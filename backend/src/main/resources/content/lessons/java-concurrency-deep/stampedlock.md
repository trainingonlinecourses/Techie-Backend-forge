---
title: StampedLock — Optimistic & Read-Write Locks
summary: When ReentrantReadWriteLock is not enough, optimistic reads for lock-free reads,悲观 locks for writes, and performance benchmarks.
order: 7
minutes: 16
topics: [stampedlock, optimistic-read, read-write-lock, concurrency-performance, lock-contention]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/locks/StampedLock.html
  - https://docs.oracle.com/javase/21/docs/api/java.base/java/util/concurrent/locks/StampedLock.html
---

# StampedLock — Optimistic & Read-Write Locks

## What Is StampedLock?

**StampedLock** (Java 8+) is a high-performance lock that supports three modes:
1. **Writing** — exclusive access (like `ReentrantLock`)
2. **Pessimistic Reading** — shared access (like `ReentrantReadWriteLock`)
3. **Optimistic Reading** — lock-free read (unique to StampedLock!)

**Think of it like**: a restaurant with three seating options — private room (write), shared table (pessimistic read), or standing room (optimistic read, no table needed).

---

## Why Not ReentrantReadWriteLock?

```java
// ReentrantReadWriteLock is good but has a problem:
// Writers can starve — readers keep getting access, writers wait forever
ReentrantReadWriteLock rwLock = new ReentrantReadWriteLock();

// Many readers can hold the lock simultaneously
rwLock.readLock().lock();    // Reader 1 ✓
rwLock.readLock().lock();    // Reader 2 ✓
rwLock.readLock().lock();    // Reader 3 ✓

// Writer waits until ALL readers release
rwLock.writeLock().lock();   // Writer waits... and waits... ⏳

// StampedLock fixes this with optimistic reads
```

---

## StampedLock Modes

### 1. Exclusive Write Lock

```java
StampedLock lock = new StampedLock();

// Write lock — exclusive access
long stamp = lock.writeLock();
try {
    // Modify shared data — no other thread can read or write
    balance = balance + 100;
} finally {
    lock.unlockWrite(stamp);  // ALWAYS unlock in finally
}
```

### 2. Pessimistic Read Lock

```java
// Read lock — shared access (multiple readers allowed)
long stamp = lock.readLock();
try {
    // Read shared data — multiple threads can read simultaneously
    int currentBalance = balance;
} finally {
    lock.unlockRead(stamp);
}
```

### 3. Optimistic Read (The Superpower!)

```java
// Optimistic read — NO LOCK AT ALL!
long stamp = lock.tryOptimisticRead();

// Read without locking
int currentBalance = balance;
long lastUpdate = timestamp;

// Validate — did a write happen while we were reading?
if (!lock.validate(stamp)) {
    // A write occurred — fall back to pessimistic read
    stamp = lock.readLock();
    try {
        currentBalance = balance;
        lastUpdate = timestamp;
    } finally {
        lock.unlockRead(stamp);
    }
}

// Use the values we read
System.out.println("Balance: " + currentBalance);
```

**Why is this amazing?** The optimistic read path has **zero locking overhead** — it's as fast as an unprotected read. Only when a write conflict is detected does it fall back to a real lock.

---

## Complete Example

```java
public class Point {
    private final StampedLock lock = new StampedLock();
    private double x;
    private double y;

    // Exclusive write
    public void move(double deltaX, double deltaY) {
        long stamp = lock.writeLock();
        try {
            x += deltaX;
            y += deltaY;
        } finally {
            lock.unlockWrite(stamp);
        }
    }

    // Pessimistic read (when you need to do complex processing)
    public double distanceFromOrigin() {
        long stamp = lock.readLock();
        try {
            // Complex calculation — hold read lock for a while
            return Math.sqrt(x * x + y * y);
        } finally {
            lock.unlockRead(stamp);
        }
    }

    // Optimistic read (for simple, fast reads)
    public double distanceFromOriginOptimistic() {
        long stamp = lock.tryOptimisticRead();
        double currentX = x;
        double currentY = y;

        if (!lock.validate(stamp)) {
            // Fall back to pessimistic read
            stamp = lock.readLock();
            try {
                currentX = x;
                currentY = y;
            } finally {
                lock.unlockRead(stamp);
            }
        }

        return Math.sqrt(currentX * currentX + currentY * currentY);
    }
}
```

