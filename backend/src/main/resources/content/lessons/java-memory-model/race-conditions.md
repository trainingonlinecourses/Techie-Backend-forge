---
title: Race Conditions — Finding and Fixing Concurrency Bugs
summary: What race conditions are, common patterns that cause them, how to detect them, and strategies for prevention using synchronization and atomic variables.
order: 4
minutes: 20
topics: [race-condition, check-then-act, compound-operation, deadlock, atomic]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/concurrency/coord.html
---

## The Concept, From Zero

A race condition happens when the outcome depends on the timing of thread execution. Two threads read the same data, both decide to act, and one thread's work overwrites the other's.

```java
// Race condition: check-then-act
if (map.containsKey(key)) {     // Thread 1 checks: true
    // Thread 2 removes key here!
    return map.get(key);         // Thread 1: NullPointerException
}
```

---

## Common Race Condition Patterns

### Check-Then-Act

```java
// ❌ Broken
if (account.getBalance() >= amount) {
    account.withdraw(amount);  // Another thread may have withdrawn between check and action
}

// ✅ Fixed with synchronized
synchronized (account) {
    if (account.getBalance() >= amount) {
        account.withdraw(amount);
    }
}
```

### Read-Modify-Write

```java
// ❌ Broken: counter++ is three operations
counter++;  // read → increment → write

// ✅ Fixed with AtomicInteger
AtomicInteger counter = new AtomicInteger(0);
counter.incrementAndGet();  // atomic
```

### Lazy Initialization

```java
// ❌ Broken: two threads may create two instances
if (instance == null) {
    instance = new Singleton();
}

// ✅ Fixed: synchronized or volatile + double-checked locking
```

---

## Line-by-Line Walkthrough

```java
import java.util.concurrent.atomic.*;
import java.util.concurrent.*;

public class RaceConditionDemo {

    // 1. Broken: non-atomic compound operation
    private int unsafeCounter = 0;

    public void unsafeIncrement() {
        unsafeCounter++;  // race condition!
    }

    // 2. Fixed: AtomicInteger
    private final AtomicInteger safeCounter = new AtomicInteger(0);

    public void safeIncrement() {
        safeCounter.incrementAndGet();  // atomic
    }

    // 3. Fixed: synchronized
    private int syncCounter = 0;

    public synchronized void syncIncrement() {
        syncCounter++;  // atomic within synchronized block
    }

    // 4. Check-then-act race
    private final ConcurrentHashMap<String, String> cache = new ConcurrentHashMap<>();

    public String getOrCreate(String key) {
        // ❌ Broken: another thread may create between check and put
        // if (!cache.containsKey(key)) {
        //     cache.put(key, computeValue(key));
        // }
        // return cache.get(key);

        // ✅ Fixed: atomic operation
        return cache.computeIfAbsent(key, k -> computeValue(k));
    }

    public String computeValue(String key) {
        return "value-" + key;
    }

    public static void main(String[] args) throws InterruptedException {
        RaceConditionDemo demo = new RaceConditionDemo();

        // Test race condition
        int threads = 10;
        int increments = 100_000;
        ExecutorService pool = Executors.newFixedThreadPool(threads);

        // Unsafe counter
        for (int i = 0; i < threads; i++) {
            for (int j = 0; j < increments; j++) {
                pool.submit(demo::unsafeIncrement);
            }
        }
        pool.shutdown();
        pool.awaitTermination(5, TimeUnit.SECONDS);
        System.out.println("Unsafe: " + demo.unsafeCounter);  // < 1_000_000

        // Safe counter
        pool = Executors.newFixedThreadPool(threads);
        for (int i = 0; i < threads; i++) {
            for (int j = 0; j < increments; j++) {
                pool.submit(demo::safeIncrement);
            }
        }
        pool.shutdown();
        pool.awaitTermination(5, TimeUnit.SECONDS);
        System.out.println("Safe: " + demo.safeCounter.get());  // exactly 1_000_000
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Inventory race condition

```java
// ❌ Broken: overselling
public void purchase(String productId) {
    int stock = inventory.getStock(productId);  // Thread A reads: 1
    // Thread B also reads: 1
    if (stock > 0) {
        inventory.setStock(productId, stock - 1);  // Both set to 0
    }
}

// ✅ Fixed: atomic decrement
public boolean purchase(String productId) {
    return inventory.decrementIfPositive(productId);
}

// In inventory service
public boolean decrementIfPositive(String productId) {
    AtomicLong stock = stockMap.get(productId);
    long current;
    do {
        current = stock.get();
        if (current <= 0) return false;
    } while (!stock.compareAndSet(current, current - 1));
    return true;
}
```

### Scenario 2: Double-checked locking

```java
// ✅ Correct implementation
public class Config {
    private static volatile Config instance;

    public static Config getInstance() {
        if (instance == null) {                    // first check (no lock)
            synchronized (Config.class) {
                if (instance == null) {            // second check (with lock)
                    instance = new Config();       // volatile prevents reordering
                }
            }
        }
        return instance;
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| `if (!map.containsKey(k)) map.put(k, v)` | Race between check and put | Use computeIfAbsent |
| counter++ with multiple threads | Lost updates | Use AtomicInteger or synchronized |
| Double-checked locking without volatile | Partially constructed object visible | Always use volatile |
| Assuming synchronized is optional | Works sometimes, fails under load | Always synchronize shared state |
