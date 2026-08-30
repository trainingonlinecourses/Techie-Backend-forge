---
title: Parallel Streams and Performance
module: java-streams-deep
order: 3
minutes: 22
topics: ["parallel streams", "fork-join", "spliterator", "thread safety", "when parallel wins", "benchmarks"]
docs:
  - title: "Parallel streams"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/package-summary.html"
summary: .parallel() sounds like free speed. In practice it's a shared ForkJoinPool, hidden threadsafety traps, and a threshold below which parallel is slow...
---

# Parallel Streams and Performance

`.parallel()` sounds like free speed. In practice it's a shared ForkJoinPool, hidden thread-safety traps, and a threshold below which parallel is slower than serial. This lesson covers when parallel actually wins, what it costs, and how to measure instead of guess.

## How It Works

```java
courses.parallelStream()   // or .stream().parallel()
    .map(this::expensiveTransform)
    .toList();
```

The stream's `Spliterator` splits the source into chunks; a shared `ForkJoinPool.commonPool()` (one per JVM!) processes chunks in parallel and merges results.

```
Source (1000 elements)
├── chunk 0-249   → worker thread 1
├── chunk 250-499 → worker thread 2
├── chunk 500-749 → worker thread 3
└── chunk 750-999 → worker thread 4
```

## The Three Requirements for Parallel to Win

1. **Large data** — thousands+ of elements (below that, splitting + merging overhead exceeds the gain)
2. **Expensive per-element work** — CPU-bound transformations, I/O, computation
3. **Independent elements** — no shared mutable state, no ordering dependence

```java
// ✅ Good parallel candidate: heavy, independent work
List<Report> reports = ids.parallelStream()
    .map(id -> reportGenerator.generate(id))   // seconds each
    .toList();

// ❌ Bad: trivial work — overhead dominates
List<Integer> squares = IntStream.range(0, 100)
    .parallel()
    .map(i -> i * i)                           // nanoseconds each
    .boxed()
    .toList();
```

## The Shared Pool Trap

```java
// All parallel streams share ONE pool (commonPool, size = cores - 1)
// A slow parallel stream blocks every other parallel stream in the JVM
```

You can't easily resize the common pool (system property `java.util.concurrent.ForkJoinPool.common.parallelism`), and you should rarely need to. **The fix is to use your own executor for long-running parallel work:**

```java
// Custom pool for blocking-heavy parallel work
ExecutorService pool = Executors.newFixedThreadPool(8);
List<Report> reports = ids.stream()
    .map(id -> CompletableFuture.supplyAsync(
        () -> reportGenerator.generate(id), pool))
    .toList()
    .stream()
    .map(CompletableFuture::join)
    .toList();
```

Or with a parallel stream on a custom ForkJoinPool:

```java
ForkJoinPool customPool = new ForkJoinPool(8);
List<Report> reports = customPool.submit(() ->
        ids.parallelStream().map(id -> generate(id)).toList())
    .join();
```

## Thread Safety: The Silent Corrupter

```java
// ❌ Shared mutable accumulator — RACE CONDITION
List<Course> results = new ArrayList<>();
courses.parallelStream()
    .filter(Course::published)
    .forEach(results::add);     // ArrayList is NOT thread-safe

// ✅ Collectors are thread-safe (concurrent-aware)
List<Course> results = courses.parallelStream()
    .filter(Course::published)
    .collect(Collectors.toList());

// ✅ Explicit concurrent collection
Set<String> levels = courses.parallelStream()
    .map(Course::level)
    .collect(Collectors.toConcurrentMap(
        Function.identity(), v -> 1L, Long::sum));
```

**Rule: never mutate shared state inside parallel stream lambdas.** Use collectors — they're designed for parallel combination.

## Ordering: What parallel Breaks

```java
// Serial: encounter order preserved
List<String> ordered = courses.stream()
    .map(Course::title)
    .toList();                    // in list order

// Parallel: order NOT guaranteed for forEach
courses.parallelStream()
    .forEach(c -> log.info(c.title()));   // any order

// Parallel WITH order preserved (costs coordination)
List<String> ordered = courses.parallelStream()
    .map(Course::title)
    .toList();                    // toList preserves encounter order even in parallel!
```

`toList`/`collect(toList())` still produce encounter-ordered results in parallel (the framework recombines in order). Side-effect operations (`forEach`) don't.

## findAny vs findFirst

```java
// findFirst: order-respecting — serializes in parallel
courses.parallelStream().filter(Course::published).findFirst();

// findAny: any element — parallel-friendly
courses.parallelStream().filter(Course::published).findAny();
```

In parallel code, prefer `findAny` when any match is fine — `findFirst` forces ordering constraints that kill parallelism.

## The Benchmarks That Matter

```java
// Measure, don't guess — JMH-style manual timing
long serial = time(() -> courses.stream().map(this::work).toList());
long parallel = time(() -> courses.parallelStream().map(this::work).toList());
System.out.printf("serial=%dms parallel=%dms speedup=%.1fx%n",
    serial, parallel, serial / (double) parallel);
```

The reality:

| Workload | Serial | Parallel | Verdict |
|----------|--------|----------|---------|
| 100 elements × 1µs | ~0.1ms | ~2ms | Parallel 20× slower |
| 100k elements × 1µs | ~100ms | ~30ms | Parallel 3× faster |
| 100k × 10ms (I/O-ish) | ~1000s | ~250s | Parallel 4× faster |
| Blocking I/O on commonPool | — | — | Dangerous (pool starvation) |

## The Blocking I/O Danger

```java
// ❌ Blocking HTTP calls on the COMMON pool — a slow API starves ALL parallel streams
items.parallelStream()
    .map(item -> restClient.get().uri(item.url()).retrieve().body(String.class))
    .toList();
```

Blocking I/O on the common pool is an anti-pattern: 8 blocked threads = 8 dead cores for every other parallel stream in the app. **For I/O, use CompletableFuture with your own executor** (see the concurrency module).

## Summary

| Question | Answer |
|----------|--------|
| When parallel wins | Large data + expensive work + independence |
| Default | Serial — parallel is opt-in for a reason |
| Pool | Shared commonPool; own executor for I/O |
| Thread safety | Collectors, never shared mutation |
| Order | toList preserves; forEach doesn't |
| findFirst vs findAny | findAny in parallel |
| Proof | Benchmark, then decide |

Parallel streams are a tool, not a default: they pay off only past the overhead threshold, with independent elements, and off the common pool for blocking work. Measure the speedup, keep lambdas pure, and reach for `CompletableFuture` + your own executor when the work blocks.
