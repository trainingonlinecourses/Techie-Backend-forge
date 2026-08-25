---
title: ScopedValues — Context Variables for Virtual Threads
summary: ThreadLocal replacement for structured contexts, automatic cleanup, request tracing, multi-tenant routing, and virtual thread safety.
order: 27
minutes: 18
topics: [scoped-values, threadlocal, virtual-threads, context-propagation, structured-concurrency]
docs:
  - https://openjdk.org/jeps/446
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ScopedValue.html
---

# Java ScopedValues — Context Variables for Virtual Threads

## What Are ScopedValues?

**ScopedValues** (preview in Java 21) provide a way to pass data down a call stack **implicitly**, without threading it through every method parameter. They are the modern replacement for `ThreadLocal`.

Think of them like **invisible parameters** — data that flows from the top of the call stack down to any method that needs it, without being passed explicitly.

---

## The Problem: ThreadLocal Is Dangerous

```java
// Old way — using ThreadLocal to store current user
public class UserContext {
    private static final ThreadLocal<String> currentUser = new ThreadLocal<>();

    public static void setCurrentUser(String user) {
        currentUser.set(user);
    }

    public static String getCurrentUser() {
        return currentUser.get();
    }

    public static void clear() {
        currentUser.remove();  // Must remember to clean up!
    }
}

// Usage in a controller
@PostMapping("/api/orders")
public Order createOrder(@RequestBody OrderRequest request) {
    UserContext.setCurrentUser("alice");  // Set the context
    try {
        return orderService.createOrder(request);  // Uses the context
    } finally {
        UserContext.clear();  // MUST clean up or you get memory leaks!
    }
}

// Deep in the service layer
@Service
public class OrderService {
    public Order createOrder(OrderRequest request) {
        String user = UserContext.getCurrentUser();  // Implicit access
        // ... create order
    }
}
```

**Problems with ThreadLocal:**
1. **Memory leaks**: If you forget to call `remove()`, the value stays in the thread forever
2. **Not thread-safe with virtual threads**: Virtual threads can migrate between carrier threads, so ThreadLocal values can "leak" to other tasks
3. **Verbose cleanup**: You always need try-finally blocks to clean up
4. **Hard to debug**: Values appear from nowhere — hard to trace

---

## The Solution: ScopedValues

```java
// New way — using ScopedValue (clean, safe, automatic cleanup)
public class UserContext {
    // Define a ScopedValue — final, immutable once set
    private static final ScopedValue<String> CURRENT_USER = ScopedValue.newInstance();

    // Run code with a context value — automatic cleanup!
    public static <T> T withUser(String user, Supplier<T> action) {
        return ScopedValue.where(CURRENT_USER, user).run(action);
    }

    // Read the current value
    public static String currentUser() {
        return CURRENT_USER.get();  // Returns the value for the current scope
    }
}
```

```java
// Usage — no cleanup needed!
@PostMapping("/api/orders")
public Order createOrder(@RequestBody OrderRequest request) {
    return UserContext.withUser("alice", () -> {
        return orderService.createOrder(request);  // User context is available
    });
    // When the lambda ends, the ScopedValue is automatically cleared
    // No try-finally needed!
}

// Deep in the service layer
@Service
public class OrderService {
    public Order createOrder(OrderRequest request) {
        String user = UserContext.currentUser();  // Clean access
        // ... create order
    }
}
```

---

## How ScopedValues Work

### Basic Usage

```java
public class App {
    // Define a ScopedValue
    private static final ScopedValue<String> GREETING = ScopedValue.newInstance();

    public static void main(String[] args) {
        // Set a value and run code in that scope
        ScopedValue.where(GREETING, "Hello").run(() -> {
            System.out.println(GREETING.get());  // "Hello"

            // Nested scopes — inner overrides outer
            ScopedValue.where(GREETING, "Hi").run(() -> {
                System.out.println(GREETING.get());  // "Hi"
            });

            System.out.println(GREETING.get());  // "Hello" — outer scope restored
        });

        // Outside the scope — value is not accessible
        // GREETING.get();  // 💥 ScopedValue.NotSetException!
    }
}
```

### Key Rules

```java
// Rule 1: ScopedValue is immutable — once set in a scope, it cannot change
ScopedValue<String> name = ScopedValue.newInstance();
ScopedValue.where(name, "Alice").run(() -> {
    System.out.println(name.get());  // "Alice"
    // name.set("Bob");  // ❌ No set() method — ScopedValues are immutable
});

// Rule 2: Must be accessed within the scope where it was set
ScopedValue.where(name, "Alice").run(() -> {
    System.out.println(name.get());  // "Alice" ✅
});
// name.get();  // 💥 NotSetException — outside scope

// Rule 3: Inner scopes can shadow outer scopes
ScopedValue.where(name, "Alice").run(() -> {
    ScopedValue.where(name, "Bob").run(() -> {
        System.out.println(name.get());  // "Bob" — inner scope
    });
    System.out.println(name.get());  // "Alice" — outer scope restored
});
```

---

## ScopedValues vs ThreadLocal

| Feature | ThreadLocal | ScopedValue |
|---------|-------------|-------------|
| Mutability | Mutable (`set()`, `remove()`) | Immutable (set once per scope) |
| Cleanup | Manual (`remove()`) | Automatic (end of scope) |
| Memory leaks | Yes (if you forget `remove()`) | No (automatic cleanup) |
| Virtual thread safe | No (values leak between threads) | Yes (scoped to task, not thread) |
| Performance | Good | Better (optimized by JVM) |
| Readability | Hard to trace | Clear flow from scope to methods |

---

## In an Organization

### Scenario 1: Request Context in Web Applications

