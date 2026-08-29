---
title: JVM Garbage Collection — How Java Manages Memory
summary: Generational hypothesis, minor vs major GC, how objects become eligible for collection, and the real-world impact of GC pauses on application performance.
order: 67
minutes: 22
topics: [garbage collection, GC roots, generational, minor GC, major GC, finalize, phantom reference, memory management]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html
  - https://www.oracle.com/java/technologies/gctuning.html
---

# JVM Garbage Collection — How Java Manages Memory

## What is Garbage Collection? (From Zero)

In languages like C, you manually allocate memory with `malloc()` and free it with `free()`. Forget to free → memory leak. Free twice → crash. Double free → security vulnerability. It's one of the hardest bugs to find and fix.

Java solves this with **Garbage Collection (GC)** — the JVM automatically finds objects that are no longer used and reclaims their memory. You never call `free()` or `delete()`. The GC handles everything.

**The trade-off:** You gain safety and productivity, but you lose some control over exactly when memory is freed and you get occasional GC pauses.

---

## When is an Object "Garbage"?

An object is eligible for garbage collection when **no live thread can reach it** through any reference chain:

```java
public void createAndAbandon() {
    Order order = new Order("ORD-001");   // order points to the new Order object
    // ... use the order ...
}   // Method ends — the local variable 'order' goes out of scope
    // The Order object is now unreachable → eligible for GC

public void leakedReference() {
    private static List<Order> cache = new ArrayList<>();   // Static — lives forever!

    public void addToCache(Order order) {
        cache.add(order);   // Now 'order' is reachable through the static list
    }
    // Even after addToCache returns, the Order is STILL alive
    // because 'cache' (static) holds a reference
}
```

**Rules for eligibility:**
1. Local variable goes out of scope → eligible
2. Nullifying a reference → eligible (if no other references exist)
3. Object only referenced by other unreachable objects → eligible
4. Static fields keep objects alive for the entire JVM lifetime

---

## The Generational Model

The GC's key insight: **most objects die young**. A typical web request creates 100+ temporary objects (strings, buffers, iterators) that are only needed for that one request. After the request completes, they're garbage.

```
┌─────────────────────────────────────────────────────────┐
│                        HEAP                              │
├──────────────────────┬──────────────────────────────────┤
│     Young Generation │          Old Generation          │
├──────┬───────┬───────┤                                  │
│ Eden │  S0   │  S1   │        (Tenured/Promoted)        │
│      │(From) │ (To)  │                                  │
└──────┴───────┴───────┴──────────────────────────────────┘
  New objects → Eden → Survive → S0/S1 → Old Gen → GC'd
```

**Young Generation:** New objects are allocated here (Eden space). Minor GC runs frequently and is fast (1-10ms).

**Old Generation:** Objects that survive multiple minor GCs are promoted here. Major GC runs less frequently but takes longer (50-500ms).

```java
// These live in Young Gen (temporary):
public void handleRequest() {
    String temp = "Hello";                        // Created, used briefly
    List<String> items = new ArrayList<>();        // Temporary list
    // After method returns, temp and items → Young Gen garbage
}

// These get promoted to Old Gen (long-lived):
private static final Config config = new Config();  // Static → lives forever
private final Cache<String, Order> orderCache;      // Instance field → long-lived
```

---

## The Code — Line by Line

### Making Objects Eligible for GC

```java
public class MemoryManagement {

    public void demonstrateGC() {
        // 1. Method scope — automatic cleanup
        String name = "Alice";              // 'name' references a String object
        // ... use name ...
        // When method returns, 'name' goes out of scope → "Alice" becomes garbage

        // 2. Explicit nulling — immediate eligibility
        byte[] buffer = new byte[1024];     // 1KB buffer allocated
        processBuffer(buffer);              // Use it
        buffer = null;                      // NOW it's eligible for GC
        // Without nulling, 'buffer' keeps the 1KB alive until the method returns

        // 3. Collection cleanup
        List<Order> orders = new ArrayList<>();
        orders.add(new Order("1"));
        orders.add(new Order("2"));
        orders.clear();                     // Orders are now unreachable
        // But the ArrayList itself is still alive (just empty)
        // orders = null;   ← would make the ArrayList itself garbage too
    }
}
```

**Line-by-line explained:**
- **Scope cleanup** is the most common and safest: the JVM handles it automatically when variables leave scope.
- **Explicit nulling** is useful for large objects (byte arrays, big strings) that you want cleaned up immediately rather than waiting for the method to return.
- **`clear()`** removes elements from the collection, but the collection object itself is still alive. To garbage collect the collection, you need to null the reference to it.

### Monitoring GC Activity

