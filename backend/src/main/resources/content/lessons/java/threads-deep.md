---
title: Java Threads Deep — Lifecycle, States and Coordination
summary: Thread states from NEW to TERMINATED, synchronized blocks and the monitor, wait/notify protocol, daemon threads, and how production code coordinates thousands of concurrent workers without deadlocks.
order: 50
minutes: 25
topics: [thread-lifecycle, thread-states, synchronized, wait-notify, daemon-threads, thread-groups, monitor]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/concurrency/procthread.html
  - https://docs.oracle.com/javase/tutorial/essential/concurrency/interthread.html
---

# Java Threads Deep — Lifecycle, States and Coordination

## The concept

A **thread** is the smallest unit of execution inside a Java process. Every Java application starts with one thread (the main thread), but modern servers spawn hundreds or thousands of threads to handle concurrent requests. Understanding threads — how they start, how they wait, how they coordinate, and how they die — is essential for writing correct concurrent code.

## Thread states

A `Thread` object moves through exactly six states during its lifetime. Understanding these states helps you diagnose deadlocks, stalled threads, and performance issues.

**NEW** — The thread object has been created with `new Thread(runnable)` but `start()` has not yet been called. The thread exists as a Java object but no OS thread has been allocated.

**RUNNABLE** — The thread has been started (`start()` called) and is either currently executing on a CPU or waiting for one. The JVM's scheduler determines which RUNNABLE thread gets CPU time.

**BLOCKED** — The thread is waiting to acquire a monitor lock. This happens when it tries to enter a `synchronized` block or method that another thread already holds. Once the lock is released, the thread transitions back to RUNNABLE.

**WAITING** — The thread is waiting indefinitely for another thread to perform a specific action. This happens when you call `Object.wait()` (without a timeout), `Thread.join()` (without a timeout), or `LockSupport.park()`.

**TIMED_WAITING** — Same as WAITING but with a timeout. The thread will automatically return to RUNNABLE when the timeout expires, even if no other thread signals it. Examples: `Thread.sleep(ms)`, `Object.wait(ms)`, `Thread.join(ms)`.

**TERMINATED** — The thread has completed execution (either `run()` returned normally or an exception propagated out). A terminated thread cannot be restarted — calling `start()` again throws `IllegalThreadStateException`.

```
NEW ──start()──> RUNNABLE ──lock contention──> BLOCKED
                   │   ▲                            │
                   │   └─────acquired────────────────┘
                   │
                   ├──wait()────> WAITING ──notify()──> RUNNABLE
                   │
                   ├──sleep(ms)─> TIMED_WAITING ──timeout──> RUNNABLE
                   │
                   └──run() ends─> TERMINATED
```

## How threads coordinate in production

### Scenario 1: Producer-Consumer with wait/notify

A background thread produces data that the main thread consumes. The classic coordination pattern:

```java
public class DataQueue<T> {
    private final Queue<T> queue = new LinkedList<>();
    private final int capacity;
    private boolean closed = false;

    public DataQueue(int capacity) {
        this.capacity = capacity;
    }

    // Producer: wait if queue is full
    public synchronized void put(T item) throws InterruptedException {
        while (queue.size() == capacity) {
            wait();  // releases the monitor, sleeps until notify()
        }
        queue.add(item);
        notifyAll();  // wake up consumers waiting on empty queue
    }

    // Consumer: wait if queue is empty
    public synchronized T take() throws InterruptedException {
        while (queue.isEmpty() && !closed) {
            wait();
        }
        if (queue.isEmpty() && closed) {
            return null;  // sentinel: no more items coming
        }
        T item = queue.poll();
        notifyAll();  // wake up producers waiting on full queue
        return item;
    }

    public synchronized void close() {
        closed = true;
        notifyAll();  // wake up all waiting threads so they can exit
    }
}
```

