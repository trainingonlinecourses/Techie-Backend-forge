---
title: CopyOnWriteArrayList and CopyOnWriteArraySet — The Write-Seldom Maps
summary: CopyOnWriteArrayList and CopyOnWriteArraySet are thread-safe collections that make a fresh copy of the underlying data on every write. Reads are fast and need no locking. They are ideal when writes are rare and reads are frequent — for example, a list of event listeners that changes only occasionally but is notified on every event. This lesson explains how they work, when to use them, and the performance traps that make them wrong for write-heavy workloads.
order: 2
minutes: 20
topics: [CopyOnWriteArrayList, CopyOnWriteArraySet, concurrent-collections, thread-safety, snapshot-iteration, listeners, immutable-copies]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/CopyOnWriteArrayList.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/CopyOnWriteArraySet.html
---

## The Concept, From Zero

Java's `java.util.concurrent` package gives you thread-safe alternatives to the collections in `java.util`. Most of the time, when you have shared data that multiple threads read and write, you reach for `ConcurrentHashMap` or a `ConcurrentLinkedQueue` or protect a plain collection with a lock. But there is a different model: the **copy-on-write** collection.

A copy-on-write collection makes a **fresh copy of its data every time you write to it**. Reads read from the current snapshot without any locking. Because the snapshot never changes after it is created, reading is completely safe and fast — no synchronization, no blocking, no risk of `ConcurrentModificationException`.

The two main copy-on-write collections are `CopyOnWriteArrayList` and `CopyOnWriteArraySet`. A `CopyOnWriteArraySet` is built on top of a `CopyOnWriteArrayList` and enforces the set property (no duplicates), but the underlying mechanics are the same.

This model sounds expensive — copying the whole list on every write — and it is. That is the whole point. These collections are designed for a very specific workload: **many reads, few writes**. When reads vastly outnumber writes, the cost of copying is paid rarely, and the benefit — lock-free reads — is worth it. When writes are frequent, the cost of copying everything on every write destroys performance.

### How CopyOnWriteArrayList Works

Under the hood, a `CopyOnWriteArrayList` holds its elements in an internal array. The array is never modified in place — it is replaced wholesale on every write.

- **Read** — gets a reference to the current internal array and reads from it directly. No lock, no copy, no blocking. Because the array is never modified after it is published, a reading thread always sees a consistent snapshot. This is safe because the array reference itself is updated atomically and the array is effectively immutable once published.
- **Write** (add, set, remove) — the collection first takes a lock, copies the current array into a new array with the modification applied, and then atomically updates the reference to point to the new array. The lock ensures that two writes do not interfere with each other. Once the new array is published, all future reads see it.
- **Iteration** — when you iterate over a `CopyOnWriteArrayList`, you get a snapshot of the array as it was at the start of the iteration. The iterator does not see subsequent modifications. This is why you never get a `ConcurrentModificationException` — the iterator is working on a copy that never changes.
- **The iterator never reflects writes that happen after the iterator was created.** If you create an iterator and then another thread adds an element, your iterator does not see it. This is a feature, not a bug — it guarantees safe iteration — but it means you must understand what "snapshot" means.

### CopyOnWriteArraySet — A Set Built on a CopyOnWriteArrayList

A `CopyOnWriteArraySet` is a `Set` backed by a `CopyOnWriteArrayList`. It uses the list to store elements and enforces the set property: no duplicates. Because it is built on a copy-on-write list, it inherits the same performance characteristics: fast, lock-free reads; expensive writes that copy the whole underlying array.

A `CopyOnWriteArraySet` does not delegate to a `HashMap` or `HashSet` internally — it uses the list directly. This means that checking whether an element is present is O(n), not O(1). For small sets, this is fine. For larger sets, the linear scan becomes a problem.

## A Code Example — A Listener List

The most common real-world use of `CopyOnWriteArrayList` is a list of listeners or callbacks. Think of a button that has a list of click listeners, or a service that notifies a list of observers when something happens. Listeners are registered and unregistered occasionally, but events happen often and each event must notify all current listeners quickly. A copy-on-write list is a natural fit.


**What this code does — step by step:**

