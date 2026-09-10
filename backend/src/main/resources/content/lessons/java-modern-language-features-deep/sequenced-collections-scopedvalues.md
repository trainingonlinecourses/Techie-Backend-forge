---
title: Sequenced Collections and Scoped Values — Java 21's Ordered Collections and Context Propagation
summary: Java 21 added SequencedCollection, SequencedSet, and SequencedMap — interfaces that give every collection a well-defined encounter order and first/last accessors. Separately, ScopedValues (incubating in Java 21, standardising later) give you a way to share data within a thread and its subtasks without the pitfalls of ThreadLocal. This lesson explains both, when to use them, and the common mistakes.
order: 3
minutes: 22
topics: [sequenced-collections, sequencedcollection, sequencedset, sequencedmap, first, last, reversed, encounter-order, scoped-values, scopedvalue, context-propagation, threadlocal, java21]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/SequencedCollection.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/SequencedSet.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/SequencedMap.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ScopedValue.html
---

## The Concept, From Zero

Java 21 introduced two unrelated but useful features: **sequenced collections** and **scoped values**. They solve different problems, but both are worth knowing because they appear in modern code and they replace older, less-uniform approaches.

### Part 1 — Sequenced Collections

Before Java 21, the collections framework had a messy story around "which end is which." A `List` has `get(0)` and `get(size()-1)` for first and last, but a `Set` had no guaranteed order at all (except for `LinkedHashSet` and `TreeSet`, which have encounter order but no standard first/last methods). A `Deque` has `getFirst()` and `getLast()`, but a `List` does not have those methods. Iterating in reverse required calling `Collections.reverse` or iterating with an index or a `ListIterator` going backwards.

This inconsistency made code less uniform. If you had a `List`, you accessed first and last one way. If you had a `Deque`, you accessed them another way. If you had a `SortedSet`, you used `first()` and `last()` from the `SortedSet` interface. There was no single "ordered collection" abstraction with first, last, and add/remove-at-end operations.

Java 21 added a set of interfaces that bring order to this mess:

- **SequencedCollection** — a collection with a well-defined encounter order. It adds methods like `getFirst()`, `getLast()`, `addFirst(e)`, `addLast(e)`, `removeFirst()`, `removeLast()`, and `reversed()` which returns a reversed view of the collection.
- **SequencedSet** — a set with encounter order. It extends `SequencedCollection` and adds `addFirst(e)` and `addLast(e)` and `reversed()`. A `LinkedHashSet` is a `SequencedSet`.
- **SequencedMap** — a map with encounter order. It adds methods like `sequencedKeySet()`, `sequencedValues()`, `sequencedEntrySet()`, `putFirst(k,v)`, `putLast(k,v)`, `getFirstEntry()`, `getLastEntry()`, and `reversed()`.

These interfaces are implemented by the existing ordered collections. A `List` is a `SequencedCollection`. A `LinkedHashSet` is a `SequencedSet`. A `LinkedHashMap` is a `SequencedMap`. The arrays-as-lists returned by `List.of(...)` are also sequenced.

The practical benefit is uniform access to first and last elements and a reversed view, without having to remember which interface provides which method.


**What this code does — step by step:**

1. A List is a SequencedCollection — getFirst, getLast, addFirst, addLast, reversed
2. `System.out.println("first: " + list.getFirst());` — A
3. `System.out.println("last:  " + list.getLast());` — C
4. `list.addFirst("Start");` — add to the beginning
5. `list.addLast("End");` — add to the end
6. `System.out.println(list);` — [Start, A, B, C, End]
7. reversed() returns a view — not a copy
8. `System.out.println("reversed: " + reversed);` — [End, C, B, A, Start]. Mutating the reversed view mutates the original
9. list is now [A, B, C, End] — the "Start" was removed via the view
10. A LinkedHashSet has encounter order — it is a SequencedSet
11. `set.add("X");` — duplicate — ignored
12. `System.out.println("set first: " + set.getFirst());` — X
13. `System.out.println("set last:  " + set.getLast());` — Y
14. `System.out.println("set reversed: " + set.reversed());` — [Y, X]
15. A LinkedHashMap has encounter order — it is a SequencedMap
16. `System.out.println("map first key: " + map.firstKey());` — one
17. `System.out.println("map last key:  " + map.lastKey());` — three
18. `System.out.println("map reversed:  " + map.reversed());` — {three=3, two=2, one=1}

