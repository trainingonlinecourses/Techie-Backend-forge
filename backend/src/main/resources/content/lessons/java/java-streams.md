---
title: Java Streams API — Functional Data Processing for Beginners
summary: What streams are and why they exist, creating streams, intermediate operations (filter, map, flatMap, sorted, distinct), terminal operations (collect, reduce, forEach, count), custom collectors, parallel streams, and when to use streams vs loops with line-by-line walkthroughs.
order: 47
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


**What this code does — step by step:**

1. This does NOTHING — just creates the pipeline:
2. THIS actually runs the pipeline (terminal operation triggers processing):
3. `.filter(n -> n > 2)` — keep only 3, 4, 5
4. `.map(n -> n * 10)` — transform to 30, 40, 50
5. `.count();` — terminal operation — returns 3

The same code, clean:

```java
List.of(1, 2, 3, 4, 5).stream()
    .filter(n -> n > 2)
    .map(n -> n * 10);

long count = List.of(1, 2, 3, 4, 5).stream()
    .filter(n -> n > 2)
    .map(n -> n * 10)
    .count();
```

## Creating Streams


**What this code does — step by step:**

1. From a Collection
2. `Stream<String> stream = names.stream();` — sequential stream
3. From an array
4. `IntStream stream = Arrays.stream(numbers);` — IntStream for primitive int
5. From individual values
6. Generate an infinite stream (use limit() to stop!)
7. `Stream<Double> randoms = Stream.generate(Math::random).limit(5);` — 5 random numbers
8. Generate a range of numbers
9. `IntStream range = IntStream.range(1, 10);` — 1, 2, 3, ..., 9 (exclusive end)
10. `IntStream rangeClosed = IntStream.rangeClosed(1, 10);` — 1, 2, 3, ..., 10 (inclusive end)
11. From a string
12. `IntStream charCodes = "Hello".chars();` — stream of Unicode code points: 72, 101, 108, 108, 111

The same code, clean:

```java
List<String> names = List.of("Alice", "Bob", "Charlie");
Stream<String> stream = names.stream();

int[] numbers = {1, 2, 3, 4, 5};
IntStream stream = Arrays.stream(numbers);

Stream<String> stream = Stream.of("Alice", "Bob", "Charlie");

Stream<Double> randoms = Stream.generate(Math::random).limit(5);

IntStream range = IntStream.range(1, 10);
IntStream rangeClosed = IntStream.rangeClosed(1, 10);

IntStream charCodes = "Hello".chars();
```

## Intermediate Operations — building the pipeline

These operations return a new Stream. They are LAZY — they don't execute until a terminal operation is called.

### filter — keep elements matching a condition


**What this code does — step by step:**

1. Keep only even numbers
2. `.filter(n -> n % 2 == 0)` — lambda: returns true to keep, false to discard
3. `.toList();` — collect to List (Java 16+)
4. .stream() — creates a Stream<Integer> from the list. .filter(n -> n % 2 == 0) — for each element, apply the test. Keep if true. n is the current element (1, then 2, then 3, ...). N % 2 == 0 — is the remainder of n/2 equal to zero? (even number). .toList() — collect all kept elements into a new List
5. `System.out.println(evens);` — [2, 4, 6, 8, 10]
6. Filter with multiple conditions
7. `.filter(name -> name.length() > 3)` — at least 4 characters
8. `.filter(name -> name.startsWith("A"))` — starts with A
9. Result: ["Alice"] — only Alice has >3 chars AND starts with A

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        List<Integer> numbers = List.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

        List<Integer> evens = numbers.stream()
            .filter(n -> n % 2 == 0)
            .toList();


        System.out.println(evens);

        List<String> results = names.stream()
            .filter(name -> name.length() > 3)
            .filter(name -> name.startsWith("A"))
            .toList();
    }
}
```

### transform — map, flatMap


**What this code does — step by step:**

1. map: transform each element
2. `.map(name -> name.toUpperCase())` — apply transformation to each element
3. Result: ["ALICE", "BOB", "CHARLIE"]
4. map: extract a property
5. `.map(User::getName)` — method reference — same as user -> user.getName()
6. Result: ["Alice", "Bob"]
7. map: convert types
8. `.map(Integer::parseInt)` — convert each String to Integer
9. Result: [1, 2, 3, 4, 5]
10. flatMap: flatten nested collections
11. `.flatMap(List::stream)` — flatten each inner list into a single stream
12. Result: ["Alice", "Bob", "Charlie", "David", "Eve"]. Without flatMap, you'd get List<List<String>> — nested
13. flatMap: split sentences into words
14. `.flatMap(sentence -> Arrays.stream(sentence.split(" ")))` — split each sentence into words
15. Result: ["Hello", "World", "Java", "Streams"]

The same code, clean:

```java
List<String> names = List.of("Alice", "Bob", "Charlie");

