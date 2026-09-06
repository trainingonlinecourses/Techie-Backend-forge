---
title: Thread Lifecycle & States — How Threads Actually Live and Die
summary: New, Runnable, Blocked, Waiting, Timed-Waiting, Terminated — the six Thread.State values and the transitions between them, what blocks a thread, what wakes it, and how to read a thread dump like a clinician reads a pulse.
order: 1
minutes: 22
topics: [thread-lifecycle, thread-states, thread-dump, thread-creation, isAlive, interrupted, Thread.start, Runnable, ThreadGroup]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Thread.State.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Thread.html
---

## The Concept, From Zero

Every Java thread has a **lifecycle** — a sequence of states it passes through from the moment it is created until the moment it dies. If you do not understand the lifecycle, you cannot debug concurrency bugs, because the bug is almost always "a thread is in the wrong state at the wrong time."

The Java Virtual Machine defines exactly **six thread states**, exposed as the enum `Thread.State`:

| State | Meaning |
|---|---|
| `NEW` | The thread object exists, but `start()` has not been called yet. No OS thread has been created. |
| `RUNNABLE` | The thread is either running on a CPU core, or ready to run and waiting for the scheduler to pick it. In Java, both "running" and "ready" are lumped into `RUNNABLE`. |
| `BLOCKED` | The thread is trying to enter a synchronized block or method, but another thread holds the lock. It is blocked on the **monitor lock**. |
| `WAITING` | The thread called `Object.wait()`, `Thread.join()`, or `LockSupport.park()` with no timeout. It will not wake up until another thread calls `notify()`/`notifyAll()`, the joined thread dies, or someone calls `unpark()`. |
| `TIMED_WAITING` | Same as `WAITING`, but with a timeout — `Thread.sleep(long)`, `Object.wait(long)`, `Thread.join(long)`, or `LockSupport.parkNanos`/`parkUntil`. The thread wakes when the timeout expires or when notified. |
| `TERMINATED` | The thread's `run()` method finished (or threw an uncaught exception). The OS thread is gone. The `Thread` object still exists in Java, but it is dead. |

The key insight: **a thread never goes directly from `NEW` to `RUNNABLE` in application code.** You call `start()`, the JVM creates the OS thread, and the thread moves to `RUNNABLE`. From `RUNNABLE`, the thread can transition to `BLOCKED`, `WAITING`, or `TIMED_WAITING` depending on what it does. From any of those blocked/waiting states, it can return to `RUNNABLE` when the blocking condition clears. The only way out of the lifecycle is to `TERMINATED`.

A common beginner mistake is to think that calling `thread.run()` starts a new thread. It does not. `thread.run()` is just a plain method call on the current thread. Only `thread.start()` asks the JVM to create a new thread of execution. Let me make that concrete.

```java
public class ThreadStartDemo {
    public static void main(String[] args) {
        Thread t = new Thread(() -> {
            System.out.println("running in thread: " + Thread.currentThread().getName());
        });

        System.out.println("state before start: " + t.getState());   // NEW
        t.start();                                                    // asks JVM to create a new thread
        System.out.println("state after start: " + t.getState());    // RUNNABLE (or TIMED_WAITING briefly)

        try {
            t.join();                                                // wait for the thread to terminate
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        System.out.println("state after join: " + t.getState());     // TERMINATED
    }
}
```

Line by line:

- **`Thread t = new Thread(...)`** — creates a `Thread` object in the `NEW` state. At this point, no OS thread exists. The lambda is the `Runnable` that will run when the thread starts.
- **`t.getState()`** returns `NEW` because `start()` has not been called. The thread object exists, but it is not alive.
- **`t.start()`** — the critical call. This asks the JVM to create a new thread of execution and run the `Runnable`'s `run()` method in that new thread. After `start()` returns, the new thread is `RUNNABLE` (or possibly still transitioning). **You can call `start()` only once on a Thread object.** A second call throws `IllegalThreadStateException`.
- **`t.getState()` after `start()`** — typically `RUNNABLE`, but the exact state depends on timing. The thread may already be running, or it may be queued waiting for a CPU slice. Either way, Java reports `RUNNABLE`.
- **`t.join()`** — the current thread (main) blocks until `t` terminates. This puts main into `WAITING` (or `TIMED_WAITING` if you pass a timeout). When `t` finishes, main wakes up.
- **`t.getState()` after `join()`** — `TERMINATED`. The thread has finished. Its `run()` method has returned.

