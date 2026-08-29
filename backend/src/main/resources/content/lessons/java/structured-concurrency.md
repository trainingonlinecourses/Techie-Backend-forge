---
title: Structured Concurrency — Predictable Parallelism in Java 21
summary: Why structured concurrency replaces thread pools and CompletableFuture for many tasks, how TaskScope manages the lifecycle of concurrent work, and the patterns for gathering results.
order: 59
minutes: 18
topics: [structured concurrency, TaskScope, Java 21, concurrency, thread management, gather results]
docs:
  - https://openjdk.org/jeps/453
  - https://docs.oracle.com/en/java/javase/21/core/structured-concurrency.html
---

# Structured Concurrency — Predictable Parallelism in Java 21

## The concept: concurrency with clear boundaries

Structured concurrency (preview in Java 21) treats concurrent tasks like blocks in a try-with-resources: all tasks must complete before the scope exits. If one task fails, the scope cancels the others. No orphaned threads, no forgotten error handling, no complex CompletableFuture chains. The code's structure *is* the concurrency lifecycle.

## The problem structured concurrency solves

With raw threads and CompletableFuture, concurrency is unstructured — tasks can outlive their scope, errors are easy to swallow, and cancellation requires manual coordination:

```java
// UNSTRUCTURED: manual lifecycle management
CompletableFuture<User> userFuture = CompletableFuture.supplyAsync(() -> fetchUser(id));
CompletableFuture<Account> acctFuture = CompletableFuture.supplyAsync(() -> fetchAccount(id));
// What if userFuture fails? acctFuture keeps running...
// What if the method returns before futures complete? They run in background...
```

## TaskScope — structured concurrency

```java
import java.util.concurrent.StructuredTaskScope;

public UserProfile loadProfile(long userId) throws Exception {
    try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
        // Fork concurrent tasks
        Subtask<User> user = scope.fork(() -> fetchUser(userId));
        Subtask<Account> account = scope.fork(() -> fetchAccount(userId));
        Subtask<List<Notification>> notifications = scope.fork(() -> fetchNotifications(userId));

        // Join: waits for ALL tasks, propagates exceptions
        scope.join();
        scope.throwIfFailed();  // if any task threw, rethrow here

        // All tasks succeeded — safe to access results
        return new UserProfile(user.get(), account.get(), notifications.get());
    }
}
```

**ShutdownOnFailure:** if any task fails, cancel all others and propagate the exception. **ShutdownOnSuccess:** if any task succeeds, cancel the rest and return the first success.

## ShutdownOnSuccess — first-wins pattern

```java
public String fetchFromAnyServer(List<String> servers) throws Exception {
    try (var scope = new StructuredTaskScope.ShutdownOnSuccess<String>()) {
        for (String server : servers) {
            scope.fork(() -> httpClient.get(server + "/health"));
        }
        scope.join();  // wait for first success, cancel others
        scope.throwIfFailed();
        return scope.result();  // first successful result
    }
}
// If server A responds in 50ms and server B in 5s, B is cancelled
```

## Error handling — failures are always visible

Unlike CompletableFuture where `.exceptionally()` is optional (and easy to forget), structured concurrency forces error handling:

```java
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    Subtask<Data> task1 = scope.fork(() -> riskyOperation1());
    Subtask<Data> task2 = scope.fork(() -> riskyOperation2());

    scope.join();

    // If either failed, scope.throwIfFailed() throws here
    scope.throwIfFailed(ex -> new ServiceException("Parallel load failed", ex));

    return combine(task1.get(), task2.get());
} catch (Exception e) {
    // Both tasks are guaranteed to be done (success or cancelled)
    // No zombie threads, no resource leaks
}
```

## org patterns

**Parallel API aggregation:** call 3 microservices simultaneously, combine results:

```java
public OrderDetails getOrderDetails(long orderId) throws Exception {
    try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
        var order = scope.fork(() -> orderService.getOrder(orderId));
        var customer = scope.fork(() -> customerService.getCustomer(orderId));
        var shipping = scope.fork(() -> shippingService.getEstimate(orderId));

        scope.join().throwIfFailed();

        return new OrderDetails(order.get(), customer.get(), shipping.get());
    }
}
```

**Retry with fallback:** first try with timeout, fallback to cached:

```java
try (var scope = new StructuredTaskScope.ShutdownOnSuccess<Data>()) {
    scope.fork(() -> freshDataService.get(key));       // primary
    scope.fork(() -> cacheService.get(key));           // fallback
    scope.join().throwIfFailed();
    return scope.result();
}
```

## Key takeaways

- Structured concurrency enforces that concurrent tasks are managed within a clear scope — no orphaned threads.
- `ShutdownOnFailure` cancels all tasks on any failure; `ShutdownOnSuccess` cancels the rest on first success.
- `scope.join()` waits for all tasks; `scope.throwIfFailed()` propagates errors. Both are mandatory.
- Use structured concurrency instead of CompletableFuture when you need parallel execution with guaranteed lifecycle management.
- Still in preview in Java 21 — use `--enable-preview` and be aware the API may evolve.
