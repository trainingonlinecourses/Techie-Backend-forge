---
title: Virtual Threads & Modern Concurrency
summary: Java 21 virtual threads — thread-per-request at scale, how Spring Boot enables them, and the rules that keep them fast.
order: 12
minutes: 15
topics: [virtual-threads, loom, thread-per-request]
docs:
  - https://docs.oracle.com/en/java/javase/21/core/virtual-threads.html
  - https://spring.io/blog/2023/10/16/spring-boot-3-2-virtual-threads
---

# Virtual Threads & Modern Concurrency

## The problem virtual threads solve

Classic platform threads are expensive: ~1MB of stack each, kernel-managed. Blocking I/O (a DB call, an HTTP call) parks the OS thread — so services tuned for high concurrency need thread pools sized carefully, or non-blocking code that's hard to write and read.

**Virtual threads** flip the model: millions of cheap threads, scheduled by the JVM onto a small pool of carrier OS threads. When a virtual thread blocks on I/O, the JVM *parks the virtual thread* and runs another one on the carrier. Thread-per-request is back, at scale:

```java
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    List<Future<Enrichment>> futures = orderIds.stream()
            .map(id -> executor.submit(() -> enrich(id)))     // one virtual thread per task
            .toList();
    for (Future<Enrichment> f : futures) results.add(f.get(2, TimeUnit.SECONDS));
}
```

## Enable in Spring Boot 3.2+

```yaml
spring:
  threads:
    virtual:
      enabled: true
```

With this one property, Tomcat request threads **and** `@Async` methods become virtual threads. A `@RestController` that blocks on a database call now blocks a ~few-KB virtual thread instead of a 1MB platform thread — same blocking code, far higher throughput.

```java
@RestController
class OrderController {
    @GetMapping("/orders/{id}")
    public Order order(@PathVariable String id) {
        return orderService.loadWithCustomersAndInventory(id); // blocking I/O is fine now
    }
}
```

## The rules that keep virtual threads fast

1. **Never pool virtual threads** — one per task (`newVirtualThreadPerTaskExecutor`), that's the whole point.
2. **Avoid `synchronized` around I/O** — it *pins* the carrier thread. Use `ReentrantLock` instead.
3. **CPU-bound work stays on platform threads** — virtual threads don't make math faster.
4. **No thread-local abuse** — ThreadLocals are cheap per-thread but now you have millions; Spring manages its own (transaction, security context) correctly.

```java
// Pinning example: synchronized + blocking I/O pins the carrier (bad)
synchronized (cache) {
    customer = client.fetch(customerId);   // carrier parked while holding the lock
}
// Prefer ReentrantLock:
cacheLock.lock();
try { customer = client.fetch(customerId); }
finally { cacheLock.unlock(); }
```

> **Why it matters (organizational view)** — Virtual threads are the biggest platform-level win of Java 21 for typical business backends, because *most* services are I/O-bound: databases, message brokers, external APIs. Teams adopt them as: upgrade to 21 → flip `spring.threads.virtual.enabled` in a load-test environment → compare p99 latency under identical load → ship. No code rewrites, no reactive rewrite — the same blocking style just scales.

## Key takeaways

- Virtual threads = cheap thread-per-request; blocking code that scales.
- One property in Spring Boot 3.2+ enables them for Tomcat + `@Async`.
- No pooling; `ReentrantLock` over `synchronized`; CPU-bound stays on platform threads.
- Measure p99 under load before and after — that's the adoption argument.

**Official docs:** [Virtual threads (Oracle)](https://docs.oracle.com/en/java/javase/21/core/virtual-threads.html) · [Spring Boot 3.2 + virtual threads](https://spring.io/blog/2023/10/16/spring-boot-3-2-virtual-threads)
