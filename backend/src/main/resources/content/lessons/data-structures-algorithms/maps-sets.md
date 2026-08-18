---
title: Maps and Sets — Hash Tables and Trees
module: data-structures-algorithms
order: 3
minutes: 26
topics: ["HashMap", "HashSet", "hash tables", "hashCode", "TreeMap", "collisions"]
docs:
  - title: "HashMap (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/HashMap.html"
  - title: "Object.hashCode (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Object.html#hashCode()"
---

# Maps and Sets — Hash Tables and Trees

## The Concept: Lookup Without Searching

A list answers "does this contain x?" by scanning every element — O(n). A **map** (dictionary) answers it in O(1): instead of searching, it *computes where x must be* and jumps there. The mechanism is the **hash function**: a function that turns any key into a number (the *hash code*), which is then mapped to a bucket. Look up the bucket, and your key is either there or it isn't.

**The mental model:** a library with books arranged by the first letter of the title. Finding "War and Peace" doesn't require scanning the shelves — you walk to the W section. The first letter is a crude hash function. A good hash function spreads books evenly across sections; a terrible one piles everything into one section, and you're back to scanning (collisions). A **hash table** is that idea made rigorous: an array of buckets + a hash function that spreads keys uniformly.

**The set** is the same machinery without values — just "is this present?" HashSet and HashMap share the exact same internals in Java (HashSet is literally a HashMap with dummy values).

## The HashMap in Action

```java
import java.util.*;

public class MapDemo {
    public static void main(String[] args) {
        Map<String, Integer> ages = new HashMap<>();
        ages.put("Ada", 36);      // O(1) average
        ages.put("Grace", 45);
        ages.put("Linus", 54);

        Integer ada = ages.get("Ada");       // O(1) — 36
        Integer missing = ages.get("Bob");   // null — no such key
        int safe = ages.getOrDefault("Bob", 0);  // 0 — avoid null

        System.out.println(ages.containsKey("Grace"));  // true
        System.out.println(ages.size());                // 3

        // Iteration order is NOT insertion order for HashMap:
        for (Map.Entry<String, Integer> e : ages.entrySet()) {
            System.out.println(e.getKey() + " -> " + e.getValue());
        }
    }
}
```

**Walking through it:** `put` computes `"Ada".hashCode()` (a specific int), maps it to a bucket index, and stores the entry. `get` does the same computation and checks only that one bucket. This is O(1) — independent of how many keys exist. `getOrDefault` and `containsKey` are the null-safe idioms. And note the iteration order warning: `HashMap` makes *no* ordering promises. If you need insertion order, use `LinkedHashMap`; if you need sorted order, use `TreeMap`.

## Collisions: When Two Keys Share a Bucket

A hash function maps an infinite key space onto a finite bucket array, so different keys *must* occasionally land in the same bucket — a **collision**. Java's `HashMap` handles collisions with **chaining**: each bucket is a small structure (a linked list, upgraded to a *tree* when a bucket gets long — since Java 8, a bucket with 8+ entries becomes a red-black tree, capping worst-case lookup at O(log n) instead of O(n)). The math that keeps HashMap fast: with a good hash function, the average bucket holds a *constant* number of entries regardless of total size (the table **resizes** — doubling and rehashing — when load exceeds 75%), so lookups stay O(1) average.

**The practical consequence:** the quality of your keys' `hashCode()` directly determines performance. A pathological `hashCode` that returns the same value for everything (say, always `1`) turns the map into a single giant bucket — O(n) lookup, resizes wasted, and an O(1)-looking program that runs like O(n²). This is why overriding `equals` *without* `hashCode` (or writing a constant `hashCode`) is a correctness-and-performance bug at once.

## The equals/hashCode Contract

