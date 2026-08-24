---
title: Java Streams API — Functional Data Processing for Beginners
summary: What streams are and why they exist, creating streams, intermediate operations (filter, map, flatMap, sorted, distinct), terminal operations (collect, reduce, forEach, count), custom collectors, parallel streams, and when to use streams vs loops with line-by-line walkthroughs.
order: 7
minutes: 35
topics: [streams, filter, map, flatmap, reduce, collect, parallel-streams, stream-creation, custom-collector]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/util/stream/package-summary.html
  - https://docs.oracle.com/javase/tutorial/collections/streams/
---

# Java Streams API — Functional Data Processing for Beginners

## What is a Stream?

A **Stream** is a sequence of elements that you can process declaratively. Instead of writing loops with conditions and temporary variables, you describe WHAT you want (filter, transform, sort) and let Java figure out HOW to do it.

**Beginner mental model:** Think of a stream like an assembly line in a factory. Raw materials (data) enter one end, pass through stations (operations), and finished products come out the other end. Each station does one thing: remove defective items (filter), paint them (map), sort them by size (sorted), and pack them into boxes (collect).

**Key rule:** Streams are LAZY. Nothing happens until you add a terminal operation. Intermediate operations (filter, map, etc.) just set up the pipeline.

```java
// This does NOTHING — just creates the pipeline:
List.of(1, 2, 3, 4, 5).stream()
    .filter(n -> n > 2)
    .map(n -> n * 10);

// THIS actually runs the pipeline (terminal operation triggers processing):
long count = List.of(1, 2, 3, 4, 5).stream()
    .filter(n -> n > 2)       // keep only 3, 4, 5
    .map(n -> n * 10)         // transform to 30, 40, 50
    .count();                  // terminal operation — returns 3
```

## Creating Streams

```java
// From a Collection
List<String> names = List.of("Alice", "Bob", "Charlie");
Stream<String> stream = names.stream();      // sequential stream

// From an array
int[] numbers = {1, 2, 3, 4, 5};
IntStream stream = Arrays.stream(numbers);   // IntStream for primitive int

// From individual values
Stream<String> stream = Stream.of("Alice", "Bob", "Charlie");

// Generate an infinite stream (use limit() to stop!)
Stream<Double> randoms = Stream.generate(Math::random).limit(5);  // 5 random numbers

// Generate a range of numbers
IntStream range = IntStream.range(1, 10);    // 1, 2, 3, ..., 9 (exclusive end)
IntStream rangeClosed = IntStream.rangeClosed(1, 10);  // 1, 2, 3, ..., 10 (inclusive end)

// From a string
IntStream charCodes = "Hello".chars();       // stream of Unicode code points: 72, 101, 108, 108, 111
```

## Intermediate Operations — building the pipeline

These operations return a new Stream. They are LAZY — they don't execute until a terminal operation is called.

### filter — keep elements matching a condition

```java
List<Integer> numbers = List.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

// Keep only even numbers
List<Integer> evens = numbers.stream()
    .filter(n -> n % 2 == 0)     // lambda: returns true to keep, false to discard
    .toList();                    // collect to List (Java 16+)

// Line by line:
// .stream() — creates a Stream<Integer> from the list
// .filter(n -> n % 2 == 0) — for each element, apply the test. Keep if true.
//   n is the current element (1, then 2, then 3, ...)
//   n % 2 == 0 — is the remainder of n/2 equal to zero? (even number)
// .toList() — collect all kept elements into a new List

System.out.println(evens);  // [2, 4, 6, 8, 10]

// Filter with multiple conditions
List<String> results = names.stream()
    .filter(name -> name.length() > 3)         // at least 4 characters
    .filter(name -> name.startsWith("A"))       // starts with A
    .toList();
// Result: ["Alice"] — only Alice has >3 chars AND starts with A
```

### transform — map, flatMap

