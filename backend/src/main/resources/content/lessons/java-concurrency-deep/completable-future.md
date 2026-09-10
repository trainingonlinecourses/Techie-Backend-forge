---
title: "CompletableFuture — Asynchronous Composition Without the Pain"
summary: "What CompletableFuture is, how to chain async operations, handle errors gracefully, combine multiple futures, and build responsive applications."
order: 1
minutes: 22
topics: [completable-future, async, chaining, exception-handling, composition, thenapply, thencompose]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/CompletableFuture.html
---

## The Concept, From Zero

### What is CompletableFuture?

**CompletableFuture = a future value that you can chain operations on.** Unlike basic `Future`, you can:
- Chain transformations (`thenApply`)
- Chain async operations (`thenCompose`)
- Combine multiple futures (`thenCombine`, `allOf`)
- Handle errors gracefully (`exceptionally`, `handle`)

Without CompletableFuture:

**What this code does — step by step:**

1. Sequential — waits for each call
2. `String user = getUser(id);` — 200ms
3. `List<Order> orders = getOrders(id);` — 300ms
4. `String recommendations = getRecs(id);` — 150ms
5. Total: 650ms — all sequential

The same code, clean:

```java
String user = getUser(id);
List<Order> orders = getOrders(id);
String recommendations = getRecs(id);
```

With CompletableFuture:
// Parallel — all run simultaneously
CompletableFuture<String> userF = CompletableFuture.supplyAsync(() -> getUser(id));
CompletableFuture<List<Order>> ordersF = CompletableFuture.supplyAsync(() -> getOrders(id));
CompletableFuture<String> recsF = CompletableFuture.supplyAsync(() -> getRecs(id));

```java
// Wait for all — total time: 300ms (the slowest one)
CompletableFuture.allOf(userF, ordersF, recsF).join();
```

### Creating CompletableFutures


**What this code does — step by step:**

1. 1. Already completed
2. 2. Async computation
3. Runs in the ForkJoinPool common pool
4. 3. With custom executor
5. `}, customExecutor);` — Use your own thread pool

The same code, clean:

```java
CompletableFuture<String> done = CompletableFuture.completedFuture("Hello");

CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> {
    return fetchFromDatabase();
});

CompletableFuture<String> future2 = CompletableFuture.supplyAsync(() -> {
    return fetchFromDatabase();
}, customExecutor);
```

### Chaining Operations


**What this code does — step by step:**

1. thenApply — transform the result (like map)
2. `.thenApply(id -> userApi.getName(id))` — String → String
3. `.thenApply(name -> "Hello, " + name);` — String → String
4. thenCompose — chain async operations (like flatMap)
5. `.thenCompose(id -> orderApi.getLatestOrder(id));` — returns CompletableFuture<Order>
6. ↑ Use thenCompose when the next step returns a CompletableFuture
7. thenAccept — consume the result (no return value)
8. thenRun — run after completion (ignores the result)

The same code, clean:

```java
CompletableFuture<String> nameFuture = CompletableFuture
    .supplyAsync(() -> getUserIdFromToken(token))
    .thenApply(id -> userApi.getName(id))
    .thenApply(name -> "Hello, " + name);

CompletableFuture<Order> orderFuture = CompletableFuture
    .supplyAsync(() -> getUserIdFromToken(token))
    .thenCompose(id -> orderApi.getLatestOrder(id));

CompletableFuture<Void> logFuture = CompletableFuture
    .supplyAsync(() -> getOrder(id))
    .thenAccept(order -> log.info("Order found: {}", order.getId()));

CompletableFuture<Void> cleanupFuture = CompletableFuture
    .supplyAsync(() -> processData())
    .thenRun(() -> cleanupTempFiles());
```

### Combining Multiple Futures


**What this code does — step by step:**

1. thenCombine — combine two futures
2. thenAcceptBoth — consume both results
3. allOf — wait for ALL futures
4. `all.join();` — Blocks until ALL complete
5. anyOf — wait for the FIRST future to complete

The same code, clean:

```java
CompletableFuture<String> result = userFuture
    .thenCombine(orderFuture, (user, order) -> 
        user.name() + " ordered " + order.product());

userFuture.thenAcceptBoth(orderFuture, (user, order) -> {
    sendEmail(user.email(), "Your order: " + order.id());
});

CompletableFuture<Void> all = CompletableFuture.allOf(
    userFuture, orderFuture, recsFuture
);
all.join();

CompletableFuture<Object> first = CompletableFuture.anyOf(
    fastApi.call(), slowApi.call()
);
```

### Exception Handling

// exceptionally — handle errors, return fallback
CompletableFuture<String> safe = CompletableFuture
    .supplyAsync(() -> riskyOperation())
```java
    .exceptionally(ex -> {
        log.error("Failed: {}", ex.getMessage());
        return "fallback value";
    });

// handle — handle both success and failure
```
CompletableFuture<String> handled = CompletableFuture
    .supplyAsync(() -> riskyOperation())
