---
title: Volatile and Synchronized — Memory Visibility
summary: What volatile does and doesn't do, synchronized blocks and their memory semantics, when to use each, and the happens-before guarantees they provide.
order: 3
minutes: 20
topics: [volatile, synchronized, memory-visibility, happens-before, monitor, mutex]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/concurrency/memconsist.html
---

## The Concept, From Zero

Without volatile or synchronized, one thread's writes may never be seen by another thread. The JVM can reorder instructions and cache values in CPU registers.

```java
// BROKEN: one thread may never see the other's write
boolean running = true;

// Thread 1
while (running) { /* work */ }

// Thread 2
running = false;  // Thread 1 may loop forever!
```

```java
// FIXED with volatile
volatile boolean running = true;

// Thread 1
while (running) { /* work */ }  // always sees the update

// Thread 2
running = false;  // Thread 1 sees this immediately
```

---

## Volatile

`volatile` guarantees visibility (all threads see the latest write) but NOT atomicity.

```java
volatile int counter = 0;

// Safe: reading is always the latest value
int value = counter;

// NOT safe: increment is not atomic
counter++;  // This is actually: read → increment → write (race condition!)
```

**Use volatile for:**
- Flags (`running`, `shutdown`)
- Double-checked locking
- Immutable state that changes rarely

---

## Synchronized

`synchronized` guarantees both visibility AND atomicity. It acquires a monitor lock.

```java
synchronized (lock) {
    // Only one thread can execute this block at a time
    counter++;
}
```

**Use synchronized for:**
- Compound operations (`counter++`)
- Protecting mutable shared state
- When you need both visibility and atomicity

---

## Line-by-Line Walkthrough

```java
public class VolatileVsSynchronized {

    // 1. Volatile flag
    private volatile boolean running = true;

    public void stop() {
        running = false;  // visible to all threads immediately
    }

    public void run() {
        while (running) {
            // work
        }
        // always exits when stop() is called
    }

    // 2. Volatile for double-checked locking
    private volatile Instance instance;

    public Instance getInstance() {
        if (instance == null) {              // first check (no lock)
            synchronized (this) {
                if (instance == null) {      // second check (with lock)
                    instance = new Instance();
                }
            }
        }
        return instance;
    }

    // 3. Synchronized counter
    private int counter = 0;

    public synchronized void increment() {
        counter++;  // safe: atomic + visible
    }

    public int getCounter() {
        return counter;  // safe: synchronized ensures visibility
    }

    // 4. Synchronized block for fine-grained locking
    private final Object lock = new Object();
    private int balance = 1000;

    public void transfer(int amount) {
        synchronized (lock) {
            if (balance >= amount) {
                balance -= amount;
            }
        }
    }
}
```

---

## Volatile vs Synchronized

| Aspect | Volatile | Synchronized |
|--------|----------|-------------|
| Visibility | ✅ Yes | ✅ Yes |
| Atomicity | ❌ No | ✅ Yes |
| Performance | Fast (no lock) | Slower (monitor) |
| Use for | Flags, simple state | Compound operations |
| Blocks threads | No | Yes (mutual exclusion) |

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using volatile for `counter++` | Race condition — not atomic | Use synchronized or AtomicInteger |
| Using synchronized for flags | Unnecessary overhead | Use volatile |
| Forgetting volatile in double-checked locking | May see partially constructed object | Always use volatile |
| Synchronizing on `this` | External code can lock on same monitor | Use private final lock object |
