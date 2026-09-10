---
title: Java 2 (1998) — The Collections Framework Replaces Vector and Hashtable
summary: Java 1.2 introduced the Collections Framework — List, Set, Map interfaces with real implementations, iterators, and predictable performance. This is the release that turned Java from a toy into an enterprise platform, and the API style it established is the style you still write.
order: 2
minutes: 12
topics: [Java 2, Collections Framework, List, Map, Iterator, Big-O]
docs:
  - https://docs.oracle.com/javase/8/docs/technotes/guides/collections/overview.html
  - https://dev.java/learn/api/collections-framework/
capstone: false
---

## The idea in one sentence

Java 1.2 (sold as "Java 2") replaced the two one-size-fits-all classes of 1.0 — `Vector` and `Hashtable` — with a whole **framework of interfaces and interchangeable implementations**, and choosing the right implementation for the job became a core Java skill.

## The world before: two classes for everything

In 1.0 you had exactly two choices, and both were wrong in the same way:

```java
// The 1.0 way (display only — Vector is still legal, just wrong for new code):
Vector names = new Vector();          // grows by doubling, synchronized (slow)
names.addElement("Ada");
Hashtable ages = new Hashtable();     // key-value, synchronized, no nulls
ages.put("Ada", 36);

Object first = names.firstElement();  // returns Object — you must cast
String n = (String) first;            // wrong guess = ClassCastException at runtime
```

**Step by step:**

1. `addElement` accepts *any* object — the list cannot promise what's inside.
2. Reading back gives you `Object`; the cast is you *telling* the compiler "trust me".
3. If a non-String sneaks in, the crash happens far from the bug that caused it.
4. Both classes synchronize every method — thread safety nobody asked for, paid for on every call.

**Analogy:** 1.0 gave you one screwdriver. Java 2 gave you a proper toolbox with a labeled drawer for each job — and a way to swap tools without rewriting the work.

## The framework in one picture

Two interface trees, learned once, reused forever:

```
Collection                (things you can iterate)
├── List    → ordered, duplicates OK
│     ├── ArrayList  — fast random access, O(1) get
│     └── LinkedList — fast inserts at ends, O(1) add/remove at ends
└── Set     → no duplicates
      ├── HashSet   — O(1) contains, no order
      └── TreeSet   — sorted, O(log n)

Map                       (key → value, separate tree)
├── HashMap — O(1) get/put, one null key
└── TreeMap — sorted by key, O(log n)
```

The rules the framework set — and every Java API since has followed:

1. **Program to interfaces.** Declare `List<String> x = new ArrayList<>();` — never `ArrayList x`. Swapping the implementation later is a one-word change.
2. **Choose by Big-O.** The docs tell you the cost of every operation; you pick the shape your access pattern needs.
3. **Iterate uniformly.** One `Iterator` interface works across every collection.

## Collections in action (runnable)

```java
import java.util.*;

public class CollectionsEra {
    public static void main(String[] args) {
        Map<String, Integer> scores = new HashMap<String, Integer>();
        scores.put("Ada", 99);
        scores.put("Linus", 91);
        scores.put("Grace", 97);

        Integer adas = scores.get("Ada");
        System.out.println("Ada's score: " + adas);

        scores.put("Ada", 100);
        Integer updated = scores.get("Ada");
        System.out.println("Updated Ada: " + updated);

        int size = scores.size();
        System.out.println("Distinct keys: " + size);
    }
}
```

**What this code does — step by step:**

1. `new HashMap<String, Integer>()` — note the pre-diamond generic syntax; the diamond `<>` arrives in Java 7 (lesson 4).
2. `scores.get("Ada")` — hash the key, find the bucket, return the value: O(1) average.
3. `put` on an existing key **replaces** the value — maps are keyed, not append-only. (One classic trap the block deliberately avoids: `get` on an *absent* key returns `null`, not an error — the NPE source that Java 8's `getOrDefault` and `Optional` later softened.)
4. `size()` counts distinct keys.

> 🔧 **Try it:** run this in **Practice**. Predict each printed line *before* running — especially what a missing key returns.

## Choosing an implementation: the decision table

| You need | Use | Why |
|---|---|---|
| Positional access, index lookups | `ArrayList` | O(1) `get(i)`; backed by an array |
| Frequent add/remove at both ends | `ArrayDeque` | O(1) at both ends |
| Fast "have I seen this?" checks | `HashSet` | O(1) `contains` |
| Sorted iteration / ranges | `TreeMap`/`TreeSet` | Red-black tree, O(log n), sorted traversal |
| Key → value with priority on reads | `HashMap` | O(1) average get/put |

**One worked example:** counting word frequencies. With a `TreeMap` the result comes out alphabetized for free; with a `HashMap` you'd have to sort afterwards. Same interface, different free perks.

## Iterator: the uniform cursor

Before the framework, `Vector` gave you `Enumeration` (`hasMoreElements()`/`nextElement()`). The Collections Framework standardized on `Iterator` with a crucial addition — **`remove()`**, the only safe way to delete while iterating:

```java
// Display only: the remove-while-iterating pattern
Iterator<String> it = words.iterator();
while (it.hasNext()) {
    if (bad(it.next())) {
        it.remove();          // safe — the collection knows about the cursor
    }
}
```

**Step by step:**

1. `iterator()` hands out a cursor positioned *before* the first element.
2. `hasNext()` asks "is there a next?" without moving.
3. `next()` returns the element *and* advances.
4. `remove()` deletes the element `next()` just returned — deleting via the collection itself mid-loop throws `ConcurrentModificationException`. (Enhanced-`for` and streams in Java 5/8 build directly on this cursor.)

## Why 1998 still matters in 2026

- **Every Spring controller returns data held in these types** — `List<Order>`, `Map<Long, User>`. When you review code, implementation choice is a real review comment.
- JPA repositories return `List<T>`; JSON serialization walks `Map`s. The framework *is* the data plumbing of the backend.
- The interface-first style — define the contract, offer implementations — is the same style Spring uses for every bean you'll wire.

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| `Map.get` result used without null check | NPE on absent keys | Check for null, or use `getOrDefault` (Java 8) |
| Declaring `HashMap x = new HashMap()` | Locks the implementation | Declare `Map x = new HashMap<>()` |
| Removing from a list inside `for` loop | `ConcurrentModificationException` | Use `Iterator.remove()` or `removeIf` (Java 8) |
| `TreeMap` chosen "for performance" | It's *slower* than `HashMap` — it buys *order* | Pick by access pattern, not vibes |

## Quick check

1. Which two 1.0 classes did Java 2 replace, and what were their two shared flaws?
2. You must answer "does this feed contain this user?" millions of times a minute — which `Set` and why?
3. Why does `map.get("missing")` returning `null` matter so much in practice?

<!-- answers: Vector/Hashtable — Object-typed (casts) and synchronized-everything; HashSet — O(1) contains; null flows on and explodes far from the cause -->

## References

- [Oracle — official JDK documentation](https://docs.oracle.com/javase/8/docs/technotes/guides/collections/overview.html)
- [dev.java — the official OpenJDK site](https://dev.java/learn/api/collections-framework/)
- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/javase/8/docs/technotes/guides/lang/enhancements.html)