The `join()` call is how one thread waits for another. Without it, main would print "state after start" and exit, possibly before the new thread even ran. In a short program, the JVM might shut down before the background thread gets a chance to run. `join()` prevents that.

Now let me show the lifecycle transitions through `sleep` and `wait`/`notify`, because that is where most bugs live.

```java
public class ThreadStateTransitions {
    public static void main(String[] args) throws InterruptedException {
        Object lock = new Object();

        Thread waiter = new Thread(() -> {
            synchronized (lock) {
                try {
                    System.out.println("WAITING: " + Thread.currentThread().getName()
                        + " -> " + Thread.currentThread().getState());
                    lock.wait();   // releases the lock and waits to be notified
                    System.out.println("woke up: " + Thread.currentThread().getState());
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        }, "waiter");

        waiter.start();
        Thread.sleep(50);  // give the waiter time to enter wait()

        System.out.println("waiter is now: " + waiter.getState());   // WAITING

        synchronized (lock) {
            lock.notify();   // wake the waiter
        }

        waiter.join();
        System.out.println("waiter finished: " + waiter.getState()); // TERMINATED
    }
}
```

Line by line:

- **`synchronized (lock) { lock.wait(); }`** — the thread acquires the monitor for `lock`, then calls `wait()`. `wait()` does two things: (1) it releases the lock, and (2) puts the thread into the `WAITING` state. The thread will not become `RUNNABLE` again until another thread calls `lock.notify()` or `lock.notifyAll()` **and** the waiting thread reacquires the lock.
- **`Thread.sleep(50)` in main** — gives the waiter time to call `wait()` before main calls `notify()`. Without this sleep, main might call `notify()` before the waiter called `wait()`, and the notification would be lost — the waiter would wait forever. This is a classic race condition.
- **`waiter.getState()` after the sleep** — `WAITING`, because the waiter is parked inside `lock.wait()`.
- **`lock.notify()`** — wakes up one thread waiting on `lock`. The waiter moves from `WAITING` back toward `RUNNABLE`, but it must first reacquire the monitor. Since main still holds the monitor (it is inside the `synchronized` block), the waiter is actually `BLOCKED` until main exits the synchronized block.
- **`waiter.join()`** — main waits for the waiter to finish.

This is the full cycle: `NEW → (start) → RUNNABLE → (wait) → WAITING → (notify + reacquire lock) → RUNNABLE → (run finishes) → TERMINATED`.

### What Blocks a Thread? A Catalog

The three blocking states have specific causes. If you see a thread in `BLOCKED`, `WAITING`, or `TIMED_WAITING`, you should be able to say why.

**`BLOCKED`** — the thread wants a monitor lock that another thread holds. The causes:
- Entering a `synchronized` method or block whose lock is held by another thread.
- Re-entering a `synchronized` block after calling `Object.wait()` — the thread must reacquire the lock before `wait()` returns.

**`WAITING`** — the thread is waiting for a specific event with no timeout. The causes:
- `Object.wait()` — waiting to be notified on a monitor.
- `Thread.join()` — waiting for another thread to die.
- `LockSupport.park()` — a low-level park used by locks and synchronizers.
- `ForkJoinPool.ManagedBlocker` — the fork/join framework's cooperative blocking.

**`TIMED_WAITING`** — waiting with a timeout. The causes:
- `Thread.sleep(long)` — the thread is sleeping for a fixed time. `sleep` does **not** release any locks the thread holds. If a thread holds a lock and sleeps, every other thread that wants that lock is blocked. This is a common source of deadlocks in beginner code.
- `Object.wait(long)` — waiting with a timeout.
- `Thread.join(long)` — waiting for a thread with a timeout.
- `LockSupport.parkNanos`/`parkUntil` — timed park.

A critical rule: **`sleep()` and `wait()` are not the same.** `sleep()` does not release locks; `wait()` does. This is the single most important distinction to internalize.