```java
    .handle((result, ex) -> {
        if (ex != null) {
            log.error("Error: {}", ex.getMessage());
            return "fallback";
        }
        return result;
    });

// exceptionallyCompose — try alternative on failure
```
CompletableFuture<String> retry = CompletableFuture
    .supplyAsync(() -> primaryService.call())
    .exceptionallyCompose(ex -> 
        CompletableFuture.supplyAsync(() -> fallbackService.call())
```java
    );
```

### Timeout Support (Java 9+)

// Timeout after 5 seconds
CompletableFuture<String> withTimeout = CompletableFuture
    .supplyAsync(() -> slowOperation())
    .orTimeout(5, TimeUnit.SECONDS)
```java
    .exceptionally(ex -> {
        if (ex instanceof TimeoutException) {
            return "Request timed out";
        }
        throw new CompletionException(ex);
    });

// Complete with default after timeout
```
CompletableFuture<String> withDefault = CompletableFuture
    .supplyAsync(() -> slowOperation())
```java
    .completeOnTimeout("default value", 5, TimeUnit.SECONDS);
```

### Organization Use Cases

**1. API Gateway Fan-Out**
public CompletableFuture<DashboardData> getDashboard(Long userId) {
    CompletableFuture<UserProfile> profile = userService.getProfile(userId);
    CompletableFuture<List<Order>> orders = orderService.getRecent(userId);
    CompletableFuture<List<Notification>> notifs = notifService.getUnread(userId);
    
```java
    return profile.thenCombine(orders, (p, o) -> 
        new DashboardData(p, o, null)
```
    ).thenCombine(notifs, (data, n) -> 
        new DashboardData(data.profile(), data.orders(), n)
    );
}

**2. Parallel Data Aggregation**
public CompletableFuture<Report> generateReport(Long id) {
    CompletableFuture<Revenue> revenue = revenueService.calculate(id);
    CompletableFuture<List<Transaction>> txns = txnService.list(id);
```java
    CompletableFuture<Map<String, Integer>> stats = statsService.aggregate(id);
    
    return CompletableFuture.allOf(revenue, txns, stats)
```
        .thenApply(v -> new Report(
            revenue.join(), txns.join(), stats.join()
        ));
}

**3. Retry with Backoff**
public CompletableFuture<String> retryWithBackoff(int maxRetries, long delayMs) {
    return CompletableFuture
        .supplyAsync(() -> callExternalApi())
        .exceptionallyCompose(ex -> {
            if (maxRetries <= 0) {
                return CompletableFuture.failedFuture(ex);
            }
            return CompletableFuture
                .delayedExecutor(delayMs, TimeUnit.MILLISECONDS)
                .submit(() -> retryWithBackoff(maxRetries - 1, delayMs * 2))
                .thenCompose(Function.identity());
        });
}

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Calling .get() instead of .join() | .get() throws checked exception | Use .join() in lambdas (throws unchecked) |
| Blocking on the common pool | Starves other tasks | Use custom executor for I/O-heavy tasks |
| Not handling exceptions | Silently swallowed in background threads | Always use exceptionally() or handle() |
| Using thenApply for async chains | Creates nested CompletableFuture | Use thenCompose() when next step is async |
| Forgetting to handle Interruption | Tasks run even after timeout | Always check interrupt status |

### Line-by-Line Code Explanation


**What this code does — step by step:**

1. ↑ Import CompletableFuture — Java 8+ async composition API
2. ↑ Returns CompletableFuture<String> — async operation
3. ↑ supplyAsync: runs the lambda in a background thread. ↑ Returns a CompletableFuture that completes with the lambda's result
4. `simulateDelay(200);` — Simulate 200ms network call
5. ↑ The string "User-{id}" becomes the future's value
6. ↑ Another async operation — returns CompletableFuture<String>
7. `simulateDelay(300);` — Simulate 300ms database query
8. Chain: fetch user → then fetch order → combine
9. ↑ thenApply: transforms the result when future completes. ↑ Input: "User-42", Output: modified string
10. ↑ Returns uppercase version as the new future value
11. ↑ thenCompose: chains another async operation. ↑ Unlike thenCompose, the inner function returns CompletableFuture
12. ↑ Combines user name with order summary
13. ↑ exceptionally: handles ANY error in the chain. ↑ If any step above fails, this runs instead
14. .join() blocks until the future completes (no checked exception)
15. ↑ Prints: "USER-42 — 3 orders totaling $450"

The same code, clean:

```java
import java.util.concurrent.CompletableFuture;

public class FutureComposition {

    static CompletableFuture<String> fetchUserName(long id) {
        return CompletableFuture.supplyAsync(() -> {
            simulateDelay(200);
            return "User-" + id;
        });
    }

    static CompletableFuture<String> fetchOrderSummary(long userId) {
        return CompletableFuture.supplyAsync(() -> {
            simulateDelay(300);
            return "3 orders totaling $450";
        });
    }

    public static void main(String[] args) {
        CompletableFuture<String> result = fetchUserName(42L)
            .thenApply(name -> {
                System.out.println("Got user: " + name);
                return name.toUpperCase();
            })
            .thenCompose(name -> {
                return fetchOrderSummary(42L)
                    .thenApply(orders -> name + " — " + orders);
            })
            .exceptionally(ex -> {
                return "Error: " + ex.getMessage();
            });

        System.out.println(result.join());
    }
}
```

### Key Takeaways

1. **supplyAsync** — create a future from an async computation
2. **thenApply** — transform the result (like Stream.map)
3. **thenCompose** — chain async operations (like Stream.flatMap)
4. **thenCombine** — merge two futures
5. **allOf** — wait for all futures
6. **exceptionally** — handle errors with fallback
7. **Use .join() not .get()** in lambdas — avoids checked exceptions

### Real-World Organization Scenario

A microservices dashboard makes 5 parallel API calls (user profile, orders, notifications, recommendations, billing). Using CompletableFuture.allOf(), all 5 calls run simultaneously. The total response time is the slowest call (200ms) instead of the sum (800ms). If any call fails, exceptionally() returns a graceful fallback. The dashboard loads 4x faster than the sequential version.

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/en/java/javase/21/core/concurrency.html)
