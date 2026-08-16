---
title: The Streams API
summary: Lazy pipelines, intermediate vs terminal operations, collectors, and when (not) to use parallel streams.
order: 9
minutes: 20
topics: [streams, collectors, pipeline, parallel]
docs:
  - https://docs.oracle.com/javase/tutorial/collections/streams/
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/package-summary.html
---

# The Streams API

## The pipeline model

A stream is a **lazy** sequence: intermediate operations do *nothing* until a terminal operation pulls. This is the single most important idea — and the source of the classic "my filter never runs" confusion.

```java
List<Alert> alerts = txns.stream()
    .filter(tx -> tx.status() == Status.COMPLETED)     // intermediate (lazy)
    .filter(tx -> tx.amountCents() > 1_000_000)
    .map(Txn::owner)                                    // transform
    .flatMap(o -> o.accounts().stream())                // flatten nested streams
    .distinct()                                         // needs equals/hashCode
    .sorted(Comparator.comparing(Account::iban))        // stateful
    .skip(0).limit(100)                                 // slice for pagination
    .peek(a -> log.debug("candidate {}", a))            // debugging ONLY — remove in prod
    .map(a -> new Alert(a.iban(), "LARGE_TRANSFER"))
    .toList();                                          // TERMINAL — unmodifiable
```

## The operator cheat sheet

| Kind | Operations |
|---|---|
| **Filter/map** | `filter`, `map`, `flatMap`, `mapToInt/Long/Double` |
| **Stateful** | `distinct`, `sorted`, `limit`, `skip` |
| **Terminal** | `toList`, `count`, `min/max`, `findFirst/findAny`, `anyMatch/allMatch/noneMatch`, `forEach`, `reduce`, `collect` |

## Collectors: turning streams into real data

```java
List<String> ids    = txns.stream().map(Txn::id).collect(Collectors.toList());
Set<Status> states  = txns.stream().map(Txn::status).collect(Collectors.toSet());

Map<String, Txn> byId = txns.stream().collect(Collectors.toMap(
        Txn::id, Function.identity(), (a, b) -> a));          // merge fn required!

Map<Status, Long> counts = txns.stream().collect(
        Collectors.groupingBy(Txn::status, Collectors.counting()));

Map<String, Long> volume = txns.stream().collect(
        Collectors.groupingBy(Txn::currency, Collectors.summingLong(Txn::amountCents)));

Map<Status, List<String>> idsByStatus = txns.stream().collect(
        Collectors.groupingBy(Txn::status, Collectors.mapping(Txn::id, Collectors.toList())));

String csv = txns.stream().map(Txn::id).collect(Collectors.joining(",", "[", "]"));
```

## Primitive streams avoid boxing

```java
long total = txns.stream().mapToLong(Txn::amountCents).sum();
IntSummaryStatistics stats = txns.stream().mapToInt(Txn::count).summaryStatistics();
// sum, average, min, max, count in one pass
```

## Parallel streams: use with discipline

`parallelStream()` runs on the **common ForkJoinPool shared by the whole JVM** — one badly behaved parallel stream starves every other.

```java
// OK: CPU-bound, stateless, big collection, pure math
long sum = numbers.parallelStream().mapToLong(Long::longValue).sum();

// WRONG: I/O inside (DB/HTTP), shared mutable state, small collections, request threads
```

For I/O-bound work use `CompletableFuture` with your own executor (see java-concurrency), not parallel streams.

> **Why it matters (organizational view)** — Streams replaced most imperative loops in review because they make *intent* visible: "filter → map → group" reads like the business rule. The review rules that matter: no `peek` for side effects, no `parallelStream` without a benchmark, `toList()` returns unmodifiable lists (so aliasing bugs disappear), and collectors with merge functions (`toMap`) never throw silently.

## Key takeaways

- Pipelines are lazy; terminal operations drive everything.
- `flatMap` flattens, `groupingBy` aggregates, `joining` builds strings.
- `peek` is for debugging only; side effects belong in terminal ops.
- Parallel streams: CPU-bound only, never in request paths.

**Official docs:** [Streams tutorial](https://docs.oracle.com/javase/tutorial/collections/streams/) · [java.util.stream](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/package-summary.html)
