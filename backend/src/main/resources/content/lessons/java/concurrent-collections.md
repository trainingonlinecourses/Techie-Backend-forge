---
title: Concurrent Collections — Thread-Safe Data Structures Beyond Synchronized
summary: ConcurrentHashMap, CopyOnWriteArrayList, BlockingQueue, and the concurrent map atomic operations that replace manual synchronization in production code.
order: 79
minutes: 22
topics: [concurrent-hashmap, copy-on-write, blocking-queue, concurrent-map, atomic-operations, thread-safe-collections]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/CopyOnWriteArrayList.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/BlockingQueue.html
---

# Concurrent Collections — Thread-Safe Data Structures Beyond Synchronized

## The concept: synchronization is not the only way

Beginners learn `Collections.synchronizedList(...)` — it wraps a collection with a `synchronized` block on every operation. It works, but it's a **scalability bottleneck**: one lock for the entire collection means threads wait in line even for independent operations. The `java.util.concurrent` package provides concurrent collections that are **lock-free or fine-grained locked** — dramatically faster under contention.

**The mental model:** think of `synchronized` as a single-lane bridge (everyone waits); concurrent collections as a multi-lane highway (threads proceed in parallel, only blocking when they truly conflict).

## ConcurrentHashMap — the workhorse

`ConcurrentHashMap` is a hash table that allows concurrent reads and **segment-level** writes (Java 8+: bin-level locking via `synchronized` on individual nodes, not whole segments):

```java
import java.util.concurrent.ConcurrentHashMap;

ConcurrentHashMap<String, Integer> visitCounts = new ConcurrentHashMap<>();

// Thread-safe put/get — no external synchronization needed
visitCounts.compute("page-home", (key, val) -> val == null ? 1 : val + 1);

// Atomic operations — no lock, no race condition
visitCounts.putIfAbsent("page-about", 0);           // only puts if absent
visitCounts.merge("page-home", 1, Integer::sum);    // atomic: get, apply, put
visitCounts.computeIfAbsent("page-contact", k -> loadCount(k));  // lazy init
```

**Line-by-line breakdown:**
- `ConcurrentHashMap<String, Integer>` — not `null` keys or values (throws NPE) — this is intentional: null is ambiguous in concurrent code (is it "not present" or "present with null value"?)
- `compute("page-home", ...)` — atomic: computes the new value under the bin's lock; no lost updates
- `putIfAbsent("page-about", 0)` — like `put` but only if the key isn't already there; atomic
- `merge("page-home", 1, Integer::sum)` — atomic get-or-create-then-update: if key exists, apply `Integer::sum(current, 1)`; if absent, put `1`
- `computeIfAbsent("page-contact", k -> loadCount(k))` — lazy initialization: only calls the expensive `loadCount` if the key isn't present; the function is called at most once per key

**The atomic operations that replace manual locking:**
| Method | What it does atomically | Use case |
|---|---|---|
| `putIfAbsent(k, v)` | Insert only if key missing | Lazy initialization |
| `compute(k, fn)` | Compute new value from old (or null) | Increment, conditional update |
| `computeIfAbsent(k, fn)` | Compute only if key missing | Expensive one-time init |
| `computeIfPresent(k, fn)` | Compute only if key exists | Conditional update |
| `merge(k, v, fn)` | Combine new value with existing | Accumulation, counters |
| `forEach(parallelism, fn)` | Parallel iteration | Large map processing |

**Real-world scenario — request counter:**
```java
// Without ConcurrentHashMap — BROKEN (race condition):
Map<String, Integer> counts = new HashMap<>();
// Thread A reads 5, Thread B reads 5, both write 6 — lost update!

// With ConcurrentHashMap — CORRECT:
ConcurrentHashMap<String, AtomicInteger> counts = new ConcurrentHashMap<>();
counts.computeIfAbsent(endpoint, k -> new AtomicInteger(0)).incrementAndGet();
// Or simpler with merge:
counts.merge(endpoint, 1, Integer::sum);  // atomic increment
```

## CopyOnWriteArrayList — snapshot iteration

`CopyOnWriteArrayList` makes a **fresh copy of the underlying array** on every `add`/`set`/`remove`. Reads see a consistent snapshot without locking; writes are expensive but rare.

```java
import java.util.concurrent.CopyOnWriteArrayList;

CopyOnWriteArrayList<Listener> listeners = new CopyOnWriteArrayList<>();

// Write — copies the array (expensive, but rare)
listeners.add(new Listener("audit"));
listeners.remove(deadListener);

// Read — no lock, no copy, sees a consistent snapshot
for (Listener l : listeners) {       // iterates over the snapshot taken at loop start
    l.onEvent(event);                // safe even if another thread modifies the list
}
```

**When to use it:**
| Scenario | Why CopyOnWriteArrayList fits |
|---|---|
| Event listener registries | Listeners change rarely; iteration is frequent |
| Configuration lists (feature flags) | Updated on deploy; read on every request |
| Thread-safe iteration without ConcurrentModificationException | The iterator sees a snapshot |

