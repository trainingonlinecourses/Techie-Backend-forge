---
title: Java Concurrency — Threads, Synchronization, ExecutorService, and CompletableFuture
summary: Thread basics for beginners, creating and starting threads, synchronized and volatile, ExecutorService thread pools, Future and CompletableFuture for async composition, Callable vs Runnable, and common concurrency patterns with line-by-line walkthroughs.
order: 31
minutes: 35
topics: [threads, synchronized, volatile, executor-service, future, completable-future, callable, thread-pool, concurrency]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/concurrency/
  - https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/ExecutorService.html
---

# Java Concurrency — Threads, Synchronization, ExecutorService, and CompletableFuture

## What is Concurrency?

**Concurrency** means doing multiple things at the same time. A web server handles 1000 requests simultaneously — each request runs on its own thread. Without concurrency, only one user could use the website at a time.

**Beginner mental model:** A thread is like a worker in a restaurant. One waiter (thread) serves Table 1, another serves Table 2. They work simultaneously, share the same kitchen (CPU), and sometimes need to coordinate (shared resources like the database).

## Creating Threads — two ways


**What this code does — step by step:**

1. Way 1: extend Thread class
2. `public void run() {` — run() contains the code the thread executes
3. `t.start();` — START the thread (calls run() in a new thread)
4. Don't call run() directly! That runs in the CURRENT thread, not a new one.
5. Way 2: implement Runnable (preferred — more flexible)
6. `Thread t = new Thread(task);` — pass the Runnable to Thread constructor
7. Way 3: ExecutorService (recommended for production — manages thread pools)
8. `ExecutorService executor = Executors.newFixedThreadPool(4);` — pool of 4 threads
9. `executor.shutdown();` — stop accepting new tasks, finish existing ones

The same code, clean:

```java
class MyThread extends Thread {
    @Override
    public void run() {
        System.out.println("Thread is running: " + getName());
    }
}
MyThread t = new MyThread();
t.start();

Runnable task = () -> {
    System.out.println("Task running on: " + Thread.currentThread().getName());
};
Thread t = new Thread(task);
t.start();

ExecutorService executor = Executors.newFixedThreadPool(4);
executor.submit(() -> {
    System.out.println("Running on pool thread: " + Thread.currentThread().getName());
});
executor.shutdown();
```

## Synchronized — preventing race conditions

A **race condition** happens when two threads modify the same data simultaneously, causing unpredictable results.


**What this code does — step by step:**

1. PROBLEM: race condition without synchronization
2. `count++;` — NOT atomic! This is actually 3 steps: 1. Read current value of count. 2. Add 1. 3. Write new value back. Thread A reads 5, Thread B reads 5, both write 6 — should be 7!
3. SOLUTION: synchronized — only one thread can execute this method at a time
4. `public synchronized void increment() {` — synchronized keyword
5. `count++;` — Now safe — only one thread at a time
6. Or synchronize only the critical section (finer control)
7. `private final Object lock = new Object();` — dedicated lock object
8. ... do non-critical work here (no lock needed)
9. `synchronized (lock) {` — only this section is synchronized
10. `count++;` — safe
11. ... do non-critical work here (no lock needed)

The same code, clean:

```java
public class Counter {
    private int count = 0;

    public void increment() {
        count++;
    }

    public int getCount() { return count; }
}

public class SafeCounter {
    private int count = 0;

    public synchronized void increment() {
        count++;
    }

    public synchronized int getCount() {
        return count;
    }
}

public class FineGrainedCounter {
    private int count = 0;
    private final Object lock = new Object();

    public void increment() {
        synchronized (lock) {
            count++;
        }
    }
}
```

**How synchronized works:**
- Every Java object has a "monitor lock."
- When a thread enters a `synchronized` method/block, it acquires the lock.
- Other threads trying to enter any `synchronized` section on the SAME object must wait.
- When the thread exits, it releases the lock.

## volatile — visibility across threads


**What this code does — step by step:**

1. PROBLEM: without volatile, threads may see stale values
2. `private boolean running = true;` — Thread A sets this to false, Thread B might not see it
3. SOLUTION: volatile guarantees visibility
4. Thread A:
5. `running = false;` — write
6. Thread B:
7. `while (running) {` — read — guaranteed to see the latest value from Thread A

The same code, clean:

```java
private boolean running = true;

private volatile boolean running = true;

running = false;

while (running) {
    process();
}
```