The same code, clean:

```java
import java.util.*;

public class SequencedDemo {
    public static void main(String[] args) {
        List<String> list = new ArrayList<>();
        list.add("A");
        list.add("B");
        list.add("C");

        System.out.println("first: " + list.getFirst());
        System.out.println("last:  " + list.getLast());

        list.addFirst("Start");
        list.addLast("End");
        System.out.println(list);

        List<String> reversed = list.reversed();
        System.out.println("reversed: " + reversed);
        reversed.removeFirst();
        System.out.println("after removing first from reversed view: " + list);

        Set<String> set = new LinkedHashSet<>();
        set.add("X");
        set.add("Y");
        set.add("X");
        System.out.println("set first: " + set.getFirst());
        System.out.println("set last:  " + set.getLast());
        System.out.println("set reversed: " + set.reversed());

        Map<String, Integer> map = new LinkedHashMap<>();
        map.put("one", 1);
        map.put("two", 2);
        map.put("three", 3);
        System.out.println("map first key: " + map.firstKey());
        System.out.println("map last key:  " + map.lastKey());
        System.out.println("map reversed:  " + map.reversed());
    }
}
```

Line by line:

- **`list.getFirst()` and `list.getLast()`** — new methods from `SequencedCollection`. They are equivalent to `list.get(0)` and `list.get(list.size()-1)`, but they read better and work on any sequenced collection.
- **`list.addFirst("Start")` and `list.addLast("End")`** — add at the beginning or end. For an `ArrayList`, `addFirst` is O(n) because it shifts elements, but the API is now uniform.
- **`list.reversed()`** — returns a view of the list in reverse order. This is a view, not a copy — changes to the reversed view affect the original list, because they are backed by the same elements.
- **`Set<String> set = new LinkedHashSet<>()`** — a `LinkedHashSet` maintains insertion order. It is a `SequencedSet`, so it has `getFirst()`, `getLast()`, and `reversed()`.
- **`map.firstKey()` and `map.lastKey()`** — from `SequencedMap`. They return the first and last keys in encounter order.
- **`map.reversed()`** — returns a reversed view of the map.

The key idea is uniformity. Instead of remembering that a `List` uses `get(0)`, a `Deque` uses `getFirst()`, and a `SortedSet` uses `first()`, you can use `getFirst()` on any sequenced collection. And instead of remembering different ways to iterate in reverse, you call `reversed()`.

This is especially useful in generic code. If you write a method that should work on any ordered collection and needs the first and last elements, you can use `SequencedCollection` as the parameter type and call `getFirst()` and `getLast()` without knowing the concrete type.

// Generic code that works on any sequenced collection
static void printFirstAndLast(SequencedCollection<String> col) {
    if (col.isEmpty()) {
        System.out.println("empty");
    } else {
        System.out.println("first: " + col.getFirst());
        System.out.println("last:  " + col.getLast());
    }
}

public static void main(String[] args) {
    printFirstAndLast(new ArrayList<>(List.of("A", "B", "C")));
    printFirstAndLast(new LinkedHashSet<>(Set.of("X", "Y", "Z")));
    printFirstAndLast(List.of("p", "q", "r"));
}

### Part 2 — Scoped Values

Scoped values are a mechanism for sharing data within a thread and its child threads (or subtasks) without the problems of `ThreadLocal`. They are incubating in Java 21 (as `ScopedValue`) and standardising in later versions.

To understand why scoped values exist, first understand the problem **ThreadLocal** solves and the problems it creates.

A `ThreadLocal` is a variable that has a separate value for each thread. Each thread can read and write its own value without seeing other threads' values. This is useful for things like a database connection or a user context that should be available anywhere in the thread's call stack without passing it as a parameter.

But `ThreadLocal` has well-known problems:

