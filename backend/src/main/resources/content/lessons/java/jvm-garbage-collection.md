---
title: Garbage Collection — How the JVM Reclaims Memory
summary: The heap generations, reachability, the major collectors (G1, ZGC), GC pause analysis, and the memory-flag and leak patterns orgs use.
order: 28
minutes: 22
topics: [garbage-collection, heap, generations, g1, zgc, gc-pauses, memory-leak, oom, jvm-flags]
docs:
  - https://docs.oracle.com/en/java/javase/21/gctuning/introduction-garbage-collection-tuning.html
  - https://jenkov.com/tutorials/java-concurrency/garbage-collection.html
---

# Garbage Collection — How the JVM Reclaims Memory

## The concept: reachability and generations

Java objects live on the **heap**, and memory is reclaimed by the **garbage collector (GC)** — you never `free()` manually. The GC's model is **reachability**: an object is alive if it's reachable from a root (a static field, a thread's stack, a local variable, a JNI reference); everything else is garbage. This is why memory leaks in Java are *accidental retention* — an object stays reachable through a long-lived reference (a static collection, a listener) long after you're done with it.

The heap is split by **age** because most objects die young (the *weak generational hypothesis*):

```text
┌─────────────────────────────── Heap ───────────────────────────────┐
│  Young Generation              │  Old Generation                    │
│  ┌──────┬──────┬───────────┐   │  (survivors, long-lived objects)   │
│  │ Eden │ S0   │ S1        │   │                                    │
│  └──────┴──────┴───────────┘   │                                    │
└─────────────────────────────────────────────────────────────────────┘
```

- **Eden** — new objects; fills fast; a *minor GC* evacuates survivors to a survivor space (S0/S1, swapped each cycle).
- **Old generation** — objects that survive enough minor GCs get **promoted**; filled objects trigger a *major/full GC*.
- **Metaspace** — class metadata (separate from the heap; leaks appear as `OutOfMemoryError: Metaspace`).

## The collectors you'll meet

- **G1 (default since Java 9)** — divides the heap into regions and collects *incrementally*, prioritizing regions with the most garbage. Targets a configurable pause goal (`-XX:MaxGCPauseMillis=200`). The right default for most services.
- **ZGC / Shenandoah** — designed for **very large heaps with tiny pauses** (sub-millisecond to a few ms) by doing most work concurrently. Choose when you have tens of GB heaps and pause-sensitive latency (trading-card systems, in-memory caches at scale).
- **Serial/Parallel** — Parallel is the default on multi-core machines for throughput; used in batch/offline jobs where pauses don't matter.

## How we use it in an organization: the flag patterns

**The standard production flag set** (the shape teams template, tuned per service):

```bash
java -Xms4g -Xmx4g \                                # heap 4g, fixed (no resize churn)
     -XX:+UseG1GC \                                 # explicit collector choice
     -XX:MaxGCPauseMillis=200 \                     # G1 pause target
     -XX:+HeapDumpOnOutOfMemoryError \              # capture the evidence when it OOMs
     -XX:HeapDumpPath=/var/log/app/heapdump.hprof \
     -Xlog:gc*:file=/var/log/app/gc.log:time,uptime,level,tags:filecount=5,filesize=20m \
     -jar app.jar
```

- **`-Xms = -Xmx`** — a fixed heap avoids resize GCs and gives the GC stable territory to plan with.
- **`HeapDumpOnOutOfMemoryError`** — the single most useful flag: when prod OOMs, you get a heap dump to analyze instead of a mystery.
- **GC logging to a rolling file** — the first stop when diagnosing latency spikes: a long GC pause shows up as `Pause Young/Mixed (G1 Evacuation Pause) ... 150ms`.

## The scenarios teams hit

**Scenario 1 — a memory leak (accidental retention).** A static cache that grows forever, or an unregistered listener holding every processed entity:

```java
// Leak: static map retains every key ever seen
private static final Map<String, Order> ORDERS = new HashMap<>();  // grows unboundedly

// Fix: bounded cache with eviction
private static final Cache<String, Order> ORDERS =
    Caffeine.newBuilder().maximumSize(10_000).expireAfterWrite(5, TimeUnit.MINUTES).build();

// Fix for listener-style retention: unregister in @PreDestroy / finally
```

**Scenario 2 — analyzing a heap dump.** After an OOM with `HeapDumpOnOutOfMemoryError`, open the `.hprof` in Eclipse MAT / VisualVM: the **Dominator Tree** shows which objects hold the most memory and the *GC roots* path that keeps them alive — the "who's holding this" answer.

**Scenario 3 — diagnosing pause spikes.** `gc.log` shows a long pause; the fix is usually heap sizing (too small → frequent full GCs), a leak (old gen grows), or promotion pressure. Tools: `jstat -gcutil <pid> 1s` for live monitoring, `jcmd <pid> GC.heap_info` for a snapshot.

**Scenario 4 — tuning G1 pause targets.** `-XX:MaxGCPauseMillis` is a *goal*, not a guarantee — G1 adjusts its work to try to meet it. If the goal is too aggressive, throughput drops (GC runs constantly); tune with the GC log, not guesses.

## Pitfalls

- **GC is not "free memory reclamation you can ignore"** — every GC pauses threads (even concurrent collectors stop-the-world briefly). The GC log is a first-class performance signal.
- **`-Xmx` too large on a shared box** — the heap must fit in the container's memory limit; with containers, set `-Xmx` *below* the container limit (or use `-XX:MaxRAMPercentage=75` with `UseContainerSupport`, the default on modern JDKs) or the OS kills the container.
- **System.gc() is a hint, not a command** — calling it can force full GCs; in containers it may be ignored (`-XX:+DisableExplicitGC`).
- **Weak/soft references for caching** — `WeakHashMap`/`SoftReference` caches are collected unpredictably; use a real bounded cache (Caffeine) with explicit eviction instead.
- **Metaspace leaks** — unbounded class loading (dynamic proxies, generated classes in a loop) grows Metaspace; `-XX:MaxMetaspaceSize` bounds it.

## Key takeaways

- GC reclaims unreachable objects; leaks are accidental retention via long-lived references.
- Young-gen collects short-lived objects cheaply; old-gen holds survivors; G1 is the default collector.
- Template flags: fixed heap, explicit G1, `HeapDumpOnOutOfMemoryError`, rolling GC logs.
- Diagnose pauses and leaks from gc.log + heap dumps (MAT/VisualVM dominator analysis).
- Container memory: size the heap below the container limit; use bounded caches, not weak-reference tricks.
