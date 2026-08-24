---
title: ArrayList and HashMap Internals — How They Actually Work
summary: Under the hood: array resizing, load factor, hash collision handling, treeification, and why a wrong initial capacity or hashCode() can destroy application performance.
order: 40
minutes: 25
topics: [arraylist-internal, hashmap-internal, load-factor, treeification, hash-collision, initial-capacity, amortized-o1]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/util/ArrayList.html
  - https://docs.oracle.com/javase/8/docs/api/java/util/HashMap.html
---

# ArrayList and HashMap Internals — How They Actually Work

## The concept

Every Java developer uses `ArrayList` and `HashMap` daily. But understanding *how* they work under the hood is the difference between code that runs in O(n) when it should run in O(1), and code that takes 2 seconds instead of 2 milliseconds.

## ArrayList: a resizable array

An `ArrayList` is backed by a plain Java array (`Object[]`). When you call `add()`, it appends to the next free slot. When the array is full, it creates a **new, larger array** (typically 1.5× the old size) and copies every element.

```
Capacity growth: 10 → 15 → 22 → 33 → 49 → 73 → ...
```

**Why this matters:** the `add()` call is **amortized O(1)** — most calls are instant (just `array[index++] = element`), but every ~10 calls triggers an O(n) copy. If you know you need 10,000 elements, **pre-size** the list:

```java
// BAD: 14 resizes to hold 10,000 elements
List<Order> orders = new ArrayList<>();
for (int i = 0; i < 10_000; i++) orders.add(generateOrder());

// GOOD: zero resizes
List<Order> orders = new ArrayList<>(10_000);
for (int i = 0; i < 10_000; i++) orders.add(generateOrder());
```

**Thread safety:** `ArrayList` is **not** thread-safe. Two concurrent `add()` calls can corrupt the internal array (lost updates, `ArrayIndexOutOfBoundsException`). Use `Collections.synchronizedList()` or `CopyOnWriteArrayList` for concurrent access.

**The remove() trap:** `ArrayList.remove(int)` removes by *index* and shifts elements (O(n)). `ArrayList.remove(Object)` removes by *identity* (`equals()`) and also shifts (O(n)). Both are O(n). If you remove from the middle frequently, a `LinkedList` or `LinkedHashMap` may be faster — but in practice, `ArrayList`'s cache-friendly array layout usually wins even for removals.

## HashMap: the hash table

A `HashMap` stores key-value pairs in an **array of buckets**. When you call `put(key, value)`:

1. Compute `key.hashCode()`.
2. Mix the hash (bitwise XOR + shift) to spread bits.
3. Map to a bucket index: `hash & (capacity - 1)`.
4. If the bucket is empty, create a new Node there.
5. If the bucket is occupied (collision), walk the linked list (or tree) in that bucket and compare keys with `equals()`.
6. If no match, append a new Node.

**Load factor and resizing:** the default load factor is **0.75**. When the number of entries exceeds `capacity × loadFactor`, the map resizes to double the capacity and rehashes every entry.

```
Capacity: 16 → 32 → 64 → 128 → ...
Threshold: 12 → 24 → 48 → 96 → ...
```

**Why 0.75?** It's a tradeoff between space (unused buckets) and time (collision probability). Lower = fewer collisions but more memory. Higher = more collisions but less memory. 0.75 gives O(1) amortized for most workloads.

**Treeification (Java 8+):** when a bucket exceeds 8 entries, the linked list converts to a **red-black tree** (O(log n) lookup instead of O(n)). This protects against denial-of-service attacks where an attacker crafts keys with identical hash codes.

**Important:** treeification requires keys to be `Comparable`. If your keys are not `Comparable`, the bucket stays a linked list even past 8 entries. This is why custom keys should implement `Comparable` or have a good `hashCode()`.

## How we use it in organizations

### Scenario 1: pre-sizing for performance — order aggregation

