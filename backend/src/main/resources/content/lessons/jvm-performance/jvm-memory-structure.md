---
title: JVM Memory Structure
summary: Heap, stack, metaspace, direct buffers and the object layout — where memory goes in a JVM process and how to read the numbers.
order: 1
minutes: 15
topics: [jvm memory, heap, stack, metaspace, object layout, jstat]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html
  - https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-2.html
---

# JVM Memory Structure

## The memory regions

A JVM process divides memory into distinct regions with different lifetimes and failure modes:

| Region | What lives there | Lifecycle | Failure mode |
|---|---|---|---|
| **Heap** | objects (instances, arrays) | GC-managed | `OutOfMemoryError: Java heap space` |
| **Metaspace** | class metadata (bytecode-level structures) | until class unload | `OutOfMemoryError: Metaspace` (classloader leaks) |
| **Thread stacks** | local variables, call frames | per thread | `StackOverflowError` |
| **Code cache** | JIT-compiled native code | until flush | `CodeCache is full` (rare) |
| **Direct buffers** | off-heap `ByteBuffer.allocateDirect` (Netty, NIO) | explicit/GC via cleaner | `OutOfMemoryError: Direct buffer memory` |

The **heap** is the one that matters most: it holds every object, and its size bounds how much data your app can keep alive. Default sizing on modern JVMs is a fraction of RAM (e.g. 25% of physical memory); you tune it when GC behavior demands (next lesson).

## How a Java object uses memory

```java
class Order {               // header (12–16 bytes) + fields
    long id;                //   8 bytes
    String customer;        //   4 bytes (reference, compressed oops)
    BigDecimal total;       //   4 bytes (reference)
}
```

- **Object header**: mark word + class pointer — 12 bytes on 64-bit with compressed oops, 16 without.
- **References**: 4 bytes with `-XX:+UseCompressedOops` (default for heaps < 32 GB), 8 without.
- **Alignment**: objects are padded to 8-byte boundaries — a 20-byte object actually occupies 24.
- **Field ordering**: the JVM reorders fields to pack references together (layout is *not* source order — one more reason not to reflectively rely on it).

The practical point: **millions of small objects dominate memory** (a `Long` is 16 bytes + wrapper overhead vs 8 for a primitive; `Integer`-keyed maps are 2–3× heavier than primitive alternatives).

## Reading the numbers

```bash
jps                      # list JVM processes + pids
jcmd <pid> GC.heap_info  # current heap breakdown
jstat -gc <pid> 1s       # live GC/heap stats every second
```

```text
S0C    S1C    S0U    S1U      EC       EU        OC         OU       MC     MU
0.0    0.0    0.0    0.0  524288.0 262144.0  1048576.0   524288.0  45568.0  43812.0
```

- `EC/OU` — Eden capacity/usage, Old capacity/usage.
- `MC/MU` — Metaspace committed/used (watch `MU` grow without bound → classloader leak).
- Rule: **heap is not the only memory** — a container that dies with "native memory exhaustion" while the heap looks healthy is usually direct buffers, thread stacks, or Metaspace.

## The classic leaks and where they live

| Symptom | Likely culprit |
|---|---|
| Heap grows, GC can't reclaim | Retained references (static collections, caches without TTL, listeners never removed) |
| Metaspace grows on redeploy | Classloader leak — each undeploy keeps old classes (common in app servers) |
| Direct memory error under Netty | ByteBufs not released / buffers allocated per request |
| StackOverflowError | Unbounded recursion (rarely a tuning issue — a bug) |
| Heap "fine" but RSS huge | Off-heap: thread stacks (many threads × 1 MB default), direct buffers, native libs |

## Sizing heuristics

- **Total heap** (`-Xmx`) — set it *explicitly* in containers (`-Xmx2g` etc.); don't let the JVM guess against a container limit it can't see (JVM ≥ 10 does container-aware detection, but explicit beats default).
- **Metaspace** — `-XX:MaxMetaspaceSize` as a guard; normal Spring Boot apps need a few hundred MB.
- **Thread stacks** — `-Xss512k` for high-thread-count servers (virtual threads make this largely moot — the Java 21 lesson).
- **Never set `-Xms` and `-Xmx` equal unless startup predictability beats GC flexibility** — most teams find equal sizes reduce pause variance at the cost of footprint.

## Key takeaways

- Heap (objects), Metaspace (classes), stacks (threads), direct (off-heap) — four regions, four failure modes.
- Object layout: headers, compressed oops, alignment — small objects are the hidden memory hog.
- Read `jstat`/`jcmd` before tuning — guessing without data is how memory fires start.
- In containers, set `-Xmx` explicitly and remember the heap is not the whole RSS story.

Official docs: [java tool](https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html) · [JVM Spec — runtime data areas](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-2.html)
