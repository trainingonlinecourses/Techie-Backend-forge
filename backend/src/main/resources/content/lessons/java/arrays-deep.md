---
title: Arrays in Depth — The Contiguous, Zero-Indexed Workhorse
summary: Array internals, the array/List bridge, sorting and searching, multidimensional arrays, and the array pitfalls (covariance, boxing, generics).
order: 33
minutes: 20
topics: [arrays, arraylist, covariance, arrays-util, sorting, binary-search, multidimensional, array-vs-list]
docs:
  - https://docs.oracle.com/javase/tutorial/java/nutsandbolts/arrays.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Arrays.html
---

# Arrays in Depth — The Contiguous, Zero-Indexed Workhorse

## The concept: the rawest data structure

An array is a **contiguous block of memory** holding N elements of one type, addressed by index: `arr[0]` is `base + 0 * elementSize`, `arr[i]` is `base + i * elementSize` — O(1) access, no pointer chasing, no per-element overhead. That's why arrays are the fastest sequential structure in Java and the backing store of `ArrayList`, `String` (char array), and most collection internals.

```java
int[] nums = new int[10];        // all zeros
String[] names = new String[3];  // all null
int[] literal = {1, 2, 3, 4, 5};
int[] copy = literal.clone();    // copies the elements (shallow for object arrays)
```

**The immutable-size contract:** an array's length is fixed at creation. You cannot add or remove elements — you *replace* the array with a bigger copy (`Arrays.copyOf`), which is exactly what `ArrayList` does internally (grow to ~1.5× and copy).

## Primitives vs object arrays

- `int[]` — raw ints, contiguous, zero boxing. Fastest.
- `Integer[]` — references to boxed objects; every element is an object (memory + GC pressure).
- `String[]` — references; the strings themselves live elsewhere.

The performance lesson from the primitives lesson applies here: `long[]` beats `List<Long>` for numeric hot paths because there's no boxing and the elements sit contiguously (cache-friendly).

## How we use it in an organization: the scenarios

**Scenario 1 — the array/List bridge.** Collections are the API layer; arrays are the compute layer:

```java
// List → array (the idiomatic way)
List<String> ids = service.findIds();
String[] arr = ids.toArray(new String[0]);     // new String[0] is the idiom — sized correctly

// array → List
List<String> list = Arrays.asList(arr);        // fixed-size VIEW — add() throws!
List<String> mutable = new ArrayList<>(Arrays.asList(arr));  // copy if you need to modify

// array → stream
long sum = Arrays.stream(longs).sum();
```

`Arrays.asList` returns a **fixed-size view backed by the array** — a classic `UnsupportedOperationException` when a team treats it as a normal list.

**Scenario 2 — sort and binary search.**

```java
int[] nums = {5, 2, 9, 1, 7};
Arrays.sort(nums);                          // dual-pivot quicksort for primitives
int idx = Arrays.binarySearch(nums, 7);     // O(log n) — but REQUIRES sorted input
// binarySearch returns -(insertion point)-1 on miss — a negative index, not -1!
```

`binarySearch` returns a *negative insertion point minus one* on a miss, so `== -1` checks are wrong; check `< 0` instead. Sorting objects: `Arrays.sort(objs, Comparator.comparing(Order::createdAt))` (TimSort — stable).

**Scenario 3 — multidimensional arrays (grids, matrices, images).**

```java
int[][] grid = new int[4][4];        // array of 4 arrays — jagged by nature
int[][] board = { {1,2}, {3,4} };
System.out.println(board[1][0]);     // 3 — row 1, col 0
```

Java's "2D arrays" are arrays of arrays — each row is its own object, so rows can differ in length (jagged). For dense numeric matrices, a flat `double[]` with `index = row * cols + col` is faster (contiguous, one allocation).

## The pitfalls that fail code review

- **Array covariance is unsound** — `String[]` is a subtype of `Object[]`, so this compiles and throws at runtime:

```java
Object[] objs = new String[10];
objs[0] = 42;     // ArrayStoreException at runtime — the compiler can't stop it
```

This is why **generic types can't be arrays**: `new T[10]` is illegal. Collections (invariant generics) don't have this hole — one reason they're preferred at API boundaries.

- **Boxing in arrays of wrappers** — `Integer[]` boxes every element; don't use wrapper arrays for numeric work.
- **No bounds-checking performance tricks** — the JVM checks `arr[i]` bounds on every access (throwing `ArrayIndexOutOfBoundsException`); that's the price of safety. Prefer `List`/streams for readability when hot-path bounds tricks aren't needed.
- **`Arrays.asList` on primitives is a trap** — `Arrays.asList(intArray)` wraps the *array itself* as a single-element `List<int[]>`; use boxed arrays or streams (`Arrays.stream(ints).boxed().toList()`).

## Arrays vs ArrayList — choosing

| Need | Use | Why |
|---|---|---|
| Fixed-size raw data, hot numeric loops | array | Fastest, zero overhead |
| Dynamic size, API boundaries | `ArrayList` | Grows, type-safe generics |
| Cache-friendly iteration | array / `ArrayList` | Both contiguous |
| Type-safe heterogeneous data | collections | No covariance hole |

## Key takeaways

- Arrays are contiguous, O(1)-indexed, fixed-size — the backing store of most collections.
- Use `Arrays.sort`/`binarySearch`/`copyOf`/`asList`/`stream` for the standard operations.
- `binarySearch` returns a negative insertion point on miss — check `< 0`.
- Array covariance + generics don't mix (`new T[]` illegal); `ArrayStoreException` guards the hole.
- Prefer arrays for raw numeric hot paths; collections for typed, growable APIs.