---

## Convert Between Lock Modes

```java
// Upgrade from read to write
long stamp = lock.readLock();
try {
    // ... reading ...

    // Need to write — upgrade the lock
    long writeStamp = lock.tryConvertToWriteLock(stamp);
    if (writeStamp != 0L) {
        // Successfully upgraded to write lock
        stamp = writeStamp;
        // ... writing ...
    } else {
        // Couldn't upgrade — unlock read and get write lock
        lock.unlockRead(stamp);
        stamp = lock.writeLock();
        // ... writing ...
    }
} finally {
    lock.unlock(stamp);
}
```

---

## In an Organization

### Scenario 1: High-Performance Configuration Cache

```java
@Service
public class ConfigurationCache {

    private final StampedLock lock = new StampedLock();
    private volatile Map<String, String> config = new HashMap<>();

    // Optimistic read — zero overhead, millions per second
    public String get(String key) {
        long stamp = lock.tryOptimisticRead();
        String value = config.get(key);

        if (!lock.validate(stamp)) {
            // Rare case: config was updated while we read
            stamp = lock.readLock();
            try {
                value = config.get(key);
            } finally {
                lock.unlockRead(stamp);
            }
        }

        return value;
    }

    // Write — exclusive access
    public void update(String key, String value) {
        long stamp = lock.writeLock();
        try {
            Map<String, String> newConfig = new HashMap<>(config);
            newConfig.put(key, value);
            config = newConfig;  // Volatile write — visible to all threads
        } finally {
            lock.unlockWrite(stamp);
        }
    }

    // Bulk update
    public void updateAll(Map<String, String> updates) {
        long stamp = lock.writeLock();
        try {
            Map<String, String> newConfig = new HashMap<>(config);
            newConfig.putAll(updates);
            config = newConfig;
        } finally {
            lock.unlockWrite(stamp);
        }
    }
}
```

### Scenario 2: Financial Account Balance

```java
public class BankAccount {

    private final StampedLock lock = new StampedLock();
    private volatile BigDecimal balance;
    private volatile BigDecimal lastTransactionAmount;

    // Optimistic read for balance checks (very frequent)
    public BigDecimal getBalance() {
        long stamp = lock.tryOptimisticRead();
        BigDecimal currentBalance = balance;

        if (!lock.validate(stamp)) {
            stamp = lock.readLock();
            try {
                currentBalance = balance;
            } finally {
                lock.unlockRead(stamp);
            }
        }

        return currentBalance;
    }

    // Write for transactions (less frequent)
    public void withdraw(BigDecimal amount) {
        long stamp = lock.writeLock();
        try {
            if (balance.compareTo(amount) < 0) {
                throw new InsufficientFundsException();
            }
            balance = balance.subtract(amount);
            lastTransactionAmount = amount.negate();
        } finally {
            lock.unlockWrite(stamp);
        }
    }
}
```

---

## StampedLock vs ReentrantReadWriteLock

| Feature | StampedLock | ReentrantReadWriteLock |
|---------|-------------|----------------------|
| Optimistic read | ✅ Yes | ❌ No |
| Reentrant | ❌ No | ✅ Yes |
| Read → Write upgrade | ✅ Yes | ❌ No |
| Condition variables | ❌ No | ✅ Yes |
| Performance | Higher (optimistic reads) | Good |
| Use when | Read-heavy, simple operations | Need reentrancy or conditions |

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Not unlocking in finally | Lock held forever on exception | Always use try-finally |
| Using optimistic read incorrectly | Stale data if not validated | Always call `validate()` |
| Trying to use StampedLock reentrantly | Deadlock — it's not reentrant | Use `ReentrantReadWriteLock` if you need reentrancy |
| Using for complex lock logic | Hard to maintain | Use `ReentrantReadWriteLock` for complex scenarios |
| Not checking `tryConvertToWriteLock` return | 0L means upgrade failed | Always check the return value |
| Over-optimizing with optimistic reads | Validation cost may exceed read lock cost | Profile before choosing |
