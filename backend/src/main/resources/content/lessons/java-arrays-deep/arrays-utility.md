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


**What this code does — step by step:**

1. Basic sort — O(n log n) using Dual-Pivot Quicksort
2. `System.out.println(Arrays.toString(numbers));` — [1, 2, 3, 5, 8, 9]
3. Parallel sort — uses multiple CPU cores for large arrays
4. `Arrays.parallelSort(big);` — 2-4x faster on 4+ cores for large arrays
5. Sort a range
6. `Arrays.sort(numbers, 1, 4);` — Sort only indices 1 to 3
7. Sort with custom comparator (for objects)
8. `System.out.println(Arrays.toString(names));` — [Bob, Alice, Charlie]
9. Sort objects by multiple fields

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        int[] numbers = {5, 2, 8, 1, 9, 3};

        Arrays.sort(numbers);
        System.out.println(Arrays.toString(numbers));

        int[] big = new int[10_000_000];
        Arrays.parallelSort(big);

        Arrays.sort(numbers, 1, 4);

        String[] names = {"Charlie", "Alice", "Bob"};
        Arrays.sort(names, Comparator.comparingInt(String::length));
        System.out.println(Arrays.toString(names));

        Employee[] employees = getEmployees();
        Arrays.sort(employees, Comparator
            .comparing(Employee::department)
            .thenComparing(Employee::lastName)
            .thenComparing(Employee::firstName));
    }
}
```

### Searching


**What this code does — step by step:**

1. Binary search — O(log n) — array MUST be sorted first!
2. `System.out.println(index);` — 3 (the index where 7 is)
3. If element not found, returns -(insertion point) - 1
4. `System.out.println(missing);` — -4 (would be inserted at index 3)
5. Binary search with comparator for objects

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        int[] sorted = {1, 3, 5, 7, 9, 11};

        int index = Arrays.binarySearch(sorted, 7);
        System.out.println(index);

        int missing = Arrays.binarySearch(sorted, 6);
        System.out.println(missing);

        String[] sortedNames = {"Alice", "Bob", "Charlie"};
        int idx = Arrays.binarySearch(sortedNames, "Bob",
            Comparator.comparingInt(String::length));
    }
}
```

### Filling


**What this code does — step by step:**

1. Fill entire array with a value
2. `System.out.println(Arrays.toString(data));` — [42, 42, 42, 42, 42, ...]
3. Fill a range
4. `Arrays.fill(data, 2, 7, 0);` — Set indices 2-6 to 0
5. [42, 42, 0, 0, 0, 0, 0, 42, 42, 42]

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        int[] data = new int[10];

        Arrays.fill(data, 42);
        System.out.println(Arrays.toString(data));

        Arrays.fill(data, 2, 7, 0);
    }
}
```

### Comparing and Copying


**What this code does — step by step:**

1. Content comparison
2. `Arrays.equals(a, b);` — true
3. `Arrays.equals(a, c);` — false
4. Hash code for content
5. `Arrays.hashCode(a);` — Same as b's hash code
6. Copy with different size
7. [1, 2, 3, 0, 0] — padded with defaults
8. Copy a range
9. [1, 2]
10. Convert to string
11. `System.out.println(Arrays.toString(a));` — [1, 2, 3]
12. Convert to list (boxed — wraps each int in Integer)
13. `List<Integer> list = Arrays.asList(1, 2, 3);` — Fixed-size list!
14. Stream from array

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        int[] a = {1, 2, 3};
        int[] b = {1, 2, 3};
        int[] c = {1, 2, 4};

        Arrays.equals(a, b);
        Arrays.equals(a, c);

        Arrays.hashCode(a);

        int[] copy = Arrays.copyOf(a, 5);

        int[] range = Arrays.copyOfRange(a, 0, 2);

        System.out.println(Arrays.toString(a));

        List<Integer> list = Arrays.asList(1, 2, 3);
        List<Integer> mutableList = new ArrayList<>(Arrays.asList(1, 2, 3));

        int sum = Arrays.stream(a).sum();
        List<Integer> doubled = Arrays.stream(a)
            .map(x -> x * 2)
            .boxed()
            .collect(Collectors.toList());
    }
}
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

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Arrays.html)
