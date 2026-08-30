---
title: java.util.Arrays — The Swiss Army Knife for Arrays
summary: Complete guide to the Arrays utility class: sorting, searching, filling, comparing, copying, parallel operations, and the performance implications of each method.
order: 3
minutes: 18
topics: ["Arrays.sort", "Arrays.binarySearch", "Arrays.fill", "Arrays.equals", "Arrays.copyOf", "parallelSort", "Spliterator"]
docs:
  - url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Arrays.html"
    title: "Arrays Class (JavaDoc)"
---

## The Concept, From Zero

Java arrays don't have methods — `int[]` can't call `.sort()` or `.contains()`. The `java.util.Arrays` class provides **static utility methods** that operate on arrays. It's one of the most-used classes in Java.

---

## The Essential Methods

### Sorting

```java
int[] numbers = {5, 2, 8, 1, 9, 3};

// Basic sort — O(n log n) using Dual-Pivot Quicksort
Arrays.sort(numbers);
System.out.println(Arrays.toString(numbers));  // [1, 2, 3, 5, 8, 9]

// Parallel sort — uses multiple CPU cores for large arrays
int[] big = new int[10_000_000];
Arrays.parallelSort(big);  // 2-4x faster on 4+ cores for large arrays

// Sort a range
Arrays.sort(numbers, 1, 4);  // Sort only indices 1 to 3

// Sort with custom comparator (for objects)
String[] names = {"Charlie", "Alice", "Bob"};
Arrays.sort(names, Comparator.comparingInt(String::length));
System.out.println(Arrays.toString(names));  // [Bob, Alice, Charlie]

// Sort objects by multiple fields
Employee[] employees = getEmployees();
Arrays.sort(employees, Comparator
    .comparing(Employee::department)
    .thenComparing(Employee::lastName)
    .thenComparing(Employee::firstName));
```

### Searching

```java
int[] sorted = {1, 3, 5, 7, 9, 11};

// Binary search — O(log n) — array MUST be sorted first!
int index = Arrays.binarySearch(sorted, 7);
System.out.println(index);  // 3 (the index where 7 is)

// If element not found, returns -(insertion point) - 1
int missing = Arrays.binarySearch(sorted, 6);
System.out.println(missing);  // -4 (would be inserted at index 3)

// Binary search with comparator for objects
String[] sortedNames = {"Alice", "Bob", "Charlie"};
int idx = Arrays.binarySearch(sortedNames, "Bob",
    Comparator.comparingInt(String::length));
```

### Filling

```java
int[] data = new int[10];

// Fill entire array with a value
Arrays.fill(data, 42);
System.out.println(Arrays.toString(data));  // [42, 42, 42, 42, 42, ...]

// Fill a range
Arrays.fill(data, 2, 7, 0);  // Set indices 2-6 to 0
// [42, 42, 0, 0, 0, 0, 0, 42, 42, 42]
```

### Comparing and Copying

```java
int[] a = {1, 2, 3};
int[] b = {1, 2, 3};
int[] c = {1, 2, 4};

// Content comparison
Arrays.equals(a, b);  // true
Arrays.equals(a, c);  // false

// Hash code for content
Arrays.hashCode(a);  // Same as b's hash code

// Copy with different size
int[] copy = Arrays.copyOf(a, 5);
// [1, 2, 3, 0, 0] — padded with defaults

// Copy a range
int[] range = Arrays.copyOfRange(a, 0, 2);
// [1, 2]

// Convert to string
System.out.println(Arrays.toString(a));  // [1, 2, 3]

// Convert to list (boxed — wraps each int in Integer)
List<Integer> list = Arrays.asList(1, 2, 3);  // Fixed-size list!
List<Integer> mutableList = new ArrayList<>(Arrays.asList(1, 2, 3));

// Stream from array
int sum = Arrays.stream(a).sum();
List<Integer> doubled = Arrays.stream(a)
    .map(x -> x * 2)
    .boxed()
    .collect(Collectors.toList());
```

---

## parallelSort vs sort

| Feature | `sort()` | `parallelSort()` |
|---------|----------|-------------------|
| Algorithm | Dual-Pivot Quicksort | Merge Sort + ForkJoin |
| Threads | Single | Multiple (ForkJoinPool) |
| Best for | < 8,192 elements | > 8,192 elements |
| Memory | In-place | Requires extra array |
| Stability | Not stable | Stable |

```java
// Decision rule:
int[] data = getData();

if (data.length < 8192) {
    Arrays.sort(data);       // Faster for small arrays (no thread overhead)
} else {
    Arrays.parallelSort(data); // Faster for large arrays (uses all CPU cores)
}
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---------|--------------|-----|
| `Arrays.binarySearch(unsorted, x)` | Returns garbage — array must be sorted | `Arrays.sort(data); Arrays.binarySearch(data, x);` |
| `Arrays.asList(arr)` is mutable | Can't add/remove elements (fixed-size) | Wrap in `new ArrayList<>(Arrays.asList(...))` |
| `==` instead of `Arrays.equals()` | Compares references, not content | Always use `Arrays.equals()` |
| Sorting primitives | Can't use `Comparator` with `int[]` | Use wrapper types (`Integer[]`) for custom comparators |
| `Arrays.fill(data, data)` | Fills with reference, not copies | Use `Arrays.copyOf()` to copy |