```java
public class SleepVsWait {
    static final Object lock = new Object();

    public static void main(String[] args) throws InterruptedException {
        new Thread(() -> badSleep()).start();   // holds lock while sleeping — blocks everyone
        Thread.sleep(10);
        new Thread(() -> goodWait()).start();   // releases lock while waiting — lets others in
    }

    static void badSleep() {
        synchronized (lock) {
            System.out.println("badSleep acquired lock, now sleeping 3s...");
            try { Thread.sleep(3000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            System.out.println("badSleep awake — during the sleep, no one else could enter this block");
        }
    }

    static void goodWait() {
        synchronized (lock) {
            System.out.println("goodWait acquired lock, now waiting 1s (lock is released during wait)...");
            try { lock.wait(1000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            System.out.println("goodWait woke up — the lock was released during wait, so others could use it");
        }
    }
}
```

Line by line:

- **`badSleep` acquires the lock inside `synchronized`, then sleeps for 3 seconds.** During those 3 seconds, the thread holds the lock. Any other thread that enters `synchronized (lock)` will block on `BLOCKED`. `sleep()` does not release the lock.
- **`goodWait` acquires the lock, then calls `lock.wait(1000)`.** `wait()` releases the lock immediately and puts the thread into `TIMED_WAITING`. During that 1 second, other threads can enter the synchronized block. When the timeout expires (or a `notify` comes), the thread wakes and **reacquires the lock** before `wait()` returns.
- The output order shows the difference: `badSleep` blocks anyone else from using `lock` for 3 seconds; `goodWait` releases the lock during its wait.

### Thread Creation — Three Ways and When to Use Each

There are three historical ways to create a thread, and one modern way. Understanding all of them matters because production code mixes them.

**1. Subclass `Thread`** — override `run()`. Simple, but limited: you can only subclass one class, so your thread cannot extend anything else. Rarely used in production.

```java
class Worker extends Thread {
    private final String task;
    Worker(String task) { this.task = task; }
    @Override
    public void run() {
        System.out.println(task + " done by " + getName());
    }
}
// usage:
new Worker("job-1").start();
```

**2. Implement `Runnable` and pass it to `Thread`** — the classic approach. Separates the task (what to do) from the thread (how to run it). Preferred over subclassing Thread.

```java
Runnable job = () -> System.out.println("job done by " + Thread.currentThread().getName());
new Thread(job, "worker-1").start();
```

**3. `ThreadFactory` / `ExecutorService`** — in production, you almost never create raw `Thread` objects. You use an `ExecutorService` (thread pool), which creates threads via a `ThreadFactory`. This is how Spring and every modern backend creates threads. The pool manages lifecycle, reuse, and limits.

```java
ExecutorService pool = Executors.newFixedThreadPool(4,
    r -> {
        Thread t = new Thread(r, "pool-worker");
        t.setDaemon(false);
        return t;
    });
pool.submit(() -> System.out.println("running in pool"));
pool.shutdown();
```

**4. Virtual threads (Java 21, `Thread.startVirtualThread`)** — the modern default for I/O-bound work. Millions of virtual threads can run on a few carrier threads. We will cover these in the Java 21 module. For CPU-bound work, stick with platform threads.

### `isAlive()`, `interrupted()`, and `isInterrupted()` — The Thread Status API

Three methods tell you whether a thread is alive and whether it has been interrupted. They are easy to confuse.

| Method | What it checks | Who it affects |
|---|---|---|
| `thread.isAlive()` | Is the thread started and not yet terminated? Returns `true` for `RUNNABLE`, `BLOCKED`, `WAITING`, `TIMED_WAITING`. Returns `false` for `NEW` and `TERMINATED`. | Read-only. |
| `Thread.interrupted()` | Is the **current** thread's interrupt flag set? **Clears the flag** after checking. | Clears the current thread's flag. |
| `thread.isInterrupted()` | Is **this** thread's interrupt flag set? Does **not** clear the flag. | Read-only. |

The interrupt flag is how one thread asks another to stop. You do not force a thread to stop — there is no `Thread.stop()` in modern Java (it was deprecated because it could leave objects in inconsistent states). Instead, you set the interrupt flag, and the target thread checks it and exits cooperatively.

