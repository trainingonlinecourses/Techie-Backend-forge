---
title: Garbage Collection — How the JVM Cleans Up
summary: Generational hypothesis, minor vs major GC, how each algorithm works, and the real-world impact of GC pauses. Beginner-friendly with line-by-line explanations.
order: 4
minutes: 25
topics: [garbage collection, generational GC, minor GC, major GC, G1GC, ZGC, concurrent marking, STW, GC roots]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html
  - https://www.oracle.com/java/technologies/gctuning.html
---

# Garbage Collection — How the JVM Cleans Up

## What is Garbage Collection? (From Zero)

In C/C++, you manually allocate and free memory. Forget to free → memory leak. Free twice → crash. Java's **Garbage Collector (GC)** automates this: it finds objects that are no longer used and reclaims their memory. You never call `free()` — the GC does it for you.

### The Generational Hypothesis

The GC's key insight: **most objects die young**. A request handler creates temporary strings, lists, and objects that are only needed for that one request. After the request completes, they're garbage.

So the heap is split into **generations**:
- **Young Generation**: New objects go here. GC runs frequently and is fast.
- **Old Generation**: Objects that survive multiple young GCs get promoted here. GC runs less often but takes longer.

```
Young Generation              Old Generation
┌────────────────────┐        ┌──────────────┐
│ Eden  │ S0  │  S1  │  ──→  │   Tenured    │
│(new)  │(sur)│ (sur) │ promo │   (long-lived)│
└────────────────────┘        └──────────────┘
   ↑ minor GC fast              ↑ major GC slow
   ↑ runs frequently            ↑ runs rarely
```

---

## The Types of Garbage Collection

### Minor GC (Young Generation)

```java
// These objects live in Young Gen:
public Order createOrder(OrderRequest req) {
    Order order = new Order();              // Allocated in Eden
    String desc = req.getDescription();     // Temporary, dies after return
    order.setTotal(calculateTotal(req));    // calcTotal creates temp objects
    return order;                           // order may survive → promoted to Old Gen
    // desc, temp objects → eligible for Minor GC
}
```

**What happens during Minor GC:**
1. Stop-the-world pause (very brief: 1-10ms)
2. Scan Eden + Survivor spaces
3. Live objects → copy to other Survivor space
4. Dead objects → reclaimed (memory freed)
5. Objects that survived N cycles → promoted to Old Gen

### Major/Full GC (Old Generation)

```java
// These objects live in Old Gen:
private static final Map<String, Config> configCache = new HashMap<>();  // Static → Old Gen
private final EntityManager em;  // Long-lived → Old Gen

// A Major GC scans the ENTIRE Old Generation
// This takes longer because there's more to scan
// Pause: 50-500ms depending on algorithm and heap size
```

### Concurrent GC (G1, ZGC, Shenandoah)

Modern GCs do most of their work **concurrently** (while your app runs), minimizing pause times:

```
G1 GC Timeline:
App:      ████░░░░░░░░░░░░░░░░░░░░░░████████████
G1:       ░░░░░████████████░░░░░░░░░░░░░░░░░░░░░░
          ↑ concurrent marking (no pause)
                       ↑ brief pause (5-20ms)
```

---

## The Code — Understanding GC Behavior

### Observing GC in Action

```bash
# Java 9+ unified logging:
java -Xlog:gc* -jar app.jar

# Output example:
[0.123s][info][gc] GC(0) Pause Young (Normal) (G1 Evacuation Pause) 12ms
[0.456s][info][gc] GC(1) Pause Young (Normal) (G1 Evacuation Pause) 8ms
[2.345s][info][gc] GC(2) Pause Full (G1 Humongous Allocation) 150ms
```

**Line-by-line explained:**
- `GC(0)`, `GC(1)` — GC event sequence number. You can count how many GCs happened.
- `Pause Young` — Minor GC: only collects the young generation. Fast (1-20ms).
- `Pause Full` — Major GC: collects the entire heap. Slow (50-500ms).
- `G1 Humongous Allocation` — An object bigger than half a region triggered a full GC. Avoid large objects.

### The Verbose GC Flag

