---
title: LinkedHashMap Sorting by Keys and Values — Predictable Order You Can Reorder
summary: LinkedHashMap remembers insertion order, but real applications need to sort by key or by value. Learn how to produce a sorted view without losing the original map, how to use a custom Comparator, and why a LinkedHashMap is often better than a plain HashMap when order matters.
order: 2
minutes: 16
topics: [LinkedHashMap, sorting, comparator, insertion-order, key-sorted, value-sorted, ordered-map]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/LinkedHashMap.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Map.html
---

## The Concept, From Zero

A `HashMap` gives you O(1) lookups, but it makes **no promise about iteration order**. The order you insert entries is not the order you get them back. In fact, the order can change over time as the map resizes. If you iterate a `HashMap` and rely on the order, your code is broken — it just happens to work sometimes.

A `LinkedHashMap` is a `HashMap` with a linked list running through its entries. It gives you O(1) lookups **and** predictable iteration order. By default, it is **insertion-order** — you get entries back in the order you put them in. This is useful for caches (least-recently-used with `accessOrder = true`), for JSON serialization where key order matters, and for any UI that displays a map as a list.

But often you need the map sorted, not just insertion-ordered. You want entries sorted by key ("Alice", "Bob", "Charlie") or by value (the highest scores first). A `LinkedHashMap` can hold a sorted copy — you build it from the original map's entries sorted with a `Comparator`.

```java
import java.util.*;

public class LinkedHashMapSorting {
    public static void main(String[] args) {
        // Original: insertion order
        Map<String, Integer> scores = new LinkedHashMap<>();
        scores.put("Charlie", 85);
        scores.put("Alice", 92);
        scores.put("Bob", 78);
        scores.put("Diana", 92);

        System.out.println("--- insertion order (original) ---");
        scores.forEach((k, v) -> System.out.println(k + " = " + v));
        // Charlie, Alice, Bob, Diana

        // --- Sort by KEY (alphabetical) ---
        Map<String, Integer> byKey = new LinkedHashMap<>();
        scores.entrySet().stream()
            .sorted(Map.Entry.comparingByKey())          // natural order of String: alphabetical
            .forEach(e -> byKey.put(e.getKey(), e.getValue()));

        System.out.println("--- sorted by key ---");
        byKey.forEach((k, v) -> System.out.println(k + " = " + v));
        // Alice, Bob, Charlie, Diana

        // --- Sort by VALUE ascending ---
        Map<String, Integer> byValueAsc = new LinkedHashMap<>();
        scores.entrySet().stream()
            .sorted(Map.Entry.comparingByValue())        // natural order of Integer: smallest first
            .forEach(e -> byValueAsc.put(e.getKey(), e.getValue()));

        System.out.println("--- sorted by value (ascending) ---");
        byValueAsc.forEach((k, v) -> System.out.println(k + " = " + v));
        // Bob(78), Charlie(85), Alice(92), Diana(92)

        // --- Sort by VALUE descending, with tie-breaker on key ---
        Map<String, Integer> byValueDesc = new LinkedHashMap<>();
        scores.entrySet().stream()
            .sorted((a, b) -> {
                int cmp = Integer.compare(b.getValue(), a.getValue());  // higher score first
                if (cmp != 0) return cmp;
                return a.getKey().compareTo(b.getKey());                // same score → alphabetical by name
            })
            .forEach(e -> byValueDesc.put(e.getKey(), e.getValue()));

        System.out.println("--- sorted by value (descending), ties broken by name ---");
        byValueDesc.forEach((k, v) -> System.out.println(k + " = " + v));
        // Alice(92), Diana(92), Charlie(85), Bob(78)
        // Alice before Diana because both have 92 and "Alice" < "Diana"
    }
}
```

Line by line:

- **`LinkedHashMap<String, Integer> scores`** — a map that remembers insertion order. Charlie first, then Alice, Bob, Diana.
- **`scores.forEach(...)`** — iterates in insertion order. The output is Charlie, Alice, Bob, Diana — the order of `put()` calls.
- **`new LinkedHashMap<>()` for `byKey`** — a new empty ordered map. We will fill it in sorted order so its iteration order is alphabetical.
- **`scores.entrySet().stream().sorted(Map.Entry.comparingByKey())`** — takes the original map's entries as a stream, sorts them by key using the natural ordering of String (alphabetical). `Map.Entry.comparingByKey()` returns a `Comparator<Map.Entry<K,V>>` that compares entries by their keys.
- **`.forEach(e -> byKey.put(...))`** — puts the sorted entries into `byKey` in that order. Now `byKey` iterates alphabetically.
- **`Map.Entry.comparingByValue()`** — similar, but compares by value. Natural order of Integer: smallest first. Bob (78) comes first, then Charlie (85), then Alice and Diana (both 92).
- **The custom comparator for `byValueDesc`** — two-stage comparison: first by value descending (`Integer.compare(b.getValue(), a.getValue())` — note the reversed arguments give descending order), then by key alphabetical as a tie-breaker. This is the pattern for "sort by X, then by Y" — exactly what you do when you display a leaderboard.

### Why Not Just Use `TreeMap`?

A `TreeMap` is always sorted by key (using natural order or a custom Comparator). It is the right choice when you need key-sorted iteration all the time. But it has two costs: O(log n) operations instead of O(1), and it does not preserve insertion order — it only sorts by key.

