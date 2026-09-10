---
title: Collectors and Aggregation
module: java-streams-deep
order: 1
minutes: 25
topics: ["Collectors", "groupingBy", "partitioningBy", "toMap", "joining", "teeing", "custom collectors"]
summary: collect is where streams turn into the structures you actually need — maps, grouped lists, joins, and stats. Collectors is a toolbox of composable ...
docs:
  - title: "Collectors"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Collectors.html"
---

# Collectors and Aggregation

`collect` is where streams turn into the structures you actually need — maps, grouped lists, joins, and stats. `Collectors` is a toolbox of composable accumulators; `groupingBy` and friends replace entire loops of "if not containsKey, create list, add".

## The Collector Contract

public interface Collector<T, A, R> {
    Supplier<A> supplier();              // start: new accumulator
    BiConsumer<A, T> accumulator();      // add one element
    BinaryOperator<A> combiner();        // merge two accumulators (parallel)
    Function<A, R> finisher();           // finish: accumulator → result
    Set<Characteristics> characteristics();
}

Every collector is a fold: start empty, add elements, merge (for parallel), finish. The four `Collectors.toList/toSet/toMap/joining` are just special cases.

## The Big Four

List<Course> list = courses.stream().collect(Collectors.toList());
Set<String> levels = courses.stream().map(Course::level).collect(Collectors.toSet());
Map<Long, Course> byId = courses.stream().collect(Collectors.toMap(
    Course::id, Function.identity()));
String joined = courses.stream().map(Course::title)
    .collect(Collectors.joining(", ", "[", "]"));   // prefix, delimiter, suffix

### toMap With Duplicate Keys

// ❌ IllegalStateException on duplicate keys
Map<String, Course> bySlug = courses.stream()
    .collect(Collectors.toMap(Course::slug, Function.identity()));

// ✅ merge function for duplicates — last wins
Map<String, Course> bySlug = courses.stream()
    .collect(Collectors.toMap(Course::slug, Function.identity(), (a, b) -> b));

// ✅ merge for accumulation — sum values
Map<String, Integer> minutesByLevel = courses.stream()
    .collect(Collectors.toMap(Course::level, Course::minutes, Integer::sum));

// ✅ with a specific map type
Map<String, Course> ordered = courses.stream().collect(Collectors.toMap(
    Course::slug, Function.identity(), (a, b) -> b, LinkedHashMap::new));

## groupingBy: The Group-By You Always Wanted

Map<String, List<Course>> byLevel = courses.stream()
    .collect(Collectors.groupingBy(Course::level));

// {
//   "BEGINNER": [course1, course2],
//   "ADVANCED": [course3]
// }

### Downstream Collectors: Don't Just List


**What this code does — step by step:**

1. Count per level
2. Sum per level
3. Average per level
4. Titles per level, joined
5. Max per level

The same code, clean:

```java
Map<String, Long> countByLevel = courses.stream()
    .collect(Collectors.groupingBy(Course::level, Collectors.counting()));

Map<String, Integer> minutesByLevel = courses.stream()
    .collect(Collectors.groupingBy(Course::level,
        Collectors.summingInt(Course::minutes)));

Map<String, Double> avgByLevel = courses.stream()
    .collect(Collectors.groupingBy(Course::level,
        Collectors.averagingInt(Course::minutes)));

Map<String, String> titlesByLevel = courses.stream()
    .collect(Collectors.groupingBy(Course::level,
        Collectors.mapping(Course::title, Collectors.joining(", "))));

Map<String, Optional<Course>> longestByLevel = courses.stream()
    .collect(Collectors.groupingBy(Course::level,
        Collectors.maxBy(Comparator.comparingInt(Course::minutes))));
```

**Downstream collectors compose** — `groupingBy(classifier, downstream)` nests arbitrarily deep:

// Level → (published → count)
Map<String, Map<Boolean, Long>> byLevelAndPublished = courses.stream()
    .collect(Collectors.groupingBy(Course::level,
        Collectors.groupingBy(Course::published, Collectors.counting())));

## partitioningBy: The Two-Way Split

Map<Boolean, List<Course>> partition = courses.stream()
    .collect(Collectors.partitioningBy(Course::published));

List<Course> published = partition.get(true);
List<Course> drafts = partition.get(false);