**volatile vs synchronized:**
- `volatile` — guarantees visibility (all threads see the latest value). Does NOT guarantee atomicity.
- `synchronized` — guarantees both visibility AND atomicity (only one thread at a time).

## Callable and Future — returning results from threads


**What this code does — step by step:**

1. Runnable: runs a task, returns nothing
2. Callable: runs a task, returns a result
3. `Thread.sleep(1000);` — simulate work
4. `return 42;` — return a value
5. Future: represents a pending result
6. Get the result (blocks until complete)
7. `Integer result = future.get();` — waits up to default timeout
8. `Integer result2 = future.get(5, TimeUnit.SECONDS);` — waits up to 5 seconds, then TimeoutException
9. Check without blocking
10. `boolean isDone = future.isDone();` — true if complete (successfully or with exception)
11. Cancel
12. `future.cancel(true);` — true = interrupt the thread if running

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Runnable task = () -> System.out.println("Hello");
        executor.submit(task);

        Callable<Integer> computation = () -> {
            Thread.sleep(1000);
            return 42;
        };

        Future<Integer> future = executor.submit(computation);

        Integer result = future.get();
        Integer result2 = future.get(5, TimeUnit.SECONDS);

        boolean isDone = future.isDone();
        boolean isCancelled = future.isCancelled();

        future.cancel(true);
    }
}
```

## CompletableFuture — composing async operations


**What this code does — step by step:**

1. CompletableFuture chains multiple async operations together. Like a pipeline: each step starts when the previous one completes
2. Simple async operation
3. Chain transformations
4. `.supplyAsync(() -> fetchUserIdFromDB())` — Step 1: get user ID
5. `.thenApply(userId -> fetchUserName(userId))` — Step 2: get name (uses Step 1's result)
6. `.thenApply(name -> name.toUpperCase())` — Step 3: uppercase
7. `.thenApply(name -> name.length());` — Step 4: get length
8. Result: CompletableFuture<Integer> — eventually contains the length of the uppercase name
9. Handle errors gracefully
10. `.exceptionally(ex -> "Default value on error")` — fallback if exception occurs
11. Combine two independent async operations
12. Both run in parallel — combined result is ready when BOTH complete
13. Wait for all to complete
14. `allDone.join();` — blocks until ALL three futures complete
15. Wait for any to complete
16. `Object first = anyDone.join();` — gets the result of whichever finishes first

The same code, clean:

```java
CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> {
    Thread.sleep(1000);
    return "Hello from async!";
});

CompletableFuture<Integer> result = CompletableFuture
    .supplyAsync(() -> fetchUserIdFromDB())
    .thenApply(userId -> fetchUserName(userId))
    .thenApply(name -> name.toUpperCase())
    .thenApply(name -> name.length());

CompletableFuture<String> safeResult = CompletableFuture
    .supplyAsync(() -> riskyOperation())
    .exceptionally(ex -> "Default value on error")
    .thenApply(result -> result + " processed");

CompletableFuture<String> userFuture = CompletableFuture.supplyAsync(() -> fetchUser());
CompletableFuture<Order> orderFuture = CompletableFuture.supplyAsync(() -> fetchOrder());

CompletableFuture<String> combined = userFuture.thenCombine(orderFuture,
    (user, order) -> user.getName() + " ordered " + order.getProduct()
);

CompletableFuture<Void> allDone = CompletableFuture.allOf(future1, future2, future3);
allDone.join();

CompletableFuture<Object> anyDone = CompletableFuture.anyOf(future1, future2, future3);
Object first = anyDone.join();
```

## ExecutorService — managing thread pools


**What this code does — step by step:**

1. Fixed thread pool — always N threads
2. Cached thread pool — creates threads as needed, reuses idle ones
3. Single thread executor — runs one task at a time (sequential processing)
4. Scheduled executor — runs tasks after a delay or periodically
5. Schedule a task to run after 5 seconds
6. Schedule a task to run every 10 seconds (fixed rate)
7. `() -> System.out.println("Periodic task"),` — the task
8. `0,` — initial delay
9. `10,` — period
10. CRITICAL: always shut down the executor
11. `fixed.shutdown();` — stop accepting new tasks
12. `fixed.awaitTermination(30, TimeUnit.SECONDS);` — wait for running tasks to finish
13. `fixed.shutdownNow();` — force shutdown — interrupt running tasks

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        ExecutorService fixed = Executors.newFixedThreadPool(4);

        ExecutorService cached = Executors.newCachedThreadPool();

        ExecutorService single = Executors.newSingleThreadExecutor();

        ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);

        scheduler.schedule(() -> System.out.println("Delayed task"), 5, TimeUnit.SECONDS);

        scheduler.scheduleAtFixedRate(
            () -> System.out.println("Periodic task"),
            0,
            10,
            TimeUnit.SECONDS
        );

        fixed.shutdown();
        fixed.awaitTermination(30, TimeUnit.SECONDS);
        if (!fixed.isShutdown()) {
            fixed.shutdownNow();
        }
    }
}
```

