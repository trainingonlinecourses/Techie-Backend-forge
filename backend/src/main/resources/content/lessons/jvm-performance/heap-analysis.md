---
title: Heap Analysis — Finding Memory Leaks
summary: How to analyze heap dumps to find memory leaks, identify the biggest objects, and trace why they're still alive. Beginner-friendly with step-by-step walkthroughs.
order: 3
minutes: 22
topics: [heap dump, memory leak, MAT, Eclipse Memory Analyzer, dominator tree, leak suspects, GC roots]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/specs/man/jcmd.html
  - https://help.eclipse.org/products/mat/
---

# Heap Analysis — Finding Memory Leaks

## What is Heap Analysis? (From Zero)

A **heap dump** is a snapshot of every object in the JVM's heap at a specific moment. When your app is using too much memory or crashing with `OutOfMemoryError`, a heap dump lets you see exactly what's consuming memory and why it's not being garbage collected.

Think of it like this: if your house is messy and you can't find anything, you take a photo of every room and analyze it later. A heap dump is that photo for your JVM's memory.

### When to Analyze Heap Dumps

| Symptom | What to Do |
|---|---|
| `OutOfMemoryError: Java heap space` | Take heap dump before the crash (`-XX:+HeapDumpOnOutOfMemoryError`) |
| Memory growing continuously | Take a heap dump, wait, take another, compare |
| GC is running too often | Heap dump shows what's surviving GC |
| App is slow due to GC pressure | Heap dump reveals the biggest memory consumers |

---

## Taking a Heap Dump

### Method 1: Automatic (Recommended for Production)

```bash
# JVM flags — automatically dump on OOM:
java -XX:+HeapDumpOnOutOfMemoryError \
     -XX:HeapDumpPath=/var/log/app/heapdump.hprof \
     -jar app.jar

# This means: when OOM happens, save the dump FIRST, then crash
# The dump is available for analysis even in production
```

### Method 2: On Demand

```bash
# Using jcmd (preferred):
jcmd <pid> GC.heap_dump /tmp/heapdump.hprof

# Using jmap (older, but works):
jmap -dump:live,format=b,file=/tmp/heapdump.hprof <pid>
```

**Line-by-line explained:**
- `jcmd <pid> GC.heap_dump` — Triggers a heap dump without restarting the app. Safe to use in production (brief pause).
- `/tmp/heapdump.hprof` — The dump file can be large (several GB for big heaps). Make sure you have disk space.
- `live` option — Only dump live objects (skips objects eligible for GC). Smaller dump, but might miss some context.

---

## The Code — Analyzing Heap Dumps

### Using Eclipse Memory Analyzer (MAT) — Free Tool

1. Download MAT from https://eclipse.dev/mat/
2. Open your `.hprof` file
3. MAT automatically analyzes and shows a "Leak Suspects Report"

### The Dominator Tree (Most Important View)

The **Dominator Tree** shows which objects are holding the most memory:

```
Dominator Tree:
  ┌─ com.example.cache.UserSessionCache @ 0x7f8b3c0
  │   └─ retained: 2.3 GB
  │   └─ HashMap entries: 1,500,000
  │
  ├─ org.springframework.orm.jpa.JpaEntityManager @ 0x7f8b4d0
  │   └─ retained: 800 MB
  │   └─ first-level cache: 500,000 entities
  │
  └─ java.lang.String @ 0x7f8b5e0
      └─ retained: 400 MB
      └─ String pool: 2,000,000 entries
```

**How to read this:**
- `retained` = how much memory would be freed if this object were garbage collected (including everything it references)
- The biggest "retained" size = your memory problem
- In this example, `UserSessionCache` is holding 2.3 GB — that's your leak

### Finding GC Roots (Why Isn't It Garbage Collected?)

Right-click an object in MAT → "Path to GC Roots" → "exclude weak/soft references"