A `LinkedHashMap` gives you O(1) and insertion order by default. When you need a sorted view, you build a new `LinkedHashMap` from a sorted stream — the original map keeps its insertion order, and the sorted copy is a separate view. This is lightweight and clear.

If you need to sort **by value**, `TreeMap` cannot do it (it only sorts by key). You must build a sorted `LinkedHashMap` or `ArrayList` of entries from a sorted stream, exactly as shown above. This is the standard pattern for "display the map sorted by value" — leaderboard, frequency table, sorted cache statistics.

```java
public class LinkedHashMapInsertionOrderDemo {
    public static void main(String[] args) {
        // LinkedHashMap as an ordered cache
        Map<String, String> cache = new LinkedHashMap<>(16, 0.75f, true); // accessOrder = true
        cache.put("a", "value-a");
        cache.put("b", "value-b");
        cache.put("c", "value-c");

        System.out.println("after insertion: " + cache.keySet());  // [a, b, c]

        cache.get("a");   // access "a" — in accessOrder mode, it moves to the end
        System.out.println("after get(a): " + cache.keySet());  // [b, c, a]

        cache.get("b");
        System.out.println("after get(b): " + cache.keySet());  // [c, a, b]
    }
}
```

Line by line:

- **`new LinkedHashMap<>(16, 0.75f, true)`** — the third constructor argument is `accessOrder`. When `true`, the iteration order is access-order (last-accessed-last), not insertion-order. This is the basis for an LRU (least-recently-used) cache.
- After insertion, the order is a, b, c (insertion order).
- **`cache.get("a")`** — in access-order mode, accessing an entry moves it to the end of the iteration order. After `get("a")`, the order is b, c, a — "a" is now the most-recently-accessed.
- **`cache.get("b")`** — now b moves to the end. Order: c, a, b.
- This is exactly how an LRU cache works: the least-recently-accessed entry is at the front; when the cache exceeds its size limit, you remove the first entry.

### Real-World Scenarios

**Scenario 1: JSON serialization with stable key order.** You serialize a `Map` to JSON and the keys appear in random order because you used a `HashMap`. The next time you serialize, the order is different — your diff shows "changed" even though the data is the same. Fix: use a `LinkedHashMap` to preserve a stable, predictable order. This matters for API responses where clients depend on field order, and for test assertions where you compare JSON strings.

**Scenario 2: Leaderboard sorted by score.** You have a map of user → score. You need to display the top 10 users by score. `HashMap` gives no order; `TreeMap` sorts by key (name), not score. You stream the entries, sort by value descending, and collect into a `LinkedHashMap` or just take the first 10 from the stream. This is the leaderboard pattern.

**Scenario 3: Configuration where order matters.** A properties file is loaded into a `LinkedHashMap` so the order of keys matches the file. When you display the config UI, the keys appear in the same order the user sees in the file. A `HashMap` would shuffle them.

**Scenario 4: LRU cache with accessOrder.** You build a small in-memory cache using `LinkedHashMap` with `accessOrder = true` and override `removeEldestEntry` to evict old entries when the size exceeds a limit. This is a lightweight cache with no external dependencies — useful for short-lived services or when you cannot add a caching library.

### Common Mistakes

| Mistake | Why it happens | Fix |
|---|---|---|
| Using `HashMap` when order matters | `HashMap` is the default choice; developers forget it has no order | Use `LinkedHashMap` when iteration order is part of the contract |
| Sorting a `LinkedHashMap` in place and expecting the original to be sorted | `LinkedHashMap` sorts only when you build a new sorted copy | Build a new sorted map from the sorted stream; the original keeps its insertion order |
| Using `TreeMap` to sort by value | `TreeMap` sorts by key only | Use a sorted stream of entries collected into a `LinkedHashMap` or `List` |
| Assuming `LinkedHashMap` with `accessOrder = true` is thread-safe | It is not — it is a normal `Map` with no synchronization | Wrap with `Collections.synchronizedMap` or use a concurrent cache library (`Caffeine`, `ConcurrentHashMap` + custom logic) |
| Using `comparingByValue()` on a map with duplicate values and expecting a stable order | `sorted()` is stable, but the tie-breaker is undefined if you do not provide one | Add a tie-breaker comparator on the key when values can be equal |

## For the Practice Lab

In the lab, you will start with an insertion-ordered `LinkedHashMap` of city → population. You will print it in insertion order, then build and print three sorted copies: by city name (key), by population ascending, and by population descending with alphabetical tie-breaker. Then you will build a small LRU cache using `accessOrder = true` and `removeEldestEntry`, insert 5 entries, access them in a pattern, and watch the order change. Finally, you will convert a `HashMap` (random order) to a `LinkedHashMap` in sorted order and verify that the original `HashMap` still has random order — confirming that sorting produces a new view, not a mutation.

## Summary

`LinkedHashMap` is a `HashMap` with predictable iteration order — insertion-order by default, access-order when you request it. It gives O(1) lookups and a stable order, which makes it the right choice for JSON serialization, configuration display, and LRU caches. When you need to sort by key or value, build a new `LinkedHashMap` from the original entries sorted with a `Comparator` — the original map keeps its order, and the sorted copy is a separate view. `TreeMap` sorts by key only and is O(log n); it cannot sort by value, so a sorted stream into a `LinkedHashMap` is the standard pattern for value-sorted maps. Always add a tie-breaker when values can be equal, and never assume any `Map` is thread-safe without synchronization.
