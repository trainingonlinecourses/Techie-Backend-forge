---
title: Synchronized and Monitors — Java's Built-in Locking
summary: The monitor lock, synchronized blocks vs methods, lock contention, reentrant locking, the wait/notify protocol, and why organizations prefer ReentrantLock for production systems.
order: 46
minutes: 22
topics: [synchronized, monitor, lock-contention, reentrant, wait-notify, intrinsic-lock, lock-word]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/concurrency/locksync.html
  - https://docs.oracle.com/javase/specs/jls/se21/html/jls-17.html#jls-17.1
---

# Synchronized and Monitors — Java's Built-in Locking

## The concept

`synchronized` is Java's built-in mechanism for mutual exclusion. It uses a **monitor** — an implicit lock that every object has. When a thread enters a `synchronized` block, it acquires the monitor on the specified object. No other thread can acquire the same monitor until the first thread exits the block.

There are two forms:

```java
// 1. Synchronized method — locks on 'this'
public synchronized void increment() {
    count++;
}

// 2. Synchronized block — locks on any object
public void transfer(Account from, Account to, BigDecimal amount) {
    synchronized (from) {
        synchronized (to) {
            from.debit(amount);
            to.credit(amount);
        }
    }
}
```

**Reentrant:** a thread that already holds a monitor can re-enter it without deadlocking. This is why `synchronized` methods can call other `synchronized` methods on the same object.

## The monitor protocol: wait/notify

Every object has a **wait set** in addition to its monitor. When a thread calls `object.wait()`, it:

1. Releases the monitor.
2. Enters the wait set (goes to sleep).
3. Wakes up when another thread calls `object.notify()` or `object.notifyAll()`.

**Critical rule:** you must hold the monitor before calling `wait()` or `notify()`, and you must check the condition in a `while` loop (not `if`) because of **spurious wakeups**.

```java
public class OrderQueue {

    private final Queue<Order> queue = new LinkedList<>();
    private boolean running = true;

    public synchronized void enqueue(Order order) {
        queue.add(order);
        notify();  // wake one consumer
    }

    public synchronized Order dequeue() throws InterruptedException {
        while (queue.isEmpty() && running) {
            wait();  // releases monitor, sleeps until notified
        }
        return queue.poll();
    }

    public synchronized void shutdown() {
        running = false;
        notifyAll();  // wake ALL waiting consumers so they can exit
    }
}
```

**Why `while` and not `if`?** Because a thread can wake up without being notified (spurious wakeup), or another thread may have consumed the item between `notify()` and this thread running. The `while` loop re-checks the condition.

## Lock contention and performance

`synchronized` has a performance cost: the JVM must acquire and release the monitor, and contended locks force threads to queue. Modern JVMs optimize uncontended locks aggressively (biased locking, thin locks), but **contention is the killer**.

```java
// Contented: 10,000 threads all calling increment()
public class Counter {
    private long count = 0;

    public synchronized void increment() {
        count++;  // every thread queues on this monitor
    }
}
```

**The fix:** reduce lock scope or use a lock-free alternative.

```java
// Fix 1: narrow the synchronized block
public class Counter {
    private long count = 0;

    public void increment() {
        synchronized (this) {
            count++;
        }
        // do other work OUTSIDE the lock
        logMetrics();
    }
}

// Fix 2: use AtomicLong (lock-free)
public class Counter {
    private final AtomicLong count = new AtomicLong(0);

    public void increment() {
        count.incrementAndGet();  // CAS operation — no lock
    }
}
```

## How we use it in organizations

### Scenario 1: synchronized for simple thread-safe singleton

```java
public class DatabaseConnection {
    private static DatabaseConnection instance;

    public static synchronized DatabaseConnection getInstance() {
        if (instance == null) {
            instance = new DatabaseConnection();
        }
        return instance;
    }
}
```

**Problem:** every thread pays the lock cost even after initialization. Better: double-checked locking with `volatile` or use an enum/holder class.

```java
// Better: holder idiom — lazy initialization without locks
public class DatabaseConnection {
    private DatabaseConnection() {}

    private static class Holder {
        static final DatabaseConnection INSTANCE = new DatabaseConnection();
    }

    public static DatabaseConnection getInstance() {
        return Holder.INSTANCE;  // class loading is thread-safe in Java
    }
}
```

### Scenario 2: wait/notify for a work queue

```java
public class WorkQueue<T> {

    private final Queue<T> items = new LinkedList<>();
    private boolean shutdown = false;

    public synchronized void submit(T item) {
        items.add(item);
        notify();
    }

    public synchronized T take() throws InterruptedException {
        while (items.isEmpty() && !shutdown) {
            wait();
        }
        if (shutdown && items.isEmpty()) return null;
        return items.poll();
    }

    public synchronized void shutdown() {
        shutdown = true;
        notifyAll();  // wake all consumers
    }
}

// Producer
queue.submit(processOrder);

// Consumer
while ((order = queue.take()) != null) {
    processOrder(order);
}
```

### Scenario 3: synchronized block for bank transfer (deadlock avoidance)

```java
public void transfer(Account from, Account to, BigDecimal amount) {
    // Always lock in a consistent order (by ID) to prevent deadlock
    Account first  = from.id().compareTo(to.id()) < 0 ? from : to;
    Account second = from.id().compareTo(to.id()) < 0 ? to : from;

    synchronized (first) {
        synchronized (second) {
            from.debit(amount);
            to.credit(amount);
        }
    }
}
```

If thread A locks `from` then tries `to`, and thread B locks `to` then tries `from`, you get a deadlock. Locking in consistent order prevents this.

## ReentrantLock: the modern alternative

`java.util.concurrent.locks.ReentrantLock` provides the same mutual exclusion as `synchronized` but with additional features:

```java
private final ReentrantLock lock = new ReentrantLock();
private final Condition notEmpty = lock.newCondition();

public void enqueue(T item) {
    lock.lock();
    try {
        queue.add(item);
        notEmpty.signal();  // signal specific condition
    } finally {
        lock.unlock();  // ALWAYS in finally — synchronized does this automatically
    }
}

public T dequeue() throws InterruptedException {
    lock.lock();
    try {
        while (queue.isEmpty()) {
            notEmpty.await(5, TimeUnit.SECONDS);  // timed wait — synchronized cannot do this
        }
        return queue.poll();
    } finally {
        lock.unlock();
    }
}
```

**When to prefer ReentrantLock over synchronized:**

| Feature | `synchronized` | `ReentrantLock` |
|---|---|---|
| Timed wait | ❌ | ✅ `await(timeout)` |
| Try-lock (non-blocking) | ❌ | ✅ `tryLock()` |
| Interruptible wait | ❌ | ✅ `lockInterruptibly()` |
| Multiple conditions | ❌ | ✅ `newCondition()` |
| Fairness policy | ❌ | ✅ `new ReentrantLock(true)` |
| Auto-release on exception | ✅ | ❌ (must use `finally`) |

## Common mistakes

| Mistake | Consequence |
|---|---|
| `if` instead of `while` in `wait()` | Spurious wakeup processes invalid state |
| Calling `wait()` without holding the monitor | `IllegalMonitorStateException` |
| Forgetting `unlock()` in `finally` | Lock held forever after exception — deadlock |
| Locking on `String` literals or boxed types | Shared across codebase — unexpected contention |
| Nested `synchronized` blocks in wrong order | Deadlock — two threads hold the other's lock |
| Using `notify()` when multiple threads wait | Only one wakes — use `notifyAll()` for correctness |
