---
title: Garbage Collection & Collectors
summary: How GC works — generations, stop-the-world pauses, the G1 and ZGC collectors, and reading GC logs to fix latency problems.
order: 2
minutes: 16
topics: [garbage collection, g1gc, zgc, gc logs, pause times, gc tuning]
docs:
  - https://docs.oracle.com/en/java/javase/21/gctuning/introduction-garbage-collection-tuning.html
  - https://docs.oracle.com/en/java/javase/21/gctuning/
---

# Garbage Collection & Collectors

## How GC actually works

Objects start in **Eden** (fast allocation, no checks). When Eden fills, a **minor GC** copies survivors to a survivor space (or promotes them to **Old** after enough copies). When Old fills, a **major/full GC** compacts the whole heap. The two truths that shape everything:

1. **Most objects die young** — generational collection exploits this: Eden is small, so minor GCs are frequent but cheap.
2. **The stop-the-world pause** — the collector must pause application threads to move objects and fix references; pause length is the latency tax.

A "GC pause" is not a bug — it's physics. The engineering is choosing a collector whose pauses fit your latency budget, and sizing the heap so full GCs are rare.

## The collectors (Java 21)

| Collector | Model | Pause profile | When |
|---|---|---|---|
| **G1** (default) | region-based, concurrent marking, incremental compaction | sub-second, tunable target | the default for a reason — most apps |
| **ZGC** | concurrent, colored pointers | ~<1 ms, almost no STW | huge heaps + tight latency (100 GB + realtime) |
| **Shenandoah** | concurrent evacuation | ~<1 ms | similar niche, simpler (Red Hat) |
| **Serial / Parallel** | stop-the-world | seconds | tiny heaps / throughput batch |

```bash
# Explicit choices:
-XX:+UseG1GC                       # default on modern JDKs — usually fine as-is
-XX:+UseZGC -Xmx16g                # <1ms pauses at 16 GB heap (extra memory cost)
-XX:+UseSerialGC                   # dev machines / tiny apps
```

The honest guidance: **stay on G1's defaults until data says otherwise**. GC tuning is debugging with a stopwatch, not a hobby — measure pauses, then change one thing.

## Reading the GC log

```bash
# Enable unified GC logging (Java 9+):
-Xlog:gc*:file=gc.log:time,uptime,level,tags
```

```text
[0.847s][info][gc] GC(0) Pause Young (Normal) (G1 Evacuation Pause) 256M->32M(512M) 3.452ms
[1.203s][info][gc] GC(1) Pause Young (Normal) (G1 Evacuation Pause) 288M->40M(512M) 4.101ms
[62.9s][info][gc] GC(21) Pause Full (G1 Compaction Pause) 500M->180M(1024M) 812ms   ← full GC!
```

What to look for:

- **Pause distribution** — p99 of young pauses (e.g. most < 5 ms, occasional 30 ms).
- **Full GC frequency** — a full GC every few minutes = heap too small or a leak. A full GC is the *latency spike* users feel.
- **Heap after GC** — if the heap bounces between "near full" and "comfortable", sizing is off; if it ratchets upward over days, that's a leak, not a tuning problem.
- **Promotion failures** — survivors can't fit in Old → full GC forced. More Old space or a bigger heap.

## The G1 knobs that matter (a short list)

```bash
-XX:MaxGCPauseMillis=100        # target — G1 sizes regions to hit it (a target, not a guarantee)
-XX:G1HeapRegionSize=8m         # region size — large objects (humongous) skip regions
-XX:+PrintAdaptiveSizePolicy    # shows why G1 resized itself
```

**Do not** hand-tune `NewRatio`/`SurvivorRatio` on G1 — it sizes adaptively; fighting it makes things worse. The levers that reliably matter: total heap, pause target, and (rarely) region size for humongous allocations.

## ZGC: when you need sub-ms

```bash
-XX:+UseZGC -Xmx32g
```

ZGC does almost all work concurrently; pauses stay under ~1 ms even at 32 GB. The price: extra CPU and memory (colored pointers + forwarding tables). **Choose ZGC when**: heap > ~8–16 GB, p99 latency is a hard requirement, and you have headroom on CPU/RAM. For a 2 GB Spring Boot app, G1 is right.

## What GC tuning is NOT

- It is not "make GC stop happening" — that's "make the app allocate less" (bigger win, harder work).
- It is not a substitute for finding a leak — a leak tuned to "acceptable" will still eat the box by Thursday.
- It is not the first lever — **allocation rate** (objects created per second) is the root cause; a profiler (next lesson) shows *who* allocates.

## Key takeaways

- Generational GC: most objects die in Eden; minor GCs are cheap, full GCs are the latency tax.
- G1 is the right default; ZGC for big heaps + tight latency; tune only with pause data.
- Read GC logs: pause distribution, full-GC frequency, heap-after-GC trend — one change at a time.
- Leaks are a code problem, not a tuning problem; allocation rate is the real first lever.

Official docs: [Garbage Collection Tuning](https://docs.oracle.com/en/java/javase/21/gctuning/)