```java
public class RequestContext {
    // Define scoped values for request data
    private static final ScopedValue<String> REQUEST_ID = ScopedValue.newInstance();
    private static final ScopedValue<String> USER_ID = ScopedValue.newInstance();
    private static final ScopedValue<String> CLIENT_IP = ScopedValue.newInstance();

    // Run code with request context
    public static <T> T withRequest(String requestId, String userId, String clientIp, Supplier<T> action) {
        return ScopedValue.where(REQUEST_ID, requestId)
            .where(USER_ID, userId)
            .where(CLIENT_IP, clientIp)
            .run(action);
    }

    // Accessors
    public static String requestId() { return REQUEST_ID.get(); }
    public static String userId() { return USER_ID.get(); }
    public static String clientIp() { return CLIENT_IP.get(); }
}
```

```java
// Filter that sets the context for every request
@Component
public class RequestContextFilter implements Filter {
    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain) {
        HttpServletRequest httpReq = (HttpServletRequest) req;
        String requestId = UUID.randomUUID().toString();
        String userId = extractUserId(httpReq);
        String clientIp = httpReq.getRemoteAddr();

        // Set context for the entire request lifecycle
        RequestContext.withRequest(requestId, userId, clientIp, () -> {
            try {
                chain.doFilter(req, res);
            } catch (Exception e) {
                // Context is automatically cleaned up
                throw new RuntimeException(e);
            }
        });
    }
}
```

```java
// Deep in any service — access request context without passing it
@Service
public class OrderService {
    public Order createOrder(OrderRequest request) {
        // These values "magically" appear — no parameter passing needed
        String requestId = RequestContext.requestId();
        String userId = RequestContext.userId();
        String clientIp = RequestContext.clientIp();

        log.info("[{}] Creating order for user {} from IP {}", requestId, userId, clientIp);

        Order order = new Order(userId, request.getItems());
        auditLog.record(requestId, "ORDER_CREATED", order.getId());
        return order;
    }
}
```

### Scenario 2: Multi-Tenant Database Routing

```java
public class TenantContext {
    private static final ScopedValue<String> TENANT_ID = ScopedValue.newInstance();
    private static final ScopedValue<DataSource> DATA_SOURCE = ScopedValue.newInstance();

    public static <T> T withTenant(String tenantId, DataSource ds, Supplier<T> action) {
        return ScopedValue.where(TENANT_ID, tenantId)
            .where(DATA_SOURCE, ds)
            .run(action);
    }

    public static String tenantId() { return TENANT_ID.get(); }
    public static DataSource dataSource() { return DATA_SOURCE.get(); }
}
```

```java
// Repository that routes to the correct tenant database
@Repository
public class TenantAwareRepository {
    public List<User> findAllUsers() {
        DataSource ds = TenantContext.dataSource();  // Auto-routed!
        String tenant = TenantContext.tenantId();

        // Use the tenant-specific data source
        return jdbcTemplate.query(
            "SELECT * FROM users WHERE tenant_id = ?",
            rowMapper,
            tenant
        );
    }
}
```

```java
// Middleware that resolves tenant
@Component
public class TenantResolver {
    public void resolve(HttpServletRequest request, Supplier<Void> next) {
        String tenantId = extractTenant(request);
        DataSource ds = dataSourceRouter.getDataSource(tenantId);

        TenantContext.withTenant(tenantId, ds, () -> {
            next.get();  // Rest of request runs with tenant context
        });
    }
}
```

### Scenario 3: Transaction Context

```java
public class TransactionContext {
    private static final ScopedValue<String> TRANSACTION_ID = ScopedValue.newInstance();
    private static final ScopedValue<Boolean> READ_ONLY = ScopedValue.newInstance();

    public static <T> T withTransaction(String txId, boolean readOnly, Supplier<T> action) {
        return ScopedValue.where(TRANSACTION_ID, txId)
            .where(READ_ONLY, readOnly)
            .run(action);
    }

    public static String transactionId() { return TRANSACTION_ID.get(); }
    public static boolean isReadOnly() { return READ_ONLY.get(); }
}
```

### Scenario 4: Security Context

```java
public class SecurityContext {
    private static final ScopedValue<Set<String>> ROLES = ScopedValue.newInstance();
    private static final ScopedValue<String> USERNAME = ScopedValue.newInstance();

    public static <T> T withSecurity(String username, Set<String> roles, Supplier<T> action) {
        return ScopedValue.where(USERNAME, username)
            .where(ROLES, roles)
            .run(action);
    }

    public static String username() { return USERNAME.get(); }
    public static boolean hasRole(String role) { return ROLES.get().contains(role); }
    public static boolean isAdmin() { return hasRole("ADMIN"); }
}
```

```java
// Usage in a service
@Service
public class UserService {
    public User updateUser(Long id, UpdateRequest request) {
        // Check permission — no need to pass security context through parameters
        if (!SecurityContext.isAdmin() && !SecurityContext.username().equals(request.getUsername())) {
            throw new AccessDeniedException("Not authorized");
        }

        User user = repository.findById(id);
        user.updateFrom(request);
        return repository.save(user);
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using ScopedValue outside its scope | `NotSetException` | Always read within `ScopedValue.where().run()` |
| Trying to mutate a ScopedValue | No `set()` method — it's immutable | Use a new scope with `ScopedValue.where()` |
| Confusing ScopedValue with ThreadLocal | ScopedValue is not a direct replacement | ScopedValue is for structured contexts, not arbitrary thread-local storage |
| Using ScopedValue for simple caching | ScopedValue doesn't persist across requests | Use a regular cache or Spring's `@Cacheable` |
| Forgetting to set the ScopedValue | `NotSetException` at runtime | Ensure the filter/interceptor sets it before downstream code |
