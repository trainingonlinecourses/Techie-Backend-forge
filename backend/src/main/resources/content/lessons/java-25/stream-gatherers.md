---
title: Stream Gatherers — Custom Intermediate Operations
summary: The Gatherer API (JEP 461) lets you create custom intermediate stream operations, replacing complex flatMap chains and enabling streaming pagination, windowing, and stateful transformations.
order: 4
minutes: 22
topics: [stream-gatherers, gatherer, intermediate-operations, custom-streams]
docs:
  - https://openjdk.org/jeps/461
---

## The Concept, From Zero

Before Java 25, if you wanted to do something custom in a stream pipeline — like window elements into groups of N, or implement sliding averages — you had to use `flatMap` with awkward workarounds, or give up on streams entirely and write imperative loops.

A Gatherer is like a mini-assembly line station. Elements come in, the gatherer processes them (maybe buffering, maybe transforming, maybe emitting zero or more elements), and the processed elements flow downstream. You can even do things that are impossible with existing intermediate operations: windowing, stateful accumulation, and combining elements.

Think of it this way: `map` transforms one element to one element, `flatMap` transforms one element to many, but a Gatherer can do both — and can also decide to hold elements until it has enough, or emit nothing at all.

## The Code

```java
import java.util.stream.Gatherer;
import java.util.stream.Stream;

public class GathererDemo {

    // Custom Gatherer: window elements into groups of N
    public static <T> Gatherer<T, ?, Stream<T>> window(int size) {
        return Gatherer.of(
            // Initial state: an ArrayList buffer
            () -> new ArrayList<T>(),
            // Integrator: add element to buffer, emit when full
            (buffer, element, downstream) -> {
                buffer.add(element);
                if (buffer.size() == size) {
                    downstream.push(List.copyOf(buffer));
                    buffer.clear();
                }
                return true; // keep processing
            },
            // Finisher: emit remaining elements if buffer isn't empty
            (buffer, downstream) -> {
                if (!buffer.isEmpty()) {
                    downstream.push(List.copyOf(buffer));
                }
            }
        );
    }

    // Custom Gatherer: sliding window average
    public static Gatherer<Double, ?, Double> slidingAverage(int windowSize) {
        return Gatherer.of(
            () -> new ArrayDeque<Double>(),
            (deque, value, downstream) -> {
                deque.addLast(value);
                if (deque.size() > windowSize) deque.removeFirst();
                if (deque.size() == windowSize) {
                    double avg = deque.stream()
                        .mapToDouble(Double::doubleValue)
                        .average()
                        .orElse(0.0);
                    downstream.push(avg);
                }
                return true;
            }
        );
    }

    public static void main(String[] args) {
        // Window: group numbers into pairs
        Stream.of(1, 2, 3, 4, 5, 6, 7)
            .gather(window(3))
            .forEach(System.out::println);
        // Output: [1, 2, 3] [4, 5, 6] [7]

        // Sliding average of stock prices
        Stream.of(100.0, 105.0, 102.0, 108.0, 110.0, 107.0)
            .gather(slidingAverage(3))
            .forEach(avg -> System.out.printf("%.2f%n", avg));
        // Output: 102.33 105.00 106.67 108.33
    }
}
```

## Line-by-Line Explanation

| Line | What It Does | Why It Matters |
|------|-------------|----------------|
| `Gatherer.of(` | Creates a new Gatherer | Takes 3 functions: initializer, integrator, finisher |
| `() -> new ArrayList<T>()` | Initializer | Creates the mutable state (buffer) for each stream pipeline |
| `buffer.add(element)` | Integrator body | Adds element to buffer before checking if window is full |
| `buffer.size() == size` | Window full check | When buffer reaches target size, emit it downstream |
| `downstream.push(List.copyOf(buffer))` | Emit window | Pushes immutable copy to next stage; original buffer is reused |
| `buffer.clear()` | Reset buffer | Ready for next window |
| `return true` | Continue processing | Return false to short-circuit the stream |
| `deque.addLast(value)` | Sliding window | Adds new element to end of fixed-size deque |
| `deque.removeFirst()` | Evict oldest | Keeps window at exactly windowSize elements |

## Real-World Scenarios

**Scenario 1: Paginated API processing**
```java
// Process 100 users at a time for bulk email
users.stream()
    .gather(window(100))
    .forEach(batch -> emailService.sendBatch(batch));
```

**Scenario 2: Real-time sensor averaging**
```java
// Average temperature readings over 5-minute windows
sensorReadings.stream()
    .gather(window(300))  // 5 per second × 300 = 5 min
    .map(GathererDemo::averageTemperature)
    .forEach(alertService::checkThreshold);
```

**Scenario 3: Deduplication with state**
```java
// Deduplicate while preserving order
Stream.of("a", "b", "a", "c", "b", "d")
    .gather(Gatherer.of(
        HashSet::new,
        (seen, item, downstream) -> {
            if (seen.add(item)) downstream.push(item);
            return true;
        }
    ))
    .forEach(System.out::println);
// Output: a b c d
```

## Key Takeaways

1. **Gatherers replace flatMap hacks** — windowing, sliding averages, deduplication become clean
2. **Three functions**: initializer (state), integrator (process each element), finisher (flush remaining)
3. **State is per-pipeline** — each stream gets its own state instance
4. **Return false from integrator** to short-circuit (like takeWhile)
5. **Works with parallel streams** when the state is thread-safe
