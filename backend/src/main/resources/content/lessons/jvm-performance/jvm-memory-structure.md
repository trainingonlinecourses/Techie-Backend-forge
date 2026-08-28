---
title: JVM Memory Structure — The Complete Guide
summary: Heap, stack, metaspace, direct buffers and the object layout — where memory goes in a JVM process and how to read the numbers. Beginner-friendly with line-by-line code.
order: 1
minutes: 25
topics: [jvm memory, heap, stack, metaspace, object layout, jstat, compressed oops, direct buffers, memory regions]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html
  - https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-2.html
---

# JVM Memory Structure — The Complete Guide

## What is JVM Memory? (From Zero)

When you run a Java program, the JVM allocates a chunk of your computer's RAM and divides it into different **regions**. Each region serves a specific purpose and has its own lifecycle and failure mode. Understanding these regions is critical for debugging `OutOfMemoryError` and tuning performance.

Think of it like a house:
- **Heap** = the living room (biggest space, where most things live)
- **Stack** = sticky notes on the fridge (small, per-thread, temporary)
- **Metaspace** = the filing cabinet (blueprints/metadata for all classes)
- **Direct buffers** = the garage (off-heap storage for NIO/Netty)

---

## The Memory Regions

| Region | What lives there | Lifecycle | Failure mode |
|---|---|---|---|
| **Heap** | Objects (instances, arrays) | GC-managed (automatically freed) | `OutOfMemoryError: Java heap space` |
| **Metaspace** | Class metadata (bytecode structures) | Until class is unloaded | `OutOfMemoryError: Metaspace` |
| **Thread stacks** | Local variables, call frames | Created/destroyed with thread | `StackOverflowError` |
| **Code cache** | JIT-compiled native code | Until JVM flushes it | `CodeCache is full` (rare) |
| **Direct buffers** | Off-heap `ByteBuffer.allocateDirect()` (Netty, NIO) | Explicit or GC via cleaner | `OutOfMemoryError: Direct buffer memory` |

---

## The Heap — Where Objects Live

The heap is the most important region. Every object you create with `new` lives here. The heap is divided into generations:

```
┌─────────────────────────────────────────────────────────┐
│                        HEAP                              │
├──────────────────────┬──────────────────────────────────┤
│     Young Gen        │          Old Gen                 │
├──────┬───────┬───────┤                                  │
│ Eden │  S0   │  S1   │        (Tenured)                 │
│      │(From) │ (To)  │                                  │
└──────┴───────┴───────┴──────────────────────────────────┘
  New objects → Eden → Survive → S0/S1 → Old Gen → GC'd
```

**Young Generation:** New objects are allocated here. Most objects die young (local variables, temporary strings). The GC runs frequently here (minor GC) and is very fast.

**Old Generation:** Objects that survive multiple minor GCs are promoted here. Major GC runs less frequently but takes longer.

```java
// This string lives in Young Gen (Eden space):
String temp = "Hello";          // Created, used briefly, eligible for GC quickly

// This object gets promoted to Old Gen (long-lived):
private static final Config config = new Config();  // Lives for the entire app lifetime
```

---

## How Java Objects Use Memory

```java
class Order {                    // header (12-16 bytes) + fields
    long id;                     //   8 bytes (primitive long)
    String customer;             //   4 bytes (reference, compressed oops)
    BigDecimal total;            //   4 bytes (reference)
}
```

**Memory layout explained:**
- **Object header**: 12 bytes with compressed oops (default for heaps < 32 GB), 16 bytes without. Contains mark word (hashcode, GC age, lock info) + class pointer.
- **References**: 4 bytes with `-XX:+UseCompressedOops` (default), 8 bytes without.
- **Alignment**: Objects are padded to 8-byte boundaries. A 20-byte object actually uses 24 bytes.

**The practical impact:** A `Long` object is 16 bytes vs 8 bytes for a primitive `long`. A `HashMap<Long, ...>` stores millions of wrapper objects — that's 2x the memory just for keys.

```java
// BAD: 16 bytes per key + wrapper overhead
Map<Long, Order> orders = new HashMap<>();

// BETTER for large datasets: use a primitive-specialized library
// or consider if the wrapper overhead matters for your use case
```

---

## Reading the Numbers — Command Line Tools

### jstat: Live GC Stats

