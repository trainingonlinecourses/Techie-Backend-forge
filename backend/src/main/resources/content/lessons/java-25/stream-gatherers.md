---
title: Stream Gatherers — Custom Intermediate Operations
summary: What gatherers are, how they differ from collectors, creating custom gatherers, windowing, batching, and how organizations build reusable stream processing libraries.
order: 1
minutes: 28
topics: [stream-gatherers, gatherer, windowing, custom-operations, java25]
docs:
  - https://openjdk.org/jeps/461
---

## The Concept, From Zero

The Stream API has two types of operations:
- **Intermediate** (lazy): filter, map, flatMap — return a new Stream
- **Terminal** (eager): collect, forEach, reduce — produce a result

**Gatherers** are a new kind of intermediate operation that lets you create custom transformations. Think of them as "terminal-like operations that return a stream":

```java
// BEFORE: Windowing required external state
List<List<Integer>> windows = new ArrayList<>();
List<Integer> current = new ArrayList<>();
for (int n : numbers) {
    current.add(n);
    if (current.size() == 3) {
        windows.add(new ArrayList<>(current));
        current.clear();
    }
}
if (!current.isEmpty()) windows.add(current);

// JAVA 25: One line with gatherers
List<List<Integer>> windows = numbers.stream()
    .gather(Gatherer.ofConcurrent().map(n -> n).utschein(3))  // window(3)
    .toList();
```

---

## The Gatherer Interface

```java
@FunctionalInterface
public interface Gatherer<I, R, A> {
    // I = input element type
    // R = output element type
    // A = accumulator type (internal state)

    Gatherer.Integrator<I, A, R> integrator();
}
```

---

## Built-in Gatherers

```java
import java.util.stream.Gatherer;

// Windowing — group into fixed-size batches
List<List<Integer>> windows = IntStream.range(0, 10).boxed()
    .gather(Gatherer.windowing(3))
    .toList();
// [[0,1,2], [3,4,5], [6,7,8], [9]]

// Sliding window — overlap
List<List<Integer>> sliding = IntStream.range(0, 5).boxed()
    .gather(Gatherer.slidingWindow(3))
    .toList();
// [[0,1,2], [1,2,3], [2,3,4]]

// Scan — running accumulation
List<Integer> runningSum = IntStream.range(1, 6).boxed()
    .gather(Gatherer.scan(0, (sum, n) -> sum + n))
    .toList();
// [1, 3, 6, 10, 15]

// MapConcurrent — parallel transformation
List<String> uppercased = names.stream()
    .gather(Gatherer.ofConcurrent().map(String::toUpperCase))
    .toList();
```

---

## Line-by-Line Walkthrough