- **It is mutable by default.** Any code in the thread can change the value, and there is no way to control who changes it or when. This makes reasoning about the value hard, especially in a large call stack.
- **It leaks in thread-pooled environments.** If you use a `ThreadLocal` in a web server with a thread pool, you must clear it after use — otherwise, the value from one request can leak into the next request that reuses the same thread. This is a common source of bugs.
- **It does not work well with virtual threads.** With virtual threads (Java 21+), you may have millions of threads. A `ThreadLocal` per virtual thread is not as efficient as a scoped value, which is designed to be more lightweight and to work well with the structured concurrency model.
- **It is global within the thread.** There is no scoping — the value is available everywhere in the thread, for the whole lifetime of the thread (or until cleared).

A **ScopedValue** is a different model. You define a scoped value (a `ScopedValue<T>`), and you bind a value to it for the duration of a method call (a "scope"). Within that scope, any code that reads the scoped value sees the bound value. When the scope ends, the binding is gone. The binding is inherited by child threads (subtasks) in a structured concurrency `StructuredTaskScope`.

The key differences from `ThreadLocal`:

- **Immutability within the scope.** The value is set once at the start of the scope and is immutable within that scope. This makes it easier to reason about — any code in the scope sees the same value, and no code can change it.
- **Scoping.** The binding is limited to the scope of a method call. When the method returns, the binding ends. This matches the natural structure of a call stack.
- **Inheritance by subtasks.** In a `StructuredTaskScope`, subtasks inherit the parent's scoped value bindings. This is the "structured" part — the data flows down the call tree in a controlled way.
- **No leak.** Because the binding ends when the scope ends, there is no need to manually clear it, and no risk of one request's value leaking into another request's thread.

A simple example:


**What this code does — step by step:**

1. Define a scoped value — a holder for a value that is bound within a scope
2. A method that uses the scoped value
3. Bind USER to the given username for the scope of this run
4. Any code in this call tree can read USER
5. Read the scoped value — no need to pass it as a parameter

The same code, clean:

```java
import java.lang.ScopedValue;

public class Main {

    public static void main(String[] args) {

        static final ScopedValue<String> USER = ScopedValue.newInstance();

        static void handleRequest(String username) {
            ScopedValue.where(USER, username)
                       .run(() -> {
                           System.out.println("user: " + USER.get());
                           processOrder();
                       });
        }

        static void processOrder() {
            System.out.println("processing for user: " + USER.get());
        }
    }
}
```

Line by line:

- **`static final ScopedValue<String> USER = ScopedValue.newInstance();`** — a scoped value is a static final holder. It is a singleton slot that can hold one value per scope.
- **`ScopedValue.where(USER, username).run(() -> { ... });`** — binds `USER` to `username` for the duration of the `run` call. Within the lambda (and any code it calls), `USER.get()` returns `username`.
- **`USER.get()`** — reads the current value of the scoped value within the current scope. Inside the `run` call, this returns the bound username. Outside the scope, calling `USER.get()` without a binding is an error.
- **`processOrder()`** — called from within the scope, so it can read `USER` without the username being passed as a parameter.

The scoping is the point. You bind the value at the top of the request handling, and every method in the call stack can read it without passing it as a parameter. When the request is done, the binding ends automatically.

In a structured concurrency setting, the binding is inherited by subtasks:

// Structured concurrency with ScopedValue (incubating API)
import java.lang.ScopedValue;
import java.util.List;
import java.util.concurrent.StructuredTaskScope;

static final ScopedValue<String> USER = ScopedValue.newInstance();

static void handleRequestWithSubtasks(String username) {
    ScopedValue.where(USER, username)
               .fork(() -> {
                   // This subtask inherits USER
                   return fetchUserData();
               })
               .join();
}

static String fetchUserData() {
    return "data for user: " + USER.get();
}

Here, the `fork` creates a subtask that inherits the scoped value bindings of the parent. The subtask can read `USER` and see the same username as the parent. This is the "structured" part — the data is bound at the top and flows down to subtasks in a controlled, explicit way.

This is different from `ThreadLocal`, where you would need to manually copy the value into the subtask's thread local, and where mis-managed thread locals can leak. With scoped values, the inheritance is explicit and automatic within a `StructuredTaskScope`.

### When to Use Scoped Values vs ThreadLocal

Use **scoped values** when:

- You have data that should be available throughout a call tree (a request, a task) without passing it as a parameter.
- You want the value to be immutable within the scope.
- You are using structured concurrency and want the value to be inherited by subtasks.
- You want to avoid the leak and cleanup issues of `ThreadLocal`.
- You are on Java 21+ and the incubating/standardised API fits your needs.

Use **ThreadLocal** when:

- You have legacy code that already uses `ThreadLocal` and refactoring is not worth it.
- You need a mutable per-thread variable that can be changed by different parts of the code (though this is often a sign of a design that could be improved).
- You are not using structured concurrency and the scoping model of scoped values does not fit.

In new code on Java 21+, scoped values are the preferred choice for per-thread (or per-call-tree) immutable context data. They are designed to replace the most common uses of `ThreadLocal`, especially in web applications and structured concurrency.

### A Code Example — Scoped Value for a Request Context

This example shows a scoped value carrying a user context through a request, with a subtask that inherits it.

import java.lang.ScopedValue;

import java.util.concurrent.StructuredTaskScope;

public class Main {

    public static void main(String[] args) {

        // A scoped value for the current user
        static final ScopedValue<String> CURRENT_USER = ScopedValue.newInstance();
        static final ScopedValue<List<String>> PERMISSIONS = ScopedValue.newInstance();

        // Simulate a request handler
        static void handleRequest(String username) {
            // Bind the scoped values for the scope of this request
            ScopedValue.where(CURRENT_USER, username)
                       .where(PERMISSIONS, List.of("read", "write"))
                       .run(() -> {
                           System.out.println("[" + CURRENT_USER.get() + "] handling request");
                           processOrder();
                           fetchUserDataAsync();
                       });
        }

        static void processOrder() {
            System.out.println("  [" + CURRENT_USER.get() + "] processing order for user");
            System.out.println("  permissions: " + PERMISSIONS.get());
        }

        static void fetchUserDataAsync() {
            try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
                // Fork a subtask — it inherits CURRENT_USER and PERMISSIONS
                var future = scope.fork(() -> {
                    System.out.println("  [subtask] fetching data for " + CURRENT_USER.get());
                    System.out.println("  [subtask] permissions: " + PERMISSIONS.get());
                    return "user-data-" + CURRENT_USER.get();
                });

                scope.join();
                System.out.println("  result: " + future.get());
            } catch (Exception e) {
                System.out.println("  error: " + e);
            }
        }
    }
}

Line by line:

- **`CURRENT_USER` and `PERMISSIONS`** — two scoped values that carry request context.
- **`ScopedValue.where(CURRENT_USER, username).where(PERMISSIONS, List.of("read", "write")).run(() -> { ... });`** — binds both scoped values for the scope of the request. The `run` call executes the lambda with these bindings in effect.
- **`processOrder()`** — reads the scoped values without them being passed as parameters. This is the convenience of scoped values — the context is available anywhere in the call tree.
- **`fetchUserDataAsync()`** — forks a subtask in a `StructuredTaskScope`. The subtask inherits the scoped value bindings, so it can read `CURRENT_USER` and `PERMISSIONS` and see the same values as the parent.
- **`scope.fork(() -> { ... })`** — creates a subtask. The subtask inherits the scoped values.
- **`scope.join()`** — waits for the subtask to complete.
- **`future.get()`** — gets the result of the subtask.

This shows the model: bind context at the top, read it anywhere in the call tree, and subtasks inherit it automatically. No manual propagation, no cleanup, no leak.

### A Common Mistake: Using Scoped Value Outside Its Scope

A scoped value can only be read within a binding scope. If you call `USER.get()` outside a `where().run()` scope, it throws an exception.

// WRONG: reading a scoped value outside its scope
static void bad() {
    System.out.println(CURRENT_USER.get());   // throws ScopedValue.CalloutException
}

// CORRECT: bind first, then read
static void good(String username) {
    ScopedValue.where(CURRENT_USER, username).run(() -> {
        System.out.println(CURRENT_USER.get());   // OK — inside the scope
    });
}

This is the safety mechanism of scoped values. They are not global variables. They are bound for a specific scope, and reading them outside that scope is an error.

