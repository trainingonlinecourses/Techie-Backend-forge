---
title: Collections Performance & Memory
module: java-collections-deep
order: 4
minutes: 22
topics: ["big-O", "ArrayList vs LinkedList", "memory overhead", "capacity", "primitive collections"]
summary: BigO is theory; real collections have constants, memory layouts, and cache behavior. This lesson covers the practical performance landscape: ArrayL...
docs:
  - title: "Collections performance"
    url: "https://docs.oracle.com/en/java/javase/21/core/collections.html"
---

# Collections Performance & Memory

Big-O is theory; real collections have constants, memory layouts, and cache behavior. This lesson covers the practical performance landscape: `ArrayList` vs `LinkedList` (the answer may surprise you), memory overhead per collection, and the "fastest" option per scenario.

## The Big-O Table (Worst Case)

| Operation | ArrayList | LinkedList | HashSet | TreeSet | HashMap | TreeMap |
|-----------|-----------|------------|---------|---------|---------|---------|
| get(i) | O(1) | O(n) | — | — | — | — |
| contains | O(n) | O(n) | O(1) | O(log n) | O(1) | O(log n) |
| add (end) | O(1) amortized | O(1) | O(1) | O(log n) | O(1) amortized | O(log n) |
| add (middle) | O(n) shift | O(1) if node | — | — | — | — |
| remove (middle) | O(n) | O(1) if node | — | — | — | — |
| iteration | O(n) fast | O(n) slow | O(n) | O(n) | O(capacity) | O(n) |

## ArrayList vs LinkedList: The Truth

```java
// "LinkedList is better for inserts" — mostly FALSE
List<Integer> array = new ArrayList<>();
List<Integer> linked = new LinkedList<>();

for (int i = 0; i < 1_000_000; i++) {
    array.add(i);
    linked.add(i);
}
// ArrayList: ~10ms
// LinkedList: ~400ms   (40× slower!)
```

**Why**: every LinkedList node is a separate heap allocation (24+ bytes of object headers + next/prev pointers) — cache-unfriendly scattered memory. ArrayList is a single contiguous array — sequential, prefetch-friendly.

| Scenario | Winner |
|----------|--------|
| Index access | ArrayList (O(1) vs O(n)) |
| Append | ArrayList (contiguous) |
| Insert at head/middle with a *known* node | LinkedList |
| Memory | ArrayList (no per-node overhead) |
| Queue operations | ArrayDeque (not LinkedList!) |

**The rule**: use ArrayList by default. LinkedList wins only for repeated insert/remove *with a held node reference* — a rare pattern. For queues, `ArrayDeque` beats LinkedList for the same reason (no node objects).

## Memory Overhead

| Structure | Per-entry overhead (approx) |
|-----------|------------------------------|
| int[] | 4 bytes + array header |
| ArrayList<Integer> | 4 bytes (ref) + Integer object (~16 bytes) |
| LinkedList | Node object (~24 bytes) + element |
| HashMap | Node (~32 bytes) + key + value |
| TreeMap | Node with 3 pointers + color flag |

**Boxing is the hidden tax**: `ArrayList<Integer>` stores references to `Integer` objects. 10M ints = 40MB as `int[]`, but ~160MB as `ArrayList<Integer>`. For huge numeric data, use primitive collections.

## Primitive Collections: When You Need Speed

```java
// Trove / fastutil / Eclipse Collections — primitive-specialized collections
IntArrayList values = new IntArrayList();   // no boxing
values.add(42);
int v = values.getInt(0);
```

Or the JDK's own primitive arrays:

```java
int[] raw = new int[1_000_000];
// vs
List<Integer> boxed = new ArrayList<>(1_000_000);
```

For big numeric workloads (100k+ elements), primitive collections are 3–10× faster and use a fraction of the memory.

## Capacity: Pre-Size Everything

```java
// ❌ grows 13 times, copying each time
List<String> list = new ArrayList<>();
for (int i = 0; i < 100_000; i++) list.add(item(i));

// ✅ one allocation
List<String> list = new ArrayList<>(100_000);
```

Same rule for maps (`new HashMap<>(expected)`) and `StringBuilder` (`new StringBuilder(estimatedLength)`).

## The Iteration Trap

```java
// ❌ O(n) lookups on top of iteration
for (String key : map.keySet()) {
    Course c = map.get(key);   // each get is O(1) but the total is 2× traversal + hash
}

// ✅ iterate entries once
for (Map.Entry<String, Course> e : map.entrySet()) {
    Course c = e.getValue();
}
```

And the capacity trap: `for (String k : hashMap.keySet())` on a 1M-capacity map with 10 entries still scans 1M slots.

## Sorting

```java
// TimSort (stable, adaptive) — the JDK's merge+insertion hybrid
List<Course> list = ...;
list.sort(Comparator.comparing(Course::title));        // O(n log n)

// Parallel sort for big arrays
int[] data = ...;
Arrays.parallelSort(data);                             // fork/join on large inputs
```

JDK sorts are excellent — don't hand-roll. Use `Arrays.parallelSort` only for large primitive arrays (small inputs pay a thread-pool overhead).

## Contains: The Hidden O(n)

```java
// ❌ contains on a list is O(n) — 10k items = 10k comparisons
if (userRoles.contains("ADMIN")) { ... }

// ✅ contains on a set is O(1)
Set<String> adminRoles = Set.of("ADMIN", "SUPERUSER");
if (adminRoles.contains(role)) { ... }
```

The single most common performance bug in Java code: `List.contains` in a loop (accidental O(n²)). If you check membership, use a `HashSet`.

## Practical Decision Flow

```
Need ordered access by index?        → ArrayList
Need unique elements?                → HashSet (or LinkedHashSet for order)
Need sorted order?                   → TreeSet / TreeMap (or sort after)
Need key→value?                      → HashMap (LinkedHashMap for insertion order)
Need queue?                          → ArrayDeque (bounded: ArrayBlockingQueue)
Need concurrent access?              → concurrent collections (previous lesson)
Huge primitive data?                 → primitive collections / arrays
Need order-preserving dedupe?        → LinkedHashSet
```

## Summary

| Truth | Consequence |
|-------|------------|
| LinkedList is rarely the answer | ArrayList for almost everything |
| Boxing is expensive | Primitive collections for big numeric data |
| Pre-sizing saves copies | `new ArrayList<>(n)`, `new HashMap<>(n)` |
| List.contains is O(n) | HashSet for membership checks |
| Iteration scans capacity | entrySet, never keySet + get |
| JDK sorts are excellent | Never hand-roll sorting |
| Memory ≠ entries | Capacity drives iteration/memory |

Performance in collections is mostly *avoiding the wrong structure*: don't scan lists for membership, don't box millions of primitives, don't let ArrayLists grow 13 times. Pick the structure by access pattern, size it up front, and measure when it matters.