```java
// map: transform each element
List<String> names = List.of("Alice", "Bob", "Charlie");

List<String> uppercased = names.stream()
    .map(name -> name.toUpperCase())   // apply transformation to each element
    .toList();
// Result: ["ALICE", "BOB", "CHARLIE"]

// map: extract a property
List<User> users = List.of(new User("Alice", 30), new User("Bob", 25));
List<String> userNames = users.stream()
    .map(User::getName)               // method reference — same as user -> user.getName()
    .toList();
// Result: ["Alice", "Bob"]

// map: convert types
List<String> numbers = List.of("1", "2", "3", "4", "5");
List<Integer> ints = numbers.stream()
    .map(Integer::parseInt)           // convert each String to Integer
    .toList();
// Result: [1, 2, 3, 4, 5]

// flatMap: flatten nested collections
List<List<String>> nested = List.of(
    List.of("Alice", "Bob"),
    List.of("Charlie", "David"),
    List.of("Eve")
);

List<String> flat = nested.stream()
    .flatMap(List::stream)            // flatten each inner list into a single stream
    .toList();
// Result: ["Alice", "Bob", "Charlie", "David", "Eve"]
// Without flatMap, you'd get List<List<String>> — nested

// flatMap: split sentences into words
List<String> sentences = List.of("Hello World", "Java Streams");
List<String> words = sentences.stream()
    .flatMap(sentence -> Arrays.stream(sentence.split(" ")))  // split each sentence into words
    .toList();
// Result: ["Hello", "World", "Java", "Streams"]
```

### sorted, distinct, limit, skip

```java
List<Integer> numbers = List.of(5, 3, 8, 3, 1, 8, 5, 9);

// sorted: natural order
List<Integer> sorted = numbers.stream()
    .sorted()
    .toList();
// Result: [1, 3, 3, 5, 5, 8, 8, 9]

// sorted: custom comparator
List<String> names = List.of("Charlie", "Alice", "Bob", "David");
List<String> byLength = names.stream()
    .sorted(Comparator.comparingInt(String::length))  // sort by string length
    .toList();
// Result: ["Bob", "Alice", "David", "Charlie"] — shortest first

// distinct: remove duplicates
List<Integer> unique = numbers.stream()
    .distinct()
    .toList();
// Result: [5, 3, 8, 1, 9]

// limit: take first N elements
List<Integer> first3 = numbers.stream()
    .limit(3)
    .toList();
// Result: [5, 3, 8]

// skip: skip first N elements
List<Integer> after3 = numbers.stream()
    .skip(3)
    .toList();
// Result: [3, 1, 8, 5, 9]
```

### peek — debug the pipeline

```java
// peek lets you see what's flowing through the pipeline (for debugging)
List<Integer> result = List.of(1, 2, 3, 4, 5).stream()
    .filter(n -> n > 2)
    .peek(n -> System.out.println("After filter: " + n))    // prints 3, 4, 5
    .map(n -> n * 10)
    .peek(n -> System.out.println("After map: " + n))       // prints 30, 40, 50
    .toList();
// Result: [30, 40, 50]
```

## Terminal Operations — executing the pipeline

These trigger the actual processing. After a terminal operation, the stream is consumed and cannot be reused.

### collect — gather results into a collection

