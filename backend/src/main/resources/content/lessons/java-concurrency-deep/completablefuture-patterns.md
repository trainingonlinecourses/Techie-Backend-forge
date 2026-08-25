---
title: CompletableFuture Patterns — Async Composition
summary: chaining, combining, exception handling, timeouts, and production patterns for building async pipelines without blocking threads.
order: 8
minutes: 22
topics: [completablefuture, async, chaining, exception-handling, timeout, parallel-composition, non-blocking]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/CompletableFuture.html
  - https://docs.oracle.com/javase/21/docs/api/java.base/java/util/concurrent/CompletableFuture.html
---

# CompletableFuture Patterns — Async Composition

## What Is CompletableFuture?

**CompletableFuture** (Java 8+) is a future that you can **chain, combine, and compose** — like Promises in JavaScript. It represents a value that may not be available yet, and lets you define what to do when it arrives.

**Think of it like**: ordering food at a restaurant — you place the order (start the async task), and when the food arrives (result is ready), you eat it (process the result). You don't stand in the kitchen waiting — you do other things.

---

## Basic CompletableFuture

### Creating and Using

```java
// Start an async task
CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> {
    // This runs on a separate thread
    return fetchDataFromExternalAPI();
});

// Do something when the result is ready
future.thenAccept(result -> {
    System.out.println("Got: " + result);
});

// Block and get the result (try to avoid this!)
String result = future.get();  // Blocks until done
```

---

## Chaining Operations

```java
// Chain multiple operations — each runs when the previous completes
CompletableFuture<String> future = CompletableFuture
    .supplyAsync(() -> fetchUserId())           // Step 1: get user ID
    .thenApply(id -> fetchUserName(id))          // Step 2: get user name
    .thenApply(name -> "Hello, " + name);        // Step 3: format greeting

// Each step runs asynchronously — no thread is blocked waiting
```

### thenApply vs thenAccept vs thenRun

```java
// thenApply: transform the result, returns new CompletableFuture
CompletableFuture<Integer> lengthFuture = future
    .thenApply(s -> s.length());  // String → Integer

// thenAccept: consume the result, returns CompletableFuture<Void>
future
    .thenAccept(s -> System.out.println("Result: " + s));  // Just consume

// thenRun: run after completion, doesn't use the result
future
    .thenRun(() -> System.out.println("Done!"));  // Just run code
```

---

## Combining Multiple Futures

### Wait for All

```java
// Run 3 independent tasks in parallel
CompletableFuture<User> userFuture = CompletableFuture.supplyAsync(() -> fetchUser());
CompletableFuture<List<Order>> ordersFuture = CompletableFuture.supplyAsync(() -> fetchOrders());
CompletableFuture<List<Product>> productsFuture = CompletableFuture.supplyAsync(() -> fetchProducts());

// Combine all three
CompletableFuture<DashboardData> dashboardFuture = CompletableFuture.allOf(
    userFuture, ordersFuture, productsFuture
).thenApply(v -> new DashboardData(
    userFuture.join(),
    ordersFuture.join(),
    productsFuture.join()
));

// All three ran in parallel — total time = slowest one, not sum of all
```

### Wait for Any

```java
// Get the fastest result from multiple sources
CompletableFuture<String> source1 = CompletableFuture.supplyAsync(() -> fetchFromSource1());
CompletableFuture<String> source2 = CompletableFuture.supplyAsync(() -> fetchFromSource2());
CompletableFuture<String> source3 = CompletableFuture.supplyAsync(() -> fetchFromSource3());

// Returns the first one to complete
CompletableFuture<String> fastest = CompletableFuture.anyOf(source1, source2, source3);
```

---

## Exception Handling

```java
CompletableFuture<String> future = CompletableFuture
    .supplyAsync(() -> {
        if (Math.random() > 0.5) {
            throw new RuntimeException("API call failed!");
        }
        return "Success";
    })
    .exceptionally(ex -> {
        // Handle the error
        log.error("Failed: {}", ex.getMessage());
        return "Fallback value";
    })
    .thenApply(result -> result.toUpperCase());

// Result is either "SUCCESS" or "FALLBACK VALUE"
```

### Multiple Exception Handlers

```java
CompletableFuture<String> future = CompletableFuture
    .supplyAsync(() -> riskyOperation())
    .exceptionally(ex -> {
        if (ex instanceof TimeoutException) {
            return "Timed out — using cached data";
        } else if (ex instanceof ConnectException) {
            return "Connection failed — using cached data";
        } else {
            return "Unknown error — using default";
        }
    });
```

