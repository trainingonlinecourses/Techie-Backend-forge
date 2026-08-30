---
title: Sequenced Collections — First, Last, and Reversed
summary: What SequencedCollection, SequencedSet, and SequencedMap are, how they unify first/last/reversed operations, and how organizations use them.
order: 2
minutes: 15
topics: [sequenced-collection, sequenced-set, sequenced-map, reversed, java21]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/SequencedCollection.html
---

## The Concept, From Zero

Before Java 21, getting the first or last element of a collection required awkward workarounds:

```java
// Getting the first element — verbose
String first = list.isEmpty() ? null : list.get(0);

// Getting the last element — even more verbose
String last = list.isEmpty() ? null : list.get(list.size() - 1);

// Reversing a list
Collections.reverse(list);  // mutates the original!
```

Java 21 introduced the **SequencedCollection** interface with clean methods:

```java
// JAVA 21: Clean, readable, safe
String first = list.getFirst();    // throws NoSuchElementException if empty
String last = list.getLast();
SequencedCollection<String> reversed = list.reversed();  // returns a VIEW, doesn't mutate
```

---

## The New Interfaces

```
SequencedCollection<E> — getFirst(), getLast(), addFirst(), addLast(), reversed()
    ├── SequencedSet<E> — (same methods, plus Set semantics)
    └── SequencedMap<K,V> — firstEntry(), lastEntry(), reversed(), putFirst(), putLast()
```

---

## Line-by-Line Walkthrough

```java
import java.util.*;

public class SequencedCollectionsDemo {
    public static void main(String[] args) {
        // Line 1: SequencedCollection — List implements it
        var list = new ArrayList<>(List.of("A", "B", "C", "D", "E"));

        System.out.println("First: " + list.getFirst());   // "A"
        System.out.println("Last: " + list.getLast());     // "E"

        list.addFirst("Z");  // [Z, A, B, C, D, E]
        list.addLast("F");   // [Z, A, B, C, D, E, F]

        // reversed() returns a VIEW — not a copy
        var reversed = list.reversed();
        System.out.println("Reversed: " + reversed);       // [F, E, D, C, B, A, Z]
        System.out.println("Original: " + list);           // [Z, A, B, C, D, E, F] — unchanged

        // Line 2: SequencedSet — LinkedHashSet implements it
        var set = new LinkedHashSet<>(List.of("X", "Y", "Z"));
        System.out.println("First: " + set.getFirst());    // "X"
        System.out.println("Last: " + set.getLast());      // "Z"

        set.addFirst("W");  // [W, X, Y, Z]
        set.addLast("A");   // [W, X, Y, Z, A]

        var reversedSet = set.reversed();
        System.out.println("Reversed: " + reversedSet);    // [A, Z, Y, X, W]

        // Line 3: SequencedMap — LinkedHashMap implements it
        var map = new LinkedHashMap<String, Integer>();
        map.put("Alice", 30);
        map.put("Bob", 25);
        map.put("Carol", 35);

        var first = map.firstEntry();
        var last = map.lastEntry();
        System.out.println("First entry: " + first);       // Alice=30
        System.out.println("Last entry: " + last);         // Carol=35

        map.putFirst("Zoe", 28);   // adds at beginning
        map.putLast("Dave", 22);   // adds at end

        var reversedMap = map.reversed();
        System.out.println("Reversed: " + reversedMap);    // {Dave=22, Carol=35, Bob=25, Alice=30, Zoe=28}

        // Line 4: reversed() is a VIEW — changes propagate
        var numbers = new ArrayList<>(List.of(1, 2, 3, 4, 5));
        var reversedView = numbers.reversed();
        numbers.add(6);
        System.out.println("Reversed view: " + reversedView);  // [6, 5, 4, 3, 2, 1]

        // Line 5: Practical — processing from both ends
        var deque = new ArrayDeque<>(List.of("first", "second", "third"));
        System.out.println("From start: " + deque.getFirst());  // "first"
        System.out.println("From end: " + deque.getLast());     // "third"
    }
}
```

---

## Real-World Scenarios

### Scenario 1: LRU Cache implementation

```java
public class LRUCache<K, V> {
    private final LinkedHashMap<K, V> cache;
    private final int maxSize;

    public LRUCache(int maxSize) {
        this.maxSize = maxSize;
        this.cache = new LinkedHashMap<>();
    }

    public V get(K key) {
        V value = cache.remove(key);
        if (value != null) {
            cache.putLast(key, value);  // Java 21: move to end
        }
        return value;
    }

    public void put(K key, V value) {
        cache.remove(key);
        cache.putLast(key, value);
        if (cache.size() > maxSize) {
            cache.remove(cache.firstEntry().getKey());  // Java 21: remove oldest
        }
    }
}
```

### Scenario 2: Undo/Redo stack

```java
public class UndoRedoStack<T> {
    private final ArrayList<T> history = new ArrayList<>();
    private int position = -1;

    public void push(T item) {
        // Remove any redo history
        if (position < history.size() - 1) {
            history.subList(position + 1, history.size()).clear();
        }
        history.add(item);
        position = history.size() - 1;
    }

    public Optional<T> undo() {
        if (position > 0) {
            position--;
            return Optional.of(history.get(position));
        }
        return Optional.empty();
    }

    public Optional<T> redo() {
        if (position < history.size() - 1) {
            position++;
            return Optional.of(history.get(position));
        }
        return Optional.empty();
    }

    public T current() {
        return history.isEmpty() ? null : history.get(position);
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `reversed()` as a new list | It's a view, not a copy | Use `new ArrayList<>(list.reversed())` if needed |
| Calling `getFirst()` on empty list | Throws NoSuchElementException | Check `isEmpty()` first |
| Using `Collections.reverse()` | Mutates the original | Use `.reversed()` for a non-mutating view |
| Confusing `addFirst()` with `add(0, ...)` | Semantically different | `addFirst()` is clearer and works on all SequencedCollections |
