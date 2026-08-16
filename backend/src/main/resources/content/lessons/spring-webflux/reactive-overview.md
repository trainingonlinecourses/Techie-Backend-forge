---
title: Reactive Programming & When It Beats Servlet
summary: The reactive model, backpressure, the thread myth, and a decision framework for reactive vs servlet stacks.
order: 1
minutes: 18
topics: [reactive, webflux, backpressure, reactive-streams, architecture, servlet]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webflux.html
  - https://projectreactor.io/docs/core/release/reference/
  - https://www.reactive-streams.org
---

# Reactive Programming & When It Beats Servlet

## What "reactive" actually means

Reactive programming is a **dataflow + non-blocking** model: you declare how data flows through operators, and the runtime pushes events as they become available. The key idea from the **Reactive Streams spec** (four interfaces: `Publisher`, `Subscriber`, `Subscription`, `Processor`):

> **Backpressure** — consumers tell producers how much they can handle. A slow consumer asks for less; nobody buffers unboundedly.

Compare the two models:

| | Servlet (Tomcat, blocking) | WebFlux (Netty, reactive) |
|---|---|---|
| Thread model | 1 thread per request, blocked on I/O | A few event-loop threads, I/O never blocks |
| Concurrency | Limited by thread pool | Tens of thousands of concurrent connections |
| Memory per idle request | Thread stack (~1 MB) + blocking buffers | Negligible — just a pending callback |
| Programming style | Imperative, familiar | Declarative chains of `Mono`/`Flux` |
| Debugging | Stack traces you know | Harder — async, thread-hopping stacks |

## The thread myth — reactive is NOT "faster"

Reactive does not make a single request faster; it makes the **system handle far more concurrent load with far fewer threads**. The classic example: a blocking service that sleeps 200ms per call with a 200-thread pool handles ~1000 req/s. A reactive version with 8 event-loop threads can hold **millions of in-flight requests** — because nothing ever blocks a thread. The cost: more complex code, a different mental model, and harder debugging.

## When reactive beats servlet — and when it doesn't

**Reactive wins:**
- **High-concurrency, I/O-bound services** — gateways, aggregators, streaming APIs, anything fronting slow databases/external calls.
- **Long-lived connections** — WebSockets, server-sent events (SSE), real-time feeds; thousands of idle clients cost almost nothing.
- **Fan-out aggregation** — calling 10 downstream services in parallel (`flatMap`) without thread pools.
- **Backpressure-driven pipelines** — ingest where the producer outpaces the consumer.

**Reactive loses (pick servlet):**
- **Simple CRUD** — a servlet app with 20 threads handles it fine; reactive adds complexity with no benefit.
- **CPU-bound work** — rendering, crypto, heavy math. Reactive doesn't speed up CPU; it only helps I/O waiting.
- **Blocking third-party libraries** — JDBC, blocking SDKs. Forcing them into reactive is an antipattern (see the production lesson).
- **Team experience** — if the team knows servlet and has deadlines, the learning curve is real.

The honest industry pattern: **most services should stay servlet; WebFlux is the right tool for the hot paths** (gateway, feed, high-scale read APIs).

> **Why it matters (organizational view)** — This is a *platform decision*, not a per-endpoint toggle. Standardize on one stack per service and be explicit about the rule: "reactive for I/O-bound, high-concurrency and streaming services; servlet for everything else." The org pays for reactive in training, debugging tooling (tracer + Reactor context propagation) and incident response — and gets back dramatically lower memory per connection at scale. Two anti-patterns to ban in review: **blocking calls inside reactive chains**, and **reactive "because it's cool" on a CRUD service** — both waste the team's time.

## Key takeaways

- Reactive = non-blocking dataflow with backpressure; `Publisher`/`Subscriber` are the Reactive Streams primitives.
- Backpressure lets slow consumers stay healthy without unbounded buffering.
- Reactive improves *concurrency per thread*, not raw speed of a single request.
- Choose WebFlux for I/O-bound, high-concurrency, streaming, fan-out; choose servlet for CRUD, CPU-bound, and blocking-lib work.
- Decision rule: per-service stack choice, enforced in review.

## Official docs

- [Spring WebFlux Reference](https://docs.spring.io/spring-framework/reference/web/webflux.html)
- [Project Reactor Core Reference](https://projectreactor.io/docs/core/release/reference/)
- [Reactive Streams](https://www.reactive-streams.org)
