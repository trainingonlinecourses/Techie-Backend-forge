---
title: Volatile and Synchronized — Memory Visibility
summary: What volatile does and doesn't do, synchronized blocks and their memory semantics, when to use each, and the happens-before guarantees they provide.
order: 4
minutes: 20
topics: [volatile, synchronized, memory-visibility, happens-before, monitor, mutex]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/concurrency/memconsist.html
---

## The Concept, From Zero

Without volatile or synchronized, one thread's writes may never be seen by another thread. The JVM can reorder instructions and cache values in CPU registers.

// BROKEN: one thread may never see the other's write
boolean running = true;

// Thread 1
while (running) { /* work */ }

// Thread 2
running = false;  // Thread 1 may loop forever!


**What this code does — step by step:**

1. FIXED with volatile
2. Thread 1
3. `while (running) { /* work */ }` — always sees the update
4. Thread 2
5. `running = false;` — Thread 1 sees this immediately

The same code, clean:

```java
volatile boolean running = true;

while (running) { /* work */ }

running = false;
```

---

## Volatile

`volatile` guarantees visibility (all threads see the latest write) but NOT atomicity.

volatile int counter = 0;

// Safe: reading is always the latest value
int value = counter;

// NOT safe: increment is not atomic
counter++;  // This is actually: read → increment → write (race condition!)

**Use volatile for:**
- Flags (`running`, `shutdown`)
- Double-checked locking
- Immutable state that changes rarely

---

## Synchronized

`synchronized` guarantees both visibility AND atomicity. It acquires a monitor lock.

synchronized (lock) {
    // Only one thread can execute this block at a time
    counter++;
}

**Use synchronized for:**
- Compound operations (`counter++`)
- Protecting mutable shared state
- When you need both visibility and atomicity

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. 1. Volatile flag
2. `running = false;` — visible to all threads immediately
3. work
4. always exits when stop() is called
5. 2. Volatile for double-checked locking
6. `if (instance == null) {` — first check (no lock)
7. `if (instance == null) {` — second check (with lock)
8. 3. Synchronized counter
9. `counter++;` — safe: atomic + visible
10. `return counter;` — safe: synchronized ensures visibility
11. 4. Synchronized block for fine-grained locking

The same code, clean:

```java
public class VolatileVsSynchronized {

    private volatile boolean running = true;

    public void stop() {
        running = false;
    }

    public void run() {
        while (running) {
        }
    }

    private volatile Instance instance;

    public Instance getInstance() {
        if (instance == null) {
            synchronized (this) {
                if (instance == null) {
                    instance = new Instance();
                }
            }
        }
        return instance;
    }

    private int counter = 0;

    public synchronized void increment() {
        counter++;
    }

    public int getCounter() {
        return counter;
    }

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

