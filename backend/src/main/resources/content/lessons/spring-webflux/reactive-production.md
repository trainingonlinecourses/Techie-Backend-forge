---
title: Reactive in Production — Schedulers, Blocking & Resilience
summary: Backpressure tuning, scheduler discipline, why blocking calls kill the event loop, resilience, and when to not go reactive.
order: 7
minutes: 20
topics: [backpressure, schedulers, subscribeOn, publishOn, blocking, resilience, production]
docs:
  - https://projectreactor.io/docs/core/release/reference/#schedulers
  - https://docs.spring.io/spring-framework/reference/web/webflux.html#webflux-thread-model
  - https://docs.spring.io/spring-boot/reference/actuator/metrics.html
---

# Reactive in Production — Schedulers, Blocking & Resilience

## The thread model — know your three threads

| Thread pool | Used for | Size |
|---|---|---|
| **Netty event loop** | I/O (HTTP, sockets) — never block here | = CPU cores × 2 |
| **Reactor `boundedElastic`** | Short blocking work (JDBC, legacy SDKs) | Default 10× cores |
| **`parallel` scheduler** | CPU-parallel work (`parallel()`/`flatMap` parallelism) | = CPU cores |

Two operators control *where* work runs:

```java
Flux<Row> rows = repo.findAll()
        .subscribeOn(Schedulers.boundedElastic())   // where the SOURCE runs
        .publishOn(Schedulers.parallel());          // where DOWNSTREAM operators run
```

- `subscribeOn` — picks the thread for the source (the DB query).
- `publishOn` — switches the downstream chain to another scheduler.

The event loop handles I/O; anything CPU-heavy or blocking must hop off it.

## The #1 production bug: blocking the event loop

```java
// ❌ DANGER — this stalls every request sharing the event loop thread
@GetMapping("/report")
public Mono<String> report() {
    return Mono.just(blockingLibrary.generateReport());   // blocks a Netty thread!
}
```

One blocking call (JDBC, `restTemplate`, `Thread.sleep`, `block()`) freezes a shared event-loop thread — the whole app's concurrency collapses, and the failure mode looks like "random timeouts under load". The fix, when you must wrap blocking work:

```java
@GetMapping("/report")
public Mono<String> report() {
    return Mono.fromCallable(() -> blockingLibrary.generateReport())
            .subscribeOn(Schedulers.boundedElastic());   // off the event loop ✅
}
```

**Review rule: no blocking calls in reactive chains unless wrapped in `boundedElastic`.**

## Backpressure in production

Default behavior is generally right: DB drivers and WebClient propagate demand. Tune when you see symptoms:

- **Slow consumer** → `limitRate(n)` requests from upstream in chunks; `onBackpressureBuffer(cap)` bounds an eager producer (with `BufferOverflowStrategy.ERROR` if you'd rather fail loud).
- **Skip/keep-latest** → `onBackpressureDrop`/`onBackpressureLatest` for telemetry where losing a sample is fine.
- Monitor with Micrometer: `reactor.netty` and `netty` metrics, queue sizes, and connection counts.

## Resilience — the reactive way

Reactive chains compose failure handling without new frameworks:

```java
Mono<Resp> call = client.call()
        .timeout(Duration.ofSeconds(2))                                  // fail fast
        .retryWhen(Retry.backoff(3, Duration.ofMillis(200)).jitter(0.5)) // transient retries
        .onErrorResume(e -> Mono.just(Resp.degraded()));                 // fallback
```

Resilience4j also ships reactive adapters (`Resilience4JCircuitBreakerFactory` with Reactor/`ReactiveResilience4JCircuitBreaker`) for circuit breakers in WebFlux. Combine: timeout → retry with jitter → circuit breaker → fallback, same as any microservice.

## Observability — context propagation is mandatory

Reactive hops threads on every operator; **trace ids do not follow automatically**. Wire Reactor context propagation (Micrometer Tracing + `Hooks.enableAutomaticContextPropagation()` / `ContextSnapshotFactory`), and thread-hop-aware logging:

```java
Hooks.enableAutomaticContextPropagation();   // at startup — trace/span across threads
```

Without it, a request spanning 5 reactive hops produces 5 unrelated log lines — the incident-response nightmare that makes teams quit reactive.

## When reactive is the wrong choice (the honest close)

- **CRUD on a relational DB with complex joins** — JPA + servlet is faster to build and maintain.
- **CPU-bound workloads** — reactive doesn't help; add machines or optimize the algorithm.
- **Thin services around blocking SDKs** — if 80% of your I/O is blocking anyway, reactive adds cost without benefit.
- **Small team, tight deadline, no reactive experience** — the learning curve is real.

The pragmatic org pattern: **reactive only where it pays** — gateway, streaming, high-concurrency fan-out — and servlet everywhere else. Mixed stacks are normal; mixed stacks *within one service* are the problem.

> **Why it matters (organizational view)** — Reactive production discipline is three rules: **never block the event loop** (boundedElastic or it's a review failure), **propagate context** (tracing across threads, else debugging is archaeology), and **enforce the stack boundary** (reactive for the hot paths, servlet for the rest — decided per service, not per developer mood). Instrument the event-loop occupancy and reactive metrics before launch; the failure modes (event-loop starvation, pool exhaustion) only appear under real load.

## Key takeaways

- Event loop = I/O; `boundedElastic` = short blocking work; `parallel` = CPU work; use `subscribeOn`/`publishOn`.
- Blocking calls in reactive chains stall the whole app — wrap them with `boundedElastic` or ban them.
- Tune backpressure (`limitRate`, `onBackpressureBuffer`) only when you see symptoms.
- Resilience composes: timeout → retry with jitter → breaker → fallback.
- Enable Reactor context propagation for tracing or you can't debug incidents.
- Reactive is for I/O-bound, high-concurrency, streaming paths — not CRUD, not CPU-bound, not teams without the experience.

## Official docs

- [Reactor — Schedulers](https://projectreactor.io/docs/core/release/reference/#schedulers)
- [Spring WebFlux — Thread Model](https://docs.spring.io/spring-framework/reference/web/webflux.html#webflux-thread-model)
- [Spring Boot — Actuator metrics (Micrometer)](https://docs.spring.io/spring-boot/reference/actuator/metrics.html)