```bash
# Detailed GC logging:
java -Xlog:gc*=info:file=/var/log/app/gc.log:time,uptime,tags -jar app.jar

# Key metrics to monitor:
# - GC frequency (how often)
# - GC pause time (how long the app is stopped)
# - GC reclaimed memory (how much was freed)
# - Promotion rate (how fast objects move to Old Gen)
```

---

## Real-World Scenarios

### Scenario 1: GC Pause Causing Timeout

```java
@RestController
public class OrderController {
    @GetMapping("/orders/{id}")
    public Order getOrder(@PathVariable String id) {
        // This endpoint has p99 = 500ms
        // But 10% of the time, a Full GC happens during the query
        // Full GC takes 400ms → total response = 500ms → timeout!
        return orderService.findById(id);
    }
}
```

**Fix options:**
1. **Reduce heap size** — smaller heap = faster Full GC (less to scan)
2. **Switch to ZGC** — sub-millisecond pauses
3. **Tune G1** — `-XX:MaxGCPauseMillis=50` to keep pauses under 50ms
4. **Fix the code** — reduce memory allocation so GC runs less often

### Scenario 2: Old Gen Filling Up (Memory Leak)

```bash
jstat -gc <pid> 1000

# Output shows Old Gen usage growing every second:
# OU (Old Used): 500M → 600M → 700M → 800M → ... → OOM
```

This is a **memory leak**, not a GC tuning issue. No GC algorithm can fix an application that creates objects faster than they can be collected.

### Scenario 3: Humongous Allocation in G1

```java
// BAD: Creates a 10MB byte array
byte[] buffer = new byte[10 * 1024 * 1024];  // 10MB!

// In G1, objects bigger than half the region size (default 4MB)
// are allocated as "humongous" — they trigger special GC behavior
// and can cause Full GC pauses

// FIX: Use off-heap buffers or stream the data
ByteBuffer buffer = ByteBuffer.allocateDirect(10 * 1024 * 1024);  // Off-heap
```

---

## GC Algorithm Deep Dive

### G1 GC (Garbage First)

```
Heap divided into 1-32MB regions:
┌───┬───┬───┬───┬───┬───┬───┬───┐
│ E │ E │ S │ O │ O │ O │ H │ E │  E=Eden, S=Survivor, O=Old, H=Humongous
└───┴───┴───┴───┴───┴───┴───┴───┘
```

- **How it works**: Divides heap into regions. Collects regions with the most garbage first (hence "Garbage First").
- **Concurrent marking**: Finds live objects while app runs (no pause).
- **Evacuation**: Copies live objects to new regions (brief pause).
- **Best for**: General-purpose web apps, 4GB+ heaps.

### ZGC (Zero-Copy GC)

```
App: ████████████████████████████████████████  (runs continuously)
ZGC: ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  (concurrent work)
     ↑ <1ms pause (only at safepoints, not full STW)
```

- **How it works**: Does ALL work concurrently. Pause time is independent of heap size (even 16TB heaps).
- **Sub-millisecond pauses**: The pause is only a few hundred microseconds.
- **Best for**: Latency-critical apps (trading, gaming, real-time).

---

## Common Mistakes

| Mistake | Why It Hurts | Fix |
|---|---|---|
| Ignoring GC logs | Can't diagnose pause issues without data | Always enable GC logging in production |
| Tuning GC for a memory leak | No GC algorithm fixes leaks | Fix the leak first, tune GC second |
| Using `System.gc()` to "help" GC | Forces a Full GC, causes unnecessary pause | Remove it — let the GC decide when to run |
| Setting `-Xmx` too large | Longer Full GC pauses (more to scan) | Match `-Xmx` to your actual needs |
| Not monitoring Old Gen growth | Memory leaks go undetected until OOM | Alert on Old Gen usage > 80% |

---

## Key Takeaways

- **Minor GC** is fast (1-10ms), **Major GC** is slow (50-500ms). Minimize Major GC by keeping the Old Gen healthy.
- **G1 GC** is the default and best for most apps. **ZGC** for sub-millisecond latency requirements.
- **GC pauses happen** — design your app to tolerate them (timeouts, retry logic, circuit breakers).
- **GC logs are your best friend** — always enable them, always monitor them.
- **Most GC issues are code issues** — fix memory allocation patterns before tuning GC flags.

Official docs: [GC Tuning Guide](https://www.oracle.com/java/technologies/gctuning.html) · [java tool](https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html)
