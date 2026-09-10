---
title: BlockingQueue, Deque, and the Concurrent Queue Implementations
summary: Queues are the backbone of work distribution, task execution, and inter-thread communication in Java. This lesson covers the queue families — BlockingQueue for producer-consumer patterns, Deque and its ArrayDeque and LinkedList implementations for double-ended queues, and the concurrent queues ConcurrentLinkedQueue and ConcurrentLinkedDeque — with the examples and mistakes that come up in real systems.
order: 1
minutes: 24
topics: [BlockingQueue, Deque, ArrayDeque, LinkedBlockingQueue, ConcurrentLinkedQueue, ConcurrentLinkedDeque, producer-consumer, thread-safety, queues]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/BlockingQueue.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/LinkedBlockingQueue.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Deque.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ConcurrentLinkedQueue.html
---

## The Concept, From Zero

A queue is a collection that orders its elements in a sequence and lets you add and remove them in a defined way. The most familiar queue is first-in, first-out (FIFO): the first element added is the first one removed, like a line at a shop. Java has several queue implementations, each with its own characteristics and intended use.

The queue interfaces and implementations in Java fall into a few families:

- **Queue** — the basic queue interface. A FIFO structure with `add`/`offer` to enqueue, `remove`/`poll` to dequeue, and `element`/`peek` to look at the head. The difference between `add` and `offer`, and between `remove` and `poll`, is how they handle failure: `add` throws an exception if the queue is full (for a bounded queue) or if the operation cannot be done, while `offer` returns `false`; `remove` throws if the queue is empty, while `poll` returns `null`.
- **Deque** (double-ended queue) — a queue where you can add and remove from both ends. Useful for stacks (LIFO) and for work-stealing patterns. `ArrayDeque` is the most common implementation.
- **BlockingQueue** — a queue where operations can block. If you try to take from an empty queue, the thread blocks until an element is available. If you try to put into a full bounded queue, the thread blocks until space is available. This is the backbone of the producer-consumer pattern.
- **Concurrent queues** — thread-safe queues for multi-threaded use. `ConcurrentLinkedQueue` and `ConcurrentLinkedDeque` are non-blocking, lock-free (or nearly so) queues for high-throughput concurrent access.

The right queue depends on the problem: are you handing work between threads, building a stack, buffering items, or just needing a collection that happens to be ordered FIFO?

### Queue — The FIFO Building Block

A `Queue` is a collection designed for holding elements prior to processing. The head of the queue is the element that would be removed by a call to `remove()` or `poll()`. In a FIFO queue, the head is the element that has been in the queue the longest.

The main operations come in two flavours:

- **Throws exception on failure:** `add(e)`, `remove()`, `element()`.
- **Returns a special value on failure:** `offer(e)` returns `false` if the collection refuses to add the element, `poll()` returns `null` if the queue is empty, `peek()` returns `null` if the queue is empty.

For unbounded queues, `offer` always returns `true` because there is always room. For bounded queues, `offer` returns `false` when the queue is at capacity.


**What this code does — step by step:**

1. LinkedList implements Queue (and Deque)
2. `queue.offer("first");` — true
3. `System.out.println(queue.peek());` — first — look at head without removing
4. `System.out.println(queue.poll());` — first — remove and return head. Second
5. `System.out.println(queue.peek());` — third
6. `System.out.println(queue.size());` — 1

The same code, clean:

```java
import java.util.Queue;
import java.util.LinkedList;

public class QueueDemo {
    public static void main(String[] args) {
        Queue<String> queue = new LinkedList<>();

        queue.offer("first");
        queue.offer("second");
        queue.offer("third");

        System.out.println(queue.peek());
        System.out.println(queue.poll());
        System.out.println(queue.poll());
        System.out.println(queue.peek());
        System.out.println(queue.size());
    }
}
```

Line by line:

- **`Queue<String> queue = new LinkedList<>();`** — a `LinkedList` is a classic `Queue` implementation. It is not the most efficient for pure queue use (an `ArrayDeque` is usually better), but it is familiar and fine for learning.
- **`queue.offer("first")`** — enqueue the element. `offer` is preferred over `add` because it returns `false` (rather than throwing) if the queue refuses the element.
- **`queue.peek()`** — look at the head element without removing it. Returns `null` if the queue is empty.
- **`queue.poll()`** — remove and return the head element. Returns `null` if the queue is empty. This is the preferred way to dequeue when emptiness is possible.
- **`queue.size()`** — the number of elements currently in the queue.

The distinction between the exception-throwing and the special-value methods matters. If you use `remove()` on an empty queue, you get a `NoSuchElementException`. If you use `poll()`, you get `null`. In a loop that drains a queue, `poll()` is usually what you want, because you can check for `null` to know when you are done.

// Draining a queue safely with poll()
while (true) {
    String item = queue.poll();
    if (item == null) {
        break;   // queue is empty
    }
    process(item);
}

### Deque — A Double-Ended Queue

A `Deque` is a queue that allows insertion and removal at both ends. You can use it as a FIFO queue (add at one end, remove from the other) or as a LIFO stack (add and remove from the same end). The `Deque` interface provides methods for both ends, again in the exception-throwing and special-value flavours.

The most common implementation is `ArrayDeque`. It is faster than `LinkedList` for most use cases because it is backed by a resizable array and has better cache locality. It is the recommended choice for a stack or a FIFO queue when you do not need concurrent access.


**What this code does — step by step:**

1. Deque as a FIFO queue
2. `System.out.println("FIFO poll: " + fifo.pollFirst());` — A
3. `System.out.println("FIFO peek: " + fifo.peekFirst());` — B
4. Deque as a stack (LIFO)
5. `stack.push("X");` — push onto the head = addFirst
6. `System.out.println("Stack pop: " + stack.pop());` — Z (last pushed)
7. `System.out.println("Stack peek: " + stack.peek());` — Y

The same code, clean:

```java
import java.util.ArrayDeque;
import java.util.Deque;

public class DequeDemo {
    public static void main(String[] args) {
        Deque<String> fifo = new ArrayDeque<>();
        fifo.addLast("A");
        fifo.addLast("B");
        fifo.addLast("C");
        System.out.println("FIFO poll: " + fifo.pollFirst());
        System.out.println("FIFO peek: " + fifo.peekFirst());

        Deque<String> stack = new ArrayDeque<>();
        stack.push("X");
        stack.push("Y");
        stack.push("Z");
        System.out.println("Stack pop: " + stack.pop());
        System.out.println("Stack peek: " + stack.peek());
    }
}
```

Line by line:

- **`Deque<String> fifo = new ArrayDeque<>();`** — an `ArrayDeque` used as a FIFO queue.
- **`addLast`** — add to the tail end of the queue.
- **`pollFirst`** — remove and return the head (the oldest element).
- **`push("X")`** — add to the head. In a deque used as a stack, `push` is like pushing onto the top of a stack.
- **`pop()`** — remove and return the head. Since we pushed onto the head, the most recently pushed element is at the head, so `pop` gives LIFO behaviour.
- **`peek()`** — look at the head without removing it.

`ArrayDeque` is the recommended stack and queue implementation for single-threaded or externally-synchronised use. It is faster than `LinkedList` because it does not allocate a node object for every element — it stores elements in a resizable array. It is also more memory-efficient.

Note: `ArrayDeque` is **not** thread-safe. If multiple threads access it concurrently and at least one thread modifies it, you must synchronise externally. For concurrent use, use the concurrent collections below.

### BlockingQueue — The Producer-Consumer Backbone

A `BlockingQueue` is a queue that supports operations that wait for the queue to become non-empty when retrieving, and wait for space to become available when storing, if necessary. This makes it the natural structure for the producer-consumer pattern: producers put items into the queue, consumers take items out, and if the queue is empty, consumers wait; if the queue is full, producers wait.

The blocking operations come in several forms, giving you control over how long to wait:

- **`put(e)`** — inserts the element, waiting if necessary for space to become available (for a bounded queue).
- **`take()`** — retrieves and removes the head, waiting if necessary until an element becomes available.
- **`offer(e, timeout, unit)`** — inserts the element, waiting up to the given time if necessary.
- **`poll(timeout, unit)`** — retrieves and removes the head, waiting up to the given time if necessary.

