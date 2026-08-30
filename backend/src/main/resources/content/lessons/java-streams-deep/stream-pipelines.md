---
title: Stream Pipelines Under the Hood
module: java-streams-deep
order: 1
minutes: 25
topics: ["lazy evaluation", "intermediate operations", "terminal operations", "short-circuiting", "pipeline stages"]
summary: Streams look like fluent chains — but understanding them as lazy, pullbased pipelines is what separates working code from code that's correct by ac...
docs:
  - title: "Stream API"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/package-summary.html"
---

# Stream Pipelines Under the Hood

Streams look like fluent chains — but understanding them as **lazy, pull-based pipelines** is what separates working code from code that's correct by accident. This lesson covers the execution model: stages, laziness, short-circuiting, and the one-pass traversal rule.

## The Execution Model

```java
courses.stream()                                    // source
    .filter(c -> c.published())                     // intermediate (lazy)
    .map(Course::title)                             // intermediate (lazy)
    .limit(10)                                      // intermediate (lazy)
    .toList();                                      // terminal (eager — runs everything)
```

**Nothing runs until the terminal operation.** `.filter` doesn't filter; it *records* a filter. The chain is a recipe; `toList()` cooks it.

## Pipeline Stages

```
Source ──▶ Stage 1 (filter) ──▶ Stage 2 (map) ──▶ Stage 3 (limit) ──▶ Terminal
              ▲                     ▲                    ▲
          next element        next element          next element
          pulled on demand    pulled on demand      pulled on demand
```

Each stage pulls from the previous. Elements flow through **one at a time**, vertically:

```java
// Execution order for 3 elements with filter+map+limit(2):
//   pull c1 → filter(c1)? yes → map(c1) → emit
//   pull c2 → filter(c2)? no  → pull c3
//   pull c3 → filter(c3)? yes → map(c3) → emit → limit reached, STOP
```

`limit(2)` stops pulling entirely once two elements are emitted — the source may never be fully consumed. This is why `findFirst()` on an infinite stream works.

## Lazy + Short-Circuit

```java
// This never hangs — the pipeline pulls only until the first match
Optional<Course> first = Stream.generate(() -> expensiveLoad())
    .filter(c -> c.isLong())
    .findFirst();
```

Short-circuiting terminal ops: `findFirst`, `findAny`, `anyMatch`, `allMatch`, `noneMatch`, `limit`.

## The One-Pass Rule

**A stream can be traversed once.** After a terminal op, it's consumed:

```java
Stream<String> s = courses.stream().map(Course::title);
List<String> a = s.toList();     // consumes
List<String> b = s.toList();     // ❌ IllegalStateException: stream has already been operated upon
```

Sources (`List.stream()`) are reusable; the *pipeline* isn't. Re-create the stream for each use.

## Intermediate Operations: Stateless vs Stateful

| Stateless | Stateful |
|-----------|----------|
| `filter`, `map`, `flatMap`, `peek` | `distinct`, `sorted`, `limit`, `skip` |

Stateless stages process one element independently. **Stateful stages buffer**: `sorted()` must see the *entire* stream before emitting the first element; `distinct()` holds a set as it goes.

```java
// sorted() buffers EVERYTHING before emitting — O(n) memory
courses.stream()
    .sorted(Comparator.comparing(Course::title))
    .limit(5)                    // still sorts all before taking 5
    .toList();
```

## peek: The Debugging Tool

```java
courses.stream()
    .peek(c -> log.debug("before filter: {}", c.id()))
    .filter(c -> c.published())
    .peek(c -> log.debug("after filter: {}", c.id()))
    .toList();
```

`peek` is for debugging — it runs the consumer when the element passes that stage. Don't use it for side effects in production (it's not guaranteed to run without a terminal op, and its timing is unspecified).

## Terminal Operations

| Terminal | Returns | Notes |
|----------|---------|-------|
| `forEach` | void | Side effects |
| `collect` | Collection | The general accumulator |
| `toList` | List | Immutable, Java 16+ |
| `reduce` | Optional<T> / T | General fold |
| `count` | long | — |
| `min`/`max` | Optional<T> | Needs comparator |
| `findFirst`/`findAny` | Optional<T> | Short-circuits |
| `anyMatch`/`allMatch`/`noneMatch` | boolean | Short-circuits |
| `toArray` | T[] | — |

## reduce: The General Fold

```java
// Sum with reduce
int total = courses.stream()
    .mapToInt(Course::minutes)
    .reduce(0, Integer::sum);

// Custom accumulation
String joined = courses.stream()
    .map(Course::title)
    .reduce("", (a, b) -> a + ", " + b);
```

`reduce(identity, accumulator)` — identity is the result for an empty stream. For most cases, specialized ops (`sum`, `collect(joining())`) are clearer, but reduce is the escape hatch.

## mapToInt and Primitive Streams

```java
// Boxing avoided: IntStream, LongStream, DoubleStream
int totalMinutes = courses.stream()
    .mapToInt(Course::minutes)
    .sum();

double avg = courses.stream()
    .mapToInt(Course::minutes)
    .average()
    .orElse(0.0);

IntSummaryStatistics stats = courses.stream()
    .mapToInt(Course::minutes)
    .summaryStatistics();
// count, sum, min, max, average in one pass
```

Primitive streams are both faster (no boxing) and have the numeric ops you need.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Side effects in `map` | Use `forEach` at the end or restructure |
| Reusing a stream | Re-create from the source |
| `sorted()` before `limit()` | Order matters — sort is a full buffer |
| Calling `get()` on `Optional` | `orElse`/`orElseThrow` |
| Collecting then streaming | Pipeline the whole way |
| Infinite stream without limit | Add `limit`/`findFirst` |

## Summary

| Concept | Key fact |
|---------|----------|
| Laziness | Nothing runs until the terminal op |
| Pull model | Elements flow one at a time |
| Short-circuit | limit/findFirst stop pulling early |
| One-pass | Streams are single-use |
| Stateful ops | sorted/distinct buffer |
| Primitives | IntStream etc. avoid boxing |

Streams are a *pull-based pipeline*, not a loop with method syntax. Think in stages: what does each element pass through, what buffers, what stops early. Master the model and every pipeline you write becomes predictable — including the ones you debug at 2 AM.