```java
import java.util.*;
import java.util.stream.*;

public class GatherersDemo {
    // Line 1: Windowing — batch processing
    static <T> Gatherer<T, ?, List<T>> window(int size) {
        return Gatherer.windowing(size);
    }

    // Line 2: Custom gatherer — chunk with predicate
    static <T> Gatherer<T, ?, List<T>> chunkWhile(java.util.function.BiPredicate<List<T>, T> predicate) {
        return Gatherer.of(
            // Initial state: empty list
            () -> new ArrayList<T>(),
            // Integrator: add elements while predicate holds
            (state, element, downstream) -> {
                state.add(element);
                if (!predicate.test(state, element)) {
                    downstream.push(List.copyOf(state));
                    state.clear();
                }
                return true; // continue
            },
            // Finisher: push remaining elements
            (state, downstream) -> {
                if (!state.isEmpty()) {
                    downstream.push(List.copyOf(state));
                }
            }
        );
    }

    // Line 3: Custom gatherer — interleave two streams
    static <T> Gatherer<T, ?, T> interleave(List<T> other) {
        Iterator<T> otherIt = other.iterator();
        return Gatherer.of(
            () -> new Object[]{ false },  // flag: other's turn
            (state, element, downstream) -> {
                boolean otherTurn = (boolean) state[0];
                downstream.push(element);
                if (otherTurn && otherIt.hasNext()) {
                    downstream.push(otherIt.next());
                }
                state[0] = !otherTurn;
                return true;
            }
        );
    }

    public static void main(String[] args) {
        // Line 4: Windowing example — process orders in batches
        var orders = IntStream.range(1, 11).boxed().toList();
        System.out.println("All orders: " + orders);

        var batches = orders.stream()
            .gather(window(3))
            .toList();
        // [[1,2,3], [4,5,6], [7,8,9], [10]]

        System.out.println("Batches:");
        batches.forEach(batch -> System.out.println("  " + batch));

        // Line 5: Batch processing with side effects
        var processedBatches = orders.stream()
            .gather(window(3))
            .peek(batch -> System.out.println("Processing batch of " + batch.size()))
            .map(batch -> batch.stream().mapToInt(Integer::intValue).sum())
            .toList();
        // [6, 15, 24, 10]

        System.out.println("Batch sums: " + processedBatches);

        // Line 6: Sliding window — rolling averages
        var temperatures = List.of(20.0, 22.0, 21.0, 25.0, 23.0, 20.0);
        var rollingAvg = temperatures.stream()
            .gather(Gatherer.slidingWindow(3))
            .map(window -> window.stream().mapToDouble(Double::doubleValue).average().orElse(0))
            .toList();
        // [21.0, 22.67, 23.0, 22.67]

        System.out.println("Rolling averages: " + rollingAvg);

        // Line 7: Scan — running total
        var purchases = List.of(10.0, 25.0, 5.0, 30.0, 15.0);
        var runningTotal = purchases.stream()
            .gather(Gatherer.scan(0.0, Double::sum))
            .toList();
        // [10.0, 35.0, 40.0, 70.0, 85.0]

        System.out.println("Running totals: " + runningTotal);

        // Line 8: Custom gatherer — chunkWhile
        var data = List.of(1, 2, 3, 1, 2, 3, 4, 1, 2);
        var chunks = data.stream()
            .gather(chunkWhile((list, item) -> item != 1 || list.isEmpty()))
            .toList();
        // [[1,2,3], [1,2,3,4], [1,2]]

        System.out.println("Chunks: " + chunks);
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Batch database inserts

```java
public void batchInsert(List<User> users) {
    users.stream()
        .gather(Gatherer.windowing(100))  // batches of 100
        .forEach(batch -> {
            String sql = "INSERT INTO users (name, email) VALUES " +
                batch.stream()
                    .map(u -> "('" + u.name() + "', '" + u.email() + "')")
                    .collect(Collectors.joining(", "));
            jdbcTemplate.execute(sql);
        });
}
```

### Scenario 2: Time-series aggregation

```java
public List<HourlyStats> aggregateByHour(List<Request> requests) {
    return requests.stream()
        .sorted(Comparator.comparing(Request::timestamp))
        .gather(Gatherer.windowing(60))  // 60-minute windows
        .map(window -> new HourlyStats(
            window.get(0).timestamp(),
            window.size(),
            window.stream().mapToLong(Request::responseTime).average().orElse(0)
        ))
        .toList();
}
```

### Scenario 3: Deduplication with order preservation

```java
public <T> Gatherer<T, ?, T> distinctByKey(java.util.function.Function<T, ?> keyExtractor) {
    Set<Object> seen = ConcurrentHashMap.newKeySet();
    return Gatherer.of(
        () -> new Object[]{},
        (state, element, downstream) -> {
            if (seen.add(keyExtractor.apply(element))) {
                downstream.push(element);
            }
            return true;
        }
    );
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using gatherers for simple ops | Overkill for filter/map | Use standard stream operations |
| Not handling finisher | Last batch lost | Implement finisher for windowing |
| Shared mutable state | Thread safety issues | Use thread-safe accumulators |
| Too many chained gatherers | Hard to debug | Break into named operations |
