---
title: Profiling with JFR & Async Profiler
summary: Java Flight Recorder, the async profiler and the flame graph — finding the methods that actually cost you CPU and allocations.
order: 3
minutes: 14
topics: [jfr, async profiler, flame graph, cpu profiling, allocation profiling]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/specs/man/jfr.html
  - https://github.com/async-profiler/async-profiler
---

# Profiling with JFR & Async Profiler

## Profiling without the profiler tax

Classic sampling profilers attach agents that slow the app and distort the measurement. **Java Flight Recorder (JFR)** is built into the JDK and designed for production: low overhead (< 1–2%), always-on-able, and rich (CPU, allocations, locks, exceptions, I/O, GC).

```bash
# Record to a file for 60s, then stop:
jcmd <pid> JFR.start name=profile filename=profile.jfr
sleep 60
jcmd <pid> JFR.stop name=profile

# Or record on demand with the CLI:
jfr summary profile.jfr
jfr print --events jdk.ExecutionSample profile.jfr | head
```

Open the `.jfr` file in **JMC (JDK Mission Control)** or **IntelliJ**: flame graphs, allocation views, lock contention, exception counts. JFR also has a WebSocket/HTTP API (`jdk.jfr` events over `jfr.jmc.io`), and Spring Boot's Actuator can start recordings via `POST /actuator/jfr/recording` in recent versions.

## The async profiler: CPU + allocations, wall-clock true

The **async profiler** samples at fixed intervals *without* safepoint bias (the classic problem: safepoint-based sampling over-reports code near safepoints):

```bash
# Attach to a running JVM (Linux/macOS; Windows support via WSL):
./profiler.sh -d 60 -o flamegraph -f profile.html <pid>

# Allocation profiling — who allocates, in bytes (the GC root-cause view):
./profiler.sh -d 60 -e alloc -o flamegraph -f alloc.html <pid>
```

Output: interactive **flame graphs** — the wider a frame, the more time/bytes it accounts for. The `alloc` profile is the single best tool for "GC is busy": it shows the call paths allocating, so you fix *that*, not the GC settings.

## The reading discipline

1. **Profile the right environment** — a local dev box with a warm cache and a prod box with real data give different answers. Profile prod (JFR is safe) or a load-tested staging.
2. **Find the widest frame first** — the flame graph answers "where does time go?" before "how do I tune?". A method taking 40% of CPU that you've never heard of is the story.
3. **CPU vs wall** — `-e cpu` shows CPU burn; `-e wall` includes waiting (locks, I/O). A thread that "spins" might be blocked 95% of the time — wall profile shows it.
4. **Allocation profile drives GC fixes** — allocate 50% less in one hot path and the GC pressure story changes completely.

## A worked diagnosis

```text
Symptom: p99 latency spikes every few minutes; GC logs show frequent young GCs.
1. JFR: jdk.GCPhasePause — pauses are short (4ms). Not the spike.
2. Async profiler -e alloc: hottest path is OrderService.create →
   stream().collect(toList()) building a BigDecimal per row.
3. Fix: reuse a BigDecimal.ZERO accumulator, avoid per-row BigDecimal allocations.
4. Re-profile: young-GC frequency drops 3×; p99 recovers.
```

The pattern: **measure → identify the widest frame → one fix → re-measure**. Profiling without the re-measure is guessing with fancier tools.

## Lock contention & the async-profiler lock view

`-e lock` shows contended monitors — the "every thread waiting on one synchronized block" story:

```bash
./profiler.sh -d 30 -e lock -o flamegraph -f locks.html <pid>
```

Hot locks in Spring apps are usually singletons doing too much (a shared `ObjectMapper` is fine; a shared `SimpleDateFormat`-like mutable object is not). Contention fixes: narrower critical sections, `ConcurrentHashMap`/`AtomicX`, or redesigning the shared resource.

## Integrating profiling into the workflow

- **Always-on JFR in production**: `-XX:StartFlightRecording=settings=default,disk=true,maxage=1h` gives you a rolling recording — when the incident happens, the data is already there.
- **Profile on demand**: a recording started 5 minutes after the alert captures the incident, not the aftermath.
- **Make it a habit, not a fire drill**: profile after every significant performance change; the flame-graph diff is the changelog.

## Key takeaways

- JFR is built-in, low-overhead, production-safe — record with `jcmd`, view in JMC.
- The async profiler gives safepoint-bias-free CPU, allocation, wall and lock flame graphs.
- `-e alloc` flame graph is the root-cause view for GC pressure — fix the allocator, not the GC.
- Measure → widest frame → one fix → re-measure; keep rolling JFR in prod so incidents are already recorded.

Official docs: [jfr tool](https://docs.oracle.com/en/java/javase/21/docs/specs/man/jfr.html) · [async-profiler](https://github.com/async-profiler/async-profiler)