```java
import java.util.*;

public class ContractDemo {
    // A key type that violates the contract — hashCode is constant.
    static class BadKey {
        String value;
        BadKey(String v) { value = v; }
        public boolean equals(Object o) {
            return o instanceof BadKey && ((BadKey) o).value.equals(value);
        }
        public int hashCode() { return 1; }   // WRONG: all keys, one bucket
    }

    // The contract-correct version:
    static class GoodKey {
        String value;
        GoodKey(String v) { value = v; }
        public boolean equals(Object o) {
            return o instanceof GoodKey && ((GoodKey) o).value.equals(value);
        }
        public int hashCode() { return Objects.hashCode(value); }  // RIGHT
    }

    public static void main(String[] args) {
        Map<GoodKey, String> good = new HashMap<>();
        good.put(new GoodKey("a"), "found");
        System.out.println(good.get(new GoodKey("a")));   // found — WORKS

        Map<BadKey, String> bad = new HashMap<>();
        bad.put(new BadKey("a"), "found");
        System.out.println(bad.get(new BadKey("a")));     // null — BROKEN!
    }
}
```

**The contract:** if `a.equals(b)` then `a.hashCode() == b.hashCode()` (equal objects must hash equally). The reverse need not hold (unequal objects may collide — that's fine, just slower). The `BadKey` breaks it functionally: with a constant hash, `get` computes the same bucket, but then must compare with `equals` — and since `equals` works, why does `get` return null? Because the *stored* key and the *lookup* key are different objects in the same bucket and... wait, equals says they're equal. Let's trace: with a constant hashCode, both go to bucket 1, equals matches — it should work. The real breakage: **mutability**. If a key's `hashCode` changes *after* it's stored (because the key object is mutable and its fields change), the map looks in the wrong bucket forever. The classic bug: storing a mutable object as a key, mutating it, then failing to find it. The rule: **use immutable keys** (String, Integer, records) — and if you must use mutable keys, never mutate them while they're in the map.

## TreeMap and TreeSet: Sorted Order, O(log n)

When you need keys *in order* (ranges, "smallest key ≥ x", iteration sorted), the hash table can't help — it's deliberately unordered. `TreeMap` uses a **red-black tree**: a self-balancing binary search tree where every operation (get, put, remove) walks the tree in O(log n), and iteration yields keys in sorted order. The extras it buys:

```java
TreeMap<Integer, String> logs = new TreeMap<>();
logs.put(10, "startup"); logs.put(50, "login"); logs.put(90, "logout");

System.out.println(logs.firstKey());       // 10
System.out.println(logs.lastKey());        // 90
System.out.println(logs.ceilingKey(45));   // 50 — smallest key >= 45
System.out.println(logs.floorKey(45));     // 10 — largest key <= 45
System.out.println(logs.subMap(10, 90));   // {10=startup, 50=login}
```

Range queries (`ceilingKey`, `subMap`) are the reason `TreeMap` exists. The trade-off: O(log n) instead of O(1) for basic ops — a small constant-factor cost for huge ordering power.

## Choosing the Right Map

| Need | Use |
|---|---|
| Fast lookup, no ordering | `HashMap` (default) |
| Insertion-order iteration | `LinkedHashMap` |
| Sorted iteration / range queries | `TreeMap` |
| Concurrent access from many threads | `ConcurrentHashMap` |
| Read-only map | `Map.of(...)` / `Map.copyOf(...)` |
| Primitive keys/values, ultra-hot | `IntIntHashMap`-style (Trove/FastUtil) |

## Sets: The Same Ideas, Values Only

`HashSet` (O(1), unordered), `LinkedHashSet` (insertion order), `TreeSet` (sorted, O(log n)), `ConcurrentHashMap.newKeySet()` (thread-safe). Sets solve the "have I seen this before?" problem — deduplication, membership checks, intersection/unions via `retainAll`/`addAll`. They share all the hash-table wisdom above, including the immutable-key rule.

## Recap

Hash tables turn lookup into computation: a good hash function spreads keys across buckets, giving O(1) average get/put, with chaining (and bucket-to-tree upgrades) handling collisions and resizing keeping load low. Sets are maps without values. The two laws to live by: honor the equals/hashCode contract and use immutable keys, or lookups silently break; and know that `HashMap` promises speed, not order — reach for `LinkedHashMap` for insertion order or `TreeMap` for sorted keys and ranges. Master these and the "constant-time lookup" claims of every framework become something you can verify and rely on.
