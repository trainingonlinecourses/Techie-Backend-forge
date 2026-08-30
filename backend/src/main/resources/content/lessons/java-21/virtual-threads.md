---
title: Virtual Threads — Lightweight Concurrency at Scale
summary: What virtual threads are, how they differ from platform threads, structured concurrency, when to use them, and how organizations handle millions of concurrent connections.
order: 1
minutes: 35
topics: [virtual-threads, project-loom, concurrency, structured-concurrency, java21]
docs:
  - https://docs.oracle.com/en/java/javase/21/language/virtual-threads.html
  - https://openjdk.org/jeps/444
---

## The Concept, From Zero

Java has had threads since version 1.0. Each thread maps to an OS thread (called a **platform thread**). The problem: platform threads are expensive — each one consumes ~1MB of stack memory. You can't create millions of them.

**Virtual threads** (Project Loom) are lightweight threads managed by the JVM, not the OS. You can create **millions** of them:

```java
// OLD WAY: Platform threads — limited to ~10,000 before running out of memory
ExecutorService executor = Executors.newFixedThreadPool(200);
// 200 threads max — each is a real OS thread

// JAVA 21: Virtual threads — create millions
ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
// Every task gets its own virtual thread — as many as needed
```

**The key insight:** Virtual threads are designed for I/O-bound work (HTTP calls, database queries, file reads). They don't help with CPU-bound work (no benefit over platform threads for pure computation).

**Analogy:** Platform threads are like having 200 checkout lanes at a grocery store. Virtual threads are like having unlimited checkout lanes, but they share a small pool of actual cashiers. When a customer goes to get their wallet (I/O wait), the cashier helps someone else. When the customer returns, the cashier resumes.

---

## Creating Virtual Threads

```java
// Method 1: Thread.ofVirtual() — create individual virtual threads
Thread vt = Thread.ofVirtual().name("my-vt").start(() -> {
    System.out.println("Running in virtual thread: " + Thread.currentThread());
});
vt.join();

// Method 2: Thread.ofVirtual().factory() — create a factory
Thread.Factory factory = Thread.ofVirtual().name("vt-", 0).factory();
Thread t1 = factory.newThread(() -> System.out.println("Hello from vt-1"));
t1.start();

// Method 3: ExecutorService — the most practical way
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    IntStream.range(0, 100_000).forEach(i -> {
        executor.submit(() -> {
            Thread.sleep(Duration.ofSeconds(1));
            return i;
        });
    });
}  // All 100,000 tasks complete within ~1 second

// Method 4: Spring Boot 3.2+ — automatic virtual threads
// spring.threads.virtual.enabled=true
```

---

## Line-by-Line Walkthrough