**When NOT to use it:**
| Scenario | Why it's wrong |
|---|---|
| Frequent writes (every request) | Every write copies the entire array — O(n) |
| Large lists (10,000+ elements) | Copying is expensive |
| Need atomic read-modify-write | Use `ConcurrentHashMap` instead |

## BlockingQueue — producer-consumer without manual wait/notify

`BlockingQueue` is a `Queue` that **blocks** when full (on `put`) or empty (on `take`) — the foundation of producer-consumer patterns:

```java
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ArrayBlockingQueue;

BlockingQueue<Task> taskQueue = new ArrayBlockingQueue<>(100);  // bounded: max 100 tasks

// Producer thread — blocks if queue is full
taskQueue.put(new Task("process-payment"));    // blocks until space available
taskQueue.offer(new Task("send-email"), 5, TimeUnit.SECONDS);  // try with timeout

// Consumer thread — blocks if queue is empty
Task task = taskQueue.take();                  // blocks until a task is available
Task next = taskQueue.poll(10, TimeUnit.SECONDS);  // try with timeout (returns null on timeout)
```

**Line-by-line breakdown:**
- `new ArrayBlockingQueue<>(100)` — bounded queue with capacity 100; `put()` blocks when full, preventing producers from overwhelming consumers
- `taskQueue.put(new Task(...))` — blocks the calling thread if the queue has 100 elements; resumes when a consumer removes one
- `taskQueue.take()` — blocks if the queue is empty; returns the head element when available
- `offer(...)` with timeout — non-blocking alternative: returns `false` if the queue is full after 5 seconds

**The producer-consumer pattern in an organization:**
```java
// Producer (API endpoint) — adds tasks to the queue
@PostMapping("/orders")
public ResponseEntity<Void> createOrder(@RequestBody Order order) {
    boolean accepted = taskQueue.offer(new Task("process-order", order), 2, TimeUnit.SECONDS);
    return accepted ? ResponseEntity.accepted().build()
                    : ResponseEntity.status(503).build();  // queue full → backpressure
}

// Consumer (background thread) — processes tasks
@PostConstruct
void startConsumer() {
    Thread.startVirtualThread(() -> {
        while (true) {
            Task task = taskQueue.take();       // blocks until work arrives
            processTask(task);                  // do the work
        }
    });
}
```

## ArrayDeque vs LinkedList for queue/deque operations

```java
// ArrayDeque — preferred over LinkedList for queue/deque
Deque<String> stack = new ArrayDeque<>();     // stack (LIFO)
stack.push("first");
stack.push("second");
String top = stack.pop();                     // "second"

Deque<String> queue = new ArrayDeque<>();     // queue (FIFO)
queue.offer("first");
queue.offer("second");
String head = queue.poll();                   // "first"
```

**Why ArrayDeque beats LinkedList:** ArrayDeque uses a circular array — O(1) amortized for add/remove at both ends, better cache locality (contiguous memory), and lower memory per element (no Node objects).

## Common mistakes

| Mistake | Why it's wrong | Fix |
|---|---|---|
| `Collections.synchronizedMap(new HashMap<>())` | Single lock for entire map — kills concurrency | Use `ConcurrentHashMap` instead |
| Null keys/values in ConcurrentHashMap | `ConcurrentHashMap` prohibits nulls (ambiguous in concurrent code) | Use `Optional` or a sentinel value |
| Using CopyOnWriteArrayList for frequent writes | Every write copies the entire array — O(n) | Use `ConcurrentLinkedQueue` or `ConcurrentHashMap` |
| `BlockingQueue.offer()` without timeout | Blocks indefinitely if queue is full and no consumer | Use `offer(v, timeout, unit)` with backpressure |
| Mixing `poll()` and `remove()` | `poll()` returns null on empty queue; `remove()` throws exception | Use `poll()` for safe non-blocking access |
| Assuming iteration order in ConcurrentHashMap | Iteration is weakly consistent; may see stale data | Use `forEach` with parallelism hint for controlled iteration |

## Key takeaways

- `ConcurrentHashMap` — fine-grained locking; use `compute`/`merge`/`computeIfAbsent` for atomic operations instead of external `synchronized`.
- `CopyOnWriteArrayList` — snapshot iteration; perfect for listener registries, bad for frequent writes.
- `BlockingQueue` — producer-consumer with backpressure; `put()`/`take()` block, `offer()`/`poll()` timeout.
- `ArrayDeque` beats `LinkedList` for stack/queue operations (cache locality, lower overhead).
- Null keys/values are prohibited in `ConcurrentHashMap` — use `Optional` or sentinels.

**Official docs:** [ConcurrentHashMap API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html) · [CopyOnWriteArrayList API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/CopyOnWriteArrayList.html) · [BlockingQueue API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/BlockingQueue.html)