### handle (Process Either Success or Failure)

```java
CompletableFuture<String> future = CompletableFuture
    .supplyAsync(() -> riskyOperation())
    .handle((result, ex) -> {
        if (ex != null) {
            log.error("Operation failed", ex);
            return "Default value";
        }
        return result;
    });
```

---

## Timeouts

```java
// Java 9+ timeout
CompletableFuture<String> future = CompletableFuture
    .supplyAsync(() -> slowOperation())
    .orTimeout(5, TimeUnit.SECONDS)  // Fail after 5 seconds
    .exceptionally(ex -> {
        if (ex instanceof TimeoutException) {
            return "Operation timed out";
        }
        throw new CompletionException(ex);
    });

// Java 8 workaround
CompletableFuture<String> future = CompletableFuture
    .supplyAsync(() -> slowOperation())
    .completeOnTimeout("Default value", 5, TimeUnit.SECONDS);
```

---

## In an Organization

### Scenario 1: Aggregated API Gateway

```java
@Service
public class DashboardAggregator {

    private final UserServiceClient userClient;
    private final OrderServiceClient orderClient;
    private final NotificationServiceClient notificationClient;

    public CompletableFuture<DashboardData> getDashboard(String userId) {
        // Fire all three requests in parallel
        CompletableFuture<User> userFuture = CompletableFuture
            .supplyAsync(() -> userClient.getUser(userId))
            .exceptionally(ex -> User.unknown(userId));  // Fallback

        CompletableFuture<List<Order>> ordersFuture = CompletableFuture
            .supplyAsync(() -> orderClient.getRecentOrders(userId, 10))
            .exceptionally(ex -> List.of());  // Empty list fallback

        CompletableFuture<Integer> notifCountFuture = CompletableFuture
            .supplyAsync(() -> notificationClient.getUnreadCount(userId))
            .exceptionally(ex -> 0);  // Zero fallback

        // Combine results
        return CompletableFuture.allOf(userFuture, ordersFuture, notifCountFuture)
            .thenApply(v -> new DashboardData(
                userFuture.join(),
                ordersFuture.join(),
                notifCountFuture.join()
            ));
    }
}
```

### Scenario 2: Retry with Backoff

```java
public <T> CompletableFuture<T> retryWithBackoff(
        Supplier<T> operation,
        int maxRetries,
        long initialDelayMs) {

    return CompletableFuture.supplyAsync(operation)
        .handle((result, ex) -> {
            if (ex == null) {
                return CompletableFuture.completedFuture(result);
            }

            if (maxRetries <= 0) {
                return CompletableFuture.failedFuture(ex);
            }

            // Retry with exponential backoff
            return CompletableFuture
                .supplyAsync(() -> {
                    try {
                        Thread.sleep(initialDelayMs);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    return retryWithBackoff(operation, maxRetries - 1, initialDelayMs * 2);
                })
                .thenCompose(Function.identity());
        })
        .thenCompose(Function.identity());
}
```

### Scenario 3: Timeout with Fallback

```java
@Service
public class ExternalDataService {

    public CompletableFuture<Data> fetchDataWithTimeout(String id) {
        return CompletableFuture
            .supplyAsync(() -> externalApiClient.getData(id))
            .orTimeout(3, TimeUnit.SECONDS)
            .exceptionallyCompose(ex -> {
                if (ex instanceof TimeoutException) {
                    log.warn("External API timed out for id: {}", id);
                    return CompletableFuture.completedFuture(getCachedData(id));
                }
                return CompletableFuture.failedFuture(ex);
            });
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Calling `.get()` without timeout | Blocks forever | Use `get(timeout, unit)` or `orTimeout()` |
| Not handling exceptions | Silent failures, swallowed errors | Always use `.exceptionally()` or `.handle()` |
| Chaining blocking calls | Thread starvation | Use non-blocking operations in `supplyAsync` |
| Creating too many threads | Resource exhaustion | Use `CompletableFuture.supplyAsync(() -> ..., executor)` with a bounded executor |
| Not using `allOf` for parallel | Sequential when parallel is possible | Use `allOf()` to wait for multiple futures |
| Ignoring `join()` exceptions | `CompletionException` not caught | Wrap in try-catch or use `.exceptionally()` |