1. An event source that maintains a list of listeners
2. CopyOnWriteArrayList: many reads (notifications), few writes (register/unregister)
3. Register a listener — a write, copies the array
4. Unregister a listener — a write, copies the array
5. Fire an event to all current listeners — a read, no locking
6. Iterate over a snapshot — safe even if listeners are modified during iteration
7. In a real system, log the error; one bad listener should not. Stop the others. With CopyOnWriteArrayList, removing during. Iteration is safe, but we still catch to be polite.
8. A functional interface for listeners
9. A small demo
10. Register some listeners
11. Register another listener during iteration — safe with CopyOnWriteArrayList
12. Remove a listener
13. NOTE: removing by lambda expression using the same code may not match. The original listener object. In real code, keep a reference to the. Listener you added so you can remove the exact same object.

The same code, clean:

```java
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

public class EventSource {
    private final List<EventListener> listeners = new CopyOnWriteArrayList<>();

    public void addListener(EventListener listener) {
        listeners.add(listener);
    }

    public void removeListener(EventListener listener) {
        listeners.remove(listener);
    }

    public void fireEvent(String message) {
        for (EventListener listener : listeners) {
            try {
                listener.onEvent(message);
            } catch (Exception e) {
                System.err.println("listener failed: " + e.getMessage());
            }
        }
    }

    @FunctionalInterface
    public interface EventListener {
        void onEvent(String message);
    }
}

class Demo {
    public static void main(String[] args) {
        EventSource source = new EventSource();

        source.addListener(msg -> System.out.println("Listener A: " + msg));
        source.addListener(msg -> System.out.println("Listener B: " + msg));

        System.out.println("=== firing first event ===");
        source.fireEvent("hello");

        source.addListener(msg -> System.out.println("Listener C (added later): " + msg));

        System.out.println("=== firing second event (includes C) ===");
        source.fireEvent("world");

        source.removeListener(msg -> System.out.println("Listener A: " + msg));

        System.out.println("=== firing third event (A removed, B and C remain) ===");
        source.fireEvent("goodbye");
    }
}
```

Line by line:

- **`List<EventListener> listeners = new CopyOnWriteArrayList<>();`** — the list is thread-safe. Multiple threads can call `addListener`, `removeListener`, and `fireEvent` concurrently without external synchronization.
- **`addListener`** — a write. The list copies its internal array and adds the new listener. This is expensive if done often, but listener registration is rare.
- **`fireEvent`** — a read. The list iterates over a snapshot with no locking. This is fast, which is what you want when firing events often.
- **Iteration during modification** — because the iterator works on a snapshot, you can iterate and modify the list at the same time without `ConcurrentModificationException`. The iterator sees the snapshot as it was when iteration began.
- **`source.addListener(...)` with a lambda** — the lambda is the listener. When registered, it becomes a new element in the copied array.
- **Removing a listener** — to remove the right listener, you need a reference to the exact same `EventListener` object you added. Removing by a new lambda with the same code does not match, because lambdas are not guaranteed to be equal even if their code is the same. In real code, keep a reference to the listener object.

## When to Use CopyOnWrite Collections

Use a `CopyOnWriteArrayList` or `CopyOnWriteArraySet` when:

- **Reads vastly outnumber writes.** If the structure is read hundreds or thousands of times for every write, the cost of copying on write is paid rarely and the lock-free reads are a big win.
- **You need safe iteration without locking.** If you often iterate over a shared collection while other threads modify it, a copy-on-write collection gives you a consistent snapshot without `ConcurrentModificationException` and without explicit locking.
- **The collection is small.** Because every write copies the entire underlying array, large collections with frequent writes become slow. Copy-on-write is best for small to medium collections.
- **The workload is listener-like.** A list of listeners, observers, or callbacks that is registered and unregistered occasionally but consulted frequently is the textbook case.

Do **not** use a copy-on-write collection when:

- **Writes are frequent.** Every write copies the whole array. If you write often, the copying cost dominates and performance degrades badly. Use a `ConcurrentHashMap`, a `ConcurrentLinkedQueue`, or a lock-protected collection instead.
- **The collection is large.** Copying a large array on every write is expensive. The larger the collection, the more expensive each write.
- **You need to see the latest writes during iteration.** Copy-on-write gives you a snapshot. If you need to see concurrent writes as they happen, a copy-on-write collection is wrong for you.
- **You need O(1) containment checks on a set.** `CopyOnWriteArraySet` checks containment by scanning the list, which is O(n). For a larger set where you need fast containment checks, use a `ConcurrentHashMap`-backed set (`ConcurrentHashMap.newKeySet()`).

## A Performance Comparison

This example compares how a `CopyOnWriteArrayList` and an `ArrayList` protected by a lock behave under different read/write ratios.


**What this code does — step by step:**

1. Scenario 1: CopyOnWriteArrayList — many reads, few writes. Scenario 2: ArrayList + ReentrantLock — same workload, locked
2. CopyOnWriteArrayList: readers iterate freely, writers copy on each write
3. read-heavy: iterate over the list
4. do something trivial with each element
5. few writes
6. `list.remove(0);` — keep size bounded
7. ArrayList + lock: every access is locked

The same code, clean:

```java
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.locks.ReentrantLock;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class CopyOnWritePerformance {
    static final int READERS = 4;
    static final int WRITERS = 1;
    static final int OPERATIONS = 100_000;

    public static void main(String[] args) throws Exception {

        System.out.println("=== Many reads, few writes ===");
        test("CopyOnWriteArrayList", new CopyOnWriteListHarness());
        test("ArrayList + Lock", new LockedListHarness());
    }

    static void test(String name, ListHarness harness) throws Exception {
        long start = System.nanoTime();
        harness.run();
        long elapsed = System.nanoTime() - start;
        System.out.printf("%-25s: %d ms%n", name, TimeUnit.NANOSECONDS.toMillis(elapsed));
    }
}

interface ListHarness {
    void run() throws Exception;
}

class CopyOnWriteListHarness implements ListHarness {
    private final List<String> list = new java.util.concurrent.CopyOnWriteArrayList<>();

    public void run() throws Exception {
        ExecutorService exec = Executors.newFixedThreadPool(5);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(5);

        for (int i = 0; i < 4; i++) {
            exec.submit(() -> {
                try {
                    start.await();
                    for (int j = 0; j < CopyOnWritePerformance.OPERATIONS; j++) {
                        for (String s : list) {
                            int ignored = s.length();
                        }
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            });
        }

        exec.submit(() -> {
            try {
                start.await();
                for (int j = 0; j < CopyOnWritePerformance.OPERATIONS / 10; j++) {
                    list.add("item-" + j);
                    if (list.size() > 1000) {
                        list.remove(0);
                    }
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                done.countDown();
            }
        });

        start.countDown();
        done.await();
        exec.shutdownNow();
    }
}

class LockedListHarness implements ListHarness {
    private final List<String> list = new ArrayList<>();
    private final ReentrantLock lock = new ReentrantLock();

    public void run() throws Exception {
        ExecutorService exec = Executors.newFixedThreadPool(5);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(5);

        for (int i = 0; i < 4; i++) {
            exec.submit(() -> {
                try {
                    start.await();
                    for (int j = 0; j < CopyOnWritePerformance.OPERATIONS; j++) {
                        lock.lock();
                        try {
                            for (String s : list) {
                                int ignored = s.length();
                            }
                        } finally {
                            lock.unlock();
                        }
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            });
        }

        exec.submit(() -> {
            try {
                start.await();
                for (int j = 0; j < CopyOnWritePerformance.OPERATIONS / 10; j++) {
                    lock.lock();
                    try {
                        list.add("item-" + j);
                        if (list.size() > 1000) {
                            list.remove(0);
                        }
                    } finally {
                        lock.unlock();
                    }
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                done.countDown();
            }
        });

        start.countDown();
        done.await();
        exec.shutdownNow();
    }
}
```

This is a synthetic benchmark, so the exact numbers depend on the machine and the JVM, but the **pattern** is what matters:

- `CopyOnWriteArrayList` is faster when reads dominate and writes are rare, because readers do no locking and no copying.
- As the write ratio grows, the cost of copying the whole array on every write grows, and the lock-based `ArrayList` can become faster because it does not copy.
- The break-even point depends on the list size and the read/write ratio. For a small list with rare writes, copy-on-write wins. For a large list with frequent writes, it loses badly.

