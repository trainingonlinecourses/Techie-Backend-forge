---
title: Scoped Values — Thread-Local Without the Pain
summary: What scoped values are, how they replace ThreadLocal, why they work with virtual threads, and how organizations manage request context safely.
order: 2
minutes: 22
topics: [scoped-values, threadlocal, context-propagation, jep503, java26]
docs:
  - https://openjdk.org/jeps/503
---

## The Concept, From Zero

`ThreadLocal` has been Java's way to store per-thread data since Java 1.0. But it has serious problems:

// OLD: ThreadLocal — memory leaks, not virtual-thread-friendly
private static final ThreadLocal<User> currentUser = new ThreadLocal<>();

public void handleRequest() {
    currentUser.set(user);        // Store user for this thread
    try {
        processOrder();           // Can access currentUser.get()
    } finally {
        currentUser.remove();     // MUST clean up or memory leak!
    }
}

**Problems with ThreadLocal:**
1. **Memory leaks** — if you forget `remove()`, values persist
2. **Virtual threads** — millions of virtual threads = millions of ThreadLocal copies
3. **Inheritance** — child threads don't automatically inherit ThreadLocal values
4. **Scope** — values live until explicitly removed, not tied to any logical scope

**Scoped values** solve all of these:

// JAVA 21+: Clean, safe, auto-cleaned
private static final ScopedValue<User> currentUser = ScopedValue.newInstance();

public void handleRequest() {
    ScopedValue.where(currentUser, user).run(() -> {
        processOrder();  // currentUser.get() works here
    });
    // currentUser.get() throws here — scope ended, auto-cleaned
}

---

## How Scoped Values Work


**What this code does — step by step:**

1. Define a scoped value
2. Set it for a scope
3. Inside this scope, TRACE_ID.get() returns "abc-123"
4. `System.out.println(TRACE_ID.get());` — "abc-123"
5. Child scopes inherit the value
6. Outside the scope, TRACE_ID.get() throws IllegalStateException

The same code, clean:

```java
import java.lang.ScopedValue;

public class Main {

    public static void main(String[] args) {

        private static final ScopedValue<String> TRACE_ID = ScopedValue.newInstance();

        ScopedValue.where(TRACE_ID, "abc-123").run(() -> {
            System.out.println(TRACE_ID.get());

            doSomething();
        });
    }
}
```

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. Line 1: Define scoped values for request context
2. Line 2: Application code that uses scoped values
3. These calls work anywhere in the call chain
4. Nested call also works — values propagate automatically
5. `String userId = USER_ID.get();` — inherited from parent scope
6. Line 3: Simulated request handler
7. Set multiple scoped values for this request
8. All three values are available throughout this scope
9. All scoped values are automatically cleaned up here
10. Line 4: Scoped values with virtual threads — inherited automatically
11. Launch virtual threads — they inherit the scoped value
12. `executor.submit(() -> REQUEST_ID.get()),` — "req-456". "req-456"
13. `executor.submit(() -> REQUEST_ID.get())` — "req-456"
14. Line 5: Scoped values vs ThreadLocal comparison
15. ScopedValue: clean, auto-cleaned, virtual-thread-friendly
16. `System.out.println("Scoped: " + SCOPED.get());` — works
17. SCOPED.get() would throw here — scope ended
18. ThreadLocal: manual cleanup needed, memory leak risk
19. `System.out.println("ThreadLocal: " + THREADED.get());` — works
20. `THREADED.remove();` — MUST clean up!
21. Line 6: Test basic scoped values
22. Line 7: Test virtual thread inheritance
23. Line 8: Test that values are cleaned up
24. `REQUEST_ID.get();` — throws IllegalStateException

The same code, clean:

```java
import java.lang.ScopedValue;
import java.util.*;
import java.util.concurrent.*;

public class ScopedValuesDemo {
    private static final ScopedValue<String> REQUEST_ID = ScopedValue.newInstance();
    private static final ScopedValue<String> USER_ID = ScopedValue.newInstance();
    private static final ScopedValue<Map<String, String>> HEADERS = ScopedValue.newInstance();

    static void processOrder() {
        String requestId = REQUEST_ID.get();
        String userId = USER_ID.get();

        System.out.println("Processing order for user " + userId +
            " (request: " + requestId + ")");

        validateOrder();
    }

    static void validateOrder() {
        String userId = USER_ID.get();
        System.out.println("Validating order for user: " + userId);
    }

    static String handleRequest(String requestId, String userId, Map<String, String> headers) {
        return ScopedValue.where(REQUEST_ID, requestId)
            .where(USER_ID, userId)
            .where(HEADERS, headers)
            .run(() -> {
                processOrder();
                return "Order processed for " + USER_ID.get();
            });
    }

    static void handleWithVirtualThreads() throws Exception {
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            ScopedValue.where(REQUEST_ID, "req-456").run(() -> {
                var futures = List.of(
                    executor.submit(() -> REQUEST_ID.get()),
                    executor.submit(() -> REQUEST_ID.get()),
                    executor.submit(() -> REQUEST_ID.get())
                );

                for (var f : futures) {
                    System.out.println("VT sees: " + f.get());
                }
            });
        }
    }

    static final ScopedValue<String> SCOPED = ScopedValue.newInstance();
    static final ThreadLocal<String> THREADED = new ThreadLocal<>();

    static void comparison() {
        ScopedValue.where(SCOPED, "value").run(() -> {
            System.out.println("Scoped: " + SCOPED.get());
        });

        THREADED.set("value");
        try {
            System.out.println("ThreadLocal: " + THREADED.get());
        } finally {
            THREADED.remove();
        }
    }

    public static void main(String[] args) throws Exception {
        Map<String, String> headers = Map.of("Authorization", "Bearer token123");
        String result = handleRequest("req-001", "user-42", headers);
        System.out.println(result);

        handleWithVirtualThreads();

        try {
            REQUEST_ID.get();
        } catch (IllegalStateException e) {
            System.out.println("Expected: " + e.getMessage());
        }
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Request tracing in web apps

public class TracingFilter implements Filter {
    private static final ScopedValue<String> TRACE_ID = ScopedValue.newInstance();

    @Override
    public void doFilter(Request request, Response response, FilterChain chain) {
        String traceId = request.getHeader("X-Trace-Id");
        ScopedValue.where(TRACE_ID, traceId).run(() -> {
            chain.doFilter(request, response);
        });
    }

    // Any code downstream can access the trace ID
    public static String getTraceId() {
        return TRACE_ID.get();
    }
}

### Scenario 2: Multi-tenant database routing

public class TenantRouter {
    private static final ScopedValue<String> TENANT_ID = ScopedValue.newInstance();

    public static <T> T withTenant(String tenantId, Callable<T> action) throws Exception {
        return ScopedValue.where(TENANT_ID, tenantId).call(action);
    }

    public static DataSource getDataSource() {
        String tenant = TENANT_ID.get();
        return dataSourcePool.get(tenant);  // routes to correct DB
    }
}

// Usage
TenantRouter.withTenant("acme-corp", () -> {
    // All database calls within this scope go to acme-corp's database
    return orderService.createOrder(request);
});

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `get()` outside scope | IllegalStateException | Only access within `run()` block |
| Trying to set a value twice | Already set in current scope | Use nested `where()` calls |
| Using for mutable state | Scoped values are immutable | Use ScopedValue + immutable wrapper |
| Forgetting `run()` returns a value | Can't chain results | Use `.run(() -> result)` or `.call(() -> result)` |
| Confusing with ThreadLocal | Different semantics | ScopedValue = scope-bound; ThreadLocal = thread-bound |