List<String> uppercased = names.stream()
    .map(name -> name.toUpperCase())
    .toList();

List<User> users = List.of(new User("Alice", 30), new User("Bob", 25));
List<String> userNames = users.stream()
    .map(User::getName)
    .toList();

List<String> numbers = List.of("1", "2", "3", "4", "5");
List<Integer> ints = numbers.stream()
    .map(Integer::parseInt)
    .toList();

List<List<String>> nested = List.of(
    List.of("Alice", "Bob"),
    List.of("Charlie", "David"),
    List.of("Eve")
);

List<String> flat = nested.stream()
    .flatMap(List::stream)
    .toList();

List<String> sentences = List.of("Hello World", "Java Streams");
List<String> words = sentences.stream()
    .flatMap(sentence -> Arrays.stream(sentence.split(" ")))
    .toList();
```

### sorted, distinct, limit, skip


**What this code does — step by step:**

1. sorted: natural order
2. Result: [1, 3, 3, 5, 5, 8, 8, 9]
3. sorted: custom comparator
4. `.sorted(Comparator.comparingInt(String::length))` — sort by string length
5. Result: ["Bob", "Alice", "David", "Charlie"] — shortest first
6. distinct: remove duplicates
7. Result: [5, 3, 8, 1, 9]
8. limit: take first N elements
9. Result: [5, 3, 8]
10. skip: skip first N elements
11. Result: [3, 1, 8, 5, 9]

The same code, clean:

```java
List<Integer> numbers = List.of(5, 3, 8, 3, 1, 8, 5, 9);

List<Integer> sorted = numbers.stream()
    .sorted()
    .toList();

List<String> names = List.of("Charlie", "Alice", "Bob", "David");
List<String> byLength = names.stream()
    .sorted(Comparator.comparingInt(String::length))
    .toList();

List<Integer> unique = numbers.stream()
    .distinct()
    .toList();

List<Integer> first3 = numbers.stream()
    .limit(3)
    .toList();

List<Integer> after3 = numbers.stream()
    .skip(3)
    .toList();
```

### peek — debug the pipeline

// peek lets you see what's flowing through the pipeline (for debugging)
List<Integer> result = List.of(1, 2, 3, 4, 5).stream()
    .filter(n -> n > 2)
    .peek(n -> System.out.println("After filter: " + n))    // prints 3, 4, 5
    .map(n -> n * 10)
    .peek(n -> System.out.println("After map: " + n))       // prints 30, 40, 50
    .toList();
// Result: [30, 40, 50]

## Terminal Operations — executing the pipeline

These trigger the actual processing. After a terminal operation, the stream is consumed and cannot be reused.

### collect — gather results into a collection


**What this code does — step by step:**

1. Collect to List
2. `.collect(Collectors.toList());` — or .toList() in Java 16+
3. Collect to Set (removes duplicates)
4. `.map(n -> n.substring(0, 1))` — first character
5. Result: {"A", "B", "C", "D"}
6. Collect to Map (key → value)
7. `name -> name,` — key: the name itself
8. `name -> name.length()` — value: its length
9. Result: {"Alice": 5, "Bob": 3, "Charlie": 7, "David": 5}
10. Join strings
11. `.collect(Collectors.joining(", "));` — join with comma-space
12. Result: "Alice, Bob, Charlie, David"
13. Group by a property
14. Result: {"Engineering": [Alice, Charlie], "Marketing": [Bob]}
15. Partition by a condition (true/false groups)
16. Result: {false: [1, 3, 5], true: [2, 4, 6]}

The same code, clean:

```java
List<String> names = List.of("Alice", "Bob", "Charlie", "David");