The most common `BlockingQueue` implementations are:

- **`ArrayBlockingQueue`** — a bounded queue backed by an array. It has a fixed capacity set at construction. It uses a single lock with two condition variables (not-full and not-empty) for synchronisation. Good when you want a fixed buffer size.
- **`LinkedBlockingQueue`** — an optionally bounded queue backed by a linked structure. If you do not set a capacity, it is unbounded (limited only by memory). It uses two locks (one for the head, one for the tail) to allow higher throughput when there are many producers and consumers.
- **`PriorityBlockingQueue`** — an unbounded blocking queue that orders elements by priority (using their natural ordering or a comparator). It is not FIFO — it is priority-ordered. Useful for task scheduling where some tasks are more urgent than others.
- **`SynchronousQueue`** — a queue where each insert operation must wait for a corresponding remove operation by another thread, and vice versa. It does not have any internal capacity. It is like a handoff — a producer hands an item directly to a consumer. Useful for handoff patterns and for keeping the number of in-flight items at zero.


**What this code does — step by step:**

1. A producer-consumer example with ArrayBlockingQueue
2. A bounded queue: at most 10 items in flight
3. `queue.put(item);` — blocks if queue is full
4. `String item = queue.take();` — blocks if queue is empty
5. Let the demo run for a bit, then shut down

The same code, clean:

```java
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class ProducerConsumerExample {
    static final BlockingQueue<String> queue = new ArrayBlockingQueue<>(10);

    static class Producer implements Runnable {
        public void run() {
            try {
                for (int i = 0; i < 20; i++) {
                    String item = "item-" + i;
                    queue.put(item);
                    System.out.println("produced: " + item);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    static class Consumer implements Runnable {
        public void run() {
            try {
                while (!Thread.currentThread().isInterrupted()) {
                    String item = queue.take();
                    System.out.println("  consumed: " + item);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    public static void main(String[] args) throws Exception {
        ExecutorService exec = Executors.newFixedThreadPool(3);
        exec.submit(new Producer());
        exec.submit(new Consumer());
        exec.submit(new Consumer());

        Thread.sleep(2000);
        exec.shutdownNow();
    }
}
```

Line by line:

- **`new ArrayBlockingQueue<>(10)`** — a bounded queue with capacity 10. Producers will block when the queue has 10 items.
- **`queue.put(item)`** — inserts the item, blocking if the queue is full. This is the producer's main operation.
- **`queue.take()`** — removes and returns the head, blocking if the queue is empty. This is the consumer's main operation.
- **Two consumers and one producer** — the two consumers compete for items. The queue ensures each item is consumed by exactly one consumer.
- **`Thread.sleep(2000)`** — lets the demo run for two seconds, then shuts down. In a real application, you would have a graceful shutdown mechanism (a special "end-of-stream" marker, or interrupting the consumers).

A `LinkedBlockingQueue` is used the same way, but it can be unbounded if you do not specify a capacity. An unbounded queue never blocks producers on `put`, which sounds convenient but can be dangerous — if consumers cannot keep up, the queue grows without bound and the application runs out of memory. A bounded queue blocks producers when full, which applies backpressure and prevents unbounded growth.


**What this code does — step by step:**

1. Unbounded LinkedBlockingQueue — dangerous if consumers are slow
2. `BlockingQueue<String> unbounded = new LinkedBlockingQueue<>();` — no capacity limit
3. unbounded.put(item); // never blocks — could grow without bound
4. Bounded LinkedBlockingQueue — backpressure when full
5. bounded.put(item); // blocks when 1000 items are in the queue

The same code, clean:

```java
BlockingQueue<String> unbounded = new LinkedBlockingQueue<>();

BlockingQueue<String> bounded = new LinkedBlockingQueue<>(1000);
```

The choice between `ArrayBlockingQueue` and `LinkedBlockingQueue` is usually about capacity and performance. `ArrayBlockingQueue` is always bounded and uses a single lock. `LinkedBlockingQueue` is optionally bounded and uses two locks, which can give higher throughput when there are many producers and consumers, but it is not dramatically faster in all cases and uses more memory per element (because of the linked nodes).

