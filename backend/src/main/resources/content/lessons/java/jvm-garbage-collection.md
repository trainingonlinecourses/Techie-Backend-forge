---
title: JVM Garbage Collection — How Java Manages Memory
summary: Generational hypothesis, minor vs major GC, how objects become eligible for collection, and the real-world impact of GC pauses on application performance.
order: 50
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


**What this code does — step by step:**

1. `Order order = new Order("ORD-001");` — order points to the new Order object. ... use the order ...
2. `}` — Method ends — the local variable 'order' goes out of scope. The Order object is now unreachable → eligible for GC
3. `private static List<Order> cache = new ArrayList<>();` — Static — lives forever!
4. `cache.add(order);` — Now 'order' is reachable through the static list
5. Even after addToCache returns, the Order is STILL alive. Because 'cache' (static) holds a reference

The same code, clean:

```java
public void createAndAbandon() {
    Order order = new Order("ORD-001");
}

public void leakedReference() {
    private static List<Order> cache = new ArrayList<>();

    public void addToCache(Order order) {
        cache.add(order);
    }
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


**What this code does — step by step:**

1. These live in Young Gen (temporary):
2. `String temp = "Hello";` — Created, used briefly
3. `List<String> items = new ArrayList<>();` — Temporary list. After method returns, temp and items → Young Gen garbage
4. These get promoted to Old Gen (long-lived):
5. `private static final Config config = new Config();` — Static → lives forever
6. `private final Cache<String, Order> orderCache;` — Instance field → long-lived

The same code, clean:

```java
public void handleRequest() {
    String temp = "Hello";
    List<String> items = new ArrayList<>();
}

private static final Config config = new Config();
private final Cache<String, Order> orderCache;
```

---

## The Code — Line by Line

### Making Objects Eligible for GC


**What this code does — step by step:**

1. 1. Method scope — automatic cleanup
2. `String name = "Alice";` — 'name' references a String object. ... use name ... When method returns, 'name' goes out of scope → "Alice" becomes garbage
3. 2. Explicit nulling — immediate eligibility
4. `byte[] buffer = new byte[1024];` — 1KB buffer allocated
5. `processBuffer(buffer);` — Use it
6. `buffer = null;` — NOW it's eligible for GC. Without nulling, 'buffer' keeps the 1KB alive until the method returns
7. 3. Collection cleanup
8. `orders.clear();` — Orders are now unreachable. But the ArrayList itself is still alive (just empty). Orders = null; ← would make the ArrayList itself garbage too

The same code, clean:

```java
public class MemoryManagement {

    public void demonstrateGC() {
        String name = "Alice";

        byte[] buffer = new byte[1024];
        processBuffer(buffer);
        buffer = null;

        List<Order> orders = new ArrayList<>();
        orders.add(new Order("1"));
        orders.add(new Order("2"));
        orders.clear();
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


**What this code does — step by step:**

1. DON'T DO THIS in production:
2. `System.gc();` — Suggests a Full GC — causes a long pause
3. Better: let the JVM manage it automatically. The JVM's heuristics are almost always better than manual triggering
4. BUT: useful in tests or benchmarks:
5. Create many objects
6. `System.gc();` — Hint to JVM to collect before assertions
7. `Thread.sleep(100);` — Give GC time to run
8. `assertThat(used).isLessThan(50_000_000);` — Less than 50MB used

The same code, clean:

```java
System.gc();


@Test
void memoryTest() {
    for (int i = 0; i < 1_000_000; i++) {
        createTemporaryObject();
    }
    System.gc();
    Thread.sleep(100);

    long used = Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory();
    assertThat(used).isLessThan(50_000_000);
}
```

**Line-by-line explained:**
- `System.gc()` is a **hint**, not a command. The JVM may or may not run GC.
- Never call it in production — it forces a Full GC that pauses ALL threads.
- In tests, it can help ensure a clean state before measuring memory.

---

## Real-World Scenarios

### Scenario 1: Memory Leak in a Cache


**What this code does — step by step:**

1. THE BUG: cache grows forever
2. `sessions.put(userId, new Session(userId));` — Never removed!
3. After 1M logins → 1M entries → heap fills → OOM
4. THE FIX: Use a cache with eviction
5. `.maximumSize(10_000)` — Max entries
6. `.expireAfterAccess(Duration.ofMinutes(30))` — Evict after 30 min idle

The same code, clean:

```java
public class UserService {
    private static final Map<String, UserSession> sessions = new HashMap<>();

    public void login(String userId) {
        sessions.put(userId, new Session(userId));
    }
}

private static final Cache<String, UserSession> sessions = Caffeine.newBuilder()
    .maximumSize(10_000)
    .expireAfterAccess(Duration.ofMinutes(30))
    .build();
```

### Scenario 2: GC Pause Causing Timeout

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

**Fix options:**
1. Reduce heap size (smaller heap → faster GC)
2. Switch to ZGC (<1ms pauses)
3. Tune G1 to keep pauses under 50ms
4. Fix the memory issue causing frequent Full GC

### Scenario 3: Finalizers (The Anti-Pattern)


**What this code does — step by step:**

1. OLD WAY (don't do this):
2. `this.close();` — "Cleanup" when GC collects this object
3. PROBLEMS with finalizers: 1. Unpredictable — you don't know WHEN finalize() runs. 2. Slow — objects with finalizers take 5-10x longer to collect. 3. Can resurrect — this = this inside finalize() makes it alive again! 4. Thread — runs on a single finalizer thread, can block all collections
4. NEW WAY (use these instead):
5. `public void close() {` — Deterministic cleanup
6. Use try-with-resources:
7. ... use connection ...
8. `}` — close() called immediately — no GC needed

The same code, clean:

```java
public class DatabaseConnection {
    @Override
    protected void finalize() throws Throwable {
        this.close();
        super.finalize();
    }
}


public class DatabaseConnection implements AutoCloseable {
    @Override
    public void close() {
        connectionPool.release(this);
    }
}
try (var conn = getConnection()) {
}
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

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/)
