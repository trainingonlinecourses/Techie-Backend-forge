---
title: Concurrency & Threads
summary: Executors, CompletableFuture, locks, atomics, and the deadlock/starvation traps in production systems.
order: 11
minutes: 20
topics: [threads, executor, completablefuture, locks, deadlock]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/concurrency/
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/package-summary.html
---

# Concurrency & Threads

## The threading model

Every thread runs on a core (1:1 with OS threads on HotSpot). Sharing mutable state between threads is where bugs live — so production code **confines state** (each thread owns its data) and uses thread-safe structures for what must be shared.

## Executors: never manage threads by hand

```java
// I/O-bound: thread pool sized by Little's Law ~= RPS x latency
ExecutorService io = Executors.newFixedThreadPool(32,
        Thread.ofPlatform().name("io-", 0).factory());

// CPU-bound: one per core
ExecutorService cpu = Executors.newFixedThreadPool(
        Runtime.getRuntime().availableProcessors());

// Submit work and wait with a BOUNDED timeout
Future<Long> f = io.submit(() -> repo.count());
Long rows = f.get(2, TimeUnit.SECONDS);          // never f.get() unbounded

// Scheduled work — fixed delay never overlaps itself
ScheduledExecutorService sched = Executors.newScheduledThreadPool(2);
sched.scheduleWithFixedDelay(outbox::relay, 1, 1, TimeUnit.SECONDS);

// Graceful shutdown
io.shutdown();
if (!io.awaitTermination(10, TimeUnit.SECONDS)) io.shutdownNow();
```

**Never** `newCachedThreadPool` on request paths (unbounded thread explosion = OOM).

## CompletableFuture: async composition

```java
public CustomerProfile assemble(String customerId, Executor io) {
    CompletableFuture<Customer> customer =
            CompletableFuture.supplyAsync(() -> customerRepo.requireById(customerId), io);
    CompletableFuture<List<Account>> accounts =
            CompletableFuture.supplyAsync(() -> accountRepo.findByCustomer(customerId), io);
    CompletableFuture<RiskRating> risk =
            riskClient.rateAsync(customerId)
                    .orTimeout(800, TimeUnit.MILLISECONDS)      // hard cap upstream
                    .exceptionally(ex -> RiskRating.UNKNOWN);   // degrade, never fail the page

    CompletableFuture.allOf(customer, accounts, risk).join();
    return new CustomerProfile(customer.join(), accounts.join(), risk.join());
}
```

Vocabulary: `thenApply` = map · `thenCompose` = flatMap · `thenCombine` = zip · `exceptionally` = catch · `handle` = result+error.

## Locks, atomics, visibility

```java
// volatile: visibility ONLY (flags)
private volatile boolean shutdownRequested;

// Atomics: lock-free; LongAdder wins under heavy contention
private final AtomicLong requests = new AtomicLong();
requests.incrementAndGet();
balance.updateAndGet(current -> current - amount);   // CAS loop inside

// ReentrantLock: tryLock with timeout beats synchronized for anything risky
private final ReentrantLock lock = new ReentrantLock();
public void move() throws InterruptedException {
    if (lock.tryLock(500, TimeUnit.MILLISECONDS)) {
        try { /* critical section */ }
        finally { lock.unlock(); }                     // ALWAYS in finally
    } else throw new BusyException();
}
```

Also in the toolbox: `ReadWriteLock`, `Semaphore`, `CountDownLatch`, `CyclicBarrier`, `BlockingQueue` (producer–consumer — never hand-rolled wait/notify).

## The three concurrency killers

**1. Data races** — two threads read/write the same field without synchronization. Fix: confinement, `volatile`/atomics, or locks.

**2. Deadlock** — T1 holds A wants B; T2 holds B wants A. Detect with `jstack` ("Found one Java-level deadlock"). Fix: **global lock ordering**:

```java
Account first  = a.getId().compareTo(b.getId()) < 0 ? a : b;
Account second = (first == a) ? b : a;
synchronized (first) { synchronized (second) { move(a, b, amt); } }
```

**3. Starvation/livelock** — threads spin without progress. Fix: fair locks, bounded queues, backoff + jitter on retries.

```java
// Producer–consumer with BlockingQueue
BlockingQueue<Job> queue = new ArrayBlockingQueue<>(1000);
executor.submit(() -> { while (!done) queue.put(produce()); });
executor.submit(() -> { while (!done) consume(queue.take()); });
```

> **Why it matters (organizational view)** — Concurrency bugs are the most expensive bugs: intermittent, thread-count-dependent, impossible to repro locally. The org-wide answer is *prevention by design*: immutable data (records), thread-confined state, thread-safe collections (`ConcurrentHashMap`), executors with bounded pools and named threads (so `jstack` output is readable), and no hand-rolled `wait`/`notify`. Spring hides most of this behind `@Async`, `@Scheduled` and virtual threads — but the rules above still apply underneath.

## Key takeaways

- Executors, not raw threads; bounded pools; named threads; always bounded `get()`.
- Confine state; share only thread-safe structures.
- Global lock ordering prevents deadlock; timeouts prevent hangs.
- `CompletableFuture` composes async work; `.orTimeout` + `.exceptionally` make it resilient.

**Official docs:** [Concurrency tutorial](https://docs.oracle.com/javase/tutorial/essential/concurrency/) · [java.util.concurrent](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/package-summary.html)