**Why `while` not `if`?** Because a thread can wake up spuriously (the JVM spec allows this) or because another thread consumed the item before this one could. The `while` loop re-checks the condition after waking.

### Scenario 2: Daemon threads for background cleanup

Daemon threads are threads that do not prevent the JVM from exiting. When all non-daemon (user) threads have finished, the JVM shuts down regardless of whether daemon threads are still running.

```java
public class CacheEvictionScheduler {
    private final ScheduledExecutorService scheduler;

    public CacheEvictionScheduler() {
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "cache-evictor");
            t.setDaemon(true);  // JVM can exit even if this thread is running
            return t;
        });
        scheduler.scheduleAtFixedRate(this::evictExpiredEntries, 1, 1, TimeUnit.MINUTES);
    }

    private void evictExpiredEntries() {
        cache.entrySet().removeIf(entry ->
            System.currentTimeMillis() - entry.getValue().timestamp() > TTL_MS
        );
    }

    public void shutdown() {
        scheduler.shutdown();
    }
}
```

**When daemon threads are appropriate:** Background tasks like cache eviction, metrics reporting, log flushing, health checks. **Never use daemon threads** for critical work like writing to a database or processing payments — they can be killed mid-operation when the JVM exits.

### Scenario 3: Thread interruption for cancellation

The standard way to cancel a blocking thread is interruption. A thread checks `Thread.currentThread().isInterrupted()` and responds:

```java
public class LogProcessor implements Runnable {
    private final BlockingQueue<LogEntry> logQueue;

    public void run() {
        try {
            while (!Thread.currentThread().isInterrupted()) {
                LogEntry entry = logQueue.take();  // blocks until available
                process(entry);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();  // restore interrupted status
            cleanup();  // graceful shutdown
        }
    }
}

// To cancel:
Thread processor = new Thread(logProcessor);
processor.start();
// ... later ...
processor.interrupt();  // signals the thread to stop
```

**Key rule:** Never swallow `InterruptedException`. Always either re-throw it or call `Thread.currentThread().interrupt()` to restore the flag.

### Scenario 4: Thread coordination with CountDownLatch

A `CountDownLatch` lets multiple threads wait for a common point — like a "ready, set, go" barrier:

```java
public class ServiceWarmup {
    private final CountDownLatch ready = new CountDownLatch(3);

    public void startServices() {
        new Thread(() -> { database.connect(); ready.countDown(); }).start();
        new Thread(() -> { cache.connect(); ready.countDown(); }).start();
        new Thread(() -> { searchIndex.connect(); ready.countDown(); }).start();

        try {
            ready.await(30, TimeUnit.SECONDS);  // wait for all 3 to be ready
            System.out.println("All services ready — starting HTTP server");
            startHttpServer();
        } catch (TimeoutException e) {
            throw new RuntimeException("Service warmup timed out", e);
        }
    }
}
```

### Scenario 5: Daemon thread naming for debugging

Production systems need every thread named for thread dump analysis:

```java
public class ThreadPoolFactory {
    public static ExecutorService createPool(String name, int size) {
        return Executors.newFixedThreadPool(size, r -> {
            Thread t = new Thread(r);
            t.setName("app-" + name + "-" + t.getId());
            t.setDaemon(false);  // user threads for production work
            t.setUncaughtExceptionHandler((thread, ex) ->
                log.error("Uncaught exception in {}: {}", thread.getName(), ex.getMessage(), ex)
            );
            return t;
        });
    }
}
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Using `Thread.stop()` | Deprecated — leaves objects in inconsistent state |
| Not naming threads | Thread dumps are unreadable |
| Catching `InterruptedException` and continuing | Thread ignores cancellation |
| Using `Thread.yield()` as synchronization | Non-portable, unreliable |
| Creating raw `new Thread()` in production | Unbounded threads, no backpressure |
| Daemon threads for critical work | Silently killed on JVM shutdown |
| Using `Thread.sleep()` for timing | Imprecise, blocks the thread entirely |
