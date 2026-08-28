---
title: Reactive Programming & When It Beats Servlet — Complete Guide
summary: The reactive model explained from scratch, backpressure, the thread myth, Mono/Flux, and a decision framework for reactive vs servlet stacks.
order: 1
minutes: 22
topics: [reactive, webflux, backpressure, reactive-streams, architecture, servlet, mono, flux]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webflux.html
  - https://projectreactor.io/docs/core/release/reference/
  - https://www.reactive-streams.org
---

# Reactive Programming & When It Beats Servlet

## What "reactive" actually means — explained from zero

**Traditional (imperative) programming** is like ordering at a restaurant: you tell the waiter what you want, you wait while they prepare it, and you get your food. One thread (the waiter) handles one customer at a time. If the kitchen is slow, the waiter just stands there waiting.

**Reactive programming** is like a sushi conveyor belt: chefs prepare dishes and put them on the belt. Customers pick what they want as it arrives. If a customer is slow, the belt keeps moving — the chef doesn't wait.

```java
// TRADITIONAL (blocking) — the thread waits for the database
public Order getOrder(String id) {
    Order order = database.query(id);     // Thread BLOCKS here — doing nothing while waiting
    return order;                         // Only then does it return
}

// REACTIVE (non-blocking) — the thread moves on immediately
public Mono<Order> getOrder(String id) {
    return database.findById(id)          // Returns IMMEDIATELY — a "promise" of future data
        .map(order -> enrich(order));     // Enrichment happens when data arrives, not now
}
```

**The key insight:** In the traditional model, one thread handles one request from start to finish. In the reactive model, a few threads handle THOUSANDS of requests by never waiting — they schedule work and move on to the next request.

## The Reactive Streams spec — four interfaces

The Reactive Streams specification (Java 9+ standard) defines exactly four interfaces:

```java
// Publisher — produces data (the database, the API call, the file)
public interface Publisher<T> {
    void subscribe(Subscriber<? super T> s);  // A subscriber signs up to receive data
}

// Subscriber — receives and processes data
public interface Subscriber<T> {
    void onSubscribe(Subscription s);    // Called first — gives the subscriber a handle
    void onNext(T item);                 // Called for each piece of data
    void onError(Throwable t);           // Called if something goes wrong
    void onComplete();                   // Called when all data is sent
}

// Subscription — the handle between publisher and subscriber
public interface Subscription {
    void request(long n);   // Subscriber asks for N items (BACKPRESSURE!)
    void cancel();          // Subscriber says "I'm done"
}

// Processor — combines Publisher and Subscriber (a transformation step)
public interface Processor<T, R> extends Publisher<R>, Subscriber<T> {}
```

**Backpressure** is the killer feature: when the producer is faster than the consumer, the consumer can say "slow down, I can only handle 10 items at a time" via `request(n)`. Nobody buffers unboundedly.

## Mono and Flux — Reactor's types

Spring WebFlux uses **Project Reactor**, which provides two types:

```java
// Mono<T> — 0 or 1 element (like Optional<T> but reactive)
Mono<User> user = userRepository.findById(id);  // One user, or empty

// Flux<T> — 0 to N elements (like Stream<T> but reactive)
Flux<Order> orders = orderRepository.findByCustomerId(id);  // Many orders
```

**Line-by-line code example:**

```java
@Service
public class OrderService {
    private final OrderRepository orderRepo;       // Line 1: Reactive repository (R2DBC)
    private final InventoryClient inventoryClient; // Line 2: Reactive HTTP client (WebClient)
    
    // Line 3: Constructor injection — Spring provides the dependencies
    public OrderService(OrderRepository orderRepo, InventoryClient inventoryClient) {
        this.orderRepo = orderRepo;                // Line 4: Store the repository
        this.inventoryClient = inventoryClient;    // Line 5: Store the HTTP client
    }
    
    // Line 6: Returns Mono — a "promise" of one Order
    public Mono<Order> enrichOrder(String orderId) {
        return orderRepo.findById(orderId)         // Line 7: Query DB (non-blocking)
            .flatMap(order ->                      // Line 8: When order arrives, enrich it
                inventoryClient                     // Line 9: Call inventory service (non-blocking)
                    .checkStock(order.getSku())    // Line 10: Check if item is in stock
                    .map(stock ->                  // Line 11: When stock info arrives
                        order.withStock(stock)     // Line 12: Combine order + stock info
                    )
            );                                     // Line 13: Returns Mono<Order> immediately
    }
}
```

