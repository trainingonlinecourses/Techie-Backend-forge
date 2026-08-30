---
title: Threads and ExecutorService
module: java-concurrency-deep
order: 1
minutes: 28
topics: ["Thread", "Runnable", "Callable", "ExecutorService", "thread pools", "Future", "shutdown"]
summary: Threads are Java's unit of concurrent execution — and the most misused abstraction in the language. Creating threads directly is almost always wron...
docs:
  - title: "Concurrency in Java"
    url: "https://docs.oracle.com/en/java/javase/21/core/concurrency.html"
---

# Threads and ExecutorService

Threads are Java's unit of concurrent execution — and the most misused abstraction in the language. Creating threads directly is almost always wrong; `ExecutorService` gives you pools, reuse, and lifecycle control. This lesson is the foundation: threads, tasks, pools, and the shutdown dance.

## Threads: The Raw Material

```java
// Direct thread — you almost never want this
Thread t = new Thread(() -> {
    doWork();
});
t.start();

// The problems:
// - One OS thread per task → thousands of threads = chaos
// - No lifecycle management, no timeout, no result
// - A leaked thread is permanent (cannot be restarted)
```

## Runnable vs Callable

```java
Runnable task = () -> System.out.println("no result");        // void
Callable<Integer> c = () -> compute();                        // returns a value, can throw
```

`Callable` is the useful one — it returns results and throws exceptions, which `Future` then captures.

## ExecutorService: The Pool

```java
ExecutorService pool = Executors.newFixedThreadPool(8);

// Fire and forget
pool.execute(() -> log("job done"));

// With a result
Future<Integer> future = pool.submit(() -> compute());

// With a Callable
Future<Report> report = pool.submit(() -> reportGenerator.generate(id));

// Future API
int result = future.get();                    // blocks
int result = future.get(5, TimeUnit.SECONDS); // blocks with timeout — PREFERRED
boolean done = future.isDone();
future.cancel(true);
```

**The timeout `get` is the production rule**: a never-ending task shouldn't block your thread forever.

## The Pool Factory Methods

| Factory | Pool | Use |
|---------|------|-----|
| `newFixedThreadPool(n)` | Fixed n threads, unbounded queue | Default for CPU-bound |
| `newCachedThreadPool()` | Unbounded threads (reuse idle) | Many short-lived tasks |
| `newSingleThreadExecutor()` | One thread | Serialized tasks |
| `newScheduledThreadPool(n)` | Scheduled tasks | Timers, retries |
| `newWorkStealingPool()` | ForkJoinPool, work stealing | Parallel divide-and-conquer |

**Never use `Executors.newFixedThreadPool` without thinking about the queue** — the default is an *unbounded* LinkedBlockingQueue. A slow consumer + a flood of tasks = unbounded memory. Production pools are built explicitly:

```java
ExecutorService pool = new ThreadPoolExecutor(
    4,                          // core threads
    16,                         // max threads
    60, TimeUnit.SECONDS,       // keep-alive for extra threads
    new ArrayBlockingQueue<>(200),   // bounded queue = backpressure
    new ThreadPoolExecutor.CallerRunsPolicy());  // saturation → caller runs
```

## The ThreadPoolExecutor Mechanics

```
submit(task)
  → if threads < core: create a thread
  → else: queue the task
  → if queue full AND threads < max: create a thread
  → if queue full AND threads == max: rejection policy
```

| Policy | Behavior |
|--------|----------|
| `AbortPolicy` (default) | Throw RejectedExecutionException |
| `CallerRunsPolicy` | The *caller's* thread runs the task |
| `DiscardPolicy` | Silently drop |
| `DiscardOldestPolicy` | Drop oldest queued task |

`CallerRunsPolicy` is the backpressure choice: the pool never drops work, and the producer slows to consumer speed.

## Shutdown: The Graceful Dance

```java
// Phase 1: stop accepting new tasks
pool.shutdown();

// Phase 2: wait for in-flight + queued tasks (with a cap!)
if (!pool.awaitTermination(30, TimeUnit.SECONDS)) {
    // Phase 3: force-stop stragglers
    pool.shutdownNow();
    // tasks interrupted; queued tasks returned
}

// Phase 4: always close (try-with-resources, Java 19+)
try (ExecutorService pool = Executors.newFixedThreadPool(4)) {
    // ... auto-shutdown at end of block
}
```

**Never skip shutdown**: a non-daemon pool thread keeps the JVM alive forever — the classic "application won't exit" bug.

## Naming Threads

```java
ThreadFactory named = new ThreadFactory() {
    private final AtomicInteger counter = new AtomicInteger();
    public Thread newThread(Runnable r) {
        Thread t = new Thread(r, "report-worker-" + counter.incrementAndGet());
        t.setDaemon(false);
        return t;
    }
};
ExecutorService pool = Executors.newFixedThreadPool(4, named);
```

Named threads turn "which thread is stuck?" from a mystery into a log line. Guava's `ThreadFactoryBuilder` does this in one line if you use Guava.

## Executors in Spring

```java
@Configuration
public class AsyncConfig {

    @Bean(name = "reportExecutor")
    public Executor reportExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(16);
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("report-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }
}
```

Used by `@Async("reportExecutor")` — the pool becomes a Spring bean with a name, a prefix, and a policy. (Full coverage in the scheduling module.)

## Common Pitfalls

| Pitfall | Symptom |
|---------|---------|
| New thread per task | Thread explosion, OOM |
| Unbounded queue | Memory blowup on bursts |
| No timeout on get() | Threads block forever |
| Forgetting shutdown | JVM won't exit |
| Unnamed threads | Untraceable stacks |
| Silent task exceptions | Lost failures (log them!) |

```java
// Exceptions in Runnable are swallowed — log explicitly
pool.execute(() -> {
    try {
        riskyWork();
    } catch (Exception e) {
        log.error("Task failed", e);   // without this: silently lost
    }
});
```

## Summary

| Concern | Answer |
|---------|--------|
| Create a thread | Never directly — use a pool |
| Run a task | `pool.execute(runnable)` |
| Get a result | `pool.submit(callable)` → `Future.get(timeout)` |
| Pool config | Bounded queue + CallerRunsPolicy |
| Shutdown | shutdown → awaitTermination → shutdownNow |
| Thread names | Always name them |
| Task errors | Catch and log inside the task |

Threads are a finite, expensive resource — the pool is the discipline. Size it for the workload, bound the queue, time-box the waits, and shut it down gracefully. The next lessons build on this: locks and atomicity, CompletableFuture, and virtual threads.
