---
title: Locks, Atomicity and Visibility
module: java-concurrency-deep
order: 2
minutes: 30
topics: ["synchronized", "ReentrantLock", "atomic classes", "volatile", "visibility", "deadlock", "happens-before"]
docs:
  - title: "Locks in Java"
    url: "https://docs.oracle.com/en/java/javase/21/core/concurrency.html"
---

# Locks, Atomicity and Visibility

Concurrency bugs are invisible: no compile error, no crash — just wrong results under load. This lesson covers the three pillars — **atomicity** (indivisible operations), **visibility** (seeing others' writes), and **ordering** — and the tools: `synchronized`, `ReentrantLock`, atomics, and `volatile`.

## The Three Problems

1. **Atomicity** — a check-then-act race: two threads read the same value, both increment, one update is lost.
2. **Visibility** — thread A writes, thread B never sees it (no happens-before edge).
3. **Ordering** — the JVM reorders instructions; without synchronization, your "obvious" order isn't.

## volatile: Visibility Only

```java
// volatile = visibility guarantee: reads always see the latest write
private volatile boolean running = true;

public void stop() { running = false; }   // another thread's while loop sees this

public void run() {
    while (running) { work(); }            // won't spin forever
}
```

`volatile` guarantees visibility and ordering, but **not atomicity**:

```java
// ❌ NOT atomic — two threads can both read 5 and write 6
private volatile int counter;
counter++;     // read, add, write — three steps, racy

// ✅ atomic
private final AtomicInteger counter = new AtomicInteger();
counter.incrementAndGet();
```

**Rule**: `volatile` for flags and published immutable references; `Atomic*` for counters and single-value updates.

## synchronized: Mutual Exclusion

```java
public class Counter {
    private int count;

    public synchronized void increment() {   // intrinsic lock
        count++;
    }

    public synchronized int get() {
        return count;
    }
}
```

- Every object has an intrinsic lock (`monitor`).
- `synchronized` on a method = lock the `this` object for the call.
- **Reentrant**: the same thread can re-acquire its own lock (nested synchronized calls work).
- Exceptions release the lock automatically.

### The Static Method Lock

```java
public class Registry {
    private static final Map<String, Entry> entries = new HashMap<>();

    public static synchronized void add(String key, Entry e) {
        entries.put(key, e);    // locks the Class object, not an instance
    }
}
```

## The synchronized Block

```java
// Lock a smaller critical section — less contention
public void transfer(Account from, Account to, BigDecimal amount) {
    synchronized (from) {
        synchronized (to) {
            from.debit(amount);
            to.credit(amount);
        }
    }
}
```

This is where **deadlock** is born: two threads transferring in opposite directions each hold one account and wait for the other. The fix — always lock in a **global order**:

```java
// Lock by id order — no cycle possible
Account first = from.id() < to.id() ? from : to;
Account second = from.id() < to.id() ? to : from;
synchronized (first) {
    synchronized (second) { ... }
}
```

## ReentrantLock: The Explicit Lock

```java
private final ReentrantLock lock = new ReentrantLock();

public void process() {
    lock.lock();                    // blocking acquire
    try {
        criticalSection();
    } finally {
        lock.unlock();              // ALWAYS in finally
    }
}
```

ReentrantLock's advantages over synchronized:

| Feature | synchronized | ReentrantLock |
|---------|--------------|---------------|
| Try-lock (non-blocking) | ❌ | `tryLock()` |
| Timeout | ❌ | `tryLock(5, SECONDS)` |
| Interruptible | ❌ | `lockInterruptibly()` |
| Fairness | ❌ (mostly) | `new ReentrantLock(true)` |
| Multiple conditions | ❌ | `newCondition()` |

```java
// The production pattern: non-blocking with timeout
if (lock.tryLock(5, TimeUnit.SECONDS)) {
    try {
        criticalSection();
    } finally {
        lock.unlock();
    }
} else {
    log.warn("Lock not acquired in 5s — proceeding with stale state");
}
```

## The Atomic Classes

```java
AtomicInteger counter = new AtomicInteger();
counter.incrementAndGet();                  // +1, returns new value
counter.getAndIncrement();                  // +1, returns old value
counter.compareAndSet(expected, update);    // CAS — the primitive of all atomics
counter.updateAndGet(x -> Math.max(x, 10)); // functional update

// Specialized:
AtomicLong, AtomicBoolean, AtomicReference<T>
AtomicLongArray, LongAdder, LongAccumulator
```

### CAS: Compare-And-Set

```java
// What incrementAndGet does under the hood:
public int incrementAndGet() {
    for (;;) {
        int current = get();
        int next = current + 1;
        if (compareAndSet(current, next)) return next;   // retry on contention
    }
}
```

CAS is a hardware primitive (LOCK CMPXCHG) — **lock-free**: no blocking, no deadlock, no context switch. Contended CAS retries, which is why `LongAdder` exists for high contention.

## AtomicReference: Lock-Free State

```java
public class LeaderElection {
    private final AtomicReference<String> leader = new AtomicReference<>();

    public boolean tryBecomeLeader(String nodeId) {
        return leader.compareAndSet(null, nodeId);   // exactly one wins
    }
}
```

## The Happens-Before Rules

These create visibility guarantees (writes visible to later reads):

- **Monitor rule**: unlock happens-before a subsequent lock on the same monitor
- **Volatile rule**: write to volatile happens-before a later read of it
- **Thread start/join**: `start()` happens-before the thread's actions; thread's actions happen-before `join()` returns
- **Executor submit**: submitting a task happens-before it runs; task completion happens-before `Future.get()` returns
- **Atomic ops**: CAS on the same variable

Every synchronization mechanism above is really a happens-before edge — this is *why* it works.

## Deadlock Prevention Checklist

| Strategy | Example |
|----------|---------|
| Lock ordering | Always lock by id/name order |
| Timeout | `tryLock(timeout)` instead of `lock()` |
| Single lock | Prefer one lock over nesting |
| Lock-free | Atomics / immutable data |
| Don't hold locks during I/O | Release before slow calls |

## Testing Concurrency

```java
@Test
void counterIsCorrectUnderContention() throws Exception {
    Counter counter = new Counter();
    ExecutorService pool = Executors.newFixedThreadPool(8);

    for (int i = 0; i < 10_000; i++) {
        pool.submit(counter::increment);
    }
    pool.shutdown();
    pool.awaitTermination(10, TimeUnit.SECONDS);

    assertEquals(10_000, counter.get());   // would fail with plain int
}
```

## Summary

| Tool | Guarantee | Use |
|------|-----------|-----|
| `volatile` | Visibility only | Flags, published refs |
| `synchronized` | Mutual exclusion + visibility | Short critical sections |
| `ReentrantLock` | + try/timeout/interrupt | Contended, long sections |
| `Atomic*` | Lock-free atomic ops | Counters, CAS state |
| `LongAdder` | High-contention counters | Metrics, stats |

Atomicity, visibility, and ordering are the entire game. Pick the *smallest* tool that gives the guarantee you need — volatile for flags, atomics for counters, synchronized/locks for compound operations — and remember every tool is really a happens-before edge. The next lessons extend this to CompletableFuture composition and virtual threads.