The lesson is not the exact numbers — it is the shape of the trade-off. Copy-on-write is a read-optimised structure. Use it for read-heavy, write-rare workloads. Use something else for write-heavy workloads.

## Where This Shows Up in an Organization

In a backend team, `CopyOnWriteArrayList` appears in three places.

First, in **event and listener registries** — the textbook case. A service that notifies observers, a web framework that maintains a list of filters or interceptors, a GUI component that maintains a list of event handlers — these are all cases where writes are occasional and reads (or notifications) are frequent.

Second, in **configuration and reference data** that is occasionally updated but read on every request. If you have a list of allowed values, a list of valid codes, or a list of endpoints that changes rarely but is consulted on many requests, a copy-on-write collection lets readers proceed without locking while an update copies the array.

Third, in **avoidance of `ConcurrentModificationException`**. If you have a shared collection and you need to iterate over it while other threads might modify it, a copy-on-write collection gives you a safe snapshot without explicit locking and without catching `ConcurrentModificationException`. This is a convenience, but it is not free — use it only when the workload justifies the copy cost.

A common real-world mistake is to use `CopyOnWriteArrayList` for a collection that grows and shrinks often. If you have a log buffer or a queue of pending tasks that is written to frequently, a copy-on-write list is the wrong tool — the copying cost on every write will kill throughput. Use a `ConcurrentLinkedQueue` or a `BlockingQueue` instead.

## Common Mistakes

| Mistake | Why it happens | Fix |
|---|---|
| Using CopyOnWriteArrayList for a write-heavy collection | It is thread-safe and feels like a drop-in replacement for ArrayList | Use ConcurrentLinkedQueue, BlockingQueue, or a lock-protected ArrayList instead |
| Assuming iterators see concurrent writes | The iterator is a snapshot — it sees the list as it was when iteration began | Design the code around snapshot semantics, or use a different structure if you need to see live writes |
| Using CopyOnWriteArraySet for a large set and not realising containment checks are O(n) | The set is backed by a list, not a hash table | For larger sets, use ConcurrentHashMap.newKeySet() for O(1) checks |
| Removing a listener by creating a new lambda with the same code | Lambdas are not guaranteed to be equal, so remove() does not find the original | Keep a reference to the listener object you added and remove that same reference |
| Forgetting that the snapshot does not include later writes | This is the intended behaviour, but it surprises people who expect a live view | Document the snapshot semantics, or choose a different structure if you need a live view |
| Using CopyOnWriteArrayList as a "thread-safe ArrayList" in general | It is thread-safe, but at the cost of copying on every write | Match the structure to the workload: copy-on-write for read-heavy, other concurrent collections for write-heavy |

## For the Practice Lab

In the lab, you will see a buggy event bus that uses a plain `ArrayList` and suffers `ConcurrentModificationException` when a listener is added during event firing. Replace the list with a `CopyOnWriteArrayList` and confirm the exception goes away. Then add a benchmark that compares `CopyOnWriteArrayList` with an `ArrayList` protected by a `ReentrantLock` under a read-heavy workload and under a write-heavy workload, and observe where the copy-on-write approach wins and where it loses. Finally, add a `CopyOnWriteArraySet` and demonstrate that its `contains()` check is O(n) by timing it on a large set and comparing with `ConcurrentHashMap.newKeySet()`.

## Summary

`CopyOnWriteArrayList` and `CopyOnWriteArraySet` are thread-safe collections that copy their underlying data on every write, giving lock-free reads and safe iteration over a snapshot. They are ideal for read-heavy, write-rare workloads — the classic example is a list of listeners or callbacks that is registered and unregistered occasionally but notified frequently. The cost is that every write copies the entire underlying array, so they are slow for write-heavy workloads and for large collections. `CopyOnWriteArraySet` is backed by a list, so its containment checks are O(n), making it unsuitable for large sets where fast containment checks are needed. Use `ConcurrentHashMap` and `ConcurrentHashMap.newKeySet()` for write-heavy or larger concurrent collections. Match the collection to the workload: copy-on-write for many reads and few writes, other concurrent collections for the rest.

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/package-summary.html)