### ConcurrentLinkedQueue and ConcurrentLinkedDeque — Non-Blocking Concurrent Queues

`ConcurrentLinkedQueue` is a thread-safe, non-blocking FIFO queue. It uses a lock-free algorithm (based on CAS — compare-and-swap) to allow high-throughput concurrent access without blocking. It is unbounded and does not block on `offer` or `poll` — it never waits for space or for elements.

`ConcurrentLinkedDeque` is the double-ended version.

These queues are useful when you need a thread-safe queue for high-throughput concurrent access and you do not need blocking semantics. They are often used for work queues where producers and consumers run at similar rates and neither wants to block.

import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;

public class ConcurrentQueueDemo {
    static final Queue<String> queue = new ConcurrentLinkedQueue<>();

    public static void main(String[] args) {
        // Multiple threads can offer and poll without blocking
        queue.offer("task-1");
        queue.offer("task-2");

        System.out.println(queue.poll());   // task-1
        System.out.println(queue.poll());   // task-2
        System.out.println(queue.poll());   // null — queue is empty, no blocking
    }
}

Key points:

- **`offer` never blocks.** If you call `offer` on a `ConcurrentLinkedQueue`, it always succeeds (subject to memory limits — it is unbounded).
- **`poll` returns `null` if the queue is empty, rather than blocking.** This means consumers must check for `null` and decide what to do — loop, wait with a sleep, or use a separate signalling mechanism.
- **It is a good fit for high-throughput work queues where you want non-blocking operations.** If you need blocking — producers waiting for consumers, consumers waiting for work — use a `BlockingQueue` instead.
- **Size is not constant-time in the same sense.** `ConcurrentLinkedQueue.size()` traverses the list to count elements (or uses a cached approximation in some implementations). For a large queue, calling `size()` frequently can be expensive. This is a known trade-off of many concurrent collections — exact size is expensive when the structure is being concurrently modified.

### Choosing the Right Queue

| Need | Best Choice |
|---|---|
| Simple FIFO, single-threaded or externally synchronised | `ArrayDeque` (faster than `LinkedList`) |
| Stack (LIFO) | `ArrayDeque` with `push`/`pop` |
| Producer-consumer, bounded, with blocking | `ArrayBlockingQueue` |
| Producer-consumer, optionally bounded, with blocking | `LinkedBlockingQueue` |
| Priority-based task queue, with blocking | `PriorityBlockingQueue` |
| Handoff between threads, no internal capacity | `SynchronousQueue` |
| High-throughput concurrent queue, non-blocking, unbounded | `ConcurrentLinkedQueue` |
| High-throughput concurrent double-ended queue, non-blocking | `ConcurrentLinkedDeque` |

### A Common Mistake: Unbounded Queue Without Backpressure

A frequent production bug is to use an unbounded `LinkedBlockingQueue` (or plain `LinkedList`) between a fast producer and a slow consumer, without any backpressure. The producer keeps putting items, the queue grows without bound, and eventually the application runs out of memory.

// DANGEROUS: unbounded queue with no backpressure
BlockingQueue<String> queue = new LinkedBlockingQueue<>();   // unbounded

// Producer runs fast, consumer runs slow — queue fills up and keeps growing
// Eventually: OutOfMemoryError

The fix is to use a bounded queue and let the producer block when the queue is full, or to use a backpressure mechanism. A bounded `ArrayBlockingQueue` or a `LinkedBlockingQueue` with a capacity limit applies backpressure naturally: when the queue is full, the producer's `put` blocks, slowing the producer down to the consumer's pace.

// SAFE: bounded queue with backpressure
BlockingQueue<String> queue = new ArrayBlockingQueue<>(1000);

// Producer blocks when queue is full — consumer controls the pace
// queue.put(item);   // blocks if 1000 items are already queued

