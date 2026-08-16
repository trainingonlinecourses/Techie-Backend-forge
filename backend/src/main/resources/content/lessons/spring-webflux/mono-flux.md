---
title: Mono & Flux — The Reactive Types
summary: Publisher subtypes, creation, the operator toolbox (map, flatMap, error handling), and backpressure in practice.
order: 2
minutes: 20
topics: [reactor, mono, flux, operators, backpressure, flatMap]
docs:
  - https://projectreactor.io/docs/core/release/reference/#getting-started
  - https://projectreactor.io/docs/core/release/reference/#which-operator
---

# Mono & Flux — The Reactive Types

## The two types

`Publisher<T>` has two practical implementations in Project Reactor:

- **`Mono<T>`** — emits **0 or 1** item (then completes). Use for a single value: one entity, one HTTP response, one DB row.
- **`Flux<T>`** — emits **0..N** items (then completes). Use for streams: a list, a feed, a download.

```java
Mono<String> one = Mono.just("hello");            // one value
Mono<String> none = Mono.empty();                 // completes without a value
Mono<String> err = Mono.error(new RuntimeException("boom"));
Flux<Integer> many = Flux.range(1, 5);            // 1,2,3,4,5
Flux<Long> ticks = Flux.interval(Duration.ofSeconds(1)); // infinite timer stream
Flux<Customer> all = customerRepo.findAll();      // reactive DB query
```

## Nothing happens until you subscribe

A `Publisher` is a **declaration**, not a computation. Operators build a pipeline; **subscribing** starts the flow:

```java
Flux.range(1, 10)
    .map(i -> i * 2)
    .subscribe(System.out::println);   // ← now it runs (prints 2..20)

// Blocking escape hatches (tests, main methods — NEVER in a server request):
int v = Mono.just(42).block();                 // block until done
List<Integer> l = Flux.range(1, 5).collectList().block();
```

## The operator toolbox

```java
Flux<Order> orders = orderRepo.findByCustomer(customerId);

// map: 1:1 transform of values
Flux<String> ids = orders.map(Order::getId);

// filter: keep matching
Flux<Order> big = orders.filter(o -> o.amount().compareTo(BigDecimal.valueOf(100)) > 0);

// flatMap: 1:N, async, INTERLEAVED — for calling services/DBs per item
Flux<Inventory> stock = orders.flatMap(o -> inventoryClient.stockFor(o.sku()));

// concatMap: 1:N, async, PRESERVES ORDER (slower — sequential per source item)
Flux<Inventory> ordered = orders.concatMap(o -> inventoryClient.stockFor(o.sku()));

// zip: combine two publishers pairwise
Mono<OrderSummary> summary = Mono.zip(orderMono, customerMono, OrderSummary::of);

// take: limit; timeout: cap wait; retry: re-subscribe on error
Flux<Quote> first3 = quoteStream.take(3);
Mono<Resp> guarded = client.call().timeout(Duration.ofSeconds(2)).retryWhen(Retry.backoff(3, Duration.ofMillis(200)));
```

The **flatMap vs concatMap** distinction is the #1 interview question: `flatMap` subscribes to inner publishers as they arrive (fast, order lost); `concatMap` queues them (order kept, sequential).

## Error handling — reactive has no try/catch

Errors travel down the pipeline as events. Handle them with operators, not `try/catch`:

```java
Mono<Customer> customer = repo.findById(id)
        .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND)))
        .onErrorResume(DataAccessException.class, e -> Mono.just(Customer.empty())) // fallback value
        .onErrorReturn(Customer.empty());                    // blanket fallback
// doOnError: observe only (log); doFinally: always run (cleanup)
Mono<Customer> c = repo.findById(id)
        .doOnError(e -> log.warn("lookup failed", e))
        .doFinally(sig -> metrics.count(sig));
```

- `switchIfEmpty` — provide an alternate publisher when the source completes empty (the reactive "optional or fallback").
- `onErrorResume` — recover with another publisher (like a catch that returns a value).
- `retryWhen(Retry.backoff(...))` — transient-failure retries with exponential backoff + jitter.

## Backpressure — the contract that makes it safe

A `Flux` from `interval` is **unbounded**: if you `subscribe` and process slowly, items pile up. Control it:

```java
Flux.interval(Duration.ofMillis(10))
    .onBackpressureBuffer(1000)      // buffer up to 1000 (then error) — bounded
    .limitRate(100)                  // request 100 at a time from upstream
    .subscribe(...);
```

In practice you rarely write this — databases and HTTP clients apply backpressure automatically. But it's why reactive systems don't blow up memory under load: **a slow consumer propagates its demand upstream**.

> **Why it matters (organizational view)** — The operator rules the org should standardize: `flatMap` for independent fan-out, `concatMap` when per-item order matters, `switchIfEmpty` + `onErrorResume` for every DB/web lookup (no leaking exceptions), and `timeout` on every external call. In code review, flag: **unbounded `flatMap` on large collections** (explodes threads/connections), **blocking calls inside operators** (`block()`, JDBC), and **swallowed errors** (a chain that never calls `doOnError`). These three rules prevent 90% of reactive production incidents.

## Key takeaways

- `Mono<T>` = 0..1 item; `Flux<T>` = 0..N; nothing runs until `subscribe()`.
- Operators: `map`, `filter`, `flatMap` (async, interleaved), `concatMap` (ordered), `zip`, `take`, `timeout`, `retryWhen`.
- No try/catch — use `switchIfEmpty`, `onErrorResume`, `onErrorReturn`, `doOnError`.
- Backpressure propagates demand upstream; bound buffers with `onBackpressureBuffer`/`limitRate` when needed.
- `block()` only in tests/main; never inside a reactive request.

## Official docs

- [Project Reactor — Getting Started](https://projectreactor.io/docs/core/release/reference/#getting-started)
- [Project Reactor — Which Operator Do I Need?](https://projectreactor.io/docs/core/release/reference/#which-operator)
- [Project Reactor — Error Handling](https://projectreactor.io/docs/core/release/reference/#error.handling)
