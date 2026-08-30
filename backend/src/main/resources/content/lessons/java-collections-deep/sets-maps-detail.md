---
title: Sets, Maps and the equals/hashCode Contract
module: java-collections-deep
order: 3
minutes: 22
topics: ["HashSet", "LinkedHashSet", "TreeSet", "equals hashCode", "LinkedHashMap", "EnumMap"]
summary: Sets and maps are their contracts: equals/hashCode decide membership, compareTo decides order, and the concrete class decides the strategy. This le...
docs:
  - title: "Set and Map interfaces"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Set.html"
---

# Sets, Maps and the equals/hashCode Contract

Sets and maps *are* their contracts: `equals`/`hashCode` decide membership, `compareTo` decides order, and the concrete class decides the strategy. This lesson covers each variant, the contract rules that break them silently, and the specialized maps that are faster than HashMap for common cases.

## The Contract That Everything Depends On

```java
public class Course {
    private String slug;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Course c)) return false;
        return Objects.equals(slug, c.slug);
    }

    @Override
    public int hashCode() {
        return Objects.hash(slug);
    }
}
```

The three laws:
1. `a.equals(b)` → `a.hashCode() == b.hashCode()` (equal objects, equal hashes)
2. `equals` must be reflexive, symmetric, transitive
3. **`hashCode` must not change while the object is in a hash collection**

Break law 3 (mutate the slug after insertion) and the set/map silently loses the object — `contains` returns false forever.

## The Set Family

| Set | Backing | Order | Use |
|-----|---------|-------|-----|
| `HashSet` | HashMap | None | Default, fastest |
| `LinkedHashSet` | LinkedHashMap | Insertion order | Ordered dedupe |
| `TreeSet` | TreeMap (red-black) | Sorted (Comparable/Comparator) | Sorted unique |

```java
Set<String> tags = new HashSet<>(List.of("java", "spring", "java"));
// → {"java", "spring"} — dedupe

Set<String> ordered = new LinkedHashSet<>(List.of("b", "a", "c"));
// → [b, a, c] — insertion order preserved

Set<String> sorted = new TreeSet<>(List.of("b", "a", "c"));
// → [a, b, c] — sorted
```

### TreeSet With a Comparator

```java
// By minutes, then title
Set<Course> byLength = new TreeSet<>(
    Comparator.comparingInt(Course::minutes).thenComparing(Course::title));

byLength.addAll(courses);
// iterate: shortest first
```

## The Map Family

| Map | Order | Use |
|-----|-------|-----|
| `HashMap` | None | Default |
| `LinkedHashMap` | Insertion (or access) order | LRU caches, ordered maps |
| `TreeMap` | Sorted by key | Range queries, sorted iteration |
| `EnumMap` | Enum ordinal array | Enum keys — fastest possible |
| `IdentityHashMap` | Reference equality | Identity semantics |

### LinkedHashMap: The LRU Cache

```java
class LruCache<K, V> extends LinkedHashMap<K, V> {

    private final int maxSize;

    LruCache(int maxSize) {
        super(maxSize, 0.75f, true);   // access-order mode
        this.maxSize = maxSize;
    }

    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        return size() > maxSize;   // evict the least-recently-used on overflow
    }
}
```

`accessOrder = true` reorders on `get` — the map becomes a real LRU cache in ~10 lines.

### EnumMap: The Forgotten Speed King

```java
enum Status { NEW, PROCESSING, PAID, CANCELLED }

Map<Status, Integer> counts = new EnumMap<>(Status.class);
counts.merge(Status.PAID, 1, Integer::sum);

// Backed by a plain array indexed by ordinal — O(1), tiny memory, no hashing
```

`EnumMap` is faster than HashMap for enum keys (array lookup, no hashing, no boxing) — use it whenever the key space is an enum.

### IdentityHashMap

```java
// Reference-equality semantics: "same object", not "equal"
IdentityHashMap<Object, String> registry = new IdentityHashMap<>();
registry.put(c1, "instance-1");
registry.put(new Course("same-slug"), "instance-2");   // different object, different key
```

Rarely needed — but essential for object-identity tracking (profiling, proxy caches) where `equals` is the wrong semantic.

## Null Handling

| Collection | Null keys | Null values |
|-----------|-----------|-------------|
| HashMap | ✅ (1 null key) | ✅ |
| LinkedHashMap | ✅ | ✅ |
| TreeMap | ❌ (NPE without comparator) | ✅ |
| EnumMap | ❌ | ✅ |
| HashSet | ✅ (1 null) | — |
| TreeSet | ❌ | — |
| List.of/Set.of/Map.of | ❌ | ❌ |

## Mutating While Iterating

All non-concurrent collections throw `ConcurrentModificationException` on structural change during iteration. Remove safely:

```java
// ❌ CME
for (String tag : tags) {
    if (tag.startsWith("x")) tags.remove(tag);
}

// ✅ iterator.remove()
Iterator<String> it = tags.iterator();
while (it.hasNext()) {
    if (it.next().startsWith("x")) it.remove();
}

// ✅ removeIf (Java 8+)
tags.removeIf(t -> t.startsWith("x"));
```

## Choosing the Right Map

```
Key is an enum?                    → EnumMap
Need LRU eviction?                 → LinkedHashMap (access order)
Need sorted/range queries?         → TreeMap
Need insertion order?              → LinkedHashMap (insertion order)
Reference equality?                → IdentityHashMap
Everything else?                   → HashMap
```

## Testing the Contract

```java
@Test
void equalObjectsHaveEqualHashes() {
    Course a = new Course("spring");
    Course b = new Course("spring");
    assertEquals(a, b);
    assertEquals(a.hashCode(), b.hashCode());
}

@Test
void hashCodeStableInCollections() {
    Set<Course> set = new HashSet<>();
    Course c = new Course("spring");
    set.add(c);
    assertTrue(set.contains(c));   // passes
    // (mutating c.slug here would break this — the trap)
}
```

## Summary

| Need | Collection |
|------|-----------|
| Fast dedupe | HashSet |
| Ordered dedupe | LinkedHashSet |
| Sorted unique | TreeSet |
| Key → value | HashMap |
| Enum keys | EnumMap (fastest) |
| LRU cache | LinkedHashMap (access order) |
| Range queries | TreeMap |
| Reference equality | IdentityHashMap |

Every set/map is a *contract* plus a *strategy*. Respect `equals`/`hashCode`, pick the strategy by access pattern, and the collections do the rest — violate the contract and they fail silently, which is the worst kind of failure.