```java
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.*;

public class VirtualThreadsDemo {
    private static final HttpClient httpClient = HttpClient.newHttpClient();

    public static void main(String[] args) throws Exception {
        // Line 1: Virtual thread executor — 1 million concurrent tasks
        System.out.println("=== Virtual Thread Demo ===");

        long start = System.currentTimeMillis();

        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            // Line 2: Submit 10,000 tasks — each simulates an HTTP call
            List<Future<String>> futures = IntStream.range(0, 10_000)
                .mapToObj(i -> executor.submit(() -> {
                    // Each virtual thread "sleeps" (simulating I/O)
                    // Platform threads: 10,000 threads × 1MB = 10GB RAM
                    // Virtual threads: ~few MB total
                    Thread.sleep(Duration.ofMillis(100));
                    return "Task " + i + " completed in " +
                        Thread.currentThread() + " on " +
                        Thread.currentThread().threadId();
                }))
                .toList();

            // Line 3: Collect results
            long completed = futures.stream()
                .filter(f -> {
                    try { f.get(1, TimeUnit.SECONDS); return true; }
                    catch (Exception e) { return false; }
                })
                .count();

            System.out.println("Completed: " + completed + " tasks");
        }

        long elapsed = System.currentTimeMillis() - start;
        System.out.println("Total time: " + elapsed + "ms");

        // Line 4: Platform thread comparison
        System.out.println("\n=== Platform Thread Comparison ===");
        start = System.currentTimeMillis();

        try (var executor = Executors.newFixedThreadPool(200)) {
            List<Future<String>> futures = IntStream.range(0, 10_000)
                .mapToObj(i -> executor.submit(() -> {
                    Thread.sleep(Duration.ofMillis(100));
                    return "Task " + i;
                }))
                .toList();

            long completed = futures.stream()
                .filter(f -> {
                    try { f.get(5, TimeUnit.SECONDS); return true; }
                    catch (Exception e) { return false; }
                })
                .count();

            System.out.println("Completed: " + completed + " tasks");
        }

        elapsed = System.currentTimeMillis() - start;
        System.out.println("Total time: " + elapsed + "ms");

        // Line 5: Pinning — when virtual threads get stuck
        System.out.println("\n=== Pinning Demo ===");
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            // synchronized blocks cause pinning — virtual thread is "pinned"
            // to its carrier platform thread
            var lock = new Object();
            executor.submit(() -> {
                synchronized (lock) {  // PINNING: virtual thread stuck on carrier
                    try { Thread.sleep(Duration.ofSeconds(1)); }
                    catch (InterruptedException e) { }
                }
            });
        }
    }
}
```

---

## Pinning — The Main Gotcha

Virtual threads get **pinned** (stuck on a carrier thread) when:
1. Inside a `synchronized` block
2. Native method call

```java
// BAD: synchronized causes pinning
synchronized (sharedLock) {
    Thread.sleep(Duration.ofSeconds(1));  // Virtual thread pinned!
}

// GOOD: ReentrantLock doesn't cause pinning
var lock = new ReentrantLock();
lock.lock();
try {
    Thread.sleep(Duration.ofSeconds(1));  // Virtual thread free to unmount
} finally {
    lock.unlock();
}
```

---

## Real-World Scenarios

### Scenario 1: High-concurrency HTTP server

```java
// Spring Boot 3.2+ with virtual threads
// application.yml:
// spring.threads.virtual.enabled: true

@RestController
public class UserController {
    @GetMapping("/users/{id}")
    public User getUser(@PathVariable String id) {
        // Each request gets a virtual thread
        // 10,000 concurrent requests → 10,000 virtual threads
        // Only a few carrier threads needed
        return userService.findById(id);
    }
}
```

### Scenario 2: Parallel I/O operations

```java
public OrderData fetchOrderData(String orderId) throws Exception {
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
        var orderFuture = executor.submit(() -> orderService.getOrder(orderId));
        var customerFuture = executor.submit(() -> customerService.getCustomer(orderId));
        var inventoryFuture = executor.submit(() -> inventoryService.checkStock(orderId));

        return new OrderData(
            orderFuture.get(),
            customerFuture.get(),
            inventoryFuture.get()
        );
    }
}
```

---

## When to Use Virtual Threads

| Use Case | Virtual Threads? | Why |
|----------|-----------------|-----|
| HTTP request handling | ✅ Yes | I/O-bound, many concurrent requests |
| Database queries | ✅ Yes | I/O-bound, waiting for DB response |
| File operations | ✅ Yes | I/O-bound |
| REST API calls | ✅ Yes | I/O-bound, waiting for external services |
| CPU-intensive computation | ❌ No | No benefit over platform threads |
| Tight loops | ❌ No | No I/O to yield during |
| Graphics rendering | ❌ No | CPU-bound |

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `synchronized` blocks | Causes pinning | Use `ReentrantLock` instead |
| Creating platform thread pools | Defeats the purpose | Use `newVirtualThreadPerTaskExecutor()` |
| Expecting CPU speedup | Virtual threads are for I/O, not CPU | Use platform threads for CPU-bound work |
| Using ThreadLocal with virtual threads | Can cause memory leaks | Use scoped values (Java 21+) |
