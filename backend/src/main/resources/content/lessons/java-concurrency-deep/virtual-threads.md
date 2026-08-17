---
title: Virtual Threads (Project Loom)
module: java-concurrency-deep
order: 5
minutes: 25
topics: ["virtual threads", "structured concurrency", "millions of threads", "platform threads", "Spring Boot virtual threads"]
docs:
  - title: "Virtual threads"
    url: "https://docs.oracle.com/en/java/javase/21/core/virtual-threads.html"
---

# Virtual Threads (Project Loom)

Virtual threads (Java 21) are the biggest concurrency change since lambdas: **millions of lightweight threads** that make blocking I/O cheap. The classic "one thread per request" model — previously impossible at scale — is back, and Spring Boot 3.2 can run it with one property.

## The Problem Virtual Threads Solve

Traditional servers cap concurrency at thread count (default ~200 Tomcat threads). A service call taking 500ms of I/O **blocks a 200-thread pool** — 200 concurrent users saturate it. Workarounds (async, reactive) complicate code.

Virtual threads flip the economics:

```
Platform thread:   ~1MB stack, OS-scheduled, expensive to create/block
Virtual thread:    ~few KB, JVM-scheduled, blocks for free
```

A blocking call on a virtual thread **doesn't block a platform thread** — the JVM parks the virtual thread and runs another on the carrier. Blocking I/O becomes the *efficient* style again.

## The Model

```java
// Platform thread (carrier) + many virtual threads multiplexed on it
Thread vThread = Thread.startVirtualThread(() -> {
    httpClient.send(request, BodyHandlers.ofString());   // blocks the VIRTUAL thread only
});
```

```
Platform thread 1: [VT-A] [VT-C] [VT-E] ...   — VT-A parks on I/O, VT-C runs
Platform thread 2: [VT-B] [VT-D] ...
```

One platform thread (carrier) runs many virtual threads, switching when one blocks. Blocking is free; the JVM handles the multiplexing.

## Creating Virtual Threads

```java
// 1. Direct
Thread v = Thread.startVirtualThread(() -> work());

// 2. Builder
Thread v = Thread.ofVirtual()
    .name("vtask-", 0)
    .start(() -> work());

// 3. With an executor
ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
executor.submit(() -> work());
// one virtual thread per task — no pool sizing, no queue tuning
```

`newVirtualThreadPerTaskExecutor` is the killer API: it creates a new virtual thread per task and **shuts down with try-with-resources** (Java 19+):

```java
try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
    List<Future<String>> futures = urls.stream()
        .map(url -> executor.submit(() -> fetch(url)))
        .toList();
    // all fetches run concurrently — thousands of virtual threads
}
```

## The Million-Thread Example

```java
// Fetch 100,000 URLs concurrently — previously impossible with 1MB-stack threads
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    List<Future<String>> results = urls.parallelStream()   // no — use submit
        ...
}
```

```java
List<String> bodies = IntStream.range(0, 100_000)
    .mapToObj(i -> executor.submit(() -> fetch(url(i))))
    .map(f -> {
        try { return f.get(); } catch (Exception e) { return "error"; }
    })
    .toList();
```

100k blocking fetches, one JVM, no pool sizing — each fetch parks its virtual thread and the carriers keep running others.

## Virtual Threads in Spring Boot

Spring Boot 3.2+: enable virtual threads with **one property**:

```yaml
spring:
  threads:
    virtual:
      enabled: true
```

Tomcat now handles each request on a virtual thread. The blocking style you already write (`restClient.get().body(...)`) becomes the scalable style — no reactive rewrite:

```java
// ✅ Simple blocking code, virtual-thread scalable
@GetMapping("/orders/{id}")
public OrderDetail getOrder(@PathVariable Long id) {
    Order order = orderService.findById(id);        // blocks a VIRTUAL thread
    Customer customer = customerService.findById(order.customerId());  // fine!
    return new OrderDetail(order, customer);
}
```

## Constraints and Gotchas

| Constraint | Why | Fix |
|-----------|-----|-----|
| No thread-local abuse | Virtual threads are many; ThreadLocals cost memory | Scoped values (preview) or pass context |
| No pinning (long `synchronized` blocks) | Pins the carrier thread | Prefer ReentrantLock, short sync blocks |
| No pooling | Virtual threads are cheap — don't pool them | `newVirtualThreadPerTaskExecutor` |
| Don't use `parallelStream` inside | ForkJoin pool ≠ virtual threads | Use the per-task executor |
| Native/JNI blocking calls | Can't be unmounted | Avoid in hot paths |

### The Pinning Problem

```java
// synchronized BLOCKS the carrier thread (pinning) — kills the benefit
synchronized (lock) {
    blockingIo();      // carrier is stuck here
}

// ReentrantLock does NOT pin
lock.lock();
try {
    blockingIo();      // virtual thread parks, carrier is free
} finally {
    lock.unlock();
}
```

Pinning = a virtual thread blocks its carrier. Short `synchronized` blocks are fine; long ones (holding through I/O) defeat the purpose.

## Structured Concurrency (Preview)

Java 21 previews **structured concurrency** — tasks scoped to a block, like a try-with-resources for threads:

```java
// Java 21 preview: StructuredTaskScope
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    Future<Order> orderF = scope.fork(() -> loadOrder(id));
    Future<Customer> customerF = scope.fork(() -> loadCustomer(id));

    scope.join();                 // wait for all
    scope.throwIfFailed();        // propagate the first failure

    return new OrderDetail(orderF.resultNow(), customerF.resultNow());
}
// ALL subtasks cancelled/joined when the scope exits — no leaks
```

The guarantee that makes structured concurrency special: **no orphaned threads** — if the scope exits early, subtasks are cancelled and joined.

## Virtual Threads vs. Reactive

| | Virtual threads (blocking) | Reactive (WebFlux) |
|--|---------------------------|---------------------|
| Style | Plain blocking code | Mono/Flux composition |
| Learning curve | None | Steep |
| Debugging | Normal stack traces | Hard |
| Existing code | Works as-is | Rewrite required |
| Best for | I/O-bound services | Streaming, high-throughput |
| Maturity (2026) | Production (Java 21+) | Production |

For most backend services, virtual threads make reactive unnecessary: same scalability, none of the complexity. Reactive stays valuable for streaming and extreme throughput.

## Summary

| Concept | Key fact |
|---------|----------|
| Virtual thread | Lightweight, JVM-scheduled, cheap to block |
| Carrier | Platform thread that runs virtual threads |
| Creation | `Thread.startVirtualThread`, `Executors.newVirtualThreadPerTaskExecutor()` |
| Spring Boot | `spring.threads.virtual.enabled=true` |
| Pinning | Long `synchronized` blocks pin carriers |
| ThreadLocals | Avoid — virtual threads are numerous |
| Structured concurrency | Preview: scoped, leak-free task groups |

Virtual threads make blocking I/O scalable again — millions of cheap threads, plain code, one property in Spring Boot. They're the pragmatic alternative to reactive complexity for the vast majority of backend workloads: same concurrency, dramatically simpler code.
