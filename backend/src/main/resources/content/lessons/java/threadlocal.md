---
title: ThreadLocal — Thread-Isolated Storage for Request-Scoped Data
summary: How ThreadLocal provides per-thread copies of data, why it's essential for request tracing and user context, memory leak traps with thread pools, and the InheritableThreadLocal alternative.
order: 62
minutes: 20
topics: [threadlocal, inheritable-threadlocal, request-context, thread-isolation, memory-leak, thread-pool]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/lang/ThreadLocal.html
  - https://docs.oracle.com/javase/tutorial/essential/concurrency/threadlocal.html
---

# ThreadLocal — Thread-Isolated Storage for Request-Scoped Data

## The concept — what is ThreadLocal?

`ThreadLocal<T>` is a special variable that gives each thread **its own independent copy** of a value. When thread A sets `threadLocal.set("Alice")` and thread B sets `threadLocal.set("Bob")`, each thread sees only its own value — they can't interfere with each other.

**Beginner mental model:** Think of ThreadLocal as a personal locker. Each thread has its own locker. When thread A puts something in "locker #1", only thread A can access it. Thread B has its own "locker #1" with completely different contents.

**Why not just pass the value as a parameter?** Because sometimes the value needs to flow through many layers of code (controllers → services → repositories → utilities) and threading it through every method signature is impractical. ThreadLocal provides implicit, thread-safe context propagation.

## How it works

```java
// Create a ThreadLocal variable
private static final ThreadLocal<String> currentUser = new ThreadLocal<>();

// Set the value (only visible to the CURRENT thread)
currentUser.set("Alice");

// Get the value (only returns what THIS thread set)
String name = currentUser.get();  // "Alice"

// Clear when done (important for thread pools!)
currentUser.remove();
```

**Critical rule:** `set()` and `get()` always operate on the **calling thread's** copy. Thread A calling `set("Alice")` has zero effect on Thread B's value.

## The problem ThreadLocal solves — request context

In a web application, every HTTP request runs on a different thread. You need to know "who is the current user?" but you don't want to pass `UserContext` through every method call:

```java
// WITHOUT ThreadLocal — you must pass user through every layer
public class OrderController {
    public Order createOrder(CreateOrderRequest req, UserContext user) {  // pass user
        return orderService.create(req, user);  // pass user again
    }
}

public class OrderService {
    public Order create(CreateOrderRequest req, UserContext user) {  // pass user again
        return orderRepo.save(new Order(req, user));  // and again
    }
}

// WITH ThreadLocal — user is available everywhere without passing
public class UserContext {
    private static final ThreadLocal<User> current = new ThreadLocal<>();

    public static void set(User user) { current.set(user); }
    public static User get() { return current.get(); }
    public static void clear() { current.remove(); }  // ALWAYS clean up!
}

// Now any class can access the current user without parameters
public class OrderService {
    public Order create(CreateOrderRequest req) {
        User user = UserContext.get();  // get current user — no parameter needed
        auditLog.log("Order by " + user.getName());
        return orderRepo.save(new Order(req, user));
    }
}
```

## How we use it in organizations

### Scenario 1: Request tracing (MDC pattern)

Every request gets a unique trace ID. You want it available in every log statement without passing it everywhere:

```java
public class TraceContext {
    private static final ThreadLocal<String> traceId = new ThreadLocal<>();
    private static final ThreadLocal<String> userId = new ThreadLocal<>();

    // Called at the start of every request
    public static void start(String trace, String user) {
        traceId.set(trace);
        userId.set(user);
    }

    // Called at the END of every request — CRITICAL to prevent leaks
    public static void end() {
        traceId.remove();
        userId.remove();
    }

    public static String getTraceId() { return traceId.get(); }
    public static String getUserId() { return userId.get(); }
}

// A filter that sets up context for every request
@Component
public class TraceFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain chain) throws IOException, ServletException {
        String trace = UUID.randomUUID().toString();
        String user = extractUser(request);

        TraceContext.start(trace, user);  // set for this request's thread
        try {
            chain.doFilter(request, response);  // all downstream code can access it
        } finally {
            TraceContext.end();  // CLEAN UP — prevent leak to next request
        }
    }
}

// Any service can now log with trace context
@Service
public class OrderService {
    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    public Order createOrder(CreateOrderRequest req) {
        log.info("[{}] Creating order for user {}",       // trace ID appears in logs
                 TraceContext.getTraceId(),
                 TraceContext.getUserId());
        // ... no need to pass traceId through every method
    }
}
```

