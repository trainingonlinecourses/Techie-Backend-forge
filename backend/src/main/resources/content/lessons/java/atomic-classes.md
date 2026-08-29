---
title: Atomic Classes — Lock-Free Thread Safety with CAS
summary: AtomicInteger, AtomicReference, LongAdder, and the compare-and-swap mechanism that lets you write lock-free concurrent code — when to use atomics instead of synchronized.
order: 80
minutes: 20
topics: [atomic-integer, atomic-reference, long-adder, compare-and-swap, cas, lock-free, volatile]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/atomic/package-summary.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/atomic/AtomicInteger.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/atomic/AtomicReference.html
---

# Atomic Classes — Lock-Free Thread Safety with CAS

## The concept: atomic operations without locks

A `volatile int` is visible across threads, but `count++` is **three operations** (read, add, write) — not atomic. Two threads doing `count++` simultaneously can lose updates. The fix is either `synchronized` (a lock — blocks other threads) or **atomic classes** (lock-free — uses hardware compare-and-swap).

**The mental model:** `synchronized` is a traffic light (stop everyone, let one through); atomic classes are a green wave (threads proceed independently, retrying only if they collide — which is rare under low contention).

## AtomicInteger — the lock-free counter

```java
import java.util.concurrent.atomic.AtomicInteger;

AtomicInteger counter = new AtomicInteger(0);

// Atomic operations — no locks, no lost updates
counter.incrementAndGet();           // ++counter: returns 1
counter.getAndIncrement();           // counter++: returns 1, then increments
counter.addAndGet(5);                // counter += 5: returns 6
counter.compareAndSet(6, 10);        // if counter == 6, set to 10; returns true/false
int val = counter.get();             // read current value (always consistent with last write)
```

**Line-by-line breakdown:**
- `incrementAndGet()` — atomic `++counter`; uses CAS (compare-and-swap) internally: reads current value, computes new value, attempts CAS; if another thread changed it in between, retries automatically
- `getAndIncrement()` — atomic `counter++`; same CAS mechanism, returns the old value
- `addAndGet(5)` — atomic `counter += 5`; one CAS operation, not three separate ones
- `compareAndSet(6, 10)` — the CAS primitive: if current value is 6, set to 10 atomically; returns `false` if the value changed (caller can retry or give up)
- `get()` — volatile read; always sees the latest committed value

**How CAS works internally (simplified):**
```java
// AtomicInteger.incrementAndGet() pseudocode:
public int incrementAndGet() {
    int old, new;
    do {
        old = get();                    // volatile read
        new = old + 1;                  // compute new value
    } while (!compareAndSet(old, new)); // CAS: if old is still current, set new; else retry
    return new;
}
```

**The CAS retry loop:** if thread A reads `old=5`, then thread B changes it to `6` before A's CAS, A's CAS fails (expected 5, found 6). A re-reads (`old=6`), computes `new=7`, and retries CAS. Under low contention, the retry almost always succeeds on the first try.

## AtomicReference — lock-free object references

```java
import java.util.concurrent.atomic.AtomicReference;

AtomicReference<UserSession> currentSession = new AtomicReference<>();

// Atomic operations on object references
currentSession.set(new UserSession("alice", Instant.now()));
UserSession old = currentSession.getAndSet(new UserSession("bob", Instant.now()));

// CAS on references — useful for optimistic locking
UserSession expected = currentSession.get();
UserSession updated = new UserSession(expected.username(), Instant.now());
boolean success = currentSession.compareAndSet(expected, updated);
// success == false means another thread changed it between get() and CAS()
```

**Real-world scenario — optimistic lock for a config object:**
```java
AtomicReference<AppConfig> config = new AtomicReference<>(AppConfig.defaultConfig());

// Hot-reload: atomically swap config if it hasn't changed since we read it
void reloadConfig() {
    AppConfig current = config.get();
    AppConfig fresh = fetchFromVault();
    if (!config.compareAndSet(current, fresh)) {
        // Someone else reloaded first — that's fine, our update was unnecessary
        log.info("Config already reloaded by another thread");
    }
}
```

## LongAdder — high-contention counters

`AtomicInteger` uses a single CAS target — under high contention (many threads incrementing simultaneously), CAS retries pile up. `LongAdder` distributes the counter across **multiple cells** (one per thread/CPU), then sums them on demand:

```java
import java.util.concurrent.atomic.LongAdder;

LongAdder requestCounter = new LongAdder();

// Each thread increments its own cell — no contention
requestCounter.increment();          // O(1), no CAS retry
requestCounter.add(5);              // batch increment

// Sum all cells — expensive, but only needed for reporting
long total = requestCounter.sum();           // not atomic — reads all cells
long snapshot = requestCounter.sumThenReset(); // sum + reset cells to zero
```