```java
// Processing a batch of 50,000 orders
public Map<String, List<Order>> groupByCustomer(List<Order> allOrders) {
    // BAD: default capacity 16, will resize ~12 times
    Map<String, List<Order>> grouped = new HashMap<>();

    // BETTER: pre-size based on expected cardinality
    Map<String, List<Order>> grouped = new HashMap<>(allOrders.size() / 3);

    for (Order order : allOrders) {
        grouped.computeIfAbsent(order.customerId(), k -> new ArrayList<>()).add(order);
    }
    return grouped;
}
```

Pre-sizing eliminates 12 resize-and-rehash operations (each touching all 50K entries). On a large batch, this is the difference between 200ms and 2 seconds.

### Scenario 2: custom hashCode() — the cache key disaster

```java
// BROKEN: default hashCode is identity-based
public class CacheKey {
    private String userId;
    private String tenantId;

    // forgot to override hashCode() and equals()
}

// Works in unit tests (single JVM), fails in production:
Map<CacheKey, SessionData> cache = new HashMap<>();
CacheKey key1 = new CacheKey("user-1", "tenant-A");
CacheKey key2 = new CacheKey("user-1", "tenant-A");

cache.put(key1, session);
cache.get(key2);  // null — different hashCode, different bucket
```

**Fix:** always override `hashCode()` and `equals()` together, or use `record` which generates both:

```java
public record CacheKey(String userId, String tenantId) {}
```

### Scenario 3: ConcurrentHashMap for concurrent access

```java
@Service
public class RateLimiter {

    // HashMap is not thread-safe — ConcurrentHashMap is
    private final ConcurrentHashMap<String, AtomicInteger> requestCounts = new ConcurrentHashMap<>();

    public boolean isAllowed(String apiKey) {
        AtomicInteger count = requestCounts.computeIfAbsent(apiKey, k -> new AtomicInteger(0));
        return count.incrementAndGet() <= 100;  // 100 requests per window
    }
}
```

`ConcurrentHashMap` uses **segment locking** (bucket-level locks since Java 8) instead of a single lock, so concurrent `put()` calls on different buckets do not block each other.

### Scenario 4: LinkedHashMap for insertion-order iteration

```java
// Maintain insertion order — use case: LRU cache
public class LruCache<K, V> extends LinkedHashMap<K, V> {

    private final int maxSize;

    public LruCache(int maxSize) {
        super(maxSize, 0.75f, true);  // accessOrder=true
        this.maxSize = maxSize;
    }

    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        return size() > maxSize;
    }
}
```

When the map exceeds `maxSize`, it automatically evicts the *least recently accessed* entry. This works because `LinkedHashMap` maintains a doubly-linked list of entries in access order.

## Performance comparison

| Operation | ArrayList | LinkedList | HashMap | TreeMap |
|---|---|---|---|---|
| Add (end) | O(1) amortized | O(1) | O(1) amortized | O(log n) |
| Add (middle) | O(n) | O(1) with cursor | O(1) amortized | O(log n) |
| Remove (by index) | O(n) | O(n) | — | — |
| Get by index | O(1) | O(n) | — | — |
| Get by key | — | — | O(1) amortized | O(log n) |
| Iteration | O(n) — cache-friendly | O(n) — cache-hostile | O(n) | O(n) |

**Key insight:** `ArrayList` beats `LinkedList` in almost all real-world scenarios because CPU cache prefetching makes sequential array access extremely fast, while `LinkedList` nodes are scattered across the heap.

## Common mistakes

| Mistake | Consequence |
|---|---|
| Using `ArrayList` as a queue (`remove(0)`) | O(n) shift on every dequeue — use `ArrayDeque` |
| Bad `hashCode()` (e.g., `return 1`) | All entries in one bucket — O(n) lookup |
| Modifying a key after `put()` | Entry is "lost" — hash bucket is wrong |
| Default capacity 16 for 100K entries | ~15 resize operations, each rehashing everything |