```java
List<String> names = List.of("Alice", "Bob", "Charlie", "David");

// Collect to List
List<String> result = names.stream()
    .filter(n -> n.length() > 3)
    .collect(Collectors.toList());    // or .toList() in Java 16+

// Collect to Set (removes duplicates)
Set<String> uniqueLengths = names.stream()
    .map(n -> n.substring(0, 1))      // first character
    .collect(Collectors.toSet());
// Result: {"A", "B", "C", "D"}

// Collect to Map (key → value)
Map<String, Integer> nameLengths = names.stream()
    .collect(Collectors.toMap(
        name -> name,                  // key: the name itself
        name -> name.length()          // value: its length
    ));
// Result: {"Alice": 5, "Bob": 3, "Charlie": 7, "David": 5}

// Join strings
String csv = names.stream()
    .collect(Collectors.joining(", "));  // join with comma-space
// Result: "Alice, Bob, Charlie, David"

// Group by a property
List<User> users = List.of(
    new User("Alice", "Engineering"),
    new User("Bob", "Marketing"),
    new User("Charlie", "Engineering")
);
Map<String, List<User>> byDepartment = users.stream()
    .collect(Collectors.groupingBy(User::getDepartment));
// Result: {"Engineering": [Alice, Charlie], "Marketing": [Bob]}

// Partition by a condition (true/false groups)
Map<Boolean, List<Integer>> partitioned = List.of(1, 2, 3, 4, 5, 6).stream()
    .collect(Collectors.partitioningBy(n -> n % 2 == 0));
// Result: {false: [1, 3, 5], true: [2, 4, 6]}
```

### reduce — combine elements into a single value

```java
List<Integer> numbers = List.of(1, 2, 3, 4, 5);

// Sum all numbers
int sum = numbers.stream()
    .reduce(0, (accumulator, current) -> accumulator + current);
// Line by line:
//   0 — initial value (starting accumulator)
//   accumulator — running total (starts at 0)
//   current — current element being processed
//   After processing: 0+1=1, 1+2=3, 3+3=6, 6+4=10, 10+5=15
// Result: 15

// Or using method reference:
int sum2 = numbers.stream()
    .reduce(0, Integer::sum);  // same result, cleaner syntax

// Find the longest string
String longest = names.stream()
    .reduce("", (a, b) -> a.length() >= b.length() ? a : b);
// Compares two strings, keeps the longer one

// Optional reduce (no initial value — returns Optional)
Optional<Integer> sum3 = numbers.stream()
    .reduce(Integer::sum);
// Returns Optional[15] — empty if the stream was empty
```

### forEach, count, anyMatch, allMatch, findFirst

```java
List<String> names = List.of("Alice", "Bob", "Charlie");

// forEach: execute an action for each element
names.stream()
    .forEach(name -> System.out.println("Hello, " + name));
// Prints: "Hello, Alice", "Hello, Bob", "Hello, Charlie"

// count: number of elements
long count = names.stream()
    .filter(n -> n.length() > 3)
    .count();
// Result: 2 ("Alice" and "Charlie")

// anyMatch: does ANY element match the condition?
boolean hasLongName = names.stream()
    .anyMatch(n -> n.length() > 5);
// Result: true ("Charlie" has 7 chars)

// allMatch: do ALL elements match?
boolean allStartWithA = names.stream()
    .allMatch(n -> n.startsWith("A"));
// Result: false ("Bob" and "Charlie" don't start with A)

// noneMatch: do NO elements match?
boolean noShortNames = names.stream()
    .noneMatch(n -> n.length() < 3);
// Result: true (no name has fewer than 3 chars)

// findFirst: get the first element matching a condition
Optional<String> first = names.stream()
    .filter(n -> n.startsWith("C"))
    .findFirst();
// Result: Optional["Charlie"]
```

## Parallel Streams — automatic multi-threading

```java
// parallelStream() splits the work across multiple CPU cores
List<Integer> numbers = IntStream.rangeClosed(1, 10_000_000).boxed().toList();

// Sequential — single thread
long seqTime = System.nanoTime();
long seqCount = numbers.stream()
    .filter(n -> n % 2 == 0)
    .count();
long seqDuration = System.nanoTime() - seqTime;

// Parallel — multiple threads
long parTime = System.nanoTime();
long parCount = numbers.parallelStream()    // just change .stream() to .parallelStream()
    .filter(n -> n % 2 == 0)
    .count();
long parDuration = System.nanoTime() - parTime;

// Parallel is often 2-4x faster for large datasets
// But can be SLOWER for small datasets (thread overhead)
```

