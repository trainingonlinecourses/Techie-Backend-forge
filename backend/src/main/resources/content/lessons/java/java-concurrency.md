---
title: Java Concurrency — Threads, Synchronization, ExecutorService, and CompletableFuture
summary: Thread basics for beginners, creating and starting threads, synchronized and volatile, ExecutorService thread pools, Future and CompletableFuture for async composition, Callable vs Runnable, and common concurrency patterns with line-by-line walkthroughs.
order: 9
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

```java
// Way 1: extend Thread class
class MyThread extends Thread {
    @Override
    public void run() {       // run() contains the code the thread executes
        System.out.println("Thread is running: " + getName());
    }
}
MyThread t = new MyThread();
t.start();                    // START the thread (calls run() in a new thread)
// Don't call run() directly! That runs in the CURRENT thread, not a new one.

// Way 2: implement Runnable (preferred — more flexible)
Runnable task = () -> {
    System.out.println("Task running on: " + Thread.currentThread().getName());
};
Thread t = new Thread(task);  // pass the Runnable to Thread constructor
t.start();

// Way 3: ExecutorService (recommended for production — manages thread pools)
ExecutorService executor = Executors.newFixedThreadPool(4);  // pool of 4 threads
executor.submit(() -> {
    System.out.println("Running on pool thread: " + Thread.currentThread().getName());
});
executor.shutdown();  // stop accepting new tasks, finish existing ones
```

## Synchronized — preventing race conditions

A **race condition** happens when two threads modify the same data simultaneously, causing unpredictable results.

```java
// PROBLEM: race condition without synchronization
public class Counter {
    private int count = 0;

    public void increment() {
        count++;  // NOT atomic! This is actually 3 steps:
        // 1. Read current value of count
        // 2. Add 1
        // 3. Write new value back
        // Thread A reads 5, Thread B reads 5, both write 6 — should be 7!
    }

    public int getCount() { return count; }
}

// SOLUTION: synchronized — only one thread can execute this method at a time
public class SafeCounter {
    private int count = 0;

    public synchronized void increment() {   // synchronized keyword
        count++;  // Now safe — only one thread at a time
    }

    public synchronized int getCount() {
        return count;
    }
}

// Or synchronize only the critical section (finer control)
public class FineGrainedCounter {
    private int count = 0;
    private final Object lock = new Object();  // dedicated lock object

    public void increment() {
        // ... do non-critical work here (no lock needed)
        synchronized (lock) {            // only this section is synchronized
            count++;                      // safe
        }
        // ... do non-critical work here (no lock needed)
    }
}
```

**How synchronized works:**
- Every Java object has a "monitor lock."
- When a thread enters a `synchronized` method/block, it acquires the lock.
- Other threads trying to enter any `synchronized` section on the SAME object must wait.
- When the thread exits, it releases the lock.

## volatile — visibility across threads

```java
// PROBLEM: without volatile, threads may see stale values
private boolean running = true;  // Thread A sets this to false, Thread B might not see it

// SOLUTION: volatile guarantees visibility
private volatile boolean running = true;

// Thread A:
running = false;  // write

// Thread B:
while (running) {   // read — guaranteed to see the latest value from Thread A
    process();
}
```

**volatile vs synchronized:**
- `volatile` — guarantees visibility (all threads see the latest value). Does NOT guarantee atomicity.
- `synchronized` — guarantees both visibility AND atomicity (only one thread at a time).

## Callable and Future — returning results from threads

```java
// Runnable: runs a task, returns nothing
Runnable task = () -> System.out.println("Hello");
executor.submit(task);

// Callable: runs a task, returns a result
Callable<Integer> computation = () -> {
    Thread.sleep(1000);     // simulate work
    return 42;              // return a value
};

// Future: represents a pending result
Future<Integer> future = executor.submit(computation);

// Get the result (blocks until complete)
Integer result = future.get();      // waits up to default timeout
Integer result2 = future.get(5, TimeUnit.SECONDS);  // waits up to 5 seconds, then TimeoutException

// Check without blocking
boolean isDone = future.isDone();   // true if complete (successfully or with exception)
boolean isCancelled = future.isCancelled();

// Cancel
future.cancel(true);   // true = interrupt the thread if running
```

## CompletableFuture — composing async operations

