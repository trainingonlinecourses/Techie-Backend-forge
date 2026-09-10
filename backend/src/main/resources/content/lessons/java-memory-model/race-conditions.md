---
title: Race Conditions — Finding and Fixing Concurrency Bugs
summary: What race conditions are, common patterns that cause them, how to detect them, and strategies for prevention using synchronization and atomic variables.
order: 3
minutes: 20
topics: [race-condition, check-then-act, compound-operation, deadlock, atomic]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/concurrency/coord.html
---

## The Concept, From Zero

A race condition happens when the outcome depends on the timing of thread execution. Two threads read the same data, both decide to act, and one thread's work overwrites the other's.

// Race condition: check-then-act
if (map.containsKey(key)) {     // Thread 1 checks: true
    // Thread 2 removes key here!
    return map.get(key);         // Thread 1: NullPointerException
}

---

## Common Race Condition Patterns

### Check-Then-Act

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

### Read-Modify-Write

// ❌ Broken: counter++ is three operations
counter++;  // read → increment → write

// ✅ Fixed with AtomicInteger
AtomicInteger counter = new AtomicInteger(0);
counter.incrementAndGet();  // atomic

### Lazy Initialization

// ❌ Broken: two threads may create two instances
if (instance == null) {
    instance = new Singleton();
}

// ✅ Fixed: synchronized or volatile + double-checked locking

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. 1. Broken: non-atomic compound operation
2. `unsafeCounter++;` — race condition!
3. 2. Fixed: AtomicInteger
4. `safeCounter.incrementAndGet();` — atomic
5. 3. Fixed: synchronized
6. `syncCounter++;` — atomic within synchronized block
7. 4. Check-then-act race
8. ❌ Broken: another thread may create between check and put. If (!cache.containsKey(key)) {. Cache.put(key, computeValue(key)); }. Return cache.get(key);
9. ✅ Fixed: atomic operation
10. Test race condition
11. Unsafe counter
12. `System.out.println("Unsafe: " + demo.unsafeCounter);` — < 1_000_000
13. Safe counter
14. `System.out.println("Safe: " + demo.safeCounter.get());` — exactly 1_000_000

The same code, clean:

```java
import java.util.concurrent.atomic.*;
import java.util.concurrent.*;

public class RaceConditionDemo {

    private int unsafeCounter = 0;

    public void unsafeIncrement() {
        unsafeCounter++;
    }

    private final AtomicInteger safeCounter = new AtomicInteger(0);

    public void safeIncrement() {
        safeCounter.incrementAndGet();
    }

    private int syncCounter = 0;

    public synchronized void syncIncrement() {
        syncCounter++;
    }

    private final ConcurrentHashMap<String, String> cache = new ConcurrentHashMap<>();

    public String getOrCreate(String key) {

        return cache.computeIfAbsent(key, k -> computeValue(k));
    }

    public String computeValue(String key) {
        return "value-" + key;
    }

    public static void main(String[] args) throws InterruptedException {
        RaceConditionDemo demo = new RaceConditionDemo();

        int threads = 10;
        int increments = 100_000;
        ExecutorService pool = Executors.newFixedThreadPool(threads);

        for (int i = 0; i < threads; i++) {
            for (int j = 0; j < increments; j++) {
                pool.submit(demo::unsafeIncrement);
            }
        }
        pool.shutdown();
        pool.awaitTermination(5, TimeUnit.SECONDS);
        System.out.println("Unsafe: " + demo.unsafeCounter);

        pool = Executors.newFixedThreadPool(threads);
        for (int i = 0; i < threads; i++) {
            for (int j = 0; j < increments; j++) {
                pool.submit(demo::safeIncrement);
            }
        }
        pool.shutdown();
        pool.awaitTermination(5, TimeUnit.SECONDS);
        System.out.println("Safe: " + demo.safeCounter.get());
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Inventory race condition


**What this code does — step by step:**

1. ❌ Broken: overselling
2. `int stock = inventory.getStock(productId);` — Thread A reads: 1. Thread B also reads: 1
3. `inventory.setStock(productId, stock - 1);` — Both set to 0
4. ✅ Fixed: atomic decrement
5. In inventory service

The same code, clean:

```java
public void purchase(String productId) {
    int stock = inventory.getStock(productId);
    if (stock > 0) {
        inventory.setStock(productId, stock - 1);
    }
}

public boolean purchase(String productId) {
    return inventory.decrementIfPositive(productId);
}

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

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| `if (!map.containsKey(k)) map.put(k, v)` | Race between check and put | Use computeIfAbsent |
| counter++ with multiple threads | Lost updates | Use AtomicInteger or synchronized |
| Double-checked locking without volatile | Partially constructed object visible | Always use volatile |
| Assuming synchronized is optional | Works sometimes, fails under load | Always synchronize shared state |

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/javase/specs/jls/se17/html/jls-17.html)