```java
public class InterruptDemo {
    public static void main(String[] args) throws InterruptedException {
        Thread worker = new Thread(() -> {
            while (!Thread.currentThread().isInterrupted()) {
                System.out.println("working...");
                try {
                    Thread.sleep(500);
                } catch (InterruptedException e) {
                    // sleep was interrupted — the flag was cleared by the JVM,
                    // so we restore it and break
                    Thread.currentThread().interrupt();
                    break;
                }
            }
            System.out.println("worker exiting, interrupted: " + Thread.currentThread().isInterrupted());
        }, "worker");

        worker.start();
        Thread.sleep(2000);
        worker.interrupt();   // polite request to stop
        worker.join();
    }
}
```

Line by line:

- **`while (!Thread.currentThread().isInterrupted())`** — the worker checks its own interrupt flag each loop iteration. If the flag is set, the loop exits and the thread terminates.
- **`Thread.sleep(500)`** — `sleep` is interruptible. If the thread is interrupted while sleeping, `sleep` throws `InterruptedException` **and clears the interrupt flag**. This is the one place the JVM silently clears the flag.
- **`Thread.currentThread().interrupt()` in the catch block** — restores the interrupt flag after `sleep` cleared it. This is the standard idiom: catch `InterruptedException`, restore the flag, and abort. If you swallow the exception without restoring the flag, the caller down the stack cannot tell the thread was interrupted.
- **`worker.interrupt()` in main** — sets the worker's interrupt flag. The worker's next check of `isInterrupted()` returns `true`, and it exits.

The golden rule: **never swallow `InterruptedException` without restoring the interrupt flag.** Swallowing it breaks the cooperative cancellation contract and makes your thread unresponsive to shutdown.

### Daemon vs User Threads — What Keeps the JVM Alive

When the JVM starts, the main thread is a **user thread** (non-daemon). The JVM shuts down when **all user threads have terminated**. Daemon threads are background threads that do not prevent shutdown — when only daemon threads remain, the JVM exits.

```java
public class DaemonDemo {
    public static void main(String[] args) throws InterruptedException {
        Thread daemon = new Thread(() -> {
            while (true) {
                try {
                    System.out.println("daemon working...");
                    Thread.sleep(500);
                } catch (InterruptedException e) { break; }
            }
        }, "daemon");
        daemon.setDaemon(true);   // mark as daemon BEFORE starting
        daemon.start();

        Thread.sleep(2000);
        System.out.println("main exiting — daemon will be aborted even though its loop is infinite");
    }
}
```

Line by line:

- **`daemon.setDaemon(true)`** — marks the thread as a daemon. This must be called **before** `start()`. Calling it after `start()` throws `IllegalThreadStateException`.
- When main (a user thread) finishes after 2 seconds, the JVM checks: are there any user threads still running? No. Are there daemon threads? Yes, the daemon is still looping. The JVM **aborts the daemon** and exits. The daemon's infinite loop does not keep the JVM alive.

This matters for background services: a thread that runs Spring's application context, or a thread that processes a queue, should be a user thread so the JVM does not exit prematurely. A thread that just logs metrics or cleans up temporary files can be a daemon. The default (inherited from the creating thread) is user thread; `setDaemon(false)` is the default.

### Thread Groups — Hierarchical Collections of Threads (Legacy)