**What happens at runtime:**
1. Line 7: The DB query is fired — but the thread doesn't wait
2. Line 8: `flatMap` says "when the order arrives, do this next step"
3. Line 9-10: When the order arrives, the inventory call is fired — thread doesn't wait again
4. Line 11-12: When stock info arrives, it's combined with the order
5. The entire chain returns a `Mono<Order>` immediately — no thread is blocked at any point

## The thread myth — reactive is NOT "faster"

Reactive does not make a single request faster. A database query that takes 50ms takes 50ms regardless of the programming model. What reactive changes is **how many concurrent requests** your system can handle:

| Model | Threads needed for 10,000 concurrent requests | Memory per idle request |
|---|---|---|
| **Servlet (blocking)** | ~10,000 threads | ~1 MB (thread stack) |
| **WebFlux (reactive)** | ~8-16 threads | ~few KB (callback) |

The classic example: a blocking service that sleeps 200ms per call with a 200-thread pool handles ~1,000 req/s. A reactive version with 8 event-loop threads can hold **millions of in-flight requests** — because nothing ever blocks a thread.

## Servlet vs WebFlux — the comparison

| | Servlet (Tomcat, blocking) | WebFlux (Netty, reactive) |
|---|---|---|
| **Thread model** | 1 thread per request, blocked on I/O | A few event-loop threads, I/O never blocks |
| **Concurrency** | Limited by thread pool size | Tens of thousands of concurrent connections |
| **Memory per idle request** | Thread stack (~1 MB) + blocking buffers | Negligible — just a pending callback |
| **Programming style** | Imperative, familiar | Declarative chains of `Mono`/`Flux` |
| **Debugging** | Stack traces you know | Harder — async, thread-hopping stacks |
| **Learning curve** | Low — everyone knows it | High — new mental model |

## When reactive beats servlet — and when it doesn't

**Reactive WINS (use WebFlux):**
- **High-concurrency, I/O-bound services** — gateways, aggregators, streaming APIs
- **Long-lived connections** — WebSockets, server-sent events (SSE), real-time feeds
- **Fan-out aggregation** — calling 10 downstream services in parallel without thread pools
- **Backpressure-driven pipelines** — ingest where the producer outpaces the consumer

**Reactive LOSES (stay with Servlet):**
- **Simple CRUD** — a servlet app with 20 threads handles it fine
- **CPU-bound work** — rendering, crypto, heavy math. Reactive doesn't speed up CPU
- **Blocking third-party libraries** — JDBC, blocking SDKs. Forcing them into reactive is an antipattern
- **Team experience** — if the team knows servlet and has deadlines, the learning curve is real

**The honest industry pattern:** most services should stay servlet; WebFlux is the right tool for the hot paths.

## A real-world scenario — API Gateway

An API gateway receives 50,000 concurrent connections from mobile apps. Each request:
1. Validates a JWT token (fast)
2. Calls 3 downstream services (slow — 200ms each)
3. Aggregates the responses (fast)

**With Servlet:** 50,000 threads × 1MB = 50GB of thread stacks alone. Most threads are just waiting for the downstream services.

**With WebFlux:** 16 event-loop threads handle all 50,000 connections. When a downstream service is slow, the thread moves to the next request. Memory usage: ~200MB.

```java
// WebFlux gateway — handles 50K concurrent connections with 16 threads
@RestController
public class GatewayController {
    private final WebClient webClient;  // Reactive HTTP client
    
    @GetMapping("/api/products/{id}")
    public Mono<ProductAggregate> getProduct(@PathVariable String id) {
        return Mono.zip(                                    // Line 1: Call 3 services in parallel
            webClient.get().uri("/products/{id}", id).retrieve().bodyToMono(Product.class),
            webClient.get().uri("/reviews/{id}", id).retrieve().bodyToMono(Reviews.class),
            webClient.get().uri("/inventory/{id}", id).retrieve().bodyToMono(Stock.class)
        ).map(tuple -> new ProductAggregate(                 // Line 2: Combine results
            tuple.getT1(), tuple.getT2(), tuple.getT3()
        ));
    }
}
```

## Key takeaways

- Reactive = non-blocking dataflow with backpressure; `Publisher`/`Subscriber` are the primitives
- Backpressure lets slow consumers stay healthy without unbounded buffering
- Reactive improves *concurrency per thread*, not raw speed of a single request
- Choose WebFlux for I/O-bound, high-concurrency, streaming, fan-out; choose Servlet for CRUD, CPU-bound
- Decision rule: per-service stack choice, enforced in review

**Official docs:** [Spring WebFlux Reference](https://docs.spring.io/spring-framework/reference/web/webflux.html) · [Project Reactor](https://projectreactor.io/docs/core/release/reference/) · [Reactive Streams](https://www.reactive-streams.org)
