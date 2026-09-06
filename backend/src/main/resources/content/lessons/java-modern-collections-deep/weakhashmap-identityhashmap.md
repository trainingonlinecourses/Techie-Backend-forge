---
title: WeakHashMap and IdentityHashMap — The Unusual Map Implementations
summary: Most of the time you use HashMap, but Java gives you two other map implementations that solve very specific problems: WeakHashMap, where the keys are held with weak references and the garbage collector can remove entries, and IdentityHashMap, which compares keys with == instead of equals. This lesson explains when each one is the right tool and why the defaults bite you.
order: 1
minutes: 22
topics: [WeakHashMap, IdentityHashMap, HashMap, weak-references, identity-equality, garbage-collection, maps]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/WeakHashMap.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/IdentityHashMap.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ref/WeakReference.html
---

## The Concept, From Zero

`HashMap` is the map you reach for by default. It computes a hash from the key's `hashCode()`, stores the key and value together, and retrieves the value by computing the same hash and using `equals()` to confirm the right key. It is fast, general-purpose, and it keeps every entry you put into it until you remove it.

But "keeps every entry until you remove it" is not what you always want. Sometimes you want a map whose entries disappear when no one else is using the key. Sometimes you want a map that uses reference identity instead of object equality. For those cases, Java provides `WeakHashMap` and `IdentityHashMap`.

These are not drop-in replacements for `HashMap`. They have specific, narrow purposes. Using the wrong one — or using one when a plain `HashMap` would do — produces subtle bugs that are hard to reproduce.

### HashMap's Equality Model — The Default to Understand First

To understand the unusual maps, start with what `HashMap` does.

- **Key lookup uses `hashCode()` and `equals()`.** When you put a key in a `HashMap`, the map computes the key's `hashCode()` and uses it to choose a bucket. When you later get with that key, the map computes the hash again and then compares the stored key with the lookup key using `equals()`.
- **This means `equals()` matters.** Two different objects that are "equal" by `equals()` act as the same key. If you put a value under one `String` object, you can retrieve it with another `String` object that contains the same text, because `"hello".equals("hello")` is true.
- **This also means `hashCode()` and `equals()` must be consistent.** If two objects are equal, they must have the same hash code. If you override `equals()` and not `hashCode()`, the map breaks — you can put a value with one object and never retrieve it with an equal object, because the hash codes differ.

This model works beautifully for most application code, where you want logical equality: two `Employee` objects with the same ID are the same key, even if they are different instances. But it is not the only model.

### WeakHashMap — A Map Whose Keys Can Be Garbage-Collected

A `WeakHashMap` is almost like a `HashMap`, except it does not keep strong references to its keys. Instead, each key is held with a **weak reference**. A weak reference is a reference that does not prevent the garbage collector from reclaiming the object. If the only references to a key are weak references — meaning your application no longer uses that key anywhere else — then the key is eligible for garbage collection, and when it is collected, the corresponding entry in the `WeakHashMap` silently disappears.

This is very different from `HashMap`. In a `HashMap`, putting a key in the map keeps that key alive as long as the map lives. The map itself holds a strong reference to the key. In a `WeakHashMap`, the map holds a weak reference, so the key can die even while the map still exists.

This sounds like it could be a memory-leak prevention tool, and it is, but only in the right situation. The classic use case is a cache or a registry where the key is some object the rest of the application owns, and you want to attach some metadata to it without preventing that object from being garbage-collected when the application is done with it.

A concrete example: imagine a web framework that keeps a `Map<ServletRequest, RequestMetadata>` so it can attach timing information to each request. If this map is a plain `HashMap`, every request object is kept alive by the map until you explicitly remove the entry. If the map grows without bound — because for one reason or another the cleanup never runs — you have a memory leak. If it is a `WeakHashMap`, then once a request object is no longer referenced elsewhere (the request is done and no other part of the application holds it), the entry can be reclaimed automatically.

But there is a trap: `WeakHashMap` only weakly references the **keys**, not the values. If the value holds a strong reference back to the key — which is common, accidentally or not — then the key is still reachable and will not be collected, and the entry stays. The map cannot help you if the value keeps the key alive.

