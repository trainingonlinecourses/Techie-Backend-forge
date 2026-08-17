---
title: Heap Analysis — Finding the Leak
summary: Heap dumps, the retained-size view, dominator trees and the leak pattern that repeats — plus OOM flags that keep the evidence.
order: 4
minutes: 14
topics: [heap dump, oom, leak analysis, dominator tree, retained size]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/specs/man/jmap.html
  - https://www.eclipse.org/mat/
---

# Heap Analysis — Finding the Leak

## Capturing the dump

A heap dump is a snapshot of every live object + references. Two ways to get one:

```bash
# On demand (works on a running JVM):
jmap -dump:live,format=b,file=heap.hprof <pid>

# Automatically on OutOfMemoryError — ALWAYS set this in production:
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/var/log/heap-<pid>.hprof
```

`HeapDumpOnOutOfMemoryError` is the first production JVM flag a Java backend sets: the OOM wipes the evidence unless you asked for the dump first. (Dumps of live heaps can be seconds to minutes and several GB — budget disk and don't dump on a box already thrashing.)

## The tool: Eclipse MAT (or your IDE)

Open the `.hprof` in **Eclipse MAT** (or IntelliJ's profiler / JProfiler). The three views that matter:

- **Leak Suspects report** — MAT's heuristic scan: "the biggest suspects and why". Start here; it's right shockingly often.
- **Dominator Tree** — every object with its **retained size** (the memory that would be freed if this object died). Sort by retained size → the top rows are the leak.
- **Path to GC Roots** — for the top suspect, *why is it still reachable*? This is the actual answer: "held by a static `Map` in `CacheManager`", "held by a thread's local variable that never ended".

## The leak pattern that repeats

```text
Leak Suspects: 1 problem detected.
  → 3.2 GB retained by java.util.HashMap @ 0x... (70.1%)
    Path to GC Roots:
      class com.acme.CacheManager (static field caches)
        → HashMap
          → "session:99" → UserSession (67 MB)
```

This is the 80% case: **an unbounded static collection** — caches without TTL or eviction, "session" maps keyed by id, listeners appended but never removed, request-scoped data stored in a singleton. The fix is usually a bounded structure (Caffeine, `LinkedHashMap` with `removeEldestEntry`, a TTL — the caching lesson's discipline), not memory surgery.

## Reading retained vs shallow

- **Shallow size** — the object itself (small: an 8-byte reference).
- **Retained size** — the object + everything only it keeps alive (huge for a Map holding millions of entries).

Always sort by **retained** — shallow sizes lead you to a million tiny objects that are symptoms, not causes. The dominator tree is your friend precisely because it groups by "what dies together".

## The other common culprits

| Pattern | Signature in MAT |
|---|---|
| Unbounded cache / static map | one `HashMap` with huge retained size, reachable via a static field |
| Thread-local leak | many thread objects each holding a reference; threads never die (pools!) |
| JDBC/HTTP connection leak | `Connection`/`Socket` objects accumulating — the *statements* or *results* weren't closed |
| Classloader leak (redeploys) | duplicate classes: the same class name loaded by 2+ loaders |
| Listener/observer leak | objects reachable only through a listener list in a long-lived bean |

**Listeners and caches are the two to check first** — they're the only "useful" leaks, which is why they go unnoticed until the box dies at 3am.

## From dump to fix, the 10-minute loop

```bash
# 1. Get the evidence (already have it if HeapDumpOnOutOfMemoryError was set)
jmap -dump:live,format=b,file=heap.hprof 12345

# 2. Open in MAT → Leak Suspects → dominator tree → Path to GC Roots
# 3. Identify the owning structure + who keeps it alive
# 4. Fix: bound it, TTL it, or stop adding to it (remove the listener on destroy)
# 5. Re-run with a soak test — heap-after-GC should plateau, not ratchet
```

The **plateau test** is the acceptance criterion: run the app under sustained load and watch heap-after-full-GC — a healthy app plateaus, a leaking one ratchets upward until the next OOM.

## Key takeaways

- Set `-XX:+HeapDumpOnOutOfMemoryError` in production — the dump is the only evidence of a leak.
- MAT: Leak Suspects → dominator tree by retained size → Path to GC Roots.
- The repeat offender: unbounded static collections (caches, sessions, listeners).
- The plateau test (heap-after-GC under load) proves the fix; the ratchet proves the leak.

Official docs: [jmap tool](https://docs.oracle.com/en/java/javase/21/docs/specs/man/jmap.html) · [Eclipse MAT](https://www.eclipse.org/mat/)
