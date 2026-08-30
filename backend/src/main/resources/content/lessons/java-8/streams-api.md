---
title: Stream API — Processing Collections the Functional Way
summary: What streams are, how they differ from collections, intermediate vs terminal operations, parallel streams, and how organizations use them for data pipelines.
order: 2
minutes: 35
topics: [streams, intermediate-operations, terminal-operations, parallel-streams, java8]
docs:
  - https://docs.oracle.com/javase/tutorial/collections/streams/
  - https://docs.oracle.com/javase/8/docs/api/java/util/stream/package-summary.html
---

## The Concept, From Zero

Before Java 8, processing a collection meant writing loops:

```java
// OLD: filter employees, transform, collect — 8 lines of imperative code
List<String> highEarnerNames = new ArrayList<>();
for (Employee e : employees) {
    if (e.getSalary() > 80000) {
        String name = e.getName().toUpperCase();
        highEarnerNames.add(name);
    }
}
```

**Streams** let you describe *what* you want, not *how* to do it:

```java
// NEW: Same logic in a fluent, declarative pipeline
List<String> highEarnerNames = employees.stream()
    .filter(e -> e.getSalary() > 80000)
    .map(e -> e.getName().toUpperCase())
    .toList();
```

**Key insight:** A Stream is NOT a data structure. It's a **pipeline** — a description of operations to perform on data. The data flows through the pipeline lazily, element by element.

**Analogy:** Think of a Stream like a water pipe:
- **Source** = the faucet (your collection)
- **Intermediate operations** = filters, valves (filter, map, flatMap)
- **Terminal operation** = the tap where water comes out (collect, forEach, reduce)

Water only flows when you turn on the tap (terminal operation). Until then, the pipe is just plumbing.

---

## Creating Streams

```java
// From a collection
List<String> names = List.of("Alice", "Bob", "Carol");
Stream<String> stream = names.stream();

// From an array
int[] nums = {1, 2, 3, 4, 5};
IntStream arrayStream = Arrays.stream(nums);

// From individual values
Stream<String> explicit = Stream.of("a", "b", "c");

// Generate infinite streams
Stream<Double> randoms = Stream.generate(Math::random).limit(5);
Stream<Integer> fibonacci = Stream.iterate(new int[]{0, 1}, f -> new int[]{f[1], f[0] + f[1]})
    .limit(10)
    .map(f -> f[0]);

// From a range
IntStream range = IntStream.range(1, 11);       // 1, 2, ..., 10
IntStream closed = IntStream.rangeClosed(1, 10); // 1, 2, ..., 10
```

---

## Intermediate Operations (Lazy)

These operations return a new Stream. They are **lazy** — nothing happens until a terminal operation is called.

```java
.filter(Predicate<T>)        // Keep elements where predicate returns true
.map(Function<T,R>)          // Transform each element
.flatMap(Function<T,Stream<R>>) // Transform each element to a stream, then flatten
.distinct()                   // Remove duplicates
.sorted()                     // Natural order
.sorted(Comparator<T>)        // Custom order
.limit(long)                  // Take at most N elements
.skip(long)                   // Skip first N elements
.peek(Consumer<T>)            // Side effect (debugging) — doesn't modify the stream
```

