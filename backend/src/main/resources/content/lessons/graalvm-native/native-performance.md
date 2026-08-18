---
title: Native Performance — Startup, Memory, and Peak Throughput
module: graalvm-native
order: 4
minutes: 24
topics: ["performance", "startup time", "memory", "peak throughput", "PGO", "profile-guided optimization"]
docs:
  - title: "Native Image Performance (GraalVM docs)"
    url: "https://www.graalvm.org/latest/docs/reference-manual/native-image/optimizations/"
  - title: "Profile-Guided Optimization (GraalVM docs)"
    url: "https://www.graalvm.org/latest/docs/reference-manual/native-image/guides/optimize-native-executable-with-pgo/"
---

# Native Performance — Startup, Memory, and Peak Throughput

## The Concept: The Honest Performance Picture

The native-image pitch leads with *instant startup* — and the fine print is the rest of the performance story: **peak throughput** (where the JVM usually wins), **memory** (where native usually wins), and **PGO** (the tool that changes the equation). Choosing between JVM and native for performance means knowing *which metric your workload actually depends on* — this lesson is the honest comparison, with the numbers and the reasoning.

**The mental model:** the JVM is a marathon runner who warms up slowly but runs a world-record pace once warm; the native binary is a sprinter off the blocks instantly but without the JIT's ability to re-optimize on the fly. Startup is the race's first 100 meters; throughput is the whole course. For a request that takes 200ms server-side, startup is noise (the app runs for years); for a serverless function billed per 100ms, startup *is* the bill.

## The Three Metrics, Honestly

**1. Startup — native wins by ~2 orders of magnitude.**

| | JVM Spring Boot | Native Spring Boot |
|---|---|---|
| Startup | 2–10 seconds | **50–150ms** |
| First request latency | seconds (JIT warmup) | ~immediate |

The native binary starts in milliseconds because there's no JVM to boot, no classpath to scan, no component scanning to do — the AOT build already wired everything. For serverless (cold starts), autoscaling from zero, and short-lived jobs (CLIs, batch tools, cron jobs), this is the decisive metric: a 3-second startup on a 500ms job means 85% of your runtime is overhead.

**2. Memory — native wins (lower footprint).**

The JVM carries the JIT compiler, class metadata, and the code cache; a Spring Boot app typically uses 300–800MB RSS. A native image drops the JVM entirely — the same app in native runs in 100–200MB (and can be tuned lower). For container fleets billed by memory, and for running many instances, the savings are real and steady. The flip side: the native *build* is memory-hungry (the compiler needs multiple GB) — build machines, not runtimes, pay that cost.

**3. Peak throughput — the JVM usually wins (with nuance).**

The JIT observes the running workload and optimizes the hot paths aggressively — inlining, specializing, de-virtualizing — reaching peak throughput that *statically compiled* code can't always match. Native image's static compilation is very good, but it can't adapt to the actual runtime distribution. **The honest numbers:** for typical Spring Boot workloads (JSON I/O, DB access — where the bottleneck is I/O, not CPU), the difference is often small (0–20%). For CPU-bound, compute-heavy loops, the JVM's JIT advantage grows.

## PGO: Closing the Throughput Gap

**Profile-Guided Optimization (PGO)** is the tool that makes static compilation *learn* the workload: you run the native binary against representative traffic, capture the profiling data, and rebuild using it:

```bash
# 1. Build a PGO-instrumented image:
./mvnw -Pnative -Dnative.profile=instrument native:compile

# 2. Run it against REPRESENTATIVE load, capture the profile:
./target/academy -XX:ProfilesDumpFile=app.iprof   # (GraalVM flag)
# ...drive realistic traffic through it (the more realistic, the better)

# 3. Rebuild, feeding the profile to the compiler:
./mvnw -Pnative -Dnative.profile=optimize native:compile
# (the build tools pass the .iprof to native-image automatically)
```

**The PGO insight:** the JIT's advantage is that it *knows the workload*; PGO hands the same knowledge to the AOT compiler — "branch X is hot, method Y is called 10,000×, inline it this way." With good PGO data, native peak throughput approaches (and for some workloads matches) the JIT. The requirement is the discipline: **the profiling run must reflect production traffic** — PGO trained on a test workload optimizes for the wrong workload.

## The I/O-Bound Reality (Why It Often Doesn't Matter)

Most Spring Boot applications are **I/O-bound**: they wait on databases, message brokers, and external APIs — the CPU spends most of its time blocked. For these, the JIT-vs-AOT throughput difference is largely invisible: the bottleneck is the database, not the method dispatch. The metrics that *do* matter for I/O-bound services: startup (native wins), memory (native wins), and **connection/resource efficiency** (roughly equal). The honest conclusion: for the typical microservice, the performance case for native is startup + memory, and the throughput gap is a non-issue — which is why the real decision is about the *other* trade-offs (reflection discipline, build time, tooling).

## The Workload Decision Matrix

| Workload | Metric that matters | Verdict |
|---|---|---|
| Serverless / cold starts | startup | **native** |
| Short-lived jobs (CLI, cron, batch) | startup + footprint | **native** |
| Long-running API service, I/O-bound | startup (minor), throughput ~equal | either — native for ops, JVM for comfort |
| CPU-bound compute hot loops | peak throughput | **JVM** (or native + PGO) |
| Memory-bounded fleets | footprint | **native** |
| Heavy dynamic/reflection use | flexibility | JVM (native needs hints) |

**The composite reality most teams land on:** JVM for the long-running core services (peak performance, dynamic freedom, mature tooling), native for the cold-start-sensitive edges (serverless functions, autoscaling tiers, CLIs) — with PGO reserved for the CPU-bound natives that need to close the throughput gap.

## The Memory Deep-Dive (For the Curious)

Why is native memory smaller? The JVM's footprint breaks down as: heap (application data), metaspace (class metadata — significant in Spring, with thousands of classes), code cache (JIT-compiled methods), and the JIT compiler itself. Native image eliminates: the JIT compiler, the interpreter, the metaspace machinery, and the class-loading infrastructure — and the AOT-processed context removes the *runtime* cost of component scanning and bean wiring. What remains is the heap (which native image manages with its own, tuned GC — SerialGC by default, G1 available) plus the compiled code. The takeaway: native's memory win comes from removing the *runtime machinery*, not from magic compression — which is why it's most dramatic for framework-heavy apps (like Spring) with lots of metadata to eliminate.

## The Measurement Discipline

- **Measure startup honestly** — `curl -w "%{time_total}"` on the first response, not the "Started in X" log line alone.
- **Measure memory in the container** — RSS/container metrics, not the JVM's reported heap.
- **Measure throughput under production-shaped load** — a benchmark with your real payloads, request mix, and concurrency; never a synthetic microbenchmark.
- **Measure both before deciding** — "native is faster" is workload-dependent; your workload's numbers are the only ones that matter.

## Recap

The honest native performance picture: **startup** (native wins by ~100× — milliseconds vs seconds), **memory** (native wins — no JVM machinery), and **peak throughput** (JVM's JIT usually leads, especially CPU-bound — but often irrelevant for I/O-bound services, and closable with **PGO**, which trains the AOT compiler on production-shaped profiling runs). The decision matrix is workload-driven: serverless and short-lived jobs go native; long-running I/O-bound services can go either way (startup/memory vs comfort); CPU-bound hot loops stay JVM (or native + PGO). Measure your workload's actual metrics — startup, RSS, and throughput under realistic load — and the "which is faster" debate resolves into a per-deployment calculation.
