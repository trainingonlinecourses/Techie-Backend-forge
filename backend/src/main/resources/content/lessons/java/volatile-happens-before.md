---
title: Volatile and the Happens-Before Relationship
summary: What volatile actually guarantees at the hardware level, the JMM happens-before rules, double-checked locking with volatile, and why volatile is not a substitute for synchronization.
order: 84
minutes: 20
topics: [volatile, happens-before, memory-barrier, visibility, double-checked-locking, ordering, store-buffer]
docs:
  - https://docs.oracle.com/javase/specs/jls/se21/html/jls-17.html#jls-17.4
  - https://docs.oracle.com/javase/tutorial/essential/concurrency/atomicvars.html
---

# Volatile and the Happens-Before Relationship

## The concept

When a thread writes to a **non-volatile** variable, the value may sit in that thread's CPU cache or store buffer for an indefinite period. Other threads may never see the update — or see a stale value. This is not a bug in Java; it is how modern CPUs work. They optimize for speed by caching variables per-core.

The `volatile` keyword tells the JVM: **every read of this variable goes to main memory, and every write is flushed to main memory immediately.** This guarantees **visibility** — all threads see the latest value.

But volatile does **not** guarantee **atomicity**. `count++` on a volatile variable is not thread-safe because it is three operations: read, increment, write. Two threads can read the same value, both increment, and both write — losing one increment. For atomicity, use `AtomicLong` or `synchronized`.

## The happens-before rules

The Java Memory Model (JMM) defines a set of **happens-before** relationships that determine when one thread's writes are visible to another thread. If action A happens-before action B, then A's writes are guaranteed visible to B.

Key happens-before rules:

1. **Program order:** within a single thread, each action happens-before the next action in program order.
2. **Monitor lock:** an unlock on a monitor happens-before every subsequent lock on that monitor.
3. **Volatile:** a write to a volatile variable happens-before every subsequent read of that volatile variable.
4. **Thread start:** `Thread.start()` happens-before any action in the started thread.
5. **Thread join:** any action in a thread happens-before another thread successfully returns from `join()`.
6. **Transitivity:** if A happens-before B, and B happens-before C, then A happens-before C.


**What this code does — step by step:**

1. Without volatile — thread B may never see the update
2. `boolean ready = false;` — NOT volatile
3. Thread A
4. Thread B
5. `while (!config.ready) {` — may loop forever — no happens-before guarantee
6. With volatile — guaranteed visibility
7. Now Thread B is guaranteed to see ready = true eventually

The same code, clean:

```java
class Config {
    boolean ready = false;
}

config.ready = true;

while (!config.ready) {
    Thread.sleep(100);
}
System.out.println("Started");

class Config {
    volatile boolean ready = false;
}
```

## Double-checked locking with volatile

The classic pattern for lazy initialization without locks:


**What this code does — step by step:**

1. `private static volatile ConfigManager instance;` — MUST be volatile
2. `if (instance == null) {` — first check — no lock
3. `if (instance == null) {` — second check — inside lock
4. `instance = new ConfigManager();` — volatile write
5. `return instance;` — volatile read

The same code, clean:

```java
public class ConfigManager {

    private static volatile ConfigManager instance;

    private Config config;

    private ConfigManager() {
        this.config = loadConfig();
    }

    public static ConfigManager getInstance() {
        if (instance == null) {
            synchronized (ConfigManager.class) {
                if (instance == null) {
                    instance = new ConfigManager();
                }
            }
        }
        return instance;
    }
}
```

**Why must `instance` be volatile?** Without it, Thread B could see a non-null `instance` that points to a partially constructed object — `config` field still null. The `volatile` write in Thread A happens-before the `volatile` read in Thread B, ensuring the constructor's writes are visible.

## Volatile vs synchronized vs atomic

| Operation | `volatile` | `synchronized` | `AtomicLong` |
|---|---|---|---|
| Visibility | ✅ | ✅ | ✅ |
| Atomicity (read-modify-write) | ❌ | ✅ | ✅ |
| Compound operations | ❌ | ✅ | ✅ (`compareAndSet`, `getAndIncrement`) |
| Blocking | No | Yes | No (CAS spin) |
| Use case | Flag, version stamp | Complex critical sections | Counters, sequence generators |

## How we use it in organizations

### Scenario 1: volatile flag for graceful shutdown

public class OrderProcessor {

    private volatile boolean running = true;
    private final BlockingQueue<Order> queue;

    public void start() {
        Thread worker = new Thread(this::processLoop);
        worker.start();
    }

    private void processLoop() {
        while (running) {                      // volatile read
            try {
                Order order = queue.poll(1, TimeUnit.SECONDS);
                if (order != null) process(order);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        System.out.println("Processor stopped gracefully");
    }

    public void shutdown() {
        running = false;                       // volatile write — visible to worker thread
    }
}

### Scenario 2: volatile for double-checked config loading

@Component
public class FeatureFlags {

    private static volatile FeatureFlags instance;

    private final Map<String, Boolean> flags;

    private FeatureFlags() {
        this.flags = loadFromDatabase();
    }

    public static FeatureFlags getInstance() {
        if (instance == null) {
            synchronized (FeatureFlags.class) {
                if (instance == null) {
                    instance = new FeatureFlags();
                }
            }
        }
        return instance;
    }

    public boolean isEnabled(String flag) {
        return flags.getOrDefault(flag, false);
    }
}

### Scenario 3: volatile does NOT protect compound operations


**What this code does — step by step:**

1. BROKEN: volatile does not make count++ atomic
2. `count++;` — read → increment → write: not atomic!
3. Thread A reads count (0), Thread B reads count (0). Thread A writes 1, Thread B writes 1 — lost update!
4. FIX: use AtomicInteger
5. `count.incrementAndGet();` — atomic CAS operation

The same code, clean:

```java
private volatile int count = 0;

public void increment() {
    count++;
}


private final AtomicInteger count = new AtomicInteger(0);

public void increment() {
    count.incrementAndGet();
}
```

## Hardware perspective

On modern CPUs, volatile inserts a **memory barrier** (fence):

- **Store barrier** after a volatile write: flushes the store buffer to main memory.
- **Load barrier** before a volatile read: invalidates the CPU cache, forcing a read from main memory.

This is expensive relative to a normal read/write (roughly 5-10x slower on x86), which is why you should not make every variable volatile. Use it only when visibility across threads is the requirement.

## Common mistakes

| Mistake | Consequence |
|---|---|
| Using volatile for `count++` | Lost updates — volatile is visibility, not atomicity |
| Forgetting volatile in double-checked locking | Thread sees partially constructed object |
| Using volatile instead of `synchronized` for compound state | Race conditions between multiple volatile fields |
| Making every field volatile | Performance degradation — unnecessary memory barriers |
| Assuming volatile is faster than synchronized | For single flags yes, for compound operations no |

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/)