### Line-by-Line Walkthrough

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

        // --- Pipeline 1: Find shipped electronics orders over $1000, sorted by price ---
        List<Order> expensiveShippedElectronics = orders.stream()
            // Step 1: filter — keep only ELECTRONICS orders
            // Predicate<Order>: order -> order.category().equals("Electronics")
            .filter(order -> order.category().equals("Electronics"))

            // Step 2: filter again — keep only SHIPPED orders
            .filter(order -> order.status().equals("SHIPPED"))

            // Step 3: filter again — keep only orders over $1000
            .filter(order -> order.total() > 1000)

            // Step 4: sorted — sort by total price, ascending
            .sorted(Comparator.comparingDouble(Order::total))

            // Step 5: collect — terminal operation that gathers results into a List
            .toList();
        // Result: [ORD-001 $1200, ORD-003 $2500]

        // --- Pipeline 2: Calculate total revenue from shipped orders ---
        double totalRevenue = orders.stream()
            .filter(o -> o.status().equals("SHIPPED"))     // only shipped orders
            .mapToDouble(Order::total)                      // convert to DoubleStream
            .sum();                                         // terminal: sum all values
        // Result: 1200 + 2500 + 199.99 = 3899.99

        // --- Pipeline 3: Group orders by category ---
        Map<String, List<Order>> byCategory = orders.stream()
            .collect(Collectors.groupingBy(Order::category));
        // Result: {Electronics: [...], Clothing: [...], Books: [...]}

        // --- Pipeline 4: Find the most expensive order ---
        Optional<Order> mostExpensive = orders.stream()
            .max(Comparator.comparingDouble(Order::total));
        // Optional — might be empty if orders is empty

        mostExpensive.ifPresent(o ->
            System.out.println("Most expensive: " + o.id() + " $" + o.total())
        );

        // --- Pipeline 5: FlatMap — get all unique order IDs from multiple shipments ---
        List<Shipment> shipments = List.of(
            new Shipment("S1", List.of("ORD-001", "ORD-002")),
            new Shipment("S2", List.of("ORD-003", "ORD-001"))  // duplicate!
        );

        List<String> uniqueOrderIds = shipments.stream()
            .flatMap(s -> s.orderIds().stream())    // flatten list of lists into one stream
            .distinct()                              // remove duplicates
            .toList();
        // Result: ["ORD-001", "ORD-002", "ORD-003"]
    }
}
```

---

## Terminal Operations (Eager)

These consume the stream and produce a result:

```java
.forEach(Consumer<T>)        // Perform action on each element
.collect(Collector<T,A,R>)  // Accumulate into a collection
.reduce(BinaryOperator<T>)  // Combine all elements into one
.count()                     // Count elements
.anyMatch(Predicate<T>)     // Any element matches?
.allMatch(Predicate<T>)     // All elements match?
.noneMatch(Predicate<T>)    // No element matches?
.findFirst()                 // First element (optional)
.findAny()                   // Any element (optional)
.min(Comparator<T>)          // Smallest element
.max(Comparator<T>)          // Largest element
.toArray()                   // Convert to array
.sum()                       // Sum (numeric streams only)
.average()                   // Average (numeric streams only)
```

---

## Collectors — The Swiss Army Knife

```java
// Join strings
String csv = orders.stream()
    .map(Order::id)
    .collect(Collectors.joining(", "));
// "ORD-001, ORD-002, ORD-003"

// Grouping
Map<String, Long> countByCategory = orders.stream()
    .collect(Collectors.groupingBy(Order::category, Collectors.counting()));
// {Electronics: 3, Clothing: 2, Books: 1}

// Partitioning (boolean split)
Map<Boolean, List<Order>> shippedVsNot = orders.stream()
    .collect(Collectors.partitioningBy(o -> o.status().equals("SHIPPED")));

// Summary statistics
DoubleSummaryStatistics stats = orders.stream()
    .mapToDouble(Order::total)
    .summaryStatistics();
// count=6, sum=4774.48, min=34.50, max=2500.00, average=795.75
```

---

## Parallel Streams

```java
// Sequential (default)
double sum1 = orders.stream()
    .mapToDouble(Order::total)
    .sum();

// Parallel — uses ForkJoinPool automatically
double sum2 = orders.parallelStream()
    .mapToDouble(Order::total)
    .sum();
```

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

```java
public SalesReport generateReport(List<Transaction> transactions, LocalDate date) {
    Map<String, DoubleSummaryStatistics> statsByRegion = transactions.stream()
        .filter(t -> t.date().equals(date))
        .collect(Collectors.groupingBy(
            Transaction::region,
            Collectors.summarizingDouble(Transaction::amount)
        ));

    return new SalesReport(date, statsByRegion);
}
```

### Scenario 2: Data transformation pipeline

```java
public List<EnrichedOrder> enrichOrders(List<RawOrder> rawOrders) {
    return rawOrders.stream()
        .filter(raw -> raw.isValid())                    // remove invalid
        .map(raw -> orderMapper.toDomain(raw))           // convert to domain object
        .map(order -> order.withTax(calculateTax(order))) // add computed field
        .sorted(Comparator.comparing(EnrichedOrder::date)) // sort chronologically
        .toList();
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Reusing a Stream | `stream.filter(...); stream.map(...);` — second call throws `IllegalStateException` | Create a new stream for each pipeline |
| Using `forEach` instead of `map` | `forEach` returns void; can't chain | Use `.map()` for transformation |
| Mutating captured objects | `stream.forEach(list::add)` — concurrent modification | Use `.collect()` instead |
| Forgetting terminal operation | `stream.filter(...)` does nothing | Always end with a terminal op |
| Parallel for small data | More overhead than sequential | Use `parallelStream()` only for large datasets |
