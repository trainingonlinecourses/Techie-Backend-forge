---
title: Queues, Deques and PriorityQueue
module: java-collections-deep
order: 5
minutes: 20
topics: ["Queue", "Deque", "PriorityQueue", "ArrayDeque", "heap", "producer consumer"]
summary: Queues are the backbone of producerconsumer systems, task processing, and buffering. This lesson covers the Queue/Deque families — including the Pr...
docs:
  - title: "Queue interface"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Queue.html"
---

# Queues, Deques and PriorityQueue

Queues are the backbone of producer-consumer systems, task processing, and buffering. This lesson covers the Queue/Deque families — including the `PriorityQueue` heap that everyone misuses — and when each variant is the right choice.

## The Queue Contract

```java
Queue<String> queue = new ArrayDeque<>();

// Offer/poll: non-blocking, return status
boolean ok = queue.offer("a");    // false if full (bounded impls)
String head = queue.poll();       // null if empty

// add/remove: throw on failure
queue.add("a");                   // IllegalStateException if full
String h = queue.remove();        // NoSuchElementException if empty

// Peek: look without removing
String head = queue.peek();       // null if empty
```

**Production rule**: use `offer`/`poll`/`peek` — the status-returning trio — unless you *want* the exception.

## ArrayDeque: The Default

```java
Deque<String> deque = new ArrayDeque<>();
deque.addFirst("a");
deque.addLast("b");
deque.removeFirst();
deque.removeLast();
```

- Resizable circular array — no node objects
- **Faster than LinkedList for queue/stack operations** (contiguous memory, cache-friendly)
- Not thread-safe (use ConcurrentLinkedDeque or wrap)

**The rule**: `ArrayDeque` for stacks and queues; never `LinkedList` for these.

## PriorityQueue: The Heap

```java
PriorityQueue<Task> tasks = new PriorityQueue<>(Comparator
    .comparingInt(Task::priority)
    .thenComparing(Task::createdAt));
```

- A **binary min-heap** — `poll()` returns the *highest priority* (smallest per comparator) element in O(log n)
- Not FIFO! Order is by priority, not insertion
- Iterator order is **not** sorted — don't iterate expecting priority order

### The Classic Use: Job Processing

```java
public class TaskQueue {

    private final PriorityQueue<Task> queue = new PriorityQueue<>(
        Comparator.comparingInt(Task::priority).reversed());   // highest first

    public void submit(Task task) {
        queue.offer(task);
    }

    public Task next() {
        return queue.poll();   // highest-priority task, O(log n)
    }
}
```

### PriorityQueue Pitfalls

| Pitfall | Consequence |
|---------|-------------|
| Mutating a queued object's priority field | Heap broken — wrong order |
| Iterating expecting sorted order | Wrong sequence (must poll repeatedly) |
| Comparator inconsistent with equals | Weird duplicate handling |
| Null elements | NPE on offer |

## Blocking Queue Variants (recap)

| Queue | Capacity | Blocking behavior |
|-------|----------|-------------------|
| ArrayBlockingQueue | Bounded | `put` blocks when full; `take` when empty |
| LinkedBlockingQueue | Bounded/optional | Same, linked nodes |
| SynchronousQueue | Zero | Direct handoff — producer waits for consumer |
| PriorityBlockingQueue | Unbounded | Priority order, blocking |
| DelayQueue | Unbounded | Items released after delay |

The blocking variants (`java.util.concurrent`) are the producer-consumer workhorses — see the concurrent collections lesson for the full treatment.

## The Producer-Consumer Pattern

```java
@Component
public class TaskProcessor {

    private final BlockingQueue<Task> queue = new ArrayBlockingQueue<>(500);

    // Producer side
    public void submit(Task task) {
        if (!queue.offer(task, 5, TimeUnit.SECONDS)) {
            throw new QueueFullException("Task queue full for 5s");
        }
    }

    // Consumer side — one thread per consumer
    @Scheduled(fixedDelay = 0)
    public void drain() {
        Task task;
        while ((task = queue.poll()) != null) {
            process(task);   // handle exceptions per task
        }
    }
}
```

## Deque as a Stack

```java
Deque<String> stack = new ArrayDeque<>();
stack.push("a");       // == addFirst
stack.push("b");
String top = stack.pop();   // "b" — LIFO
```

`Deque` is the modern replacement for the legacy `Stack` class (which is synchronized — needlessly slow).

## When to Use Which

| Need | Queue |
|------|-------|
| FIFO, single thread | ArrayDeque |
| FIFO, multi-thread producer-consumer | ArrayBlockingQueue (bounded) |
| Priority processing | PriorityQueue / PriorityBlockingQueue |
| LIFO (stack) | ArrayDeque (push/pop) |
| Delayed execution | DelayQueue |
| Unbounded concurrent | ConcurrentLinkedQueue |
| Double-ended | ArrayDeque / ConcurrentLinkedDeque |

## Testing Queues

```java
@Test
void priorityQueuePollsInPriorityOrder() {
    PriorityQueue<Task> q = new PriorityQueue<>(Comparator.comparingInt(Task::priority));
    q.add(new Task("low", 3));
    q.add(new Task("high", 1));
    q.add(new Task("mid", 2));

    assertEquals("high", q.poll().name());
    assertEquals("mid", q.poll().name());
    assertEquals("low", q.poll().name());
}

@Test
void arrayDequeWorksAsStack() {
    Deque<String> stack = new ArrayDeque<>();
    stack.push("a");
    stack.push("b");
    assertEquals("b", stack.pop());
    assertEquals("a", stack.pop());
}
```

## Summary

| Family | Contract | Order |
|--------|----------|-------|
| Queue (ArrayDeque) | offer/poll | FIFO |
| Deque | addFirst/addLast | Both ends |
| PriorityQueue | offer/poll | By priority (heap) |
| BlockingQueue | put/take | FIFO or priority, blocking |
| DelayQueue | offer/poll | By delay expiry |

Queues are simple to name and subtle to choose: `ArrayDeque` for plain FIFO/LIFO, `PriorityQueue` when priority matters, blocking variants for producer-consumer. The failure modes are equally subtle — mutate a queued object's priority and your "priority" queue quietly becomes random order.
