---
title: Structured Concurrency — Clean Task Management
summary: What structured concurrency is, how it replaces raw ExecutorService, shutdown scopes, how organizations manage concurrent tasks safely, and error propagation.
order: 1
minutes: 30
topics: [structured-concurrency, shutdown-scope, task-group, jep502, java26]
docs:
  - https://openjdk.org/jeps/502
---

## The Concept, From Zero

When you launch concurrent tasks, you need to:
1. **Start** them
2. **Wait** for them to complete
3. **Handle** failures
4. **Clean up** resources

Before structured concurrency, this was error-prone:

```java
// OLD: Easy to forget cleanup, hard to propagate errors
ExecutorService executor = Executors.newFixedThreadPool(10);
CompletableFuture<User> userFuture = CompletableFuture.supplyAsync(() -> fetchUser(id), executor);
CompletableFuture<List<Order>> ordersFuture = CompletableFuture.supplyAsync(() -> fetchOrders(id), executor);
CompletableFuture<Profile> profileFuture = CompletableFuture.supplyAsync(() -> fetchProfile(id), executor);

// What if one fails? Others keep running...
// What if we forget executor.shutdown()? Resource leak...
```

**Structured concurrency** ties task lifetimes to a scope. When the scope ends, all tasks are guaranteed to complete (or be cancelled):

```java
// JAVA 21+: Clean, structured, no resource leaks
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    var userTask = scope.fork(() -> fetchUser(id));
    var ordersTask = scope.fork(() -> fetchOrders(id));
    var profileTask = scope.fork(() -> fetchProfile(id));

    scope.join();  // Wait for all tasks
    scope.throwIfFailed();  // Propagate any error

    // All tasks completed successfully
    return new Dashboard(userTask.get(), ordersTask.get(), profileTask.get());
}
// Scope automatically shuts down — no resource leak
```

---

## Shutdown Strategies

```java
// ShutdownOnFailure: If ANY task fails, cancel all others
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    scope.fork(() -> fetchUser(id));
    scope.fork(() -> fetchOrders(id));
    scope.join().throwIfFailed();
}

// ShutdownOnSuccess: If ANY task succeeds, cancel the rest
try (var scope = new StructuredTaskScope.ShutdownOnSuccess<String>()) {
    scope.fork(() -> serviceA.call());
    scope.fork(() -> serviceB.call());
    scope.fork(() -> serviceC.call());
    scope.join().throwIfFailed();
    String fastest = scope.result();  // first successful result
}
```

---

## Line-by-Line Walkthrough

```java
import java.net.http.*;
import java.net.URI;
import java.time.Duration;
import java.util.concurrent.*;
import java.util.concurrent.StructuredTaskScope;

public class StructuredConcurrencyDemo {
    private static final HttpClient client = HttpClient.newHttpClient();

    // Line 1: Simple structured concurrency — parallel fetches
    static record Dashboard(User user, Profile profile, List<Order> orders) {}
    record User(String id, String name) {}
    record Profile(String bio, String avatar) {}
    record Order(String id, double total) {}

    static Dashboard fetchDashboard(String userId) throws Exception {
        // Line 2: Create a scope — ShutdownOnFailure means: if any task fails, cancel all
        try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {

            // Line 3: Fork tasks — each gets its own virtual thread
            StructuredTaskScope.Subtask<User> userTask = scope.fork(() -> {
                // Simulate HTTP call
                Thread.sleep(Duration.ofMillis(100));
                return new User(userId, "Alice");
            });

            StructuredTaskScope.Subtask<Profile> profileTask = scope.fork(() -> {
                Thread.sleep(Duration.ofMillis(150));
                return new Profile("Software Engineer", "avatar.jpg");
            });

            StructuredTaskScope.Subtask<List<Order>> ordersTask = scope.fork(() -> {
                Thread.sleep(Duration.ofMillis(200));
                return java.util.List.of(
                    new Order("ORD-1", 99.99),
                    new Order("ORD-2", 49.99)
                );
            });

            // Line 4: Wait for all tasks to complete
            scope.join();

            // Line 5: Check if any task failed — if so, propagate the error
            scope.throwIfFailed();

            // Line 6: All tasks succeeded — extract results
            return new Dashboard(
                userTask.get(),
                profileTask.get(),
                ordersTask.get()
            );
        }
        // Line 7: Scope ends here — all tasks are guaranteed complete
    }

    // Line 8: ShutdownOnSuccess — race multiple services, use the fastest
    static String fetchFromFastest(String id) throws Exception {
        try (var scope = new StructuredTaskScope.ShutdownOnSuccess<String>()) {

            scope.fork(() -> {
                Thread.sleep(Duration.ofMillis(200));
                return "Response from Service A";
            });

            scope.fork(() -> {
                Thread.sleep(Duration.ofMillis(100));
                return "Response from Service B";  // This wins!
            });

            scope.fork(() -> {
                Thread.sleep(Duration.ofMillis(300));
                return "Response from Service C";
            });

            scope.join().throwIfFailed();
            return scope.result();  // "Response from Service B"
        }
    }

    // Line 9: Error propagation — one task fails, all cancelled
    static void demonstrateFailure() {
        try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {

            scope.fork(() -> {
                Thread.sleep(Duration.ofMillis(50));
                return "Success";
            });

            scope.fork(() -> {
                Thread.sleep(Duration.ofMillis(100));
                throw new RuntimeException("Task 2 failed!");
            });

            scope.join();
            scope.throwIfFailed();  // throws RuntimeException from task 2

        } catch (Exception e) {
            System.out.println("Caught: " + e.getMessage());  // "Task 2 failed!"
        }
    }

    public static void main(String[] args) throws Exception {
        // Line 10: Test parallel fetch
        Dashboard dashboard = fetchDashboard("user-123");
        System.out.println("Dashboard: " + dashboard);

        // Line 11: Test race
        String fastest = fetchFromFastest("user-123");
        System.out.println("Fastest: " + fastest);

        // Line 12: Test failure propagation
        demonstrateFailure();
    }
}
```

---

## Real-World Scenarios

### Scenario 1: API gateway aggregation

```java
public AggregatedResponse aggregate(String userId) throws Exception {
    try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {

        var userTask = scope.fork(() -> userService.getUser(userId));
        var ordersTask = scope.fork(() -> orderService.getOrders(userId));
        var recommendationsTask = scope.fork(() -> recommendationService.getFor(userId));

        scope.join().throwIfFailed();

        return new AggregatedResponse(
            userTask.get(),
            ordersTask.get(),
            recommendationsTask.get()
        );
    }
}
```

### Scenario 2: Timeout with structured concurrency

```java
public <T> T withTimeout(Callable<T> task, Duration timeout) throws Exception {
    try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
        scope.fork(() -> {
            Thread.sleep(timeout);
            throw new TimeoutException("Operation timed out");
        });

        scope.fork(() -> {
            return task.call();
        });

        scope.join().throwIfFailed();
        return scope.fork(() -> task.call()).get();
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Forgetting `scope.join()` | Tasks may not complete | Always call `join()` before accessing results |
| Using raw ExecutorService | Resource leaks | Use structured task scopes |
| Not handling `throwIfFailed()` | Errors silently lost | Always check for failures |
| Long-running tasks in scope | Blocks the scope | Use virtual threads for I/O |
| Nested scopes | Can get confusing | Keep nesting shallow |