### Scenario 2: Multi-tenant database routing

Different customers use different databases. ThreadLocal determines which database to use:

```java
public class TenantContext {
    private static final ThreadLocal<String> tenantId = new ThreadLocal<>();

    public static void setTenant(String id) { tenantId.set(id); }
    public static String getTenant() { return tenantId.get(); }
    public static void clear() { tenantId.remove(); }
}

// Dynamic DataSource routing based on ThreadLocal
public class TenantRoutingDataSource extends AbstractRoutingDataSource {
    @Override
    protected Object determineCurrentLookupKey() {
        return TenantContext.getTenant();  // returns "acme" or "globex" etc.
    }
}

// A filter sets the tenant from the request header
@Component
public class TenantFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain chain) throws IOException, ServletException {
        String tenant = request.getHeader("X-Tenant-ID");
        TenantContext.setTenant(tenant);  // set tenant for this request's thread
        try {
            chain.doFilter(request, response);
        } finally {
            TenantContext.clear();  // prevent tenant leak to next request on same thread
        }
    }
}
```

### Scenario 3: The memory leak trap with thread pools

```java
// DANGEROUS: ThreadLocal in an ExecutorService with fixed thread pool
ExecutorService executor = Executors.newFixedThreadPool(10);

for (int i = 0; i < 1_000_000; i++) {
    executor.submit(() -> {
        currentUser.set("Alice");
        processRequest();
        // FORGOT currentUser.remove() — Alice stays in the thread's ThreadLocal forever!
        // After 10 tasks, all 10 threads have stale "Alice" values
        // The next 999,990 tasks will see the WRONG user
    });
}
```

**Why this happens:** In a thread pool, threads are reused. When a task completes without calling `remove()`, the ThreadLocal value persists for the next task that reuses that thread. With 10 threads and 1M tasks, the first 10 tasks leave stale data that affects all subsequent tasks.

**The fix — always remove in a finally block:**

```java
executor.submit(() -> {
    try {
        currentUser.set("Alice");
        processRequest();
    } finally {
        currentUser.remove();  // ALWAYS clean up — no exceptions
    }
});
```

## InheritableThreadLocal — passing context to child threads

Regular `ThreadLocal` doesn't propagate to child threads. `InheritableThreadLocal` does:

```java
// Regular ThreadLocal — child thread gets NULL
private static final ThreadLocal<String> parent = new ThreadLocal<>();
parent.set("from-parent");
new Thread(() -> {
    System.out.println(parent.get());  // null! child can't see parent's value
}).start();

// InheritableThreadLocal — child thread inherits parent's value
private static final InheritableThreadLocal<String> inheritable = new InheritableThreadLocal<>();
inheritable.set("from-parent");
new Thread(() -> {
    System.out.println(inheritable.get());  // "from-parent" — inherited!
}).start();
```

**Caveat:** InheritableThreadLocal copies the value when the child thread is created, not when it runs. If the parent changes the value later, the child still sees the old value. For true async context propagation, use `TaskDecorator` or the `context- Propagation` library.

## Common mistakes

| Mistake | Consequence |
|---|---|
| Forgetting `remove()` after `set()` | Memory leak — values accumulate in thread pool threads |
| Using ThreadLocal for shared data (not per-thread) | Race conditions — each thread sees its own copy, not the shared one |
| Setting ThreadLocal in a thread pool task without cleanup | Next task on same thread sees stale data |
| Using InheritableThreadLocal with complex objects | Child sees reference to parent's mutable object — potential race |
| ThreadLocal in static fields without remove | Values persist across requests in pooled threads |
