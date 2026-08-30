---
title: "Concurrent Collections — Thread-Safe Data Structures That Actually Scale"
summary: "ConcurrentHashMap internals, CopyOnWriteArrayList trade-offs, BlockingQueue for producer-consumer, and when to use which thread-safe collection."
order: 6
minutes: 22
topics: [concurrent-hashmap, copyonwritearraylist, blocking-queue, collections-thread-safe, java-util-concurrent]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/package-summary.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html
---

## The Concept, From Zero

### Why Regular Collections Are Not Thread-Safe

A regular `HashMap` is not thread-safe. If two threads write to it simultaneously, you get data corruption:

```java
Map<String, Integer> map = new HashMap<>();
// Thread 1: map.put("count", 1);
// Thread 2: map.put("count", 2);
// Race condition: one write may be lost, or internal structure corrupts
```

Even worse, `HashMap` uses a linked list internally. Concurrent modifications can create an infinite loop (the classic "CPU spike" bug).

### ConcurrentHashMap — The Workhorse

`ConcurrentHashMap` is the thread-safe replacement for `HashMap`. It uses **segment locking** (Java 8+) — only the specific bucket being modified is locked, not the entire map:

```java
import java.util.concurrent.ConcurrentHashMap;

public class ConcurrentMapDemo {
    public static void main(String[] args) {
        ConcurrentHashMap<String, Integer> scores = new ConcurrentHashMap<>();
        
        // Thread-safe put — no locks needed
        scores.put("Alice", 95);
        scores.put("Bob", 87);
        
        // Atomic operations — combine check + act in one step
        scores.putIfAbsent("Charlie", 92);
        // ↑ Only puts if key doesn't exist — no race condition
        
        scores.compute("Alice", (key, val) -> val + 5);
        // ↑ Atomically reads + updates — no separate get/put
        
        scores.merge("Bob", 10, Integer::sum);
        // ↑ Atomically merges: if key exists, apply function
        
        // Thread-safe iteration (weakly consistent)
        scores.forEach((name, score) -> {
            System.out.println(name + ": " + score);
        });
    }
}
```

**Why ConcurrentHashMap is fast:**
- Read operations use no locking at all
- Write operations lock only the specific bucket (not the whole map)
- Java 8+ uses CAS (Compare-And-Swap) for put operations — lock-free

### CopyOnWriteArrayList — Write Once, Read Many

`CopyOnWriteArrayList` creates a **new copy of the array** on every write. This makes writes expensive but reads lock-free:

```java
import java.util.concurrent.CopyOnWriteArrayList;

public class CopyOnWriteDemo {
    // Perfect for listener lists — written rarely, read often
    private final CopyOnWriteArrayList<EventListener> listeners = new CopyOnWriteArrayList<>();
    
    public void addListener(EventListener listener) {
        listeners.add(listener);  // Creates a new array copy — expensive
    }
    
    public void removeListener(EventListener listener) {
        listeners.remove(listener);  // Another copy — expensive
    }
    
    public void notifyAll(String event) {
        for (EventListener listener : listeners) {  // No locking — fast
            listener.onEvent(event);
        }
    }
}
```

**When to use CopyOnWriteArrayList:**
- Listener/observer lists (registered once, notified many times)
- Configuration lists that change rarely
- When iteration must never throw ConcurrentModificationException

**When NOT to use it:**
- Frequent writes (each write copies the entire array)
- Large lists (copying 10,000 elements per write is slow)

### BlockingQueue — Producer-Consumer Pattern

`BlockingQueue` is a queue that blocks when full (producer waits) or empty (consumer waits):

```java
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;

public class ProducerConsumerDemo {
    public static void main(String[] args) {
        BlockingQueue<String> queue = new ArrayBlockingQueue<>(5);
        // ↑ Capacity of 5 — producer blocks when full
        
        // Producer thread
        Thread producer = new Thread(() -> {
            try {
                for (int i = 0; i < 10; i++) {
                    queue.put("item-" + i);  // Blocks if queue is full
                    System.out.println("Produced: item-" + i);
                }
                queue.put("DONE");  // Poison pill — signals consumer to stop
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        
        // Consumer thread
        Thread consumer = new Thread(() -> {
            try {
                while (true) {
                    String item = queue.take();  // Blocks if queue is empty
                    if ("DONE".equals(item)) break;
                    System.out.println("Consumed: " + item);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        
        producer.start();
        consumer.start();
    }
}
```

### BlockingQueue Implementations

