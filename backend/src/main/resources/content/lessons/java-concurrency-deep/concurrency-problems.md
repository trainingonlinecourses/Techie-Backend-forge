---
title: Race Conditions, Deadlocks and LiveLocks
module: java-concurrency-deep
order: 4
minutes: 25
topics: ["race conditions", "deadlock", "livelock", "starvation", "memory visibility", "detection tools"]
summary: Concurrency bugs don't crash at compile time — they corrupt data under load, hang threads at 3 AM, and vanish when you add logging. This lesson is ...
docs:
  - title: "Concurrency problems"
    url: "https://docs.oracle.com/en/java/javase/21/core/concurrency.html"
---

# Race Conditions, Deadlocks and LiveLocks

Concurrency bugs don't crash at compile time — they corrupt data under load, hang threads at 3 AM, and vanish when you add logging. This lesson is the pathology: the four failure modes, how to recognize each from its symptoms, and the tools that find them.

## 1. Race Conditions

**Definition**: the outcome depends on the interleaving of threads — a check-then-act window where two threads can both observe the same pre-condition and act inconsistently.

```java
public class BookingService {
    private int seats = 10;

    public void book() {
        if (seats > 0) {        // both threads read 10
            seats--;            // both write 9 — ONE BOOKING LOST
        }
    }
}
```

**Recognition**: works in dev, corrupts under load; wrong counts; missing bookings; "it only happens in production."

**Fix**: make check-then-act atomic (synchronized, lock, or an atomic op):

```java
private final AtomicInteger seats = new AtomicInteger(10);

public void book() {
    for (;;) {
        int current = seats.get();
        if (current == 0) return;
        if (seats.compareAndSet(current, current - 1)) return;  // atomic claim
    }
}
```

## 2. Deadlock

**Definition**: two or more threads each hold a lock the other needs — all wait forever.

```java
// Thread A: transfer(a→b)
synchronized (accountA) { synchronized (accountB) { ... } }

// Thread B: transfer(b→a)
synchronized (accountB) { synchronized (accountA) { ... } }
```

**Recognition**: threads stuck forever (jstack shows both `WAITING` on each other's monitors), thread dump shows the cycle:

```
"pool-1-thread-1" waiting for 0x...B (held by pool-1-thread-2)
"pool-1-thread-2" waiting for 0x...A (held by pool-1-thread-1)
```

**Fixes** (in order of preference):

1. **Lock ordering** — always acquire locks in a global order (by id, by name):
```java
Account first = a.id() < b.id() ? a : b;
Account second = a.id() < b.id() ? b : a;
synchronized (first) { synchronized (second) { ... } }
```
2. **Timeout** — `tryLock(timeout)` and back off instead of waiting forever.
3. **Single lock** — one lock per subsystem beats lock nesting.
4. **Lock-free** — atomics and immutable data eliminate the cycle entirely.

## 3. Livelock

**Definition**: threads aren't blocked — they're *spinning*, each undoing the other's progress forever.

```java
// Two threads, both politely yielding on contention — neither progresses
while (!tryLock()) {
    Thread.yield();    // both yield to each other forever
}
```

**Recognition**: CPU pegged, threads RUNNABLE but no progress, jstack shows them retrying in a loop.

**Fix**: add randomness/backoff so they desynchronize:

```java
while (!lock.tryLock()) {
    Thread.sleep(ThreadLocalRandom.current().nextLong(1, 50));  // jitter breaks the symmetry
}
```

## 4. Starvation

**Definition**: a thread is *runnable* but never gets scheduled — others keep winning the lock.

```java
// Non-fair lock: a burst of thread A acquisitions starves thread B
// (synchronized is non-fair; ReentrantLock can be fair)
ReentrantLock lock = new ReentrantLock(true);   // fair — FCFS, prevents starvation
```

**Recognition**: one thread never progresses while others complete; thread dump shows it RUNNABLE but the same others always hold the lock.

**Fix**: fair locks (`new ReentrantLock(true)`), or redesign to reduce contention (striped locks, atomics).

## Memory Visibility: The Fifth Failure

Not a lock problem — a *memory* problem. Without a happens-before edge, thread B may never see thread A's write:

```java
// ❌ No happens-before: the loop may run forever
private boolean done = false;       // not volatile!
threadA: done = true;
threadB: while (!done) { }          // may never see the write

// ✅ volatile: visibility guaranteed
private volatile boolean done = false;
```

**Recognition**: infinite loops, stale values that "should" have updated, works after adding a print (which incidentally syncs).

## Detection Toolkit

| Tool | Finds |
|------|-------|
| `jstack <pid>` | Deadlocks (it prints the cycle), stuck threads |
| `jcmd <pid> Thread.print` | Same, plus virtual threads |
| Thread dump analysis tools | Deadlock detection built-in |
| IntelliJ/Eclipse analyzer | Deadlock warnings at code level |
| Stress tests (JCStress) | Race condition reproduction |
| `-Xlog:locks` / LockSupport logging | Lock contention |

### The JStack Deadlock Output

```bash
$ jstack 12345
Found one Java-level deadlock:
"pool-1-thread-1":
  waiting to lock monitor 0x00007f8c00849a20 (object 0x...B)
"pool-1-thread-2":
  waiting to lock monitor 0x00007f8c00849a70 (object 0x...A)
Java stack information for the threads listed above:
... (the cycle is right there)
```

## The Contention Curve

```
Low contention:   atomics are fastest (no locks at all)
Medium contention: synchronized / ReentrantLock
High contention:  LongAdder / striped locks / redesign
Extreme:          single-writer + immutable reads (copy-on-write)
```

## Testing for Concurrency Bugs

```java
// Stress test that reproduces races (run many times)
@Test
void noLostUpdatesUnderStress() throws Exception {
    AtomicInteger counter = new AtomicInteger();
    try (var pool = Executors.newFixedThreadPool(16)) {
        IntStream.range(0, 100_000).forEach(i -> pool.submit(counter::incrementAndGet));
    }
    assertEquals(100_000, counter.get());
}
```

Real production detection: **Chaos/load tests** with high concurrency + randomized schedules, plus JCStress for proving individual races.

## Summary

| Failure | Symptom | Root fix |
|---------|---------|----------|
| Race | Wrong data under load | Atomicity (CAS, locks) |
| Deadlock | Threads stuck forever | Lock ordering / timeout |
| Livelock | CPU pegged, no progress | Jitter / backoff |
| Starvation | One thread never runs | Fair locks |
| Visibility | Stale reads | volatile / happens-before |

All five failures share one cure: **respect the happens-before rules and make check-then-act atomic**. Recognize the symptom (stuck? spinning? stale? wrong?), apply the matching fix, and prove it with stress tests — because a race that "never happens" is just one you haven't reproduced yet.
