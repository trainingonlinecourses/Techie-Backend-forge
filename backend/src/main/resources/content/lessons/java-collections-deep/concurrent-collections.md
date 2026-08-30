---
title: Concurrent Collections Deep Dive
module: java-collections-deep
order: 2
minutes: 28
topics: ["ConcurrentHashMap", "CopyOnWriteArrayList", "BlockingQueue", "ConcurrentLinkedQueue", "lock-free", "thread safety"]
summary: The java.util.concurrent collections are the difference between a multithreaded app that's correct and one that's slow, deadlocked, or corrupted. T...
docs:
  - title: "Concurrent collections"
    url: "https://docs.oracle.com/en/java/javase/21/core/collections.html"
---

# Concurrent Collections Deep Dive

The `java.util.concurrent` collections are the difference between a multi-threaded app that's correct and one that's slow, deadlocked, or corrupted. This lesson covers each concurrent collection's *design* — not just its name — so you pick the right tool and understand its guarantees.

## The Spectrum of Thread Safety

| Collection | Strategy | Typical use |
|-----------|----------|-------------|
| `ConcurrentHashMap` | Lock-free reads, striped locks on writes | Caches, counters, shared maps |
| `CopyOnWriteArrayList` | Copy the array on every write | Read-heavy listener lists |
| `BlockingQueue` impls | Lock + condition, blocking | Producer-consumer |
| `ConcurrentLinkedQueue` | Lock-free CAS | High-throughput queues |
| `ConcurrentSkipListMap` | Lock-free sorted structure | Sorted concurrent maps |

## ConcurrentHashMap: The Workhorse

### Design (Java 8+)

- **Reads are lock-free** — `get` never blocks (volatile reads)
- **Writes lock only their bucket** — striped locking via `synchronized` on bin heads (Java 8) 
- **`size()` is approximate** — no global counter; sums per-bin counters

```java
ConcurrentHashMap<String, CacheEntry> cache = new ConcurrentHashMap<>();

// Atomic operations — the reason to use CHM over HashMap + lock:
cache.putIfAbsent(key, entry);
cache.computeIfAbsent(key, k -> expensiveLoad(k));   // single-flight load
cache.compute(key, (k, v) -> v == null ? entry : v.merge(entry));
cache.merge(key, delta, Long::sum);                  // atomic counter
```

### The computeIfAbsent Single-Flight Pattern

```java
public Course getOrLoad(String slug) {
    return cache.computeIfAbsent(slug, this::loadFromDb);
}
```

With `HashMap`, two threads miss and both load. With CHM, the computation is atomic — one thread loads, the other waits and gets the result. This is the cache-stampede fix at the data-structure level.

### Never Use These on CHM

```java
// ❌ NOT atomic — a check-then-act race
if (!map.containsKey(key)) {
    map.put(key, value);
}

// ✅ atomic
map.putIfAbsent(key, value);
```

## CopyOnWriteArrayList

```java
CopyOnWriteArrayList<Listener> listeners = new CopyOnWriteArrayList<>();
```

**Design**: every `add`/`remove` copies the entire backing array; every `get`/`iterate` reads the immutable snapshot — no locks on reads.

```java
// Listener registration — rare writes
listeners.add(this::onEvent);

// Notification — frequent reads, safe iteration
for (Listener l : listeners) {   // iterates a snapshot; no CME ever
    l.onEvent(event);
}
```

**When**: read-heavy (frequent iteration), write-rare (listeners, config subscribers). **Never** for write-heavy workloads — each write is O(n) copy.

## BlockingQueue: Producer-Consumer

```java
BlockingQueue<Order> queue = new ArrayBlockingQueue<>(1000);

// Producer — blocks when full (backpressure!)
queue.put(order);

// Consumer — blocks when empty
Order order = queue.take();
```

| Implementation | Design | Use |
|----------------|--------|-----|
| `ArrayBlockingQueue` | Bounded, single array, fair option | Bounded buffering with backpressure |
| `LinkedBlockingQueue` | Optionally bounded, linked nodes | Default choice |
| `SynchronousQueue` | No buffer — handoff only | Direct handoffs, thread pools |
| `PriorityBlockingQueue` | Unbounded, priority order | Job queues by priority |
| `DelayQueue` | Items release after delay | Scheduled work, retry queues |

### The Timeout Variants

```java
// Never block forever — production rule
boolean offered = queue.offer(order, 5, TimeUnit.SECONDS);
if (!offered) {
    // queue full for 5s — alert, drop, or spill
    overflowCounter.increment();
}
```

`offer(timeout)` / `poll(timeout)` are the production-safe versions of `put`/`take`.

## ConcurrentLinkedQueue: Lock-Free

```java
ConcurrentLinkedQueue<Task> tasks = new ConcurrentLinkedQueue<>();
tasks.offer(task);
Task t = tasks.poll();   // may return null
```

- **Lock-free**: CAS-based, no locks, no blocking
- **Unbounded** — no capacity control
- `size()` is O(n) — don't call it per-operation

Use for high-throughput, unbounded, many-producers-many-consumers queues where blocking isn't wanted.

## ConcurrentSkipListMap: Sorted + Concurrent

```java
ConcurrentSkipListMap<String, Double> scores = new ConcurrentSkipListMap<>();
scores.put("alice", 95.0);

// Sorted views — atomic
String first = scores.firstKey();
Map<String, Double> top10 = scores.headMap("c", true);
```

Skip lists give O(log n) sorted operations lock-free. Use when you need a **sorted concurrent map** (leaderboards, time-sorted indexes).

## The Atomic Counter Idiom

```java
// Old: LongAdder for high contention
LongAdder requests = new LongAdder();
requests.increment();
requests.sum();            // eventually consistent — fine for metrics

// Counter in a map:
ConcurrentHashMap<String, LongAdder> byEndpoint = new ConcurrentHashMap<>();
byEndpoint.computeIfAbsent(endpoint, e -> new LongAdder()).increment();
```

`LongAdder` beats `AtomicLong` under heavy contention — it splits the counter across cells and merges on `sum()`. The right choice for metrics and stats.

## Choosing Correctly

| Need | Collection |
|------|-----------|
| Shared map, atomic ops | ConcurrentHashMap |
| Read-mostly listener lists | CopyOnWriteArrayList |
| Producer-consumer with bounds | ArrayBlockingQueue / LinkedBlockingQueue |
| Unbounded lock-free queue | ConcurrentLinkedQueue |
| Sorted concurrent map | ConcurrentSkipListMap |
| High-contention counter | LongAdder |

## The Two Rules

1. **Never share a plain `HashMap`/`ArrayList` across threads** — not even with `Collections.synchronizedMap` unless you're disciplined about the lock.
2. **Prefer the atomic operations** (`computeIfAbsent`, `putIfAbsent`, `merge`) — they make check-then-act races impossible.

## Summary

| Collection | Read | Write | Blocking |
|-----------|------|-------|----------|
| ConcurrentHashMap | Lock-free | Per-bucket lock | No |
| CopyOnWriteArrayList | Lock-free | O(n) copy | No |
| BlockingQueue | Blocking | Blocking | Yes (bounded) |
| ConcurrentLinkedQueue | Lock-free | Lock-free | No |
| SkipListMap | Lock-free | Lock-free | No |

Concurrent collections are chosen by *access pattern*, not popularity. Match the strategy — striped locks for maps, snapshots for listener lists, blocking for producer-consumer, CAS for queues — and your multi-threaded code stays correct, fast, and readable.
