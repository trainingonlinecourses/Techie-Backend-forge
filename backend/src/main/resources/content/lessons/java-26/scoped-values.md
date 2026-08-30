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

```java
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
```

**Problems with ThreadLocal:**
1. **Memory leaks** — if you forget `remove()`, values persist
2. **Virtual threads** — millions of virtual threads = millions of ThreadLocal copies
3. **Inheritance** — child threads don't automatically inherit ThreadLocal values
4. **Scope** — values live until explicitly removed, not tied to any logical scope

**Scoped values** solve all of these:

```java
// JAVA 21+: Clean, safe, auto-cleaned
private static final ScopedValue<User> currentUser = ScopedValue.newInstance();

public void handleRequest() {
    ScopedValue.where(currentUser, user).run(() -> {
        processOrder();  // currentUser.get() works here
    });
    // currentUser.get() throws here — scope ended, auto-cleaned
}
```

---

## How Scoped Values Work

```java
import java.lang.ScopedValue;

// Define a scoped value
private static final ScopedValue<String> TRACE_ID = ScopedValue.newInstance();

// Set it for a scope
ScopedValue.where(TRACE_ID, "abc-123").run(() -> {
    // Inside this scope, TRACE_ID.get() returns "abc-123"
    System.out.println(TRACE_ID.get());  // "abc-123"

    // Child scopes inherit the value
    doSomething();
});

// Outside the scope, TRACE_ID.get() throws IllegalStateException
```

---

## Line-by-Line Walkthrough

```java
import java.lang.ScopedValue;
import java.util.*;
import java.util.concurrent.*;

public class ScopedValuesDemo {
    // Line 1: Define scoped values for request context
    private static final ScopedValue<String> REQUEST_ID = ScopedValue.newInstance();
    private static final ScopedValue<String> USER_ID = ScopedValue.newInstance();
    private static final ScopedValue<Map<String, String>> HEADERS = ScopedValue.newInstance();

    // Line 2: Application code that uses scoped values
    static void processOrder() {
        // These calls work anywhere in the call chain
        String requestId = REQUEST_ID.get();
        String userId = USER_ID.get();

        System.out.println("Processing order for user " + userId +
            " (request: " + requestId + ")");

        // Nested call also works — values propagate automatically
        validateOrder();
    }

    static void validateOrder() {
        String userId = USER_ID.get();  // inherited from parent scope
        System.out.println("Validating order for user: " + userId);
    }

    // Line 3: Simulated request handler
    static String handleRequest(String requestId, String userId, Map<String, String> headers) {
        // Set multiple scoped values for this request
        return ScopedValue.where(REQUEST_ID, requestId)
            .where(USER_ID, userId)
            .where(HEADERS, headers)
            .run(() -> {
                // All three values are available throughout this scope
                processOrder();
                return "Order processed for " + USER_ID.get();
            });
        // All scoped values are automatically cleaned up here
    }

    // Line 4: Scoped values with virtual threads — inherited automatically
    static void handleWithVirtualThreads() throws Exception {
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            ScopedValue.where(REQUEST_ID, "req-456").run(() -> {
                // Launch virtual threads — they inherit the scoped value
                var futures = List.of(
                    executor.submit(() -> REQUEST_ID.get()),  // "req-456"
                    executor.submit(() -> REQUEST_ID.get()),  // "req-456"
                    executor.submit(() -> REQUEST_ID.get())   // "req-456"
                );

                for (var f : futures) {
                    System.out.println("VT sees: " + f.get());
                }
            });
        }
    }

    // Line 5: Scoped values vs ThreadLocal comparison
    static final ScopedValue<String> SCOPED = ScopedValue.newInstance();
    static final ThreadLocal<String> THREADED = new ThreadLocal<>();

    static void comparison() {
        // ScopedValue: clean, auto-cleaned, virtual-thread-friendly
        ScopedValue.where(SCOPED, "value").run(() -> {
            System.out.println("Scoped: " + SCOPED.get());  // works
        });
        // SCOPED.get() would throw here — scope ended

        // ThreadLocal: manual cleanup needed, memory leak risk
        THREADED.set("value");
        try {
            System.out.println("ThreadLocal: " + THREADED.get());  // works
        } finally {
            THREADED.remove();  // MUST clean up!
        }
    }

    public static void main(String[] args) throws Exception {
        // Line 6: Test basic scoped values
        Map<String, String> headers = Map.of("Authorization", "Bearer token123");
        String result = handleRequest("req-001", "user-42", headers);
        System.out.println(result);

        // Line 7: Test virtual thread inheritance
        handleWithVirtualThreads();

        // Line 8: Test that values are cleaned up
        try {
            REQUEST_ID.get();  // throws IllegalStateException
        } catch (IllegalStateException e) {
            System.out.println("Expected: " + e.getMessage());
        }
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Request tracing in web apps

```java
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
```

### Scenario 2: Multi-tenant database routing

```java
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
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `get()` outside scope | IllegalStateException | Only access within `run()` block |
| Trying to set a value twice | Already set in current scope | Use nested `where()` calls |
| Using for mutable state | Scoped values are immutable | Use ScopedValue + immutable wrapper |
| Forgetting `run()` returns a value | Can't chain results | Use `.run(() -> result)` or `.call(() -> result)` |
| Confusing with ThreadLocal | Different semantics | ScopedValue = scope-bound; ThreadLocal = thread-bound |
