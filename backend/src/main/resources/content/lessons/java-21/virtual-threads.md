---
title: "Virtual Threads — Millions of Threads Without the Pain"
summary: "What virtual threads are, why they change everything about Java concurrency, how they differ from platform threads, and how organizations use them to build scalable systems."
order: 5
minutes: 25
topics: [virtual-threads, project-loom, java-21, concurrency, fibers, thread-per-request, structured-concurrency]
docs:
  - https://openjdk.org/jeps/444
  - https://openjdk.org/jeps/453
---

## The Concept, From Zero

### What are Virtual Threads?

For 25 years, Java developers had one choice for concurrency: **platform threads**. Each platform thread maps to an OS thread, which uses about 1MB of stack memory. This means:

- 1,000 threads = ~1GB RAM
- 10,000 threads = ~10GB RAM (usually crashes)
- 100,000 threads = impossible

**Virtual threads change everything.** Introduced as a preview in Java 19 and finalized in Java 21 (JEP 444), virtual threads are lightweight threads managed by the JVM, not the OS. They use about **1KB** of stack memory:

- 1,000 virtual threads = ~1MB RAM
- 1,000,000 virtual threads = ~1GB RAM
- 10,000,000 virtual threads = possible!

### Why Virtual Threads Exist

The problem is **thread-per-request** architecture. When a web server gets 10,000 concurrent requests, it needs 10,000 threads. With platform threads, this is expensive. With virtual threads, it's trivial.

**The key insight:** Most threads spend most of their time **waiting** — for database queries, HTTP calls, file I/O. Virtual threads free the underlying OS thread during waits, letting thousands of virtual threads share a small pool of platform threads.

### How Virtual Threads Differ from Platform Threads

```java
public class ThreadComparison {
    public static void main(String[] args) {
        // Platform thread — expensive, OS-managed
        Thread platformThread = Thread.ofPlatform().name("platform-1").start(() -> {
            System.out.println("Running on platform thread: " + Thread.currentThread());
        });
        
        // Virtual thread — lightweight, JVM-managed
        Thread virtualThread = Thread.ofVirtual().name("virtual-1").start(() -> {
            System.out.println("Running on virtual thread: " + Thread.currentThread());
        });
        
        // They look the same from your code's perspective
        // But virtual threads use ~1000x less memory
    }
}
```

### Creating Virtual Threads

```java
public class CreatingVirtualThreads {
    public static void main(String[] args) throws Exception {
        // Method 1: Thread.ofVirtual()
        Thread vt1 = Thread.ofVirtual().name("vt-1").start(() -> {
            System.out.println("Hello from virtual thread!");
        });
        vt1.join();
        
        // Method 2: VirtualThreadPool (ExecutorService)
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            IntStream.range(0, 100_000).forEach(i -> {
                executor.submit(() -> {
                    Thread.sleep(Duration.ofMillis(100));
                    return i;
                });
            });
        } // All 100,000 tasks complete — no thread exhaustion
        
        // Method 3: Virtual thread factory
        var factory = Thread.ofVirtual().name("vt-", 0).factory();
        try (var executor = Executors.newFixedThreadPool(10, factory)) {
            // 10 platform threads, unlimited virtual threads
        }
    }
}
```

### The Pinning Problem

Virtual threads have one important limitation: **pinning**. When a virtual thread holds a `synchronized` block or native method, it cannot be unmounted from its platform thread:

```java
public class PinningDemo {
    private static final Object lock = new Object();
    
    static void pinnedVirtualThread() {
        synchronized (lock) {
            // This virtual thread is PINNED to its platform thread
            // It cannot be unmounted during this block
            // If the thread sleeps here, the platform thread is wasted
            Thread.sleep(Duration.ofSeconds(1)); // BAD — pinning
        }
    }
    
    static void unpinnedVirtualThread() {
        try (var guard = ScopedValue.where(...). ...) {
            // No synchronized block — virtual thread can be unmounted
            Thread.sleep(Duration.ofSeconds(1)); // GOOD — not pinned
        }
    }
}
```

**How to avoid pinning:**
1. Use `ReentrantLock` instead of `synchronized`
2. Avoid native methods inside virtual threads
3. Use `StructuredTaskScope` for structured concurrency

### Structured Concurrency

Virtual threads work best with **structured concurrency** — a way to manage concurrent tasks that ensures:

1. **Lifecycle management** — when a scope ends, all tasks are cancelled
2. **Error propagation** — failures in child tasks propagate to the parent
3. **No thread leaks** — tasks cannot outlive their scope

```java
import jdk.incubator.concurrent.StructuredTaskScope;

public class StructuredConcurrencyDemo {
    record User(String name, String email) {}
    record Order(String id, double total) {}
    record UserOrders(User user, List<Order> orders) {}
    
    static UserOrders fetchUserOrders(long userId) throws Exception {
        try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
            // Launch both fetches concurrently
            Subtask<User> userTask = scope.fork(() -> fetchUser(userId));
            Subtask<List<Order>> ordersTask = scope.fork(() -> fetchOrders(userId));
            
            // Wait for both to complete
            scope.join();
            scope.throwIfFailed(); // Propagate errors
            
            // Both are done — safe to access results
            return new UserOrders(userTask.get(), ordersTask.get());
        }
    }
}
```