```
GC Root Path:
  Thread "main" (0x7f8a100)
    → static UserService.instance (0x7f8b200)
      → HashMap sessions (0x7f8b300)
        → Entry "user123" → UserSession @ 0x7f8b400
```

This tells you: the `UserSession` is alive because it's referenced by a static field → HashMap → which is reachable from the main thread. The fix: make the HashMap time-based or size-bounded.

---

## Real-World Scenarios

### Scenario 1: Cache Without Eviction

```java
// The leak — cache grows forever
public class CacheService {
    private static final Map<String, byte[]> cache = new HashMap<>();

    public byte[] get(String key) {
        return cache.computeIfAbsent(key, this::loadFromDB);   // Never evicted!
    }
}
```

Heap dump shows:
```
Dominator Tree:
  CacheService.cache @ 0x7f8b3c0
    retained: 5.2 GB
    entries: 8,000,000
```

Fix: Use Caffeine or Guava Cache with `maximumSize` and `expireAfterWrite`.

### Scenario 2: EntityManager First-Level Cache

```java
// JPA caches every entity you load in a transaction
@Transactional
public void processAllOrders() {
    List<Order> orders = orderRepository.findAll();   // All loaded into L1 cache
    for (Order order : orders) {
        process(order);                               // L1 cache grows with each entity
    }
    // If this processes 1M orders, L1 cache holds 1M entities → OOM
}
```

Fix: Use `@Transactional(propagation = Propagation.NOT_SUPPORTED)` and batch processing, or periodically `entityManager.clear()`.

### Scenario 3: ThreadLocal Leaks

```java
// ThreadLocal values survive thread reuse in thread pools
public class UserService {
    private static final ThreadLocal<UserContext> currentUser = new ThreadLocal<>();

    public void processRequest() {
        currentUser.set(new UserContext("user123"));
        try {
            doWork();
        } finally {
            currentUser.remove();   // CRITICAL: always remove in finally!
        }
    }
}
```

Heap dump shows: thread pool threads holding stale `ThreadLocal` values from previous requests.

---

## Comparing Two Heap Dumps (Memory Growth)

```bash
# Take two dumps 10 minutes apart:
jcmd <pid> GC.heap_dump /tmp/heap1.hprof
# ... wait 10 minutes ...
jcmd <pid> GC.heap_dump /tmp/heap2.hprof

# In MAT: File → Compare Heap Dumps
# Shows objects that GREW between the two snapshots
```

This is the fastest way to find a **memory leak** (something that grows continuously) vs a **memory spike** (temporary high usage).

---

## Common Mistakes

| Mistake | Why It's a Problem | Fix |
|---|---|---|
| Not setting `-XX:+HeapDumpOnOutOfMemoryError` | You lose the diagnostic data when you need it most | Always set in production JVM flags |
| Analyzing the wrong dump | Dump taken after app restarted = useless | Take dumps BEFORE restarting |
| Ignoring soft/weak references | They dominate the "not garbage collected" view | Exclude weak/soft in GC root analysis |
| Only looking at "largest objects" | The leak might be many small objects | Use the Dominator Tree and compare dumps |
| Not comparing two dumps | Single dump shows what's there, not what's growing | Take dumps 10+ minutes apart and compare |

---

## Key Takeaways

- **Always set `-XX:+HeapDumpOnOutOfMemoryError`** in production — it's the most valuable JVM flag for debugging.
- **Dominator Tree** is the first view to check — it shows what's holding the most memory.
- **Path to GC Roots** tells you WHY an object is alive — follow the chain to find the fix.
- **Compare two dumps** to find memory leaks (growth over time) vs spikes (temporary).
- **Most common leaks**: static collections without eviction, JPA L1 cache, ThreadLocal not removed, unclosed resources.

Official docs: [jcmd GC.heap_dump](https://docs.oracle.com/en/java/javase/21/docs/specs/man/jcmd.html) · [Eclipse MAT](https://eclipse.dev/mat/)