**Warning:** Parallel streams are NOT thread-safe for shared mutable state:
```java
// DANGEROUS: race condition with parallel stream
List<Integer> sharedList = new ArrayList<>();
IntStream.range(0, 1000).parallel()
    .forEach(sharedList::add);    // CRASH! ConcurrentModificationException or lost elements

// SAFE: use collect (thread-safe terminal operation)
List<Integer> safeList = IntStream.range(0, 1000).parallel()
    .boxed()
    .collect(Collectors.toList());  // thread-safe collection
```

## How we use it in organizations

### Scenario 1: Data transformation pipeline

```java
@Service
public class ReportService {

    public Report generateSalesReport(List<Order> orders, LocalDate startDate) {
        return orders.stream()
            .filter(order -> order.getCreatedAt().isAfter(startDate.atStartOfDay()))  // only recent orders
            .filter(order -> order.getStatus() == OrderStatus.COMPLETED)             // only completed
            .collect(Collectors.groupingBy(                                           // group by product
                Order::getProductName,
                Collectors.summingDouble(Order::getTotalAmount)                       // sum revenue per product
            ))
            .entrySet().stream()
            .sorted(Map.Entry.<String, Double>comparingByValue().reversed())          // highest revenue first
            .limit(10)                                                                // top 10 products
            .collect(Collectors.toMap(
                Map.Entry::getKey,
                Map.Entry::getValue,
                (a, b) -> a,
                LinkedHashMap::new                                                    // preserve sorted order
            ));
    }
}
```

### Scenario 2: Search and filter with complex predicates

```java
@Service
public class ProductService {

    public List<Product> search(ProductSearchRequest request) {
        return productRepository.findAll().stream()
            .filter(p -> request.getCategory() == null ||
                         p.getCategory() == request.getCategory())
            .filter(p -> request.getMinPrice() == null ||
                         p.getPrice().compareTo(request.getMinPrice()) >= 0)
            .filter(p -> request.getMaxPrice() == null ||
                         p.getPrice().compareTo(request.getMaxPrice()) <= 0)
            .filter(p -> request.getKeyword() == null ||
                         p.getName().toLowerCase().contains(request.getKeyword().toLowerCase()))
            .sorted(Comparator.comparing(Product::getName))
            .toList();
    }
}
```

### Scenario 3: Collecting statistics

```java
// DoubleSummaryStatistics gives you count, sum, min, max, average in one pass
DoubleSummaryStatistics stats = orders.stream()
    .mapToDouble(Order::getTotalAmount)
    .summary();

System.out.println("Count: " + stats.getCount());     // 150
System.out.println("Sum: " + stats.getSum());          // 45000.00
System.out.println("Min: " + stats.getMin());          // 15.00
System.out.println("Max: " + stats.getMax());          // 899.99
System.out.println("Avg: " + stats.getAverage());      // 300.00
```

## Streams vs Loops — when to use which

| Use Streams when | Use Loops when |
|---|---|
| Processing collections declaratively | You need break/continue control |
| Chaining multiple transformations | Performance is critical (streams have overhead) |
| Parallel processing of large datasets | You need to modify external state |
| Working with Optional/functional style | Simple iteration with index access |
| Collecting/grouping/partitioning | Debugging step-by-step with IDE |

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Reusing a stream after terminal operation | IllegalStateException | Create a new stream |
| Using parallel streams on small datasets | Slower than sequential (thread overhead) | Use parallel only for large datasets |
| Mutating external state in stream operations | Race conditions, non-deterministic results | Use collect/reduce instead |
| Using `collect(Collectors.toList())` when `.toList()` works | Extra import, same result | Use `.toList()` in Java 16+ |
| Forgetting that filter/map are lazy | Unexpected execution order | Terminal operation triggers everything |
| Creating huge intermediate lists | Memory waste | Chain operations directly on the stream |
