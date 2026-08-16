---
title: The Collections Framework
summary: The List/Set/Map contracts, choosing the right implementation, comparators, and avoiding ConcurrentModificationException.
order: 6
minutes: 18
topics: [collections, list, map, set, comparator, concurrency]
docs:
  - https://docs.oracle.com/javase/tutorial/collections/
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/List.html
---

# The Collections Framework

## The core contracts

```
Iterable
 └── Collection
      ├── List    — ordered, indexed, duplicates allowed   (ArrayList, LinkedList)
      ├── Set     — no duplicates, equals-based            (HashSet, LinkedHashSet, TreeSet)
      └── Queue   — FIFO/priority processing               (ArrayDeque, PriorityQueue)
Map<K,V>          — key → value lookup                      (HashMap, LinkedHashMap, TreeMap, ConcurrentHashMap)
```

## Choosing the right implementation

| Need | Use |
|---|---|
| Fast indexed access, iterate often | `ArrayList` |
| Insert/remove at both ends | `ArrayDeque` |
| Unique elements, fast contains | `HashSet` |
| Unique + insertion order | `LinkedHashSet` |
| Sorted unique elements | `TreeSet` (natural order) |
| Fast key lookup | `HashMap` |
| Insertion-order map | `LinkedHashMap` |
| Sorted keys | `TreeMap` |
| **Shared across threads** | `ConcurrentHashMap` (never a plain HashMap) |

```java
List<String> names = new ArrayList<>(List.of("ada", "grace", "linus"));
names.sort(Comparator.naturalOrder());

Map<String, Integer> scores = new HashMap<>();
scores.merge("ada", 1, Integer::sum);   // increment safely, no get/put dance

// Immutable copies: List.of / Set.of / Map.of — prefer returning these
List<String> snapshot = List.copyOf(names);
```

## Comparable vs Comparator

```java
record Txn(String id, Instant at, long amountCents) implements Comparable<Txn> {
    @Override public int compareTo(Txn o) { return at.compareTo(o.at); }   // natural: by time
}

Comparator<Txn> byAmount = Comparator.comparingLong(Txn::amountCents).reversed();
Comparator<Txn> byAmountThenDate = byAmount.thenComparing(Txn::at);       // chaining
```

- `Comparable` = the type's own natural ordering (one only).
- `Comparator` = external strategies; compose, reverse, chain.

## Iteration and ConcurrentModificationException

```java
List<String> list = new ArrayList<>(List.of("a", "b", "c"));

// WRONG — structural change during iteration throws
for (String s : list) if (s.equals("b")) list.remove(s);

// RIGHT — iterator.remove() or removeIf
list.removeIf(s -> s.equals("b"));

Iterator<String> it = list.iterator();
while (it.hasNext()) if ("c".equals(it.next())) it.remove();
```

`ConcurrentModificationException` also happens when *another thread* mutates a collection mid-iteration. Fixes: `removeIf`, `CopyOnWriteArrayList` (rare), `ConcurrentHashMap` for shared maps.

## Map recipes used daily

```java
Map<String, List<Txn>> byCurrency = new HashMap<>();
byCurrency.computeIfAbsent("EUR", k -> new ArrayList<>()).add(txn);

Map<String, Long> counts = new HashMap<>();
for (Txn t : txns) counts.merge(t.currency(), 1L, Long::sum);

// iterate entries
for (Map.Entry<String, Long> e : counts.entrySet()) {
    System.out.println(e.getKey() + " -> " + e.getValue());
}
```

> **Why it matters (organizational view)** — Wrong collection choices cause production incidents: a `HashMap` shared across threads corrupts silently; `LinkedList` indexing is O(n); mutable collections returned from APIs cause aliasing bugs. Standards ("return unmodifiable views, use ConcurrentHashMap for shared state, size ArrayList up front") are cheap insurance.

## Key takeaways

- Know the contract (List/Set/Map/Queue) and pick the implementation for *your* access pattern.
- Never mutate a collection while iterating it — use `removeIf`/iterator methods.
- `ConcurrentHashMap` for shared maps; immutable `List.copyOf`/`Map.copyOf` for API returns.
- `Comparator.comparing(...)` chains are more readable than hand-rolled compareTo.

**Official docs:** [Collections tutorial](https://docs.oracle.com/javase/tutorial/collections/) · [List API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/List.html)