### A Common Mistake: Thinking Scoped Values Are a Drop-In Replacement for ThreadLocal in All Cases

Scoped values are designed for immutable context data that flows down a call tree. They are not a general replacement for `ThreadLocal` when you need mutable per-thread state that can be changed by different parts of the code. If you have a `ThreadLocal` that is written to by many parts of the code at different times, scoped values are not a direct replacement — you would need to restructure the code to bind the value once at the top of the scope.

Also, scoped values in Java 21 are an incubating API. The exact API may change before standardisation. If you use them in production, pin your Java version and be prepared for the API to evolve.

## Where This Shows Up in an Organization

Sequenced collections appear in code that works with ordered collections — lists, sets with encounter order, and maps that preserve insertion order. They are especially useful in generic code that needs to access first and last elements uniformly, and in code that needs to iterate in reverse without copying. If you have Java 21+, you can start using `getFirst()`, `getLast()`, and `reversed()` on any ordered collection, and your code becomes more uniform.

Scoped values appear in request-handling code, especially with structured concurrency. If you are building a web service with virtual threads and structured concurrency, scoped values are the way to carry request context (user, permissions, trace ID) through the call tree without passing it as a parameter and without the leak and cleanup problems of `ThreadLocal`. They are also useful in any code that uses `StructuredTaskScope` and needs subtasks to inherit context.

## Common Mistakes

| Mistake | Why it happens | Fix |
|---|---|
| Calling `getFirst()` or `getLast()` on an empty sequenced collection | These methods throw `NoSuchElementException` if the collection is empty | Check `isEmpty()` first, or use `Stream.findFirst()` if you want an optional result |
| Treating `reversed()` as a copy | It is a view — mutating it mutates the original | Be aware that the reversed view is backed by the original collection |
| Using `addFirst()` on an `ArrayList` and expecting O(1) performance | `addFirst` on an `ArrayList` is O(n) because it shifts elements | Use a `LinkedList` or `ArrayDeque` if you frequently add at both ends |
| Reading a scoped value outside its binding scope | Scoped values are not global | Always bind the value with `where().run()` before reading it |
| Using a scoped value as mutable per-thread state | Scoped values are intended to be immutable within a scope | Bind the value once at the start of the scope; do not reassign within the scope |
| Using scoped values without understanding the structured concurrency model | Scoped values are designed to work with `StructuredTaskScope` | Learn structured concurrency before using scoped values with subtasks, or stick to the simpler request-scope pattern |
| Assuming scoped values replace ThreadLocal in all legacy code | They are a better choice for new code, but not a drop-in replacement for mutable thread locals | Evaluate each case; some legacy uses of ThreadLocal may not fit the scoped value model |

## For the Practice Lab

In the lab, you will see a helper that prints the first and last elements of a collection using `get(0)` and `get(size()-1)`, and a method that only works on `List`. Refactor it to use `SequencedCollection` so it works on any ordered collection, including a `LinkedHashSet` and a `List.of(...)`. Then add a `reversed()` call and show that mutating the reversed view mutates the original. For scoped values, write a request handler that binds a user name and permissions as scoped values, reads them in a deep call stack without passing them as parameters, and forks a subtask that inherits them. Finally, demonstrate the error from reading a scoped value outside its scope.

## Summary

Java 21 added sequenced collections — `SequencedCollection`, `SequencedSet`, and `SequencedMap` — that give every ordered collection a uniform set of first/last accessors and a `reversed()` view. A `List` is a `SequencedCollection`, a `LinkedHashSet` is a `SequencedSet`, and a `LinkedHashMap` is a `SequencedMap`. These interfaces make it easier to write uniform code over ordered collections and to access first and last elements without remembering which interface provides which method. Separately, scoped values (`ScopedValue`) give you a way to share immutable data within a thread and its subtasks without the problems of `ThreadLocal`. You bind a value with `ScopedValue.where(value).run(...)`, and any code in the scope reads it with `get()`. In a `StructuredTaskScope`, subtasks inherit the bindings. Scoped values avoid the leak and cleanup issues of `ThreadLocal` and are the preferred choice for per-call-tree context data in new code on Java 21+. The common mistakes are reading a scoped value outside its scope and treating `reversed()` as a copy.