## How we use it in organizations

### Scenario 1: Parallel API calls — reducing response time


**What this code does — step by step:**

1. These 3 calls are independent — run them in parallel
2. Wait for all three to complete
3. Build the dashboard from all three results
4. Total time: max(3 calls) instead of sum(3 calls). If each takes 200ms, total is 200ms instead of 600ms

The same code, clean:

```java
@Service
public class DashboardService {

    public DashboardData getDashboard(String userId) {
        CompletableFuture<User> userFuture = CompletableFuture.supplyAsync(
            () -> userService.getUser(userId));

        CompletableFuture<List<Order>> ordersFuture = CompletableFuture.supplyAsync(
            () -> orderService.getRecentOrders(userId));

        CompletableFuture<Recommendations> recsFuture = CompletableFuture.supplyAsync(
            () -> recommendationService.getRecommendations(userId));

        CompletableFuture.allOf(userFuture, ordersFuture, recsFuture).join();

        return new DashboardData(
            userFuture.join(),
            ordersFuture.join(),
            recsFuture.join()
        );
    }
}
```

### Scenario 2: Thread-safe cache with synchronized


**What this code does — step by step:**

1. `synchronized (lock) {` — only one thread at a time
2. `return cache.get(key);` — cache hit — return cached value
3. `V value = loader.get();` — cache miss — load from source
4. `cache.put(key, value);` — store in cache
5. `timestamps.put(key, System.currentTimeMillis());` — record timestamp

The same code, clean:

```java
public class ThreadSafeCache<K, V> {
    private final Map<K, V> cache = new HashMap<>();
    private final Map<K, Long> timestamps = new HashMap<>();
    private final long ttlMillis;
    private final Object lock = new Object();

    public V get(K key, Supplier<V> loader) {
        synchronized (lock) {
            Long timestamp = timestamps.get(key);
            if (timestamp != null && System.currentTimeMillis() - timestamp < ttlMillis) {
                return cache.get(key);
            }

            V value = loader.get();
            cache.put(key, value);
            timestamps.put(key, System.currentTimeMillis());
            return value;
        }
    }
}
```

### Scenario 3: Graceful shutdown with ScheduledExecutorService

@Component
public class HealthChecker {
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);
    private final List<HealthCheck> checks;

    @PostConstruct
    public void start() {
        // Check health every 30 seconds
        scheduler.scheduleAtFixedRate(this::runChecks, 0, 30, TimeUnit.SECONDS);
    }

    private void runChecks() {
        for (HealthCheck check : checks) {
            try {
                boolean healthy = check.isHealthy();
                metrics.record(check.getName(), healthy);
            } catch (Exception e) {
                log.error("Health check failed: {}", check.getName(), e);
                metrics.record(check.getName(), false);
            }
        }
    }

    @PreDestroy
    public void stop() {
        scheduler.shutdown();
        try {
            scheduler.awaitTermination(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            scheduler.shutdownNow();
        }
    }
}

## Concurrency patterns

| Pattern | When to Use | Implementation |
|---|---|---|
| Producer-Consumer | One thread produces data, another consumes | BlockingQueue |
| Read-Write Lock | Many readers, few writers | ReentrantReadWriteLock |
| Thread Pool | Running many tasks efficiently | ExecutorService |
| Future Composition | Combining multiple async results | CompletableFuture |
| Periodic Tasks | Running jobs on a schedule | ScheduledExecutorService |

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Calling `run()` instead of `start()` | Runs in current thread, not a new one | Always use `start()` |
| Forgetting `synchronized` on shared data | Race conditions — data corruption | Synchronize all access to shared state |
| Holding a lock too long | Other threads blocked — deadlock risk | Keep synchronized blocks small |
| Using `Thread.sleep()` for timing | Inaccurate, wastes thread | Use ScheduledExecutorService |
| Not shutting down ExecutorService | Thread leak — threads run forever | Always call shutdown() in @PreDestroy |
| Using `future.get()` without timeout | Potential infinite hang | Always use `get(timeout, unit)` |

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/)