`partitioningBy` is a specialized two-bucket grouping — both keys always present (even empty lists), unlike `groupingBy` which omits absent keys.

## Stats Collectors

// One pass, five numbers
IntSummaryStatistics stats = courses.stream()
    .collect(Collectors.summarizingInt(Course::minutes));
stats.getCount(); stats.getSum(); stats.getMin();
stats.getMax(); stats.getAverage();

// Summarizing by group
Map<String, IntSummaryStatistics> byLevel = courses.stream()
    .collect(Collectors.groupingBy(Course::level,
        Collectors.summarizingInt(Course::minutes)));

## teeing: Two Collectors, One Pass

// Java 12+: compute two things in a single traversal
record Range(int min, int max) {}

Range range = courses.stream().collect(Collectors.teeing(
    Collectors.minBy(Comparator.comparingInt(Course::minutes)),
    Collectors.maxBy(Comparator.comparingInt(Course::minutes)),
    (min, max) -> new Range(
        min.map(Course::minutes).orElse(0),
        max.map(Course::minutes).orElse(0))));

`teeing` is the answer to "I want to compute X and Y in one pass instead of two".

## Custom Collector: The Escape Hatch


**What this code does — step by step:**

1. `PriorityQueue::new,` — supplier: min-heap
2. `(pq, c) -> {` — accumulator
3. `if (pq.size() > n) pq.poll();` — evict smallest
4. `(a, b) -> { a.addAll(b); return a; },` — combiner
5. `.toList(),` — finisher
6. Usage: top 3 by minutes, single pass, O(n log k)

The same code, clean:

```java
public static Collector<Course, ?, List<Course>> topN(int n) {
    return Collector.of(
        PriorityQueue::new,
        (pq, c) -> {
            pq.add(c);
            if (pq.size() > n) pq.poll();
        },
        (a, b) -> { a.addAll(b); return a; },
        pq -> pq.stream().sorted(Comparator.comparingInt(Course::minutes).reversed())
                 .toList(),
        Collector.Characteristics.UNORDERED);
}

List<Course> top3 = courses.stream().collect(topN(3));
```

## Choosing the Right Collector

```
Need a List?                  → toList() / toCollection(ArrayList::new)
Need a Set?                   → toSet() / toCollection(LinkedHashSet::new)
Need a Map by key?            → toMap (handle duplicates!)
Need groups?                  → groupingBy (+ downstream)
Need two groups?              → partitioningBy
Need a string?                → joining
Need stats?                   → summarizingInt/Long/Double
Need two results in one pass? → teeing
Nothing standard fits?        → custom Collector

// toCollection for order preservation:
courses.stream().collect(Collectors.toCollection(LinkedHashSet::new));
```

## Common Mistakes

| Mistake | Consequence |
|---------|-------------|
| toMap with duplicate keys | IllegalStateException |
| groupingBy without downstream | Lists when you wanted counts |
| Collectors.toList() when immutable wanted | Mutable result |
| Nested grouping forgetting the second arg | One level short |
| forEach on a map for printing | Use forEach only for side effects |

## Testing Collectors

@Test
void groupsByLevelWithCounts() {
    Map<String, Long> counts = courses.stream()
        .collect(Collectors.groupingBy(Course::level, Collectors.counting()));

    assertEquals(2L, counts.get("BEGINNER"));
    assertEquals(1L, counts.get("ADVANCED"));
}

@Test
void partitionsByPublished() {
    Map<Boolean, List<Course>> p = courses.stream()
        .collect(Collectors.partitioningBy(Course::published));
    assertEquals(1, p.get(true).size());
    assertEquals(1, p.get(false).size());
}

## Summary

| Collector | One-liner |
|-----------|-----------|
| Group | `groupingBy(Course::level)` |
| Group + count | `groupingBy(level, counting())` |
| Group + sum | `groupingBy(level, summingInt(minutes))` |
| Group + max | `groupingBy(level, maxBy(cmp))` |
| Two buckets | `partitioningBy(predicate)` |
| Map by key | `toMap(keyFn, valueFn, mergeFn)` |
| Join | `joining(", ")` |
| Two-in-one | `teeing(c1, c2, merger)` |

Collectors turn stream pipelines into the exact data structures you need — and `groupingBy` with downstream collectors replaces the ugliest loops in Java. Compose them, handle duplicates explicitly, and your aggregation code reads like a spec.

