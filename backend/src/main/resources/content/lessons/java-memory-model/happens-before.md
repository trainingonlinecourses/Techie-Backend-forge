---
title: Happens-Before Relationship — Why Threads Don't See Each Other's Writes
summary: What the Java Memory Model is, happens-before rules, visibility problems, volatile, synchronized, and how organizations write correct concurrent code.
order: 1
minutes: 30
topics: [memory-model, happens-before, visibility, volatile, synchronized, java-concurrency]
docs:
  - https://docs.oracle.com/javase/specs/jls/se17/html/jls-17.html
---

## The Concept, From Zero

When multiple threads access shared data, the JVM and CPU can reorder operations for performance. This means a thread might not see another thread's writes immediately:

```java
// DANGEROUS: No happens-before guarantee
class SharedData {
    boolean ready = false;
    int data = 0;
}

// Thread 1
sharedData.data = 42;
sharedData.ready = true;        // Might be reordered before data = 42!

// Thread 2
while (!sharedData.ready) {}    // Might never see ready = true
System.out.println(sharedData.data);  // Might print 0 instead of 42!
```

The **Java Memory Model (JMM)** defines the rules for when one thread's writes become visible to other threads. The key concept is **happens-before** — if action A happens-before action B, then A's effects are guaranteed visible to B.

---

## The Happens-Before Rules

1. **Program order rule:** Within a single thread, each action happens-before the next action
2. **Monitor lock rule:** An unlock happens-before every subsequent lock on the same monitor
3. **Volatile variable rule:** A write to a volatile field happens-before every subsequent read of that field
4. **Thread start rule:** `Thread.start()` happens-before any action in the started thread
5. **Thread termination rule:** Any action in a thread happens-before any other thread detects it terminated (via `join()` or `isAlive()`)
6. **Transitivity:** If A happens-before B, and B happens-before C, then A happens-before C

---

## Line-by-Line Walkthrough

```java
import java.util.concurrent.*;

public class HappensBeforeDemo {
    // Line 1: Problem — no synchronization
    static boolean running = true;
    static int counter = 0;

    static void noSyncProblem() throws InterruptedException {
        Thread worker = new Thread(() -> {
            while (running) {        // Might cache 'running' in a register
                counter++;           // Might not be visible to main thread
            }
            System.out.println("Worker stopped. Counter: " + counter);
        });
        worker.start();
        Thread.sleep(100);
        running = false;             // Might not be seen by worker thread!
        worker.join();
        // Counter might be wrong!
    }

    // Line 2: Fix with volatile — ensures visibility
    static volatile boolean runningVolatile = true;

    static void volatileFix() throws InterruptedException {
        Thread worker = new Thread(() -> {
            while (runningVolatile) {
                // volatile write in main thread is guaranteed visible
            }
            System.out.println("Worker stopped (volatile)");
        });
        worker.start();
        Thread.sleep(100);
        runningVolatile = false;     // volatile write → visible to worker
        worker.join();
    }

    // Line 3: Fix with synchronized — ensures both visibility and atomicity
    static class Counter {
        private int count = 0;

        // synchronized ensures happens-before:
        // 1. All writes before unlock are visible to next lock
        public synchronized void increment() {
            count++;  // atomic AND visible
        }

        public synchronized int get() {
            return count;
        }
    }

    // Line 4: Fix with AtomicInteger — lock-free thread safety
    static java.util.concurrent.atomic.AtomicInteger atomicCounter =
        new java.util.concurrent.atomic.AtomicInteger(0);

    // Line 5: Happens-before with Thread.start()
    static String message = null;

    static void threadStartRule() throws InterruptedException {
        Thread printer = new Thread(() -> {
            // message = "Hello" happens-before this lambda runs
            // because Thread.start() happens-before any action in started thread
            System.out.println(message);  // guaranteed to print "Hello"
        });

        message = "Hello";   // This write happens-before Thread.start()
        printer.start();      // Thread.start() happens-before printer thread runs
        printer.join();
    }

    // Line 6: Happens-before with join()
    static int result = 0;

    static void joinRule() throws InterruptedException {
        Thread calculator = new Thread(() -> {
            result = 42;     // This write happens-before join() returns
        });

        calculator.start();
        calculator.join();   // join() returns → all writes in calculator thread are visible

        System.out.println(result);  // guaranteed to print 42
    }

    public static void main(String[] args) throws InterruptedException {
        System.out.println("=== Volatile Fix ===");
        volatileFix();

        System.out.println("\n=== Counter with Synchronized ===");
        Counter counter = new Counter();
        Thread[] threads = new Thread[10];
        for (int i = 0; i < 10; i++) {
            threads[i] = new Thread(() -> {
                for (int j = 0; j < 1000; j++) counter.increment();
            });
            threads[i].start();
        }
        for (Thread t : threads) t.join();
        System.out.println("Final count: " + counter.get());  // 10000

        System.out.println("\n=== Thread Start Rule ===");
        threadStartRule();

        System.out.println("\n=== Join Rule ===");
        joinRule();
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Graceful shutdown

```java
public class GracefulShutdown {
    private volatile boolean shutdownRequested = false;

    public void requestShutdown() {
        shutdownRequested = true;  // volatile write — visible to worker
    }

    public void run() {
        while (!shutdownRequested) {  // volatile read — sees the write
            processNextItem();
        }
        cleanup();
    }
}
```

### Scenario 2: Double-checked locking (correct version)

```java
public class Singleton {
    private static volatile Singleton instance;  // volatile is essential!

    public static Singleton getInstance() {
        if (instance == null) {                    // First check (no lock)
            synchronized (Singleton.class) {
                if (instance == null) {            // Second check (with lock)
                    instance = new Singleton();    // volatile write ensures visibility
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
| Using `volatile` for compound operations | Not atomic: `count++` | Use `synchronized` or `AtomicInteger` |
| Assuming `System.out.println` is synchronized | It is, but your data might not be | Ensure happens-before before printing |
| Using `Thread.sleep()` for synchronization | Sleep doesn't guarantee visibility | Use `volatile`, `synchronized`, or `join()` |
| Forgetting happens-before with `volatile` | Race conditions | Understand the JMM rules |
| Relying on execution order for visibility | CPU/JVM can reorder | Use explicit synchronization |