```bash
jps                              # List all JVM processes with PIDs
jstat -gc <pid> 1000             # Show GC stats every 1 second
```

```
  S0C    S1C    S0U    S1U      EC       EU        OC         OU       MC     MU
  0.0    0.0    0.0    0.0  524288.0 262144.0  1048576.0   524288.0  45568.0  43812.0
```

**What each column means:**
- `S0C/S1C` = Survivor 0/1 Capacity (bytes)
- `S0U/S1U` = Survivor 0/1 Used (bytes)
- `EC/EU` = Eden Capacity/Used — young gen allocation area
- `OC/OU` = Old Gen Capacity/Used — watch `OU` grow over time
- `MC/MU` = Metaspace Capacity/Used — if `MU` grows without bound → classloader leak

### jcmd: Detailed Heap Info

```bash
jcmd <pid> GC.heap_info          # Breakdown of heap regions
jcmd <pid> VM.flags              # All JVM flags
jcmd <pid> GC.heap_dump /tmp/heap.hprof   # Take a heap dump
```

---

## The Classic Memory Leaks

| Symptom | Likely Cause | How to Diagnose |
|---|---|---|
| Heap grows, GC can't reclaim | Retained references (static collections, caches without TTL) | Heap dump → find biggest retained objects |
| Metaspace grows on redeploy | Classloader leak (app servers keep old classes) | `jcmd <pid> GC.class_stats` |
| Direct memory error under Netty | ByteBufs not released / buffers allocated per request | `-XX:MaxDirectMemorySize` + Netty leak detection |
| StackOverflowError | Unbounded recursion | Stack trace tells you exactly where |
| Heap "fine" but RSS huge | Thread stacks (1MB per thread), direct buffers, native libs | `jcmd <pid> VM.native_memory` |

### Example: Detecting a Memory Leak

```java
// The leak: a static cache that never evicts
public class UserService {
    private static final Map<String, UserSession> sessions = new HashMap<>();

    public void login(String userId) {
        sessions.put(userId, new Session(userId));   // Never removed!
    }
    // After 1M logins, this map has 1M entries → heap OOM
}

// The fix: use a cache with TTL and max size
private static final Cache<String, UserSession> sessions = Caffeine.newBuilder()
    .maximumSize(10_000)               // Max entries
    .expireAfterAccess(Duration.ofMinutes(30))   // Evict after 30 min idle
    .build();
```

---

## Sizing Heuristics

- **Total heap (`-Xmx`)** — Set explicitly in containers (`-Xmx2g`). Don't let the JVM guess against a container limit it can't see.
- **Metaspace (`-XX:MaxMetaspaceSize`)** — Set as a guard. Normal Spring Boot apps need 100-200 MB.
- **Thread stacks (`-Xss512k`)** — For high-thread-count servers. Virtual threads make this less important.
- **Direct memory (`-XX:MaxDirectMemorySize`)** — For NIO/Netty apps. Default is same as `-Xmx`.

```bash
# Production JVM flags for a container:
java -Xmx2g -Xms2g \
     -XX:MaxMetaspaceSize=256m \
     -XX:MaxDirectMemorySize=512m \
     -Xss512k \
     -jar app.jar
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Not setting `-Xmx` in containers | JVM guesses wrong, gets OOM-killed by container runtime | Always set `-Xmx` explicitly |
| Using `Long`/`Integer` in hot-path maps | 2x memory overhead vs primitives | Consider Trove/ Eclipse Collections for large datasets |
| Ignoring Metaspace | Classloader leaks kill long-running apps | Monitor `jcmd GC.class_stats` growth |
| Equal `-Xms` and `-Xmx` | Reduces GC flexibility (no grow/shrink) | Unless startup predictability is critical |
| Forgetting thread stacks | 1000 threads × 1MB = 1GB RSS before any objects | Reduce `-Xss` or use virtual threads |

---

## Key Takeaways

- **Four memory regions**: heap (objects), metaspace (classes), stacks (threads), direct (off-heap).
- **Object layout matters**: headers + compressed oops + alignment — small objects are the hidden memory hog.
- **Read before tuning**: use `jstat` and `jcmd` to understand your actual memory usage.
- **In containers**: always set `-Xmx` explicitly and remember the heap is not the whole RSS story.

Official docs: [java tool](https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html) · [JVM Spec — runtime data areas](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-2.html)
