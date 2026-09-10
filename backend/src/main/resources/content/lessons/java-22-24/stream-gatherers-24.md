---
title: Java 24 — Stream Gatherers (JEP 485, finalized)
summary: Stream.gather() is a general-purpose "map-window-fold" step: sliding windows, prefixes, running folds, custom grouping — everything Streams couldn't do before, without leaving the pipeline.
order: 3
minutes: 12
topics: [Java 24, JEP 485, Stream Gatherers, Streams]
docs:
  - url: https://openjdk.org/jeps/485
    title: JEP 485 — Stream Gatherers (final)
capstone: false
---

## The idea in one sentence

`map`, `filter` and `collect` cover the common cases, but "pair each element with its neighbor" or "keep a running total" were awkward. **Stream Gatherers (finalized in Java 24, JEP 485)** add `Stream.gather(...)` — one new step that can transform a stream in any element-by-element way, including looking at neighbors and state.

## What this code does — step by step

1. `Gatherers.windowSliding(size)` hands you overlapping windows of the stream — each window slides forward by one element.
2. `Gatherers.scan(() -> seed, accumulator)` is a *running* fold: it emits every intermediate value, not just the final one.
3. You can write your own gatherer for truly custom logic (we stick to the built-ins here).
4. Run the code: it shows sensor readings paired with their previous reading, and a running sum.

```java
import java.util.List;
import java.util.stream.Gatherers;

public class GatherersDemo {
    public static void main(String[] args) {
        List<Integer> temps = List.of(21, 23, 22, 25, 24, 27);

        // 1. Sliding window: each window contains an element and its predecessor.
        System.out.println("Sliding pairs (previous -> current):");
        temps.stream()
             .gather(Gatherers.windowSliding(2))
             .forEach(pair -> System.out.println("  " + pair.get(0) + " -> " + pair.get(1)));

        // 2. Scan: emit every intermediate sum, not just the final total.
        System.out.println("Running totals:");
        temps.stream()
             .gather(Gatherers.scan(() -> 0, Integer::sum))
             .forEach(t -> System.out.println("  after reading: " + t));

        // 3. windowFixed, for contrast: chop into non-overlapping chunks.
        System.out.println("Fixed windows of 3:");
        temps.stream()
             .gather(Gatherers.windowFixed(3))
             .forEach(w -> System.out.println("  " + w));
    }
}
```

## The gatherers you'll use most

| Gatherer | What it gives you | Classic analogy |
|---|---|---|
| `Gatherers.windowFixed(n)` | consecutive chunks of n | "pages" of the stream |
| `Gatherers.windowSliding(n)` | overlapping windows, step 1 | "each element + its neighbors" |
| `Gatherers.scan(seed, op)` | every intermediate fold result | a running counter you can watch |
| `Gatherers.fold(seed, op)` | one final value | `reduce` with guaranteed order |

## Common mistakes

| Mistake | What happens | Fix |
|---|---|---|
| Using gatherers before Java 24 | Compile error (preview-only API before) | Run JDK 24+ |
| Expecting `scan` to give only the total | It emits *all* intermediates — that's its point | Use `reduce` for the final value |
| Mutating elements across windows | Windows can share element references | Treat windows as read-only |

## Try it yourself

Change the sliding window to size 3 and watch windows overlap by two elements, then add a `scan` that keeps a running maximum instead of a sum. Run with **Ctrl+Enter** (the browser simulator supports plain Streams; gatherers need a local JDK 24+ to run for real).

## References

- [OpenJDK — JEP 485](https://openjdk.org/jeps/485)
- [dev.java — the official OpenJDK site](https://dev.java/)
- [inside.java — the Java team at Oracle](https://inside.java/)