List<String> result = names.stream()
    .filter(n -> n.length() > 3)
    .collect(Collectors.toList());

Set<String> uniqueLengths = names.stream()
    .map(n -> n.substring(0, 1))
    .collect(Collectors.toSet());

Map<String, Integer> nameLengths = names.stream()
    .collect(Collectors.toMap(
        name -> name,
        name -> name.length()
    ));

String csv = names.stream()
    .collect(Collectors.joining(", "));

List<User> users = List.of(
    new User("Alice", "Engineering"),
    new User("Bob", "Marketing"),
    new User("Charlie", "Engineering")
);
Map<String, List<User>> byDepartment = users.stream()
    .collect(Collectors.groupingBy(User::getDepartment));

Map<Boolean, List<Integer>> partitioned = List.of(1, 2, 3, 4, 5, 6).stream()
    .collect(Collectors.partitioningBy(n -> n % 2 == 0));
```

### reduce — combine elements into a single value


**What this code does — step by step:**

1. Sum all numbers
2. 0 — initial value (starting accumulator). Accumulator — running total (starts at 0). Current — current element being processed. After processing: 0+1=1, 1+2=3, 3+3=6, 6+4=10, 10+5=15. Result: 15
3. Or using method reference:
4. `.reduce(0, Integer::sum);` — same result, cleaner syntax
5. Find the longest string
6. Compares two strings, keeps the longer one
7. Optional reduce (no initial value — returns Optional)
8. Returns Optional[15] — empty if the stream was empty

The same code, clean:

```java
List<Integer> numbers = List.of(1, 2, 3, 4, 5);

int sum = numbers.stream()
    .reduce(0, (accumulator, current) -> accumulator + current);

int sum2 = numbers.stream()
    .reduce(0, Integer::sum);

String longest = names.stream()
    .reduce("", (a, b) -> a.length() >= b.length() ? a : b);

Optional<Integer> sum3 = numbers.stream()
    .reduce(Integer::sum);
```

### forEach, count, anyMatch, allMatch, findFirst


**What this code does — step by step:**

1. forEach: execute an action for each element
2. Prints: "Hello, Alice", "Hello, Bob", "Hello, Charlie"
3. count: number of elements
4. Result: 2 ("Alice" and "Charlie")
5. anyMatch: does ANY element match the condition?
6. Result: true ("Charlie" has 7 chars)
7. allMatch: do ALL elements match?
8. Result: false ("Bob" and "Charlie" don't start with A)
9. noneMatch: do NO elements match?
10. Result: true (no name has fewer than 3 chars)
11. findFirst: get the first element matching a condition
12. Result: Optional["Charlie"]

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        List<String> names = List.of("Alice", "Bob", "Charlie");

        names.stream()
            .forEach(name -> System.out.println("Hello, " + name));

        long count = names.stream()
            .filter(n -> n.length() > 3)
            .count();

        boolean hasLongName = names.stream()
            .anyMatch(n -> n.length() > 5);

        boolean allStartWithA = names.stream()
            .allMatch(n -> n.startsWith("A"));

        boolean noShortNames = names.stream()
            .noneMatch(n -> n.length() < 3);

        Optional<String> first = names.stream()
            .filter(n -> n.startsWith("C"))
            .findFirst();
    }
}
```

