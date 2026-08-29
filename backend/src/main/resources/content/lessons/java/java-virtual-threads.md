---
title: Virtual Threads & Modern Concurrency — Complete Beginner's Guide
summary: Java 21 virtual threads explained from scratch — what they solve, how they work, Spring Boot integration, and the rules that keep them fast.
order: 14
minutes: 20
topics: [virtual-threads, loom, thread-per-request, carrier-threads, pinning, synchronized]
docs:
  - https://docs.oracle.com/en/java/javase/21/core/virtual-threads.html
  - https://spring.io/blog/2023/10/16/spring-boot-3-2-virtual-threads
---

# Virtual Threads & Modern Concurrency — Complete Beginner's Guide

## The problem virtual threads solve

**Traditional platform threads** are expensive. Each thread takes about 1MB of memory (for its stack) and is managed by the operating system. If you want to handle 10,000 concurrent requests, you need 10,000 threads — that's 10GB of memory just for thread stacks!

But here's the real problem: most of those threads are **waiting**. They're waiting for a database query, an HTTP call, or a file read. The thread is alive but doing nothing — just consuming memory.

```java
// This is the blocking model — the thread waits while the database thinks
public Order getOrder(String id) {
    Order order = database.query(id);     // Thread BLOCKS here — doing NOTHING for 50ms
    // During those 50ms, this thread can't serve any other request
    // If 1000 requests come in, you need 1000 threads
    return order;
}
```

**Virtual threads flip the model:** Instead of expensive OS threads, you get millions of cheap JVM-managed threads. When a virtual thread blocks on I/O, the JVM **parks it** and runs another virtual thread on the same OS thread. Thread-per-request is back, at scale:

```java
// Virtual threads — millions of cheap threads, scheduled by the JVM
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    // Line 1: Create an executor that gives each task its own virtual thread
    List<Future<Enrichment>> futures = orderIds.stream()
        .map(id -> executor.submit(() -> enrich(id)))  // Line 2: One virtual thread per task
        .toList();
    // Line 3: All tasks run concurrently, even with millions of them
    for (Future<Enrichment> f : futures) {
        results.add(f.get(2, TimeUnit.SECONDS));  // Line 4: Collect results
    }
}
```

## How virtual threads work internally

```
Virtual Thread 1: ──[running]──[parked: DB query]──────────[running]──
Virtual Thread 2: ──────[running]──[parked: HTTP call]──────[running]──
Virtual Thread 3: ──[running]──[parked: file read]──────────[running]──
                       ↓              ↓              ↓
Carrier Thread (OS): [VT1]      [VT2]          [VT3]
                     (one OS thread runs all three, switching when one parks)
```

**Key insight:** When a virtual thread blocks, it doesn't consume an OS thread. The JVM parks it (saves its state) and runs another virtual thread on the same carrier OS thread. From the OS's perspective, there are only a few threads running. From the application's perspective, there are millions of concurrent tasks.

## Enable in Spring Boot 3.2+

**One property — that's it:**

```yaml
# application.yml
spring:
  threads:
    virtual:
      enabled: true    # Line 1: This single property enables virtual threads
                       # Line 2: Tomcat request threads become virtual threads
                       # Line 3: @Async methods use virtual threads
```

**What changes when you flip this flag:**

```java
// BEFORE: This @RestController used platform threads
// With 200 threads, it could handle ~200 concurrent requests
@RestController
public class OrderController {
    @GetMapping("/orders/{id}")
    public Order order(@PathVariable String id) {
        return orderService.loadWithCustomersAndInventory(id);  // Blocking I/O
    }
}

// AFTER: Same code, but now virtual threads handle the blocking
// With virtual threads enabled, it can handle MILLIONS of concurrent requests
// The code doesn't change — the runtime does
```

**Line-by-line example of what happens:**

```java
@RestController
public class OrderController {
    @GetMapping("/orders/{id}")
    public Order order(@PathVariable String id) {
        // Line 1: A virtual thread is created for this request
        // Line 2: It calls the database — blocks for 50ms
        // Line 3: But it doesn't block an OS thread — the JVM parks it
        // Line 4: Another virtual thread can use the carrier OS thread
        // Line 5: When the DB responds, the virtual thread is unparked
        // Line 6: It continues executing on any available carrier thread
        return orderService.loadWithCustomersAndInventory(id);
        // Line 7: The response is sent back to the client
    }
}
```

## The rules that keep virtual threads fast

### Rule 1: Never pool virtual threads

```java
// WRONG — pooling defeats the purpose
ExecutorService pool = Executors.newFixedThreadPool(100);  // Platform threads

// RIGHT — one virtual thread per task
ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();  // Virtual threads
```

