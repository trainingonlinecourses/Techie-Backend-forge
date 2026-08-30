---
title: Atomics and Locks — Thread-Safe Operations Without Synchronized
summary: What AtomicInteger/Long/Reference are, CAS operations, ReentrantLock vs synchronized, ReadWriteLock, StampedLock, and how organizations build high-performance concurrent systems.
order: 2
minutes: 30
topics: [atomic, cas, reentrantlock, readwritelock, stampedlock, java-concurrency]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/atomic/package-summary.html
  - https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/locks/package-summary.html
---

## The Concept, From Zero

`synchronized` is simple but has limitations:
- Only one thread can hold the lock at a time
- Thread blocks while waiting — no progress
- Can cause deadlocks

**Atomic classes** use **Compare-And-Swap (CAS)** — a hardware-level operation that's faster than locking:

```java
// CAS operation (conceptual):
// 1. Read current value
// 2. Compute new value
// 3. If current value hasn't changed, update it
// 4. If it changed, retry

// AtomicInteger — lock-free counter
AtomicInteger counter = new AtomicInteger(0);
counter.incrementAndGet();  // CAS: read 0, compute 1, swap 0→1, return 1
counter.incrementAndGet();  // CAS: read 1, compute 2, swap 1→2, return 2
```

**Locks** provide more flexibility than `synchronized`:
- `ReentrantLock` — supports tryLock, timed lock, interruptible lock
- `ReadWriteLock` — multiple readers OR one writer
- `StampedLock` — optimistic reading + read/write locks

---

## Line-by-Line Walkthrough

```java
import java.util.concurrent.atomic.*;
import java.util.concurrent.locks.*;

public class AtomicsAndLocksDemo {
    // Line 1: AtomicInteger — lock-free counter
    static AtomicInteger counter = new AtomicInteger(0);

    static void atomicExample() throws InterruptedException {
        Thread[] threads = new Thread[10];
        for (int i = 0; i < 10; i++) {
            threads[i] = new Thread(() -> {
                for (int j = 0; j < 1000; j++) {
                    counter.incrementAndGet();  // CAS operation
                }
            });
            threads[i].start();
        }
        for (Thread t : threads) t.join();
        System.out.println("Atomic counter: " + counter.get());  // 10000
    }

    // Line 2: AtomicReference — lock-free object reference
    static AtomicReference<String> state = new AtomicReference<>("IDLE");

    static void atomicReferenceExample() {
        // CAS: compare current value and update atomically
        state.compareAndSet("IDLE", "PROCESSING");
        state.compareAndSet("PROCESSING", "COMPLETED");
        System.out.println("State: " + state.get());  // COMPLETED
    }

    // Line 3: AtomicReference with complex updates
    static record Balance(double amount) {}
    static AtomicReference<Balance> account = new AtomicReference<>(new Balance(1000));

    static void transfer(double amount) {
        // Retry until CAS succeeds
        while (true) {
            Balance current = account.get();
            Balance updated = new Balance(current.amount - amount);
            if (account.compareAndSet(current, updated)) {
                break;  // CAS succeeded
            }
            // CAS failed — another thread modified the account, retry
        }
    }

    // Line 4: ReentrantLock — more flexible than synchronized
    static class BankAccount {
        private final ReentrantLock lock = new ReentrantLock();
        private double balance;

        public void withdraw(double amount) {
            lock.lock();  // Acquire lock
            try {
                if (balance >= amount) {
                    balance -= amount;
                }
            } finally {
                lock.unlock();  // Always release in finally
            }
        }

        // Try to acquire lock without waiting
        public boolean tryWithdraw(double amount) {
            if (lock.tryLock()) {  // Non-blocking
                try {
                    if (balance >= amount) {
                        balance -= amount;
                        return true;
                    }
                    return false;
                } finally {
                    lock.unlock();
                }
            }
            return false;  // Couldn't acquire lock
        }

        // Timed lock — wait up to 1 second
        public void withdrawWithTimeout(double amount) throws InterruptedException {
            if (lock.tryLock(1, java.util.concurrent.TimeUnit.SECONDS)) {
                try {
                    balance -= amount;
                } finally {
                    lock.unlock();
                }
            }
        }
    }

    // Line 5: ReadWriteLock — multiple readers OR one writer
    static class CachedData {
        private final ReentrantReadWriteLock rwLock = new ReentrantReadWriteLock();
        private final Map<String, String> cache = new HashMap<>();

        // Multiple threads can read simultaneously
        public String get(String key) {
            rwLock.readLock().lock();
            try {
                return cache.get(key);
            } finally {
                rwLock.readLock().unlock();
            }
        }

        // Only one thread can write (blocks readers)
        public void put(String key, String value) {
            rwLock.writeLock().lock();
            try {
                cache.put(key, value);
            } finally {
                rwLock.writeLock().unlock();
            }
        }
    }

    // Line 6: StampedLock — optimistic reading
    static class Point {
        private final StampedLock sl = new StampedLock();
        private double x, y;

        public void move(double deltaX, double deltaY) {
            long stamp = sl.writeLock();
            try {
                x += deltaX;
                y += deltaY;
            } finally {
                sl.unlockWrite(stamp);
            }
        }

        // Optimistic read — doesn't lock, checks for concurrent modification
        public double distanceFromOrigin() {
            long stamp = sl.tryOptimisticRead();  // non-blocking
            double currentX = x, currentY = y;

            if (!sl.validate(stamp)) {
                // Concurrent write happened — fall back to read lock
                stamp = sl.readLock();
                try {
                    currentX = x;
                    currentY = y;
                } finally {
                    sl.unlockRead(stamp);
                }
            }
            return Math.sqrt(currentX * currentX + currentY * currentY);
        }
    }

    public static void main(String[] args) throws InterruptedException {
        System.out.println("=== Atomic Counter ===");
        atomicExample();

        System.out.println("\n=== Atomic Reference ===");
        atomicReferenceExample();

        System.out.println("\n=== Bank Account with ReentrantLock ===");
        BankAccount account = new BankAccount();
        account.withdraw(100);

        System.out.println("\n=== Cached Data with ReadWriteLock ===");
        CachedData cache = new CachedData();
        cache.put("key1", "value1");
        System.out.println("Cached: " + cache.get("key1"));
    }
}
```