A `ThreadGroup` is a named collection of threads, organized hierarchically. Every thread belongs to a thread group (the main thread's group is "main"). Thread groups can be used to:
- Apply `uncaughtException` handlers to a whole group of threads.
- Enumerate the threads in a group (for monitoring or shutdown).
- Set a maximum priority for all threads in the group.

Thread groups are **largely legacy** — they are not used much in modern code, and they have some known weaknesses (e.g., they are not thread-safe for some operations, and security managers are gone in modern Java). But they are still in the API, and you will see them in older codebases and in thread dumps.

```java
public class ThreadGroupDemo {
    public static void main(String[] args) {
        ThreadGroup workers = new ThreadGroup("workers");

        Thread t1 = new Thread(workers, () -> {
            try { Thread.sleep(10000); } catch (InterruptedException e) {}
        }, "worker-1");
        Thread t2 = new Thread(workers, () -> {
            try { Thread.sleep(10000); } catch (InterruptedException e) {}
        }, "worker-2");

        t1.start(); t2.start();

        System.out.println("group: " + workers.getName());
        System.out.println("active count: " + workers.activeCount());
        System.out.println("parent: " + workers.getParent().getName());

        workers.list();   // prints all threads in the group to stdout

        Thread.setDefaultUncaughtExceptionHandler((t, ex) ->
            System.out.println("unhandled in " + t.getName() + ": " + ex));
    }
}
```

Line by line:

- **`new ThreadGroup("workers")`** — creates a thread group. The group has a parent (the group of the thread that created it, usually "main").
- **`new Thread(workers, runnable, name)`** — creates a thread that belongs to the `workers` group. The thread inherits the group's maximum priority and daemon status (unless overridden).
- **`workers.activeCount()`** — an estimate of the number of active threads in the group. It is an estimate because threads can be created or destroyed concurrently.
- **`workers.list()`** — prints the group's threads and subgroups to `System.out`. Useful for debugging, not for logic.
- **`setDefaultUncaughtExceptionHandler`** — sets a handler that catches uncaught exceptions from any thread. You can also set a handler per-thread or per-thread-group. In production, you set this to log the exception and possibly alert.

### Reading a Thread Dump — The Practical Skill

When a production Java application hangs or has a performance problem, the first diagnostic artifact is a **thread dump**. It lists every thread, its state, its stack trace, and (for blocked threads) what lock it is waiting for. You read it to find deadlocks, contended locks, and threads stuck in the wrong state.

You can get a thread dump with `jstack <pid>`, `kill -3 <pid>` (on Unix), or via JMX. Here is a simplified example and how to read it.

```
"pool-1-thread-2" #12 prio=5 os_prio=0 tid=0x00007f... nid=0x1a30 waiting on condition
   java.lang.Thread.State: WAITING (parking)
        at jdk.internal.misc.Unsafe.park(Native Method)
        - parking to wait for  <0x000000076b8c2a10> (a java.util.concurrent.locks.ReentrantLock$NonfairSync)
        at java.util.concurrent.locks.LockSupport.park(java.base@21.0.2/...CompletableFuture.java:207)
        ...
"main" #1 prio=5 os_prio=0 tid=0x00007f... nid=0x1a2e waiting on condition
   java.lang.Thread.State: WAITING (join)
        at java.lang.Thread.join(java.base@21.0.2/Thread.java:80...)
        ...
"worker" #13 prio=5 os_prio=0 tid=0x00007f... nid=0x1a31 BLOCKED (on object monitor)
   java.lang.Thread.State: BLOCKED (on object monitor)
        at ThreadStateTransitions.badSleep(ThreadStateTransitions.java:25)
        - waiting to lock <0x000000076b8c2a10> (a java.lang.Object)
```

Line by line of the reading:

- **`"pool-1-thread-2"`** — the thread name. Naming threads is important; "Thread-1" tells you nothing. "pool-1-thread-2" tells you it came from a pool.
- **`WAITING (parking)`** — the thread is parked on a `LockSupport.park()` call. It is waiting for something to call `unpark`. The line below tells you what: it is parking to wait for a `ReentrantLock` sync object. This is typical for threads waiting on `CompletableFuture`, `Lock`, or `Semaphore`.
- **`WAITING (join)`** — the `main` thread is waiting for another thread to finish via `join()`.
- **`BLOCKED (on object monitor)`** — the `worker` thread is blocked trying to acquire a monitor lock. The line below shows the source: `badSleep` at line 25, and it is "waiting to lock" a specific object. This is the thread that is stuck because `badSleep` held the lock while sleeping.

When you see `BLOCKED` on many threads all waiting for the same lock, you have a contended lock — a bottleneck. When you see a cycle of threads each holding one lock and waiting for another, you have a deadlock. Thread dumps are how you find both.

### Where This Shows Up in an Organization

Understanding thread lifecycle is not academic — it is the daily work of a backend team.

- **Reading thread dumps during incidents.** When a service stops responding, on-call engineers grab a thread dump. If you do not understand `BLOCKED` vs `WAITING` vs `RUNNABLE`, you cannot interpret the dump. The difference between "the thread is waiting for a downstream call (normal `WAITING`)" and "the thread is deadlocked (two `BLOCKED` threads each holding a lock the other needs)" is the difference between waiting for a slow downstream and paging the on-call programmer.
- **Debugging a thread that "never finishes."** A thread that is `WAITING` forever because a `notify()` was lost (the classic `wait`/`notify` race), or `BLOCKED` forever because a lock was never released (an exception skipped the unlock), is a bug. The lifecycle tells you which.
- **Writing shutdown-safe services.** A service that creates threads must shut them down cleanly. User threads keep the JVM alive; if you create a thread and never stop it, the JVM never exits. If you use `ExecutorService`, you call `shutdown()` and then `awaitTermination()`. If you forget, the service appears to "hang" on shutdown.
- **Choosing between `sleep` and `wait`.** A thread that sleeps while holding a lock blocks everyone else. This shows up in slow endpoints, timeouts, and thread dumps full of `BLOCKED` threads. The fix is usually to move the sleep outside the lock, or replace sleep with `wait`/`notify` or a `Condition`.

### Common Mistakes

| Mistake | Why it happens | Fix |
|---|---|
| Calling `thread.run()` instead of `thread.start()` | Both are methods on `Thread`; the names are similar | Call `start()` to run in a new thread; call `run()` only if you want it on the current thread |
| Calling `start()` twice on the same `Thread` | Thread objects are not reusable; `start()` can be called once | Create a new `Thread` (or use a pool) for each unit of work |
| Holding a lock while sleeping | Using `Thread.sleep()` inside a `synchronized` block | Move the sleep outside the lock, or use `wait()`/`Condition.await()` to release the lock while waiting |
| Losing a `notify()` because the waiter was not yet waiting | The notifier runs before the waiter calls `wait()` | Use a state variable (a flag or count) guarded by the lock, and have the waiter check the state in a `while` loop (spurious wakeup + lost notify protection) |
| Swallowing `InterruptedException` | Catching it and doing nothing, or logging and continuing | Restore the interrupt flag (`Thread.currentThread().interrupt()`) and abort the operation |
| Not naming threads | Creating threads with default names like "Thread-1" | Give every thread a meaningful name — it makes thread dumps readable |
| Assuming `Thread.sleep(0)` yields the CPU | In some OSes it does, in some it does not, and the behavior is not portable | Do not rely on `sleep(0)` for scheduling; use proper concurrency primitives |
| Not calling `setDaemon` before `start` | Calling `setDaemon(true)` after the thread has started | Call `setDaemon` before `start()`, or let the thread inherit its parent's daemon status |

## Where This Shows Up in an Organization

(Back to the earlier section — this is the same content; the lifecycle concept is the foundation for everything in the module.)

## Common Mistakes

(Repeated for completeness in the lesson structure — the table above covers it.)

## For the Practice Lab

In the lab, you will start with a program that creates several threads and prints their states at various points. Your job is to predict the state at each point, run the program, and compare. Then you will add an intentional bug — a `sleep` inside a `synchronized` block — and read the thread dump to find which threads are `BLOCKED` and why. Then you will fix it. Finally, you will write a thread that responds to `interrupt()` cleanly, restoring the flag and exiting, and verify that `isInterrupted()` returns what you expect at each step.

## Summary

A Java thread passes through six states — `NEW`, `RUNNABLE`, `BLOCKED`, `WAITING`, `TIMED_WAITING`, `TERMINATED` — and every concurrency bug is a thread in the wrong state. Only `start()` creates a new thread of execution; `run()` is just a method call on the current thread. `sleep()` does not release locks; `wait()` does — this is the most important distinction in the lifecycle. Threads block on monitor locks (`BLOCKED`), wait for notifications or joins (`WAITING`/`TIMED_WAITING`), and terminate when `run()` returns. Interrupts are cooperative: set the flag, let the thread check it and exit. Daemon threads do not keep the JVM alive; user threads do. Thread dumps are the diagnostic artifact — read the state, the lock, and the stack to find what each thread is doing and why.
