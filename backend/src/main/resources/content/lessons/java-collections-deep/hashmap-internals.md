---
title: HashMap Internals
module: java-collections-deep
order: 1
minutes: 30
topics: ["HashMap", "hash function", "collisions", "buckets", "resize", "treeification", "load factor"]
docs:
  - title: "HashMap source"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/HashMap.html"
---

# HashMap Internals

`HashMap` is the most-used data structure in Java — and the least understood. Interviewers love it, but more importantly: knowing how hashing, collisions, and resizing actually work tells you why a HashMap with 10 million entries slows down, and why a HashMap keyed by a mutable object silently breaks.

## The Big Picture

A HashMap is an **array of buckets** where each bucket is a linked list (or tree, when big). The array is called `table`:

```
table: [null, null, [k1→v1, k2→v2], null, [k3→v3], ...]
                      └── bucket 2: 2 collisions
```

- `put(k, v)` → hash k → bucket index → insert/update in the bucket
- `get(k)` → hash k → bucket index → linear-scan the bucket for an equal key

## Hashing: From hashCode to Index

```java
int hash = key.hashCode();              // 32-bit
int index = (table.length - 1) & hash;  // mask to a bucket (length is a power of 2)
```

`(n - 1) & hash` is a fast `hash % n` when `n` is a power of two. The default capacity is 16 → indices 0–15.

### The Spread Function

Java 8+ *spreads* the hash to use the high bits too — otherwise keys with the same low bits collide:

```java
static final int hash(Object key) {
    int h;
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}
```

The XOR of the top 16 bits into the bottom 16 bits improves bucket distribution for keys with similar low bits (common with `Integer` keys).

## Collisions: Linked List → Tree

Two keys with the same bucket → collision. Java 8 handles it in two stages:

1. **Up to 8 entries**: a singly-linked list. `get` scans it linearly — O(n) worst case.
2. **At 8 entries, if the table ≥ 64**: the list **treeifies** into a red-black tree. `get` becomes O(log n).

```java
static final int TREEIFY_THRESHOLD = 8;
static final int UNTREEIFY_THRESHOLD = 6;
static final int MIN_TREEIFY_CAPACITY = 64;
```

**Why 8?** With a good hash, collisions follow a Poisson distribution — the probability of 8+ collisions in one bucket is under 1 in 10 million. If you hit treeification, your hash function is bad, not unlucky.

## Load Factor and Resize

```java
new HashMap<>();                 // capacity 16, load factor 0.75
new HashMap<>(10_000);           // capacity rounds up to power of 2 (16384)
new HashMap<>(10_000, 0.75f);
```

**Resize threshold = capacity × load factor**. At 16×0.75 = 12 entries, the table doubles to 32 and **rehashes every entry**:

- New table of 2× length
- Every entry re-indexed: `index = (newLen - 1) & hash`
- Cost: O(n) — this is why the first N inserts into a growing map are slow

### The Initial-Capacity Rule

```java
// For 100k known entries:
new HashMap<>(100_000);                  // capacity 131072, no resize
new HashMap<>();                         // resizes ~13 times during inserts
```

Size the map when you know the size — one `new HashMap<>(expected)` beats a dozen silent resizes.

## Why Mutable Keys Break HashMaps

```java
Course c = new Course("Spring");          // hashCode based on title
Map<Course, String> map = new HashMap<>();
map.put(c, "v1");

c.setTitle("Spring Boot");                // ❌ hashCode changes!

map.get(c);          // may return null — the key is in the wrong bucket now
```

**Rule: keys must be immutable** (or at least never mutated after insertion). Records, `String`, boxed primitives — immutable by design. This is the #1 HashMap production bug.

## Concurrent Modification

`HashMap` is **not** thread-safe. Two threads putting can corrupt the map (or, pre-Java 8, infinite-loop the resize). Options:

| Structure | When |
|-----------|------|
| `ConcurrentHashMap` | Reads + writes from many threads — always |
| `Collections.synchronizedMap` | Rare writes, simple needs |
| `HashMap` + external locking | You hold a lock around every access |

```java
// ConcurrentHashMap: the default for shared state
ConcurrentHashMap<String, Course> cache = new ConcurrentHashMap<>();
cache.putIfAbsent("spring", course);          // atomic
cache.computeIfAbsent("spring", CourseService::load);   // atomic compute
```

## The Iterator Fail-Fast Contract

```java
Map<String, String> map = new HashMap<>();
for (var entry : map.entrySet()) {
    map.put("new", "value");    // ❌ ConcurrentModificationException
}
```

HashMap iterators are **fail-fast**: they track a `modCount`, and any structural modification during iteration throws `ConcurrentModificationException`. (Not a guarantee — a heuristic, as the docs say.)

## Measuring Hash Quality

```java
public static double collisionRate(Map<String, Course> map, List<String> keys) {
    // Count distinct buckets used vs. total
    Field tableField = HashMap.class.getDeclaredField("table");
    tableField.setAccessible(true);
    Object[] table = (Object[]) tableField.get(map);
    long used = Arrays.stream(table).filter(Objects::nonNull).count();
    return used / (double) table.length;
}
```

A healthy map uses 40–60% of buckets at load factor 0.75. Below ~30% after heavy use → hash function or sizing problem.

## Performance Cheat Sheet

| Operation | Average | Worst |
|-----------|---------|-------|
| get | O(1) | O(log n) treeified / O(n) degenerate |
| put | O(1) amortized | O(n) on resize |
| containsKey | O(1) | same |
| iteration | O(capacity + size) | — (iterate entries, not keySet then get!) |

**Iteration cost is proportional to capacity, not size.** A map sized 1M with 100 entries iterates 1M slots. Iterate `entrySet()`, never `keySet()` + `get()` per key (that's O(n) lookups).

## Summary

| Concept | Key fact |
|---------|----------|
| Storage | Array of buckets (power-of-2 length) |
| Index | `(len - 1) & spread(hash)` |
| Collisions | Linked list → red-black tree at 8 |
| Load factor | 0.75 default; threshold = capacity × factor |
| Resize | Double + full rehash — O(n) |
| Keys | Must be immutable |
| Threads | ConcurrentHashMap, always |
| Iteration | Scans capacity, use entrySet |

HashMap is O(1) *when you respect its contract*: immutable keys, proper sizing, and no concurrent mutation. Respect the contract and it's the fastest general-purpose structure in the JDK; break it and you get silent nulls, corrupted data, or a CPU on fire.