```java
// A WeakHashMap example: a simple cache where the key is something the
// application owns and the map should not keep it alive

import java.util.WeakHashMap;
import java.util.Map;

public class WeakCacheExample {
    // The keys are objects the rest of the app owns.
    // The map should not prevent them from being GC'd.
    static final Map<BigDataObject, Metadata> cache =
        new WeakHashMap<>();

    static class BigDataObject {
        // imagine a large object the application creates and uses
        private final byte[] data = new byte[1024 * 1024]; // 1 MB
    }

    static class Metadata {
        final long created = System.currentTimeMillis();
    }

    public static void main(String[] args) {
        BigDataObject obj = new BigDataObject();
        cache.put(obj, new Metadata());
        System.out.println("cached: " + cache.size());   // 1

        // The application is now done with obj — drop the reference
        obj = null;

        // At this point, only the WeakHashMap (weakly) and the Metadata
        // hold references to the BigDataObject. If Metadata does NOT
        // reference the key back, the key is GC-eligible.
        //
        // The entry does NOT disappear immediately — it disappears the
        // next time the map is accessed and the GC has reclaimed the key.
        // This is why WeakHashMap is not a real-time cache and why you
        // should never rely on it for correctness.

        System.gc();   // hint to the JVM — not guaranteed, not a solution
        System.out.println("after gc (best-effort): " + cache.size());
    }
}
```

A few things to notice in this example:

- The key is `BigDataObject`, which the application owns.
- The map is a `WeakHashMap`, so the key is held weakly.
- The `Metadata` value does **not** hold a reference back to the key. If it did, the key would stay reachable and the entry would not be collected.
- `System.gc()` is only a hint; the JVM may ignore it or run a partial collection. You cannot depend on it to clean up the map immediately.
- The entry does not disappear the moment the key becomes unreachable. `WeakHashMap` cleans up entries lazily, during map operations. This means the map can still hold onto "stale" entries for a while after the key is gone.

The main takeaways for `WeakHashMap`:

- Use it when you want to associate data with objects you do not own and should not keep alive.
- The keys must be weakly referenced — only the keys, not the values.
- Do not use it when correctness depends on entries persisting. It is not a cache you can trust to keep data for a set time.
- Be careful that the values do not hold strong references back to the keys, or the whole thing breaks.
- It is not a real-time structure. The entries disappear during map operations after GC, not instantly.

### IdentityHashMap — A Map That Uses == Instead of equals

An `IdentityHashMap` is a map that compares keys with **reference identity** (`==`), not with `equals()`. Two keys are considered the same if and only if they are the exact same object in memory. Even if two objects have the same state and `equals()` returns true, an `IdentityHashMap` treats them as different keys if they are different objects.

This is the opposite of the `HashMap` model. `HashMap` says "these two equal objects are the same key." `IdentityHashMap` says "only this exact object is the same key."

The use cases are narrow but real:

- **Serialization and deep-copy frameworks** — when you are traversing an object graph and need to track which objects you have already seen, you usually want to track by object identity, because you are dealing with the actual object instances, not their logical equality. Two different `Person` objects with the same name are different objects in the graph, and you want to handle each one separately.
- **Debugging and analysis tools** — when you are building a tool that inspects objects, you want to know whether two references point to the same object, not whether they are equal.
- **When `equals()` is expensive and you know the objects are unique** — but this is rare and usually a premature optimisation. The default `HashMap` is almost always the right choice for application data.