```java
// CompletableFuture chains multiple async operations together
// Like a pipeline: each step starts when the previous one completes

// Simple async operation
CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> {
    Thread.sleep(1000);
    return "Hello from async!";
});

// Chain transformations
CompletableFuture<Integer> result = CompletableFuture
    .supplyAsync(() -> fetchUserIdFromDB())         // Step 1: get user ID
    .thenApply(userId -> fetchUserName(userId))      // Step 2: get name (uses Step 1's result)
    .thenApply(name -> name.toUpperCase())           // Step 3: uppercase
    .thenApply(name -> name.length());               // Step 4: get length
// Result: CompletableFuture<Integer> — eventually contains the length of the uppercase name

// Handle errors gracefully
CompletableFuture<String> safeResult = CompletableFuture
    .supplyAsync(() -> riskyOperation())
    .exceptionally(ex -> "Default value on error")  // fallback if exception occurs
    .thenApply(result -> result + " processed");

// Combine two independent async operations
CompletableFuture<String> userFuture = CompletableFuture.supplyAsync(() -> fetchUser());
CompletableFuture<Order> orderFuture = CompletableFuture.supplyAsync(() -> fetchOrder());

CompletableFuture<String> combined = userFuture.thenCombine(orderFuture,
    (user, order) -> user.getName() + " ordered " + order.getProduct()
);
// Both run in parallel — combined result is ready when BOTH complete

// Wait for all to complete
CompletableFuture<Void> allDone = CompletableFuture.allOf(future1, future2, future3);
allDone.join();  // blocks until ALL three futures complete

// Wait for any to complete
CompletableFuture<Object> anyDone = CompletableFuture.anyOf(future1, future2, future3);
Object first = anyDone.join();  // gets the result of whichever finishes first
```

## ExecutorService — managing thread pools

```java
// Fixed thread pool — always N threads
ExecutorService fixed = Executors.newFixedThreadPool(4);

// Cached thread pool — creates threads as needed, reuses idle ones
ExecutorService cached = Executors.newCachedThreadPool();

// Single thread executor — runs one task at a time (sequential processing)
ExecutorService single = Executors.newSingleThreadExecutor();

// Scheduled executor — runs tasks after a delay or periodically
ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);

// Schedule a task to run after 5 seconds
scheduler.schedule(() -> System.out.println("Delayed task"), 5, TimeUnit.SECONDS);

// Schedule a task to run every 10 seconds (fixed rate)
scheduler.scheduleAtFixedRate(
    () -> System.out.println("Periodic task"),  // the task
    0,                                           // initial delay
    10,                                          // period
    TimeUnit.SECONDS
);

// CRITICAL: always shut down the executor
fixed.shutdown();                   // stop accepting new tasks
fixed.awaitTermination(30, TimeUnit.SECONDS);  // wait for running tasks to finish
if (!fixed.isShutdown()) {
    fixed.shutdownNow();            // force shutdown — interrupt running tasks
}
```

## How we use it in organizations

### Scenario 1: Parallel API calls — reducing response time

```java
@Service
public class DashboardService {

    public DashboardData getDashboard(String userId) {
        // These 3 calls are independent — run them in parallel
        CompletableFuture<User> userFuture = CompletableFuture.supplyAsync(
            () -> userService.getUser(userId));

        CompletableFuture<List<Order>> ordersFuture = CompletableFuture.supplyAsync(
            () -> orderService.getRecentOrders(userId));

        CompletableFuture<Recommendations> recsFuture = CompletableFuture.supplyAsync(
            () -> recommendationService.getRecommendations(userId));

        // Wait for all three to complete
        CompletableFuture.allOf(userFuture, ordersFuture, recsFuture).join();

        // Build the dashboard from all three results
        return new DashboardData(
            userFuture.join(),
            ordersFuture.join(),
            recsFuture.join()
        );
        // Total time: max(3 calls) instead of sum(3 calls)
        // If each takes 200ms, total is 200ms instead of 600ms
    }
}
```

### Scenario 2: Thread-safe cache with synchronized

```java
public class ThreadSafeCache<K, V> {
    private final Map<K, V> cache = new HashMap<>();
    private final Map<K, Long> timestamps = new HashMap<>();
    private final long ttlMillis;
    private final Object lock = new Object();

    public V get(K key, Supplier<V> loader) {
        synchronized (lock) {                                    // only one thread at a time
            Long timestamp = timestamps.get(key);
            if (timestamp != null && System.currentTimeMillis() - timestamp < ttlMillis) {
                return cache.get(key);                           // cache hit — return cached value
            }

            V value = loader.get();                              // cache miss — load from source
            cache.put(key, value);                               // store in cache
            timestamps.put(key, System.currentTimeMillis());    // record timestamp
            return value;
        }
    }
}
```

### Scenario 3: Graceful shutdown with ScheduledExecutorService

```java
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
```

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