Virtual threads are cheap (a few KB each). Pooling them is like pooling objects — you create them when needed and let the GC collect them.

### Rule 2: Avoid `synchronized` around I/O (it PINNNS the carrier)

```java
// BAD — synchronized PINNS the carrier thread during I/O
synchronized (cache) {
    // Line 1: The carrier thread is LOCKED to this virtual thread
    // Line 2: Even though the virtual thread is blocking on I/O
    // Line 3: The carrier OS thread can't run other virtual threads
    customer = client.fetch(customerId);  // PINNED — carrier thread wasted!
}

// GOOD — ReentrantLock doesn't pin
cacheLock.lock();
try {
    customer = client.fetch(customerId);  // NOT PINNED — carrier thread is free
} finally {
    cacheLock.unlock();
}
```

**What "pinning" means:** When a virtual thread holds a `synchronized` lock while blocking on I/O, the JVM can't unmount it from the carrier thread. The carrier thread is stuck, waiting for the I/O — exactly the problem virtual threads were designed to solve.

### Rule 3: CPU-bound work stays on platform threads

```java
// Virtual threads don't make math faster
// For CPU-bound work, use platform threads
ExecutorService cpuExecutor = Executors.newFixedThreadPool(
    Runtime.getRuntime().availableProcessors()  // One thread per CPU core
);
```

Virtual threads are for I/O-bound work (database, HTTP, file). CPU-bound work (rendering, encryption, heavy computation) doesn't benefit from virtual threads.

### Rule 4: No ThreadLocal abuse

```java
// ThreadLocal is fine per-thread, but with millions of virtual threads...
private static final ThreadLocal<Formatter> formatter = 
    ThreadLocal.withInitial(Formatter::new);  // One Formatter per virtual thread!

// If you have 1 million virtual threads, that's 1 million Formatter objects
// Use ScopedValues instead (Java 21)
private static final ScopedValue<Formatter> formatter = ScopedValue.newInstance();
```

## Real-world scenario — e-commerce checkout

An e-commerce site during a flash sale gets 100,000 concurrent checkout requests. Each request:
1. Validates user session (fast — 1ms)
2. Checks inventory across 5 warehouses (slow — 200ms each, parallel)
3. Calculates shipping (fast — 10ms)
4. Charges payment (slow — 300ms)
5. Sends confirmation email (slow — 500ms)

**Platform threads (before):** Need 100,000 threads × 1MB = 100GB RAM. Most threads are just waiting.

**Virtual threads (after):** Need ~100 carrier OS threads. Same code, same logic, but now the threads are cheap and the waiting is free.

```java
@Service
public class CheckoutService {
    private final InventoryClient inventoryClient;
    private final PaymentClient paymentClient;
    private final EmailClient emailClient;
    
    @Async  // With virtual threads enabled, this runs on a virtual thread
    public CompletableFuture<CheckoutResult> checkout(Order order) {
        // Line 1: Check inventory across 5 warehouses (parallel, non-blocking)
        List<StockCheck> checks = IntStream.range(0, 5)
            .mapToObj(i -> inventoryClient.check(order.getSku(), i))  // Line 2: 5 parallel calls
            .toList();                                                 // Line 3: Collect results
        
        // Line 4: Process payment (blocking I/O — but virtual thread handles it)
        PaymentResult payment = paymentClient.charge(order);           // Line 5: 300ms blocked
        
        // Line 6: Send confirmation email (fire and forget)
        emailClient.sendConfirmation(order);                           // Line 7: Non-blocking
        
        return CompletableFuture.completedFuture(                      // Line 8: Return result
            new CheckoutResult(order, checks, payment)
        );
    }
}
```

## Measuring the impact

```bash
# Before (platform threads):
wrk -t4 -c1000 -d30s http://localhost:8080/orders/123
# Results: 500 req/s, p99: 2000ms (thread pool exhausted)

# After (virtual threads):
wrk -t4 -c1000 -d30s http://localhost:8080/orders/123
# Results: 50,000 req/s, p99: 100ms (no thread pool exhaustion)
```

## Key takeaways

- Virtual threads = cheap thread-per-request; blocking code that scales
- One property in Spring Boot 3.2+ enables them for Tomcat + `@Async`
- Never pool; `ReentrantLock` over `synchronized`; CPU-bound stays on platform threads
- Measure p99 under load before and after — that's the adoption argument
- The biggest win: I/O-bound business backends (databases, message brokers, external APIs)

**Official docs:** [Virtual threads (Oracle)](https://docs.oracle.com/en/java/javase/21/core/virtual-threads.html) · [Spring Boot 3.2 + virtual threads](https://spring.io/blog/2023/10/16/spring-boot-3-2-virtual-threads)