Another common mistake is to use `size()` on a concurrent queue as part of a control decision. The size of a concurrent queue is a snapshot that can be stale the instant you read it. If you use `size()` to decide whether the queue is "too full," you might make the decision based on a size that is already wrong. If you need flow control, use a bounded queue that blocks on `put` — that is the correct backpressure mechanism, not a manual `size()` check.

// BAD: using size() for flow control — race condition
if (queue.size() < 1000) {
    queue.put(item);   // another thread might have added items between size() and put()
}

// GOOD: use a bounded blocking queue — the queue handles backpressure internally
boundedQueue.put(item);   // blocks when full, no manual size check needed

## A Code Example — A Small Thread Pool Using a BlockingQueue

This example shows a minimal work-queue thread pool built with a `BlockingQueue`. It is a simplified illustration of how thread pools are built — tasks are queued, and worker threads take tasks from the queue and run them.


**What this code does — step by step:**

1. A Runnable task — in a real pool, this would be a function or command
2. A minimal thread pool with a bounded blocking queue
3. `queue.put(task);` — blocks if queue is full — backpressure
4. In a real pool, you would also drain or interrupt workers
5. `Task task = queue.take();` — blocks until a task is available
6. A small demo

The same code, clean:

```java
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.atomic.AtomicBoolean;

interface Task {
    void run();
}

public class SimpleThreadPool {
    private final BlockingQueue<Task> queue;
    private final Worker[] workers;
    private final AtomicBoolean running = new AtomicBoolean(true);

    public SimpleThreadPool(int workerCount, int queueCapacity) {
        this.queue = new ArrayBlockingQueue<>(queueCapacity);
        this.workers = new Worker[workerCount];
        for (int i = 0; i < workerCount; i++) {
            workers[i] = new Worker("worker-" + i);
        }
    }

    public void start() {
        for (Worker w : workers) {
            new Thread(w).start();
        }
    }

    public void submit(Task task) throws InterruptedException {
        queue.put(task);
    }

    public void shutdown() {
        running.set(false);
    }

    private class Worker implements Runnable {
        private final String name;

        Worker(String name) { this.name = name; }

        public void run() {
            while (running.get()) {
                try {
                    Task task = queue.take();
                    task.run();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
    }

    public static void main(String[] args) throws InterruptedException {
        SimpleThreadPool pool = new SimpleThreadPool(3, 10);
        pool.start();

        for (int i = 0; i < 20; i++) {
            final int taskId = i;
            pool.submit(() -> {
                System.out.println("[" + Thread.currentThread().getName() +
                                   "] running task " + taskId);
                try { Thread.sleep(200); } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            });
        }

        Thread.sleep(3000);
        pool.shutdown();
    }
}
```

Line by line:

- **`ArrayBlockingQueue<Task> queue = new ArrayBlockingQueue<>(queueCapacity);`** — a bounded queue. When the queue is full, `submit` blocks, applying backpressure so the caller does not overwhelm the pool.
- **`queue.put(task)` in `submit`** — the task is enqueued. If the queue is full, this blocks until a worker takes a task.
- **`queue.take()` in `Worker.run`** — workers block until a task is available. This is the consumer side of the producer-consumer pattern.
- **Workers are long-lived threads** that loop, taking tasks and running them. This is the essence of a thread pool — avoid creating a new thread for every task; reuse a fixed set of threads.
- **`AtomicBoolean running`** — a flag to stop the workers. In a real pool, you would also handle graceful shutdown (draining the queue, interrupting idle workers, etc.).

This is a simplified example — real thread pools (like `ExecutorService` and `ThreadPoolExecutor`) are more sophisticated, with thread creation policies, rejection policies when the queue is full, and graceful shutdown. But this captures the core: a blocking queue as the buffer between submitters and workers.

## Where This Shows Up in an Organization

In a backend team, queues are everywhere.

