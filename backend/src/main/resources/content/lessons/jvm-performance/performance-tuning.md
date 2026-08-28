---
title: JVM Performance Tuning — The Complete Guide
summary: A systematic approach to JVM tuning — measuring first, understanding GC algorithms, choosing the right flags, and avoiding premature optimization.
order: 5
minutes: 25
topics: [performance tuning, GC selection, throughput, latency, p99, G1GC, ZGC, tuning methodology, benchmarks]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html
  - https://www.oracle.com/java/technologies/gctuning.html
---

# JVM Performance Tuning — The Complete Guide

## What is JVM Performance Tuning? (From Zero)

JVM performance tuning is the process of adjusting JVM settings to meet your application's **latency** (how fast each request is) or **throughput** (how many requests per second) requirements. The key insight: **measure first, tune second**. Most performance problems aren't JVM issues — they're code issues.

### The Tuning Methodology (Always Follow This)

```
1. Set clear goals    → p99 latency < 200ms? Throughput > 10k req/s?
2. Measure baseline   → What do you get with DEFAULT settings?
3. Identify bottleneck → Is it CPU? Memory? I/O? Lock contention?
4. Make ONE change    → Change ONE setting at a time
5. Measure again      → Did it improve? By how much?
6. Repeat             → Go back to step 3 until goals are met
```

**Never skip step 2.** You can't improve what you haven't measured.

---

## GC Algorithms — The Big Choice

| Algorithm | Best For | Pause Time | Throughput | When to Use |
|---|---|---|---|---|
| **Serial GC** | Single-core, small heaps | High (stop-the-world) | Lowest | Embedded, tiny apps |
| **Parallel GC** | Batch jobs, high throughput | Medium (50-200ms) | Highest | Batch processing, data pipelines |
| **G1 GC** | Balanced (default since Java 9) | Low (10-50ms) | High | General-purpose web apps |
| **ZGC** | Ultra-low latency | <1ms | Medium | Real-time systems, gaming, trading |
| **Shenandoah** | Ultra-low latency | <1ms | Medium | Similar to ZGC (Red Hat alternative) |

### How to Choose

```bash
# For most web apps (balanced):
java -XX:+UseG1GC -Xmx2g -jar app.jar

# For batch processing (max throughput):
java -XX:+UseParallelGC -Xmx4g -jar app.jar

# For ultra-low latency (sub-millisecond pauses):
java -XX:+UseZGC -Xmx2g -jar app.jar

# For Java 21+ with virtual threads (G1 is recommended):
java -XX:+UseG1GC -Xmx2g -jar app.jar
```

---

## The Code — Key Tuning Flags

### Heap Sizing

```bash
# Set initial and max heap size:
java -Xms2g -Xmx2g -jar app.jar

# Why set both equal?
# -Xms = Xmx avoids heap resizing pauses (heap grows/shrinks dynamically)
# Trade-off: uses 2GB even when idle, but no resize pauses
```

### G1 GC Tuning

```bash
# Target pause time (default 200ms):
java -XX:+UseG1GC \
     -XX:MaxGCPauseMillis=50 \        # Aim for 50ms pauses
     -XX:G1HeapRegionSize=16m \        # Region size (1-32MB, power of 2)
     -XX:G1NewSizePercent=30 \         # Min young gen (30% of heap)
     -XX:G1MaxNewSizePercent=60 \      # Max young gen (60% of heap)
     -Xmx2g -jar app.jar
```

**Line-by-line explained:**
- `-XX:MaxGCPauseMillis=50` — G1 tries to keep pauses under 50ms. It's a target, not a guarantee — G1 adjusts region counts to meet it.
- `-XX:G1HeapRegionSize=16m` — Divides the heap into 16MB regions. Larger regions = fewer GC events, but less granular.
- `-XX:G1NewSizePercent=30` — Minimum 30% of heap for young generation. More young gen = fewer minor GCs.
- `-XX:G1MaxNewSizePercent=60` — Maximum young gen can grow to 60%. Prevents old gen from being too small.

### ZGC Tuning (Java 21+)

```bash
# Ultra-low latency:
java -XX:+UseZGC \
     -XX:+ZGenerational \            # Use generational ZGC (Java 21+)
     -Xmx2g \
     -jar app.jar
```

ZGC is much simpler to tune — it's designed for "set it and forget it." The main decision is heap size.

---

## Real-World Scenarios

### Scenario 1: Web App with p99 Latency Goals

**Problem:** API p99 latency is 500ms, goal is under 200ms.

```bash
# Step 1: Baseline with G1 (default)
java -XX:+UseG1GC -Xmx2g -jar app.jar
# Result: p99 = 500ms, GC pause = 200ms

# Step 2: Reduce pause target
java -XX:+UseG1GC -XX:MaxGCPauseMillis=50 -Xmx2g -jar app.jar
# Result: p99 = 250ms, GC pause = 40ms (but more frequent GCs)

# Step 3: Switch to ZGC for sub-millisecond pauses
java -XX:+UseZGC -XX:+ZGenerational -Xmx2g -jar app.jar
# Result: p99 = 150ms, GC pause = <1ms ✅
```

### Scenario 2: Batch Job with High Throughput

**Problem:** Processing 1M records is slow because GC interrupts frequently.

```bash
# Parallel GC maximizes throughput (but longer pauses):
java -XX:+UseParallelGC \
     -XX:ParallelGCThreads=8 \         # Use 8 threads for GC
     -XX:MaxGCPauseMillis=200 \        # Allow longer pauses
     -Xmx4g -jar app.jar

# Result: 40% throughput improvement (fewer, longer pauses)
# For batch jobs, total speed matters more than individual pause length
```

### Scenario 3: Diagnosing a Performance Regression

```bash
# Step 1: Check if it's GC
jstat -gc <pid> 1000
# If Full GC is running frequently → memory issue
# If Minor GC is running every few seconds → young gen too small

# Step 2: Check if it's CPU
top -H -p <pid>
# If one thread is at 100% → hot method, use JFR to find it

# Step 3: Check if it's I/O
jcmd <pid> JFR.start name=io settings=profile duration=60s filename=io.jfr
# Look at FileRead/FileWrite events in JMC
```

---

## Common Mistakes

| Mistake | Why It Hurts | Fix |
|---|---|---|
| Not setting `-Xmx` in containers | JVM guesses wrong, gets OOM-killed | Always set explicitly |
| Tuning without measuring | Wasted effort, might make things worse | Baseline first, then change ONE thing |
| Copying flags from StackOverflow | Flags that work for one app may hurt another | Understand what each flag does |
| Using `-XX:+PrintGCDetails` (deprecated) | Use `-Xlog:gc*` instead | Java 9+ unified logging |
| Ignoring code-level issues | No GC tuning fixes a memory leak | Fix the leak, then tune GC |
| Setting `-XX:MaxGCPauseMillis` too low | GC runs constantly, throughput drops | Start with 50-100ms, measure |

---

## Key Takeaways

- **Measure first, tune second** — set clear goals, baseline, identify bottleneck, change ONE thing.
- **G1 GC is the default** for most apps — it's balanced and well-tuned out of the box.
- **ZGC for ultra-low latency** — sub-millisecond pauses, simple to configure.
- **Set `-Xmx` explicitly** in containers — don't let the JVM guess.
- **Most performance problems are code issues**, not JVM settings — profile before you tune.

Official docs: [java tool](https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html) · [GC Tuning Guide](https://www.oracle.com/java/technologies/gctuning.html)