---

## Real-World Scenarios

### Scenario 1: High-performance rate limiter

```java
public class RateLimiter {
    private final AtomicInteger tokens;
    private final int maxTokens;
    private final long refillIntervalMs;

    public RateLimiter(int maxTokens, long refillIntervalMs) {
        this.maxTokens = maxTokens;
        this.tokens = new AtomicInteger(maxTokens);
        this.refillIntervalMs = refillIntervalMs;
    }

    public boolean tryAcquire() {
        while (true) {
            int current = tokens.get();
            if (current <= 0) return false;
            if (tokens.compareAndSet(current, current - 1)) {
                return true;
            }
        }
    }
}
```

### Scenario 2: Reader-writer cache

```java
public class RWCache<K, V> {
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();
    private final Map<K, V> cache = new HashMap<>();

    public V getOrCreate(K key, Function<K, V> loader) {
        // Try read lock first (fast path)
        lock.readLock().lock();
        try {
            V value = cache.get(key);
            if (value != null) return value;
        } finally {
            lock.readLock().unlock();
        }

        // Upgrade to write lock (slow path)
        lock.writeLock().lock();
        try {
            // Double-check after acquiring write lock
            V value = cache.get(key);
            if (value == null) {
                value = loader.apply(key);
                cache.put(key, value);
            }
            return value;
        } finally {
            lock.writeLock().unlock();
        }
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using CAS in a tight loop without backoff | CPU spinning | Add Thread.onSpinWait() or Thread.sleep() |
| Forgetting to unlock in finally | Lock never released | Always unlock in finally block |
| Using ReentrantLock when synchronized works | Overhead without benefit | Start with synchronized, upgrade when needed |
| Not handling interrupted exceptions | tryLock throws InterruptedException | Catch and handle or rethrow |
| Using StampedLock with virtual threads | Not compatible | Use ReentrantLock with virtual threads |