```bash
# See GC activity in real-time:
jstat -gc <pid> 1000

# Output:
#  S0C    S1C    S0U    S1U      EC       EU        OC         OU       MC     MU
#  0.0    0.0    0.0    0.0  524288.0 262144.0  1048576.0   524288.0  45568.0  43812.0

# Key columns:
# EC/EU = Eden Capacity/Used (Young Gen)
# OC/OU = Old Capacity/Used (Old Gen) — if OU grows steadily, you have a memory leak
# MC/MU = Metaspace — watch for classloader leaks
```

### Triggering GC Programmatically

```java
// DON'T DO THIS in production:
System.gc();   // Suggests a Full GC — causes a long pause

// Better: let the JVM manage it automatically
// The JVM's heuristics are almost always better than manual triggering

// BUT: useful in tests or benchmarks:
@Test
void memoryTest() {
    // Create many objects
    for (int i = 0; i < 1_000_000; i++) {
        createTemporaryObject();
    }
    System.gc();         // Hint to JVM to collect before assertions
    Thread.sleep(100);   // Give GC time to run

    long used = Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory();
    assertThat(used).isLessThan(50_000_000);   // Less than 50MB used
}
```

**Line-by-line explained:**
- `System.gc()` is a **hint**, not a command. The JVM may or may not run GC.
- Never call it in production — it forces a Full GC that pauses ALL threads.
- In tests, it can help ensure a clean state before measuring memory.

---

## Real-World Scenarios

### Scenario 1: Memory Leak in a Cache

```java
// THE BUG: cache grows forever
public class UserService {
    private static final Map<String, UserSession> sessions = new HashMap<>();

    public void login(String userId) {
        sessions.put(userId, new Session(userId));   // Never removed!
    }
    // After 1M logins → 1M entries → heap fills → OOM
}

// THE FIX: Use a cache with eviction
private static final Cache<String, UserSession> sessions = Caffeine.newBuilder()
    .maximumSize(10_000)                              // Max entries
    .expireAfterAccess(Duration.ofMinutes(30))        // Evict after 30 min idle
    .build();
```

### Scenario 2: GC Pause Causing Timeout

```java
@RestController
public class OrderController {
    @GetMapping("/orders/{id}")
    public Order getOrder(@PathVariable String id) {
        // Normal: 50ms response time
        // But Full GC pauses ALL threads for 400ms
        // 10% of requests hit during GC → timeout!
        return orderService.findById(id);
    }
}
```

**Fix options:**
1. Reduce heap size (smaller heap → faster GC)
2. Switch to ZGC (<1ms pauses)
3. Tune G1 to keep pauses under 50ms
4. Fix the memory issue causing frequent Full GC

### Scenario 3: Finalizers (The Anti-Pattern)

```java
// OLD WAY (don't do this):
public class DatabaseConnection {
    @Override
    protected void finalize() throws Throwable {
        this.close();   // "Cleanup" when GC collects this object
        super.finalize();
    }
}

// PROBLEMS with finalizers:
// 1. Unpredictable — you don't know WHEN finalize() runs
// 2. Slow — objects with finalizers take 5-10x longer to collect
// 3. Can resurrect — this = this inside finalize() makes it alive again!
// 4. Thread — runs on a single finalizer thread, can block all collections

// NEW WAY (use these instead):
public class DatabaseConnection implements AutoCloseable {
    @Override
    public void close() {        // Deterministic cleanup
        connectionPool.release(this);
    }
}
// Use try-with-resources:
try (var conn = getConnection()) {
    // ... use connection ...
}   // close() called immediately — no GC needed
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| `System.gc()` in production | Forces Full GC, pauses ALL threads for 100ms+ | Remove it — let JVM decide |
| Finalizers for cleanup | Slow, unpredictable, can block GC | Use `AutoCloseable` + try-with-resources |
| Static collections without eviction | Objects live forever, heap fills up | Use Caffeine/Guava with TTL + max size |
| Not monitoring GC logs | Can't diagnose pause issues | Enable GC logging, alert on frequent Full GC |
| Assuming GC = memory leak fix | GC reclaims unreachable objects, not leaked references | Fix the leak (remove the reference), then GC helps |
| Creating huge temporary objects | Triggers humongous allocation in G1, causes Full GC | Use streaming/chunking for large data |

---

## Key Takeaways

- **Objects are garbage** when no live reference can reach them — scope exit, nulling, or collection clearing.
- **Young Gen** (frequent, fast GC) vs **Old Gen** (rare, slow GC) — keep the Old Gen healthy to avoid Full GC.
- **Don't call `System.gc()`** in production — the JVM's heuristics are better.
- **Use `AutoCloseable`** instead of finalizers — deterministic, fast, safe.
- **Most "GC problems" are memory leaks** — fix the code that keeps objects alive, don't just tune GC flags.

Official docs: [GC Tuning Guide](https://www.oracle.com/java/technologies/gctuning.html) · [java.lang.ref](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ref/package-summary.html)
