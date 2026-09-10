---
title: Stream API — Processing Collections the Functional Way
summary: What streams are, how they differ from collections, intermediate vs terminal operations, parallel streams, and how organizations use them for data pipelines.
order: 6
minutes: 35
topics: [streams, intermediate-operations, terminal-operations, parallel-streams, java8]
docs:
  - https://docs.oracle.com/javase/tutorial/collections/streams/
  - https://docs.oracle.com/javase/8/docs/api/java/util/stream/package-summary.html
---

## The Concept, From Zero

Before Java 8, processing a collection meant writing loops:

// OLD: filter employees, transform, collect — 8 lines of imperative code
List<String> highEarnerNames = new ArrayList<>();
for (Employee e : employees) {
    if (e.getSalary() > 80000) {
        String name = e.getName().toUpperCase();
        highEarnerNames.add(name);
    }
}

**Streams** let you describe *what* you want, not *how* to do it:

// NEW: Same logic in a fluent, declarative pipeline
List<String> highEarnerNames = employees.stream()
    .filter(e -> e.getSalary() > 80000)
    .map(e -> e.getName().toUpperCase())
    .toList();

**Key insight:** A Stream is NOT a data structure. It's a **pipeline** — a description of operations to perform on data. The data flows through the pipeline lazily, element by element.

**Analogy:** Think of a Stream like a water pipe:
- **Source** = the faucet (your collection)
- **Intermediate operations** = filters, valves (filter, map, flatMap)
- **Terminal operation** = the tap where water comes out (collect, forEach, reduce)

Water only flows when you turn on the tap (terminal operation). Until then, the pipe is just plumbing.

---

## Creating Streams


**What this code does — step by step:**

1. From a collection
2. From an array
3. From individual values
4. Generate infinite streams
5. From a range
6. `IntStream range = IntStream.range(1, 11);` — 1, 2, ..., 10
7. `IntStream closed = IntStream.rangeClosed(1, 10);` — 1, 2, ..., 10

The same code, clean:

```java
List<String> names = List.of("Alice", "Bob", "Carol");
Stream<String> stream = names.stream();

int[] nums = {1, 2, 3, 4, 5};
IntStream arrayStream = Arrays.stream(nums);

Stream<String> explicit = Stream.of("a", "b", "c");

Stream<Double> randoms = Stream.generate(Math::random).limit(5);
Stream<Integer> fibonacci = Stream.iterate(new int[]{0, 1}, f -> new int[]{f[1], f[0] + f[1]})
    .limit(10)
    .map(f -> f[0]);

IntStream range = IntStream.range(1, 11);
IntStream closed = IntStream.rangeClosed(1, 10);
```

---

## Intermediate Operations (Lazy)

These operations return a new Stream. They are **lazy** — nothing happens until a terminal operation is called.


**What this code does — step by step:**

1. `.filter(Predicate<T>)` — Keep elements where predicate returns true
2. `.map(Function<T,R>)` — Transform each element
3. `.flatMap(Function<T,Stream<R>>)` — Transform each element to a stream, then flatten
4. `.distinct()` — Remove duplicates
5. `.sorted()` — Natural order
6. `.sorted(Comparator<T>)` — Custom order
7. `.limit(long)` — Take at most N elements
8. `.skip(long)` — Skip first N elements
9. `.peek(Consumer<T>)` — Side effect (debugging) — doesn't modify the stream

The same code, clean:

```java
.filter(Predicate<T>)
.map(Function<T,R>)
.flatMap(Function<T,Stream<R>>)
.distinct()
.sorted()
.sorted(Comparator<T>)
.limit(long)
.skip(long)
.peek(Consumer<T>)
```

### Line-by-Line Walkthrough


**What this code does — step by step:**

1. --- Pipeline 1: Find shipped electronics orders over $1000, sorted by price ---
2. Step 1: filter — keep only ELECTRONICS orders. Predicate<Order>: order -> order.category().equals("Electronics")
3. Step 2: filter again — keep only SHIPPED orders
4. Step 3: filter again — keep only orders over $1000
5. Step 4: sorted — sort by total price, ascending
6. Step 5: collect — terminal operation that gathers results into a List
7. Result: [ORD-001 $1200, ORD-003 $2500]
8. --- Pipeline 2: Calculate total revenue from shipped orders ---
9. `.filter(o -> o.status().equals("SHIPPED"))` — only shipped orders
10. `.mapToDouble(Order::total)` — convert to DoubleStream
11. `.sum();` — terminal: sum all values. Result: 1200 + 2500 + 199.99 = 3899.99
12. --- Pipeline 3: Group orders by category ---
13. Result: {Electronics: [...], Clothing: [...], Books: [...]}
14. --- Pipeline 4: Find the most expensive order ---
15. Optional — might be empty if orders is empty
16. --- Pipeline 5: FlatMap — get all unique order IDs from multiple shipments ---
17. `new Shipment("S2", List.of("ORD-003", "ORD-001"))` — duplicate!
18. `.flatMap(s -> s.orderIds().stream())` — flatten list of lists into one stream
19. `.distinct()` — remove duplicates
20. Result: ["ORD-001", "ORD-002", "ORD-003"]

The same code, clean:

```java
import java.util.*;
import java.util.stream.*;

public class StreamDemo {
    public static void main(String[] args) {
        List<Order> orders = List.of(
            new Order("ORD-001", "Electronics", 1200.00, "SHIPPED"),
            new Order("ORD-002", "Clothing", 89.99, "PENDING"),
            new Order("ORD-003", "Electronics", 2500.00, "SHIPPED"),
            new Order("ORD-004", "Books", 34.50, "DELIVERED"),
            new Order("ORD-005", "Clothing", 199.99, "SHIPPED"),
            new Order("ORD-006", "Electronics", 750.00, "CANCELLED")
        );

        List<Order> expensiveShippedElectronics = orders.stream()
            .filter(order -> order.category().equals("Electronics"))

            .filter(order -> order.status().equals("SHIPPED"))

            .filter(order -> order.total() > 1000)

            .sorted(Comparator.comparingDouble(Order::total))

            .toList();

        double totalRevenue = orders.stream()
            .filter(o -> o.status().equals("SHIPPED"))
            .mapToDouble(Order::total)
            .sum();

        Map<String, List<Order>> byCategory = orders.stream()
            .collect(Collectors.groupingBy(Order::category));

        Optional<Order> mostExpensive = orders.stream()
            .max(Comparator.comparingDouble(Order::total));

        mostExpensive.ifPresent(o ->
            System.out.println("Most expensive: " + o.id() + " $" + o.total())
        );

        List<Shipment> shipments = List.of(
            new Shipment("S1", List.of("ORD-001", "ORD-002")),
            new Shipment("S2", List.of("ORD-003", "ORD-001"))
        );

        List<String> uniqueOrderIds = shipments.stream()
            .flatMap(s -> s.orderIds().stream())
            .distinct()
            .toList();
    }
}
```

---

## Terminal Operations (Eager)

These consume the stream and produce a result:


**What this code does — step by step:**

1. `.forEach(Consumer<T>)` — Perform action on each element
2. `.collect(Collector<T,A,R>)` — Accumulate into a collection
3. `.reduce(BinaryOperator<T>)` — Combine all elements into one
4. `.count()` — Count elements
5. `.anyMatch(Predicate<T>)` — Any element matches?
6. `.allMatch(Predicate<T>)` — All elements match?
7. `.noneMatch(Predicate<T>)` — No element matches?
8. `.findFirst()` — First element (optional)
9. `.findAny()` — Any element (optional)
10. `.min(Comparator<T>)` — Smallest element
11. `.max(Comparator<T>)` — Largest element
12. `.toArray()` — Convert to array
13. `.sum()` — Sum (numeric streams only)
14. `.average()` — Average (numeric streams only)

The same code, clean:

```java
.forEach(Consumer<T>)
.collect(Collector<T,A,R>)
.reduce(BinaryOperator<T>)
.count()
.anyMatch(Predicate<T>)
.allMatch(Predicate<T>)
.noneMatch(Predicate<T>)
.findFirst()
.findAny()
.min(Comparator<T>)
.max(Comparator<T>)
.toArray()
.sum()
.average()
```

---

## Collectors — The Swiss Army Knife


**What this code does — step by step:**

1. Join strings
2. "ORD-001, ORD-002, ORD-003"
3. Grouping
4. {Electronics: 3, Clothing: 2, Books: 1}
5. Partitioning (boolean split)
6. Summary statistics
7. count=6, sum=4774.48, min=34.50, max=2500.00, average=795.75

The same code, clean:

```java
String csv = orders.stream()
    .map(Order::id)
    .collect(Collectors.joining(", "));

Map<String, Long> countByCategory = orders.stream()
    .collect(Collectors.groupingBy(Order::category, Collectors.counting()));

Map<Boolean, List<Order>> shippedVsNot = orders.stream()
    .collect(Collectors.partitioningBy(o -> o.status().equals("SHIPPED")));

DoubleSummaryStatistics stats = orders.stream()
    .mapToDouble(Order::total)
    .summaryStatistics();
```

---

## Parallel Streams

// Sequential (default)
double sum1 = orders.stream()
    .mapToDouble(Order::total)
    .sum();

// Parallel — uses ForkJoinPool automatically
double sum2 = orders.parallelStream()
    .mapToDouble(Order::total)
    .sum();

**When to use parallel:**
- Large datasets (>10,000 elements)
- CPU-intensive operations per element
- No shared mutable state between operations

**When NOT to use parallel:**
- Small datasets (overhead > benefit)
- I/O-bound operations (use CompletableFuture instead)
- Operations that modify shared state

---

## Real-World Scenarios

### Scenario 1: Report generation

public SalesReport generateReport(List<Transaction> transactions, LocalDate date) {
    Map<String, DoubleSummaryStatistics> statsByRegion = transactions.stream()
        .filter(t -> t.date().equals(date))
        .collect(Collectors.groupingBy(
            Transaction::region,
            Collectors.summarizingDouble(Transaction::amount)
        ));

    return new SalesReport(date, statsByRegion);
}

### Scenario 2: Data transformation pipeline

public List<EnrichedOrder> enrichOrders(List<RawOrder> rawOrders) {
    return rawOrders.stream()
        .filter(raw -> raw.isValid())                    // remove invalid
        .map(raw -> orderMapper.toDomain(raw))           // convert to domain object
        .map(order -> order.withTax(calculateTax(order))) // add computed field
        .sorted(Comparator.comparing(EnrichedOrder::date)) // sort chronologically
        .toList();
}

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Reusing a Stream | `stream.filter(...); stream.map(...);` — second call throws `IllegalStateException` | Create a new stream for each pipeline |
| Using `forEach` instead of `map` | `forEach` returns void; can't chain | Use `.map()` for transformation |
| Mutating captured objects | `stream.forEach(list::add)` — concurrent modification | Use `.collect()` instead |
| Forgetting terminal operation | `stream.filter(...)` does nothing | Always end with a terminal op |
| Parallel for small data | More overhead than sequential | Use `parallelStream()` only for large datasets |

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/javase/8/docs/api/)