**Line-by-line breakdown:**
- `increment()` — each thread writes to its own cell (determined by thread ID); no CAS contention
- `sum()` — reads all cells and adds them; not atomic (a cell might change between reads), but good enough for metrics
- `sumThenReset()` — atomic sum + reset; better for periodic reporting

**When to use LongAdder vs AtomicLong:**
| Scenario | Use | Why |
|---|---|---|
| High-contention counter (metrics, requests/sec) | `LongAdder` | Distributes contention across cells |
| Low-contention counter (1-4 threads) | `AtomicInteger`/`AtomicLong` | Lower overhead (one field vs array of cells) |
| Need exact atomic snapshot | `AtomicLong` | `sum()` on LongAdder is not atomic |
| Need CAS on the value | `AtomicLong` | LongAdder has no CAS (only increment/add) |

## AtomicStampedReference — ABA problem solution

The **ABA problem:** thread A reads value `X`, thread B changes it to `Y` then back to `X`, thread A's CAS succeeds (seeing `X` again) — but the state has actually changed. `AtomicStampedReference` adds a **stamp** (version number) that changes on every modification:

```java
import java.util.concurrent.atomic.AtomicStampedReference;

AtomicStampedReference<String> ref = new AtomicStampedReference<>("A", 0);

int[] stampHolder = new int[1];
String current = ref.get(stampHolder);    // current = "A", stamp = 0

// CAS with stamp — fails if either value OR stamp changed
boolean success = ref.compareAndSet("A", "B", stampHolder[0], stampHolder[0] + 1);
// success == false if another thread changed the value or incremented the stamp
```

**When you need it:** linked-lock-free data structures (ConcurrentLinkedQueue uses stamps internally), and scenarios where value recycling (ABA) is possible. Most application code doesn't need this — plain `AtomicReference` suffices.

## AtomicReferenceFieldUpdater — update a single field without wrapping the whole object

```java
public class Order {
    volatile String status;  // volatile is required for the updater

    private static final AtomicReferenceFieldUpdater<Order, String> STATUS_UPDATER =
        AtomicReferenceFieldUpdater.newUpdater(Order.class, String.class, "status");

    public boolean updateStatus(String expected, String newStatus) {
        return STATUS_UPDATER.compareAndSet(this, expected, newStatus);
    }
}
```

**Why it exists:** wrapping every mutable field in an `AtomicReference<Order>` is wasteful (one extra object per field). The updater lets you do CAS on a single `volatile` field of an existing object — memory-efficient for high-cardinality objects.

## Atomics vs locks — when to choose which

| Characteristic | Atomic classes | synchronized / Lock |
|---|---|---|
| Contention | Low (CAS retries are rare) | High (threads block) |
| Critical section size | Single variable update | Multiple operations (read-modify-write of several fields) |
| Blocking | Never | Can block indefinitely |
| Starvation | Possible under extreme contention (CAS livelock) | No (fair locks guarantee access) |
| Composability | Hard (single variable only) | Easy (wrap multiple operations) |
| Debugging | No thread dumps (no lock) | Thread dumps show blocked threads |

**Rule of thumb:** if the concurrent update is a single variable (counter, flag, reference), use atomics. If it's multiple variables or a complex invariant, use locks.

## Common mistakes

| Mistake | Why it's wrong | Fix |
|---|---|---|
| `AtomicInteger` for high-contention counters | CAS retries pile up; throughput drops | Use `LongAdder` for metrics/counters |
| Assuming `get()` is always latest | `get()` is a volatile read — it's consistent with the last CAS, but another thread may have changed it since | Use `get()` + CAS in a loop if you need consistency |
| Using `atomic.incrementAndGet()` in a loop for batch | Each increment is a separate CAS; wasteful | Use `atomic.addAndGet(batchSize)` |
| Mixing `get()` and `set()` (non-atomic compound) | Two threads can interleave between `get()` and `set()` — lost update | Use `compareAndSet` or `updateAndGet` |
| Using `AtomicReference` for every object | Overhead of wrapping every field; use field updaters or plain `volatile` for simple cases | Use `volatile` + `compareAndSet` for single-field updates |

## Key takeaways

- Atomic classes use CAS (compare-and-swap) — lock-free, retry on contention, never block.
- `AtomicInteger`/`AtomicReference` — for single-variable atomic updates; `LongAdder` — for high-contention counters.
- CAS is a retry loop: read → compute → CAS → if failed, retry. Under low contention, it almost never retries.
- `AtomicStampedReference` solves the ABA problem with version stamps.
- Use atomics for single-variable updates; use locks for multi-variable invariants.

**Official docs:** [Atomic package](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/atomic/package-summary.html) · [AtomicInteger API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/atomic/AtomicInteger.html) · [LongAdder API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/atomic/LongAdder.html)