| Implementation | Behavior When Full | Behavior When Empty |
|---------------|-------------------|-------------------|
| `ArrayBlockingQueue` | Blocks producer | Blocks consumer |
| `LinkedBlockingQueue` | Blocks producer (optional capacity) | Blocks consumer |
| `PriorityBlockingQueue` | Never full (unbounded) | Blocks consumer |
| `SynchronousQueue` | Blocks until consumer ready | Blocks until producer ready |
| `DelayQueue` | Never full | Blocks until delay expires |

### Collections.unmodifiable* — Immutable Views

```java
import java.util.Collections;

public class ImmutableDemo {
    public static void main(String[] args) {
        List<String> mutable = new ArrayList<>(List.of("A", "B", "C"));
        
        // Create immutable view — throws UnsupportedOperationException on write
        List<String> immutable = Collections.unmodifiableList(mutable);
        
        // Thread-safe for reads (no synchronization needed)
        String first = immutable.get(0);  // Safe
        
        // mutable.add("D");  // Still works — modifies original
        // immutable.add("E");  // Throws UnsupportedOperationException!
        
        // Note: This is a VIEW — if mutable changes, immutable reflects it
        // For true immutability, use List.copyOf() (Java 10+)
        List<String> trulyImmutable = List.copyOf(mutable);
    }
}
```

### Organization Use Cases

**1. Thread-Safe Caching**
```java
public class ThreadSafeCache {
    private final ConcurrentHashMap<String, String> cache = new ConcurrentHashMap<>();
    
    public String getOrCompute(String key, Function<String, String> compute) {
        return cache.computeIfAbsent(key, compute);
        // ↑ Atomically: if absent, compute and put; otherwise return existing
        // ↑ Thread-safe: no race conditions
    }
}
```

**2. Rate Limiter with BlockingQueue**
```java
public class RateLimiter {
    private final BlockingQueue<Instant> requests = new ArrayBlockingQueue<>(100);
    
    public boolean tryAcquire() {
        Instant now = Instant.now();
        requests.offer(now);  // Non-blocking add
        // Remove requests older than 1 second
        requests.removeIf(t -> t.isBefore(now.minusSeconds(1)));
        return requests.size() <= 100;  // Allow 100 req/sec
    }
}
```

**3. Event Bus**
```java
public class EventBus {
    private final ConcurrentHashMap<Class<?>, CopyOnWriteArrayList<Object>> listeners = new ConcurrentHashMap<>();
    
    public <T> void register(Class<T> eventType, Consumer<T> listener) {
        listeners.computeIfAbsent(eventType, k -> new CopyOnWriteArrayList<>())
                 .add(listener);
    }
    
    public <T> void publish(T event) {
        List<Object> handlers = listeners.get(event.getClass());
        if (handlers != null) {
            for (Object handler : handlers) {
                ((Consumer<T>) handler).accept(event);
            }
        }
    }
}
```

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using Collections.synchronizedMap | Entire map locked on every operation | Use ConcurrentHashMap |
| Iterating CopyOnWriteArrayList while adding | Works but expensive copy per add | Use ConcurrentHashMap for frequent writes |
| Using BlockingQueue.add() | Throws IllegalStateException when full | Use put() to block or offer() to return false |
| Not handling InterruptedException | Thread stays in blocked state | Always catch and re-set interrupt flag |
| Using HashMap in multithreaded code | Data corruption, infinite loops | Use ConcurrentHashMap |

### Key Takeaways

1. **ConcurrentHashMap** — default thread-safe map; reads are lock-free, writes lock only the bucket
2. **CopyOnWriteArrayList** — for read-heavy, write-rare scenarios (listener lists)
3. **BlockingQueue** — producer-consumer pattern with blocking put/take
4. **Collections.unmodifiable*** — immutable views (not thread-safe by themselves)
5. **Use compute/merge/putIfAbsent** — atomic compound operations on ConcurrentHashMap
6. **Never use synchronized wrappers** for high-throughput scenarios — they serialize all access

### Real-World Organization Scenario

A real-time analytics platform processes 50,000 events/second. They use:
- `ConcurrentHashMap` for live counters (page views, clicks)
- `BlockingQueue<ArrayBlockingQueue>` for event pipeline buffering
- `CopyOnWriteArrayList` for subscriber notification (rarely changed)
- `ConcurrentLinkedQueue` for lock-free event logging

The result: thread-safe operations without any `synchronized` blocks, achieving sub-millisecond latency per event.