- **Task execution** — `ExecutorService` uses a `BlockingQueue` internally to hold tasks waiting for a worker thread. When you submit a task to an `ExecutorService`, you are putting it into a queue, and worker threads take tasks from that queue.
- **Producer-consumer pipelines** — a web service that receives requests and hands them to a background worker, a data pipeline that reads from a source and writes to a sink, a log aggregator that collects log entries and writes them to disk — all of these are producer-consumer patterns, and a `BlockingQueue` is the natural structure.
- **Event handling** — an event bus that distributes events to handlers, a notification system that delivers messages to subscribers — these use queues to buffer events and distribute them to consumers.
- **Work stealing** — a `Deque` is used in work-stealing thread pools, where idle threads steal work from the tail of other threads' queues. `ForkJoinPool` uses work-stealing deques internally.
- **Non-blocking pipelines** — high-throughput concurrent pipelines that do not want to block use `ConcurrentLinkedQueue` or `ConcurrentLinkedDeque`. These appear in data ingestion, real-time processing, and lock-free algorithms.

The choice of queue is not an academic detail — it affects backpressure, memory usage, throughput, and latency. An unbounded queue can cause out-of-memory errors. A blocking queue can cause a producer to block, which may be exactly what you want (backpressure) or exactly what you do not want (a hung request). A copy-on-write list is fast for reads but expensive for writes. Knowing which queue to use is part of designing a system that behaves the way you expect under load.

## Common Mistakes

| Mistake | Why it happens | Fix |
|---|---|
| Using an unbounded queue when you mean to apply backpressure | It is convenient — `put` never blocks | Use a bounded `ArrayBlockingQueue` or `LinkedBlockingQueue` with a capacity; let the queue block the producer when full |
| Using `size()` on a concurrent queue for flow control | The size is a snapshot that can be stale immediately | Use a bounded blocking queue's `put` for backpressure, not a manual `size()` check |
| Using `ArrayDeque` in concurrent code without synchronisation | It is not thread-safe | Use a `ConcurrentLinkedQueue` or a `BlockingQueue`, or synchronise externally |
| Using `ConcurrentLinkedQueue`'s `poll()` without checking for `null` | `poll` returns `null` when empty, not an exception | Check for `null` and decide how to handle an empty queue (loop, sleep, or use a blocking queue instead) |
| Using `LinkedList` for a queue when `ArrayDeque` is faster | `LinkedList` is the classic queue example in tutorials | Prefer `ArrayDeque` for single-threaded queue and stack use |
| Blocking a consumer thread forever with no shutdown mechanism | A consumer calls `take()` and never stops because the queue never signals end-of-stream | Provide a shutdown mechanism — a special marker, interruption, or a timeout on `poll` |
| Confusing `offer` and `add` on a bounded queue | `add` throws an exception when the queue is full; `offer` returns `false` | Use `offer` if you want to handle a full queue gracefully, or `put` if you want to block |

## For the Practice Lab

In the lab, you will see a producer-consumer demo with an unbounded queue and a slow consumer, which causes the queue to grow without bound. Replace the unbounded queue with a bounded `ArrayBlockingQueue` and observe the backpressure — the producer blocks when the queue is full and the system stays stable. Then replace the `BlockingQueue` with a `ConcurrentLinkedQueue` and add a `poll` loop with a sleep to simulate a non-blocking consumer, and compare the behaviour. Finally, build a small thread pool with a `BlockingQueue` and a fixed set of worker threads, and submit tasks that sleep briefly to see the workers take tasks from the queue and run them concurrently.

## Summary

Java's queue families solve different problems. `Queue` (FIFO) is the basic ordered collection — `ArrayDeque` is the recommended simple implementation, not `LinkedList`. `Deque` is a double-ended queue you can use as a FIFO queue or a LIFO stack — `ArrayDeque` is the usual choice. `BlockingQueue` is the backbone of the producer-consumer pattern — `ArrayBlockingQueue` for a bounded queue with a single lock, `LinkedBlockingQueue` for an optionally bounded queue with two locks, `PriorityBlockingQueue` for priority-ordered tasks, and `SynchronousQueue` for direct handoff. `ConcurrentLinkedQueue` and `ConcurrentLinkedDeque` are non-blocking, high-throughput concurrent queues for cases where you do not need blocking semantics. The most common production mistake is using an unbounded queue without backpressure, which lets a fast producer overwhelm a slow consumer and eventually run out of memory. The fix is a bounded blocking queue — the queue itself applies backpressure by blocking the producer when full.