## Parallel Streams — automatic multi-threading


**What this code does — step by step:**

1. parallelStream() splits the work across multiple CPU cores
2. Sequential — single thread
3. Parallel — multiple threads
4. `long parCount = numbers.parallelStream()` — just change .stream() to .parallelStream()
5. Parallel is often 2-4x faster for large datasets. But can be SLOWER for small datasets (thread overhead)

The same code, clean:

```java
List<Integer> numbers = IntStream.rangeClosed(1, 10_000_000).boxed().toList();

long seqTime = System.nanoTime();
long seqCount = numbers.stream()
    .filter(n -> n % 2 == 0)
    .count();
long seqDuration = System.nanoTime() - seqTime;

long parTime = System.nanoTime();
long parCount = numbers.parallelStream()
    .filter(n -> n % 2 == 0)
    .count();
long parDuration = System.nanoTime() - parTime;
```

**Warning:** Parallel streams are NOT thread-safe for shared mutable state:
// DANGEROUS: race condition with parallel stream
List<Integer> sharedList = new ArrayList<>();
IntStream.range(0, 1000).parallel()
    .forEach(sharedList::add);    // CRASH! ConcurrentModificationException or lost elements

// SAFE: use collect (thread-safe terminal operation)
List<Integer> safeList = IntStream.range(0, 1000).parallel()
    .boxed()
    .collect(Collectors.toList());  // thread-safe collection

## How we use it in organizations

### Scenario 1: Data transformation pipeline


**What this code does — step by step:**

1. `.filter(order -> order.getCreatedAt().isAfter(startDate.atStartOfDay()))` — only recent orders
2. `.filter(order -> order.getStatus() == OrderStatus.COMPLETED)` — only completed
3. `.collect(Collectors.groupingBy(` — group by product
4. `Collectors.summingDouble(Order::getTotalAmount)` — sum revenue per product
5. `.sorted(Map.Entry.<String, Double>comparingByValue().reversed())` — highest revenue first
6. `.limit(10)` — top 10 products
7. `LinkedHashMap::new` — preserve sorted order

The same code, clean:

```java
@Service
public class ReportService {

    public Report generateSalesReport(List<Order> orders, LocalDate startDate) {
        return orders.stream()
            .filter(order -> order.getCreatedAt().isAfter(startDate.atStartOfDay()))
            .filter(order -> order.getStatus() == OrderStatus.COMPLETED)
            .collect(Collectors.groupingBy(
                Order::getProductName,
                Collectors.summingDouble(Order::getTotalAmount)
            ))
            .entrySet().stream()
            .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
            .limit(10)
            .collect(Collectors.toMap(
                Map.Entry::getKey,
                Map.Entry::getValue,
                (a, b) -> a,
                LinkedHashMap::new
            ));
    }
}
```

### Scenario 2: Search and filter with complex predicates

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

### Scenario 3: Collecting statistics


**What this code does — step by step:**

1. DoubleSummaryStatistics gives you count, sum, min, max, average in one pass
2. `System.out.println("Count: " + stats.getCount());` — 150
3. `System.out.println("Sum: " + stats.getSum());` — 45000.00
4. `System.out.println("Min: " + stats.getMin());` — 15.00
5. `System.out.println("Max: " + stats.getMax());` — 899.99
6. `System.out.println("Avg: " + stats.getAverage());` — 300.00

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        DoubleSummaryStatistics stats = orders.stream()
            .mapToDouble(Order::getTotalAmount)
            .summary();

        System.out.println("Count: " + stats.getCount());
        System.out.println("Sum: " + stats.getSum());
        System.out.println("Min: " + stats.getMin());
        System.out.println("Max: " + stats.getMax());
        System.out.println("Avg: " + stats.getAverage());
    }
}
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