```java
// IdentityHashMap: two equal-but-distinct objects are different keys

import java.util.IdentityHashMap;
import java.util.Map;

public class IdentityMapExample {
    static class Person {
        final String name;
        final int id;

        Person(String name, int id) {
            this.name = name;
            this.id = id;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof Person)) return false;
            Person p = (Person) o;
            return id == p.id;
        }

        @Override
        public int hashCode() {
            return id;
        }

        @Override
        public String toString() {
            return name + "(" + id + ")";
        }
    }

    public static void main(String[] args) {
        // Two Person objects with the same id — they are EQUAL by our equals(),
        // but they are DIFFERENT objects in memory.
        Person p1 = new Person("Alice", 1);
        Person p2 = new Person("Alice", 1);

        System.out.println("p1.equals(p2): " + p1.equals(p2));   // true
        System.out.println("p1 == p2: " + (p1 == p2));           // false

        // HashMap: uses equals — p1 and p2 are the same key
        Map<Person, String> hashMap = new java.util.HashMap<>();
        hashMap.put(p1, "first");
        hashMap.put(p2, "second");     // overwrites the entry under p1
        System.out.println("HashMap size: " + hashMap.size());   // 1
        System.out.println("HashMap.get(p1): " + hashMap.get(p1)); // "second"
        System.out.println("HashMap.get(p2): " + hashMap.get(p2)); // "second"

        // IdentityHashMap: uses == — p1 and p2 are different keys
        Map<Person, String> idMap = new IdentityHashMap<>();
        idMap.put(p1, "first");
        idMap.put(p2, "second");       // different key — does NOT overwrite
        System.out.println("IdentityHashMap size: " + idMap.size()); // 2
        System.out.println("idMap.get(p1): " + idMap.get(p1)); // "first"
        System.out.println("idMap.get(p2): " + idMap.get(p2)); // "second"
    }
}
```

In this example:

- `p1` and `p2` are two different objects, but they are equal by the `Person` class's `equals()` method (same `id`).
- In a `HashMap`, `p2` overwrites `p1`'s entry, because the map treats them as the same key. The map size is 1.
- In an `IdentityHashMap`, `p1` and `p2` are different keys, because they are different objects. The map size is 2.

This is the core behaviour: `IdentityHashMap` ignores `equals()` and `hashCode()` for key comparison and uses identity instead. (It still uses `hashCode()` to choose buckets, but it uses `System.identityHashCode()`, which is based on identity, not on your overridden `hashCode()`.)

A few warnings:

- **Do not use `IdentityHashMap` for general application data.** If you put an object in an `IdentityHashMap` and later look it up with another object that is "equal" to it, you will not find it. This is almost never what you want for application logic.
- **`equals()` and `hashCode()` contracts do not apply here.** The normal rule that equal objects must have the same hash code is irrelevant for `IdentityHashMap`, because it does not use your `hashCode()`. But if you write code that assumes it does, you will be confused.
- **It is not a general-purpose map.** It is a specialised tool for when identity, not equality, is the property you care about.

### The Difference in a Table

| Property | HashMap | WeakHashMap | IdentityHashMap |
|---|---|---|---|
| Key equality | `equals()` | `equals()` | `==` (identity) |
| Key reference | strong | weak | strong |
| Entries disappear when key is GC'd? | No | Yes (lazily) | No |
| Values reference keys? | No impact | Can prevent GC if value holds key strongly | No impact |
| Typical use | General-purpose map | Cache/registry tied to object lifetime | Object-graph algorithms, debuggers |
| Thread-safe? | No (use ConcurrentHashMap) | No | No |

### A Common Mistake: Confusing the Three

A common bug pattern is to use `WeakHashMap` when you actually needed entries to persist, and then spend hours wondering why data vanishes "on its own." Another is to use `IdentityHashMap` for application data, and then be confused when two equal objects do not act as the same key.

The question to ask is: "Do I care about **logical equality** (two objects with the same data are the same) or **identity** (only this exact object is the same)?" If the answer is logical equality, use `HashMap` (or `ConcurrentHashMap` if you need thread safety). If the answer is identity, and you are writing a framework or tool that tracks object instances, consider `IdentityHashMap`. If the answer is "I want to attach metadata to an object without keeping it alive," consider `WeakHashMap`, but be careful about values referencing keys.

