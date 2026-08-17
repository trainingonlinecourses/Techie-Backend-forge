---
title: Bulkhead — Containing a Slow Dependency
module: resilience-circuit-breaker
order: 2
minutes: 24
topics: ["bulkhead", "isolation", "thread pools", "semaphores", "blast radius", "Resilience4j"]
docs:
  - title: "Resilience4j Bulkhead"
    url: "https://resilience4j.readme.io/docs/bulkhead"
---

# Bulkhead — Containing a Slow Dependency

## The Concept: One Leaky Compartment Sinks the Ship

A **bulkhead** (in shipbuilding) is a partition inside the hull: if one compartment floods, the others stay dry and the ship floats. The software pattern is identical: **isolate each dependency's resource usage**, so a slow or broken dependency can only exhaust its *own* compartment — never the whole app's threads.

The failure it prevents: your app has a thread pool of 200. A dependency (say, the AI provider) starts responding in 8 seconds each. Users hit the feature that calls it → 200 requests → 200 threads all waiting 8 seconds → **every thread is stuck waiting on one dependency** → the health endpoint, the login, everything else — *all* stall. One slow dependency has taken down the entire app.

The bulkhead fixes it: the AI provider gets **at most 20 threads**. When those 20 are busy, the 21st request fails fast (`BulkheadFullException`). The other 180 threads keep serving everything else normally.

## Two Bulkhead Styles

| Style | Mechanism | Use when |
|---|---|---|
| **Semaphore** | Limits concurrent calls (no extra threads) | Calls are short and non-blocking |
| **Thread pool** | A dedicated pool per dependency | Calls block (I/O, HTTP), need isolation |

**Semaphore bulkheads** are the lightweight default: they count in-flight calls and reject beyond the limit. **Thread pool bulkheads** allocate real threads per dependency — heavier but genuinely isolates blocking calls (a pool full of stuck threads doesn't touch the main pool).

## The Code Walkthrough

```java
import io.github.resilience4j.bulkhead.Bulkhead;
import io.github.resilience4j.bulkhead.BulkheadConfig;
import io.github.resilience4j.bulkhead.ThreadPoolBulkhead;
import io.github.resilience4j.bulkhead.ThreadPoolBulkheadConfig;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
public class AiTutorService {

    private final Bulkhead aiBulkhead;                 // semaphore style
    private final ThreadPoolBulkhead catalogPool;      // thread-pool style

    public AiTutorService() {
        // ---- 1. Semaphore bulkhead: at most 5 concurrent AI calls ----
        this.aiBulkhead = Bulkhead.of("ai-provider", BulkheadConfig.custom()
                .maxConcurrentCalls(5)
                .maxWaitDuration(Duration.ofMillis(500))   // fail fast if full
                .build());

        // ---- 2. Thread-pool bulkhead: a dedicated pool for catalog calls ----
        this.catalogPool = ThreadPoolBulkhead.of("catalog", ThreadPoolBulkheadConfig.custom()
                .maxThreadPoolSize(10)
                .coreThreadPoolSize(4)
                .queueCapacity(20)
                .build());
    }

    public String ask(String question) {
        // The AI provider gets at most 5 concurrent calls.
        // The 6th fails fast instead of consuming a main-pool thread for 8s.
        return aiBulkhead.executeSupplier(() -> aiProvider.answer(question));
    }
}
```

### Walking Through Each Part

**Semaphore bulkhead** — `maxConcurrentCalls(5)`: at most 5 AI calls in flight. `maxWaitDuration(500ms)`: if all 5 are busy, wait at most half a second, then **fail fast** — the caller gets a quick `BulkheadFullException` instead of an indefinite queue. This is the containment: the AI's slowness can never consume more than 5 slots.

**Thread-pool bulkhead** — a dedicated pool (`maxThreadPoolSize(10)`, queue 20) for catalog calls. Catalog's slowness fills *its own* pool; the main request threads never wait on it.

**The asymmetry of protection** — without bulkheads, the *whole* pool is shared, so one slow dependency starves everything. With bulkheads, each dependency has its own ceiling; the blast radius is contained to the compartment.

## Bulkhead + Circuit Breaker + Retry — The Stack

The resilience patterns compose in layers:

```java
// Breaker outside (decide whether to call at all),
// retry inside the breaker (transient failures get another try),
// bulkhead beneath (limit concurrent calls):
Supplier<Answer> call = () -> paymentBulkhead.executeSupplier(
        () -> retry.decorateSupplier(() -> gateway.charge(req)));
Answer result = circuitBreaker.executeSupplier(call);
```

- **Bulkhead** — how many calls may be in flight (protects your threads).
- **Circuit breaker** — whether to call at all (protects the dependency + your time).
- **Retry** — how many attempts per call (handles transient blips).

## Sizing the Bulkhead

The numbers matter. Too small: legitimate traffic gets `BulkheadFullException` (a self-inflicted outage). Too large: the protection is meaningless. Sizing inputs:

- **Concurrency** — expected simultaneous users of that feature × request rate.
- **Latency** — how long each call occupies a slot (higher latency → fewer slots can serve the same throughput).
- **SLO** — the queue/wait you can tolerate.

Rule of thumb (Little's Law): `concurrency = throughput × latency`. If you expect 20 calls/sec and each takes 0.5s, you need ~10 concurrent slots — size above that for headroom.

## Monitoring Bulkheads

Watch: `BulkheadFullException` rate (is the limit being hit?), call duration (is the dependency degrading?), available capacity. A regularly-full bulkhead is a sizing problem; a suddenly-full one is a dependency problem. Resilience4j exposes both as Micrometer metrics.

## Common Beginner Pitfalls

1. **Bulkhead around everything with tiny limits** — legitimate traffic rejected; size from real concurrency.
2. **Semaphore bulkhead around blocking calls on shared threads** — the *call* is limited but the blocking still occupies shared pool threads; use the thread-pool style for blocking I/O.
3. **No fallback on `BulkheadFullException`** — fast-fail is only useful if the caller *handles* it (fallback, degraded response, 503); unhandled, it's just a new error.
4. **Bulkheads without breakers** — a slow-but-not-failing dependency fills the bulkhead and rejects everything; the breaker would have cut it off.
5. **Monitoring nothing** — a full bulkhead with no alert is a silent capacity crisis.
6. **Uniform limits for all dependencies** — the AI provider and the fast internal cache deserve different ceilings; size per dependency.

## Key Takeaways

- The bulkhead isolates each dependency's resource ceiling — one slow dependency can't starve the whole app.
- Semaphore bulkheads limit concurrent calls; thread-pool bulkheads give blocking calls dedicated pools.
- Compose: breaker (whether) + retry (how many) + bulkhead (how many concurrent).
- Size by `concurrency = throughput × latency` with headroom.
- Fast-fail must be *handled* — pair bulkheads with fallbacks.
- Monitor fullness and duration per dependency.
