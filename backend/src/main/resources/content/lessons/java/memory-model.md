---
title: The Java Memory Model — Visibility, Happens-Before and Volatile
summary: Why shared fields go stale across threads, the happens-before rules that make visibility deterministic, and the volatile/atomic patterns orgs rely on.
order: 27
minutes: 22
topics: [memory-model, happens-before, volatile, visibility, atomicity, data-race, memory-barrier]
docs:
  - https://docs.oracle.com/javase/specs/jls/se21/html/jls-17.html
  - https://jenkov.com/tutorials/java-concurrency/java-memory-model.html
---

# The Java Memory Model — Visibility, Happens-Before and Volatile

## The concept: threads don't see each other's writes instantly

Every thread has its own **working memory** (CPU caches / registers). When thread A writes a plain field, that write may sit in A's cache — thread B can read the *stale* value indefinitely:

```java
class StopFlag {
    boolean running = true;                 // plain field
    void stop() { running = false; }        // thread A
    void work() {
        while (running) { /* busy loop */ } // thread B — may NEVER see the change!
    }
}
```

Without synchronization, the JVM is *allowed* to keep the loop running forever — no guarantee, no error, just a hang. This is a **data race** (unsynchronized read/write of the same field), and the Java Memory Model (JMM) defines exactly when visibility *is* guaranteed.

## The happens-before rules

The JMM guarantees: **if action X happens-before action Y, then X's writes are visible to Y.** The rules you rely on daily:

1. **Program order** — statements in one thread happen-before later statements in that thread.
2. **Monitor unlock → lock** — everything before `synchronized` block A's unlock happens-before everything after the *same* monitor's lock by another thread.
3. **Volatile write → volatile read** — a write to a `volatile` field happens-before any later read of it.
4. **Thread start** — everything before `thread.start()` happens-before anything the new thread does.
5. **Thread join** — everything a thread did happens-before `thread.join()` returns.
6. **Executor submit** — task submission happens-before the task runs; task completion happens-before `Future.get()` returns.
7. **Transitivity** — if A HB B and B HB C, then A HB C.

**What this means in practice:** your safety does *not* come from hoping the hardware is fast enough — it comes from establishing a happens-before edge (lock, volatile, join, future) between the writing and the reading thread.

## How we use it in an organization: the patterns

**Pattern 1 — the volatile flag.** The shutdown pattern from the graceful-shutdown lesson — `volatile` is exactly right here because the flag is written by one thread and read by many, with no compound operation:

```java
class Worker {
    private volatile boolean running = true;   // visibility guaranteed
    public void shutdown() { running = false; }
    public void run() { while (running) { ... } }
}
```

**Pattern 2 — immutable publishes.** If a field is `final`, the JMM guarantees the fully-constructed object is visible to any thread that obtains the reference (safe publication):

```java
class Config {
    final int poolSize;            // final → safe publication through the reference
    final String dbUrl;
    Config(int poolSize, String dbUrl) { this.poolSize = poolSize; this.dbUrl = dbUrl; }
}
// Publish:  shared.config = new Config(...)  → any thread reading shared.config
// sees the fully-built Config (as long as `this` didn't escape the constructor)
```

Records and immutable value objects rely on this — publishing an immutable object needs **no** locking.

**Pattern 3 — volatile is not atomic.** The classic bug: incrementing a volatile counter is *three* operations (read, add, write) and can lose updates:

```java
volatile int count = 0;
// count++ is NOT atomic — two threads can both read 5, both write 6 → lost update
// Fix: AtomicInteger, or synchronized, or LongAdder under heavy contention
```

Volatile guarantees **visibility**, not **atomicity**. For read-modify-write you need `AtomicInteger`/`AtomicLong` (which use CAS and also establish happens-before) or a lock.

## The three synchronizers, chosen correctly

| Need | Tool | Why |
|---|---|---|
| Visibility of a flag/state | `volatile` | Cheapest; single-thread writer, many readers |
| Read-modify-write counters | `AtomicInteger` / `LongAdder` | CAS atomicity; `LongAdder` for hot counters |
| Compound critical sections | `synchronized` / `ReentrantLock` | Mutual exclusion + happens-before |
| Immutable data publish | `final` fields + immutable object | Safe publication with zero synchronization |

## The scenarios teams hit

- **Double-checked locking** — the old broken idiom is *correct* only with `volatile` on the field (Java 5+ fixed it). The modern answer is `Initialization-on-demand` or an enum singleton — or simply not hand-rolling singletons.
- **Cache poisoning across threads** — a shared in-memory cache written by a background refresher and read by request threads: the cache map must be a concurrent structure (`ConcurrentHashMap`) whose writes establish happens-before for readers.
- **Metrics counters** — hot request counters written by every thread: `LongAdder` (striped, low-contention) over `AtomicLong`.
- **Static lazy init** — class initialization is itself thread-safe (the JVM guarantees one-time init with happens-before), so a `static` holder class needs no synchronization at all.

## Pitfalls

- **Assuming visibility "works out"** — without a happens-before edge it can work in dev and break on a different CPU/core count. This is the classic *works locally, hangs in prod* concurrency bug.
- **`volatile` on compound ops** — lost updates, silently.
- **Mutable objects published without synchronization** — readers see partially-constructed state. Publish only immutable or fully-synchronized objects.
- **`this` escaping the constructor** — publishing `this` before the constructor finishes destroys the final-field guarantee.
- **Forgetting the read side** — happens-before requires *both* threads to participate; a writer using `volatile` while the reader reads a plain field still races.

## Key takeaways

- Threads have private working memory — shared-field writes are not automatically visible.
- Happens-before edges (lock, volatile, start/join, future) are what make visibility deterministic.
- `volatile` = visibility for single-writer/many-reader flags; `Atomic*` = atomic read-modify-write.
- `final` fields give safe publication of immutable objects with zero locking.
- A data race may work locally and fail in prod — always establish the edge explicitly.