```java
// A mistake: using IdentityHashMap for application data when you meant HashMap

import java.util.IdentityHashMap;
import java.util.Map;

public class WrongMapExample {
    public static void main(String[] args) {
        // Two different String objects with the same text
        String s1 = new String("admin");
        String s2 = new String("admin");

        // IdentityHashMap — different objects, different keys
        Map<String, String> roles = new IdentityHashMap<>();
        roles.put(s1, "admin-role");
        String role = roles.get(s2);   // s2 is not the same object as s1
        System.out.println("role for s2: " + role);   // null — not found!

        // HashMap — same text, same key
        Map<String, String> roles2 = new java.util.HashMap<>();
        roles2.put(s1, "admin-role");
        String role2 = roles2.get(s2);   // s2.equals(s1) is true
        System.out.println("role for s2 in HashMap: " + role2); // "admin-role"
    }
}
```

In this example, `s1` and `s2` are two different `String` objects, but their text is the same. In a `HashMap`, they are the same key — you can look up with `s2` and find the value stored under `s1`. In an `IdentityHashMap`, they are different keys — `roles.get(s2)` returns `null`, because `s2` is not the same object as `s1`. This is almost certainly a bug if your intention was to look up roles by username text.

## A Code Example — Combining Both Unusual Maps

This example shows a scenario where `WeakHashMap` and `IdentityHashMap` are both the right tool, but for different reasons: a simple object-graph tracer that tracks visited objects by identity, and a per-object metadata cache that should not keep objects alive.

```java
import java.util.IdentityHashMap;
import java.util.Map;
import java.util.WeakHashMap;
import java.util.Set;

public class UnusualMapsExample {

    // === IdentityHashMap: track visited objects by identity ===
    // When traversing an object graph (like a deep-clone or a cycle detector),
    // we want to know if we have already visited a specific object instance.
    // Two equal objects are NOT the same visit — we care about identity.
    static final Map<Object, Boolean> visited = new IdentityHashMap<>();

    // === WeakHashMap: attach metadata to objects without keeping them alive ===
    // Objects the application works with should be GC-able when the app is
    // done with them. The metadata cache should not prevent that.
    static final Map<Object, Object> metadata = new WeakHashMap<>();

    // A sample object graph with a cycle: Node A -> Node B -> Node A
    static class Node {
        final String label;
        Node next;

        Node(String label) { this.label = label; }

        @Override
        public String toString() {
            return "Node(" + label + ")";
        }
    }

    // Traverse a graph, stopping at already-visited objects (by identity)
    static void traverse(Object obj) {
        if (obj == null) return;

        // IdentityHashMap: use ==, not equals
        if (visited.containsKey(obj)) {
            System.out.println("  already visited: " + obj);
            return;
        }
        visited.put(obj, Boolean.TRUE);
        System.out.println("visiting: " + obj);

        if (obj instanceof Node n) {
            traverse(n.next);
        }
    }

    public static void main(String[] args) {
        // Create a cycle: A -> B -> A
        Node a = new Node("A");
        Node b = new Node("B");
        a.next = b;
        b.next = a;

        System.out.println("=== Traversing a cyclic graph with IdentityHashMap ===");
        traverse(a);

        // === WeakHashMap metadata cache ===
        System.out.println("\n=== WeakHashMap metadata cache ===");
        Object payload = new Object();
        metadata.put(payload, "attached-metadata");
        System.out.println("metadata size before drop: " + metadata.size());

        // Drop our reference to the payload — now only the WeakHashMap
        // (weakly) might reference it. The entry becomes eligible for
        // removal on the next map access after GC.
        payload = null;

        // Access the map to trigger cleanup
        metadata.get(new Object());   // triggers a cleanup pass internally
        System.out.println("metadata size after drop + access: " + metadata.size());
    }
}
```

Line by line:

- **`IdentityHashMap<Object, Boolean> visited`** — we track visited objects by identity. Two different `Node` objects that happen to have the same label are different nodes in the graph, and we want to visit each one separately. If we used a `HashSet` with `equals()`, two equal-but-distinct nodes would be treated as the same, and we would miss part of the graph. With `IdentityHashMap`, each distinct object instance is its own entry.
- **`visited.containsKey(obj)`** — checks by identity. If this exact object instance was already visited, we have found a cycle (or a repeated reference) and stop.
- **`WeakHashMap<Object, Object> metadata`** — we attach metadata to objects without keeping them alive. Once the application drops its reference to an object, the metadata entry should be reclaimable.
- **`metadata.put(payload, "attached-metadata")`** — stores metadata for an object.
- **`payload = null;`** — the application no longer references the object. Now only the weak reference in the map (and the value) holds it.
- **`metadata.get(new Object())`** — triggers an internal cleanup pass in `WeakHashMap`. The map checks its weak keys and removes entries whose keys have been garbage-collected. (This is lazy cleanup, not immediate.) After this, the stale entry may be gone.

This example shows both maps doing what they are designed for: `IdentityHashMap` for identity-based tracking in a graph algorithm, `WeakHashMap` for metadata that should not keep objects alive.

## Where This Shows Up in an Organization

In a backend team, these maps show up in framework and tool code, not usually in plain service logic.

`IdentityHashMap` is used in serialization libraries (to track which objects have been seen during a deep-copy or a serialization pass), in ORM implementations (to track entity instances during a session), and in debuggers and profilers (to report on actual object instances). If you are writing a tool that inspects or traverses object graphs, you will reach for `IdentityHashMap`.

`WeakHashMap` is used in caching layers where the cache keys are objects the application owns and the cache should not prevent their collection. It also appears in memory-sensitive caches and in some framework hot-reload and annotation-scanning implementations. But it is not a general-purpose cache — for that, use a library like Caffeine or Redis, not `WeakHashMap`.

`HashMap` and `ConcurrentHashMap` are the maps you use every day for application data. They are the default for a reason.

## Common Mistakes

| Mistake | Why it happens | Fix |
|---|---|
| Using `IdentityHashMap` for application data like roles or permissions | The name "map" makes it feel interchangeable | Default to `HashMap`. Use `IdentityHashMap` only when identity, not equality, is what you mean |
| Expecting a `WeakHashMap` entry to disappear instantly when the key is dropped | Weak references are not牛逼immediate; cleanup is lazy and GC-dependent | Do not rely on `WeakHashMap` for correctness or timing; treat it as a best-effort optimisation |
| Creating a memory leak with `WeakHashMap` by letting values reference keys | The value holds the key alive, so the weak reference does not help | Make sure values do not reference their keys strongly, or use a different structure |
| Using `System.gc()` to force cleanup | `System.gc()` is a hint, not a guarantee, and calling it often is harmful to performance | Do not depend on it; let the JVM manage GC |
| Confusing `IdentityHashMap` with a `HashMap` that uses reference identity on a class that does not override `equals()` | If a class does not override `equals()`, the default `Object.equals()` uses `==`, so the two maps behave the same | If the class overrides `equals()`, the maps behave differently — that is the point |
| Thinking `WeakHashMap` is a cache | It is not designed for TTL, size limits, or eviction policies | Use Caffeine, Guava, or Redis for caches; use `WeakHashMap` only for weak-key semantics |

## For the Practice Lab

In the lab, you will see a starter with a faulty cache that uses `WeakHashMap` incorrectly — the value holds a strong reference to the key — and a graph-traversal that uses `HashMap` where it should use `IdentityHashMap`, causing it to miss nodes that are equal but distinct. Fix both, then run the traversal on a cyclic graph and observe the identity-based visited set correctly detecting the cycle. Finally, switch the cache to a proper map implementation (or fix the weak reference usage) so entries no longer leak.

## Summary

`WeakHashMap` and `IdentityHashMap` are specialised `Map` implementations for specific problems. `WeakHashMap` holds keys with weak references so entries can be garbage-collected when no one else uses the key — useful for metadata caches tied to object lifetime, but not a real-time cache and not one you can rely on for correctness. `IdentityHashMap` uses reference identity (`==`) instead of `equals()` for key comparison — useful for object-graph algorithms and tools that track actual instances, but almost never the right choice for application data. For general-purpose maps, use `HashMap` (single-threaded) or `ConcurrentHashMap` (thread-safe). The three maps differ in how they compare keys and how they hold references to them — and choosing the wrong one is a common source of subtle bugs.