### ScopedValues (Context Propagation)

Scoped values replace `ThreadLocal` for passing context to virtual threads:

```java
public class ScopedValueDemo {
    // Define a scoped value — like ThreadLocal but for virtual threads
    private static final ScopedValue<User> CURRENT_USER = ScopedValue.newInstance();
    
    static String processRequest(User user) {
        // Set the scoped value for this scope
        return ScopedValue.where(CURRENT_USER, user).run(() -> {
            // All code in this scope (and child virtual threads)
            // can read CURRENT_USER.get()
            return handleRequest();
        });
    }
    
    static String handleRequest() {
        User user = CURRENT_USER.get(); // Accessible!
        return "Processing for " + user.name();
    }
}
```

### Platform Threads vs Virtual Threads

| Aspect | Platform Thread | Virtual Thread |
|--------|----------------|----------------|
| **Memory** | ~1MB stack | ~1KB stack |
| **Creation cost** | Expensive (OS call) | Cheap (JVM allocation) |
| **Scheduling** | OS scheduler | JVM scheduler |
| **Pinning** | N/A | Pinned during synchronized/native |
| **Max count** | ~10,000 | ~10,000,000 |
| **Use case** | CPU-intensive work | I/O-bound work |

### Organization Use Cases

**1. Web Server Request Handling**
```java
// Spring Boot automatically uses virtual threads with this config
spring.threads.virtual.enabled=true

// Every HTTP request gets its own virtual thread
// Thousands of concurrent requests? No problem.
```

**2. Database Connection Pool Efficiency**
```java
// Before: 200 platform threads, 200 DB connections
// After: 10,000 virtual threads, 200 DB connections

try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    // 10,000 concurrent DB queries
    // Only 200 actual DB connections
    // Virtual threads wait for connections without blocking OS threads
}
```

**3. Microservice Fan-Out**
```java
public CompletableFuture<UserDashboard> getDashboard(long userId) {
    try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
        var userTask = scope.fork(() -> userService.getUser(userId));
        var ordersTask = scope.fork(() -> orderService.getOrders(userId));
        var recsTask = scope.fork(() -> recommendationService.getRecs(userId));
        
        scope.join().throwIfFailed();
        
        return new UserDashboard(
            userTask.get(), ordersTask.get(), recsTask.get()
        );
    }
}
```

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `synchronized` blocks | Pins virtual thread to platform thread | Use `ReentrantLock` instead |
| Using `ThreadLocal` with virtual threads | Values shared across virtual threads | Use `ScopedValue` instead |
| Creating platform threads for I/O | Wastes OS threads | Use virtual threads for I/O |
| Using virtual threads for CPU-bound work | No benefit — JVM can't unmount during CPU work | Use platform threads for CPU-intensive tasks |
| Not joining virtual threads | Thread leaks | Use try-with-resources or join |

### Line-by-Line Code Explanation

```java
import jdk.incubator.concurrent.StructuredTaskScope;
// ↑ Import structured concurrency — only available with --enable-preview in Java 21
// ↑ Will be finalized in a future Java version

public class VirtualThreadDemo {
    // ↑ Main class demonstrating virtual threads
    
    static void fetchMultipleUrls(List<String> urls) throws Exception {
        // ↑ Method that fetches multiple URLs concurrently
        
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            // ↑ Creates an ExecutorService with virtual threads
            // ↑ "per task" = each submitted task gets its own virtual thread
            // ↑ try-with-resources = auto-closes when done
            
            List<Future<String>> futures = urls.stream()
                .map(url -> executor.submit(() -> fetchUrl(url)))
                // ↑ Each URL fetch runs on its own virtual thread
                // ↑ Virtual threads are cheap — 10,000 URLs? No problem
                
                .toList();
            
            for (Future<String> future : futures) {
                System.out.println(future.get());
                // ↑ .get() blocks until the result is ready
                // ↑ If this was platform threads, we'd need 10,000 OS threads
                // ↑ With virtual threads, the OS threads are freed during waits
            }
        }
        // ↑ All virtual threads are cancelled when the executor closes
        // ↑ No thread leaks — structured lifecycle management
    }
}
```

### Key Takeaways

1. **Virtual threads are lightweight** — 1KB vs 1MB per thread
2. **Millions of concurrent threads** — possible on modest hardware
3. **Same API as platform threads** — `Thread.ofVirtual().start()`
4. **Avoid `synchronized`** — use `ReentrantLock` to prevent pinning
5. **Structured concurrency** — manage task lifecycles safely
6. **ScopedValues replace ThreadLocal** — context propagation for virtual threads
7. **Best for I/O-bound work** — not CPU-intensive tasks

### Real-World Organization Scenario

A SaaS platform handles 50,000 concurrent WebSocket connections. With platform threads, they needed 50,000 threads (~50GB RAM). Switching to virtual threads reduced memory to ~50GB → ~50MB, and the server now handles 500,000 connections on the same hardware. The key change: replacing `synchronized` blocks with `ReentrantLock` to avoid pinning.
