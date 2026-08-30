---
title: Client Resilience — Timeouts, Retries, and Fallbacks
module: spring-rest-clients
order: 5
minutes: 26
topics: ["retry", "timeout", "circuit breaker", "fallback", "idempotency", "Resilience4j"]
docs:
  - title: "Resilience4j (GitHub)"
    url: "https://resilience4j.readme.io/docs"
summary: The single most important mindset for backendtobackend calls: the remote service will fail — it will be slow, return 500s, time out, or be unreacha...
---

# Client Resilience — Timeouts, Retries, and Fallbacks

## The Concept: Assume the Other Service Will Fail

The single most important mindset for backend-to-backend calls: **the remote service *will* fail** — it will be slow, return 500s, time out, or be unreachable. The question isn't "if" but "how does my app behave when it does?" Resilience is the collection of mechanisms that keep *your* service healthy when *its dependencies* aren't:

1. **Timeouts** — bound how long you wait (from the configuration lesson).
2. **Retries** — transient failures often succeed on a second attempt.
3. **Circuit breakers** — stop hammering a failing service; fail fast instead.
4. **Fallbacks** — serve *something* (cached data, a default) when the call fails.
5. **Bulkheads / rate limits** — isolate failures so one slow dependency can't exhaust your threads.

The classic real-world analogy: a fire alarm system. It doesn't just *call* the fire department once (retry); if the department is unreachable it stops dialing for a while and sounds the alarm locally (circuit breaker), and it has sprinklers (fallback) so damage is contained.

## The Code Walkthrough

```java
import io.github.resilience4j.retry.Retry;
import io.github.resilience4j.retry.RetryConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.function.Supplier;

@Service
public class ResilientCatalogClient {

    private final RestClient restClient;
    private final Retry retry;
    private final CircuitBreaker circuitBreaker;

    public ResilientCatalogClient(RestClient.Builder builder) {
        this.restClient = builder.baseUrl("https://catalog.example.com").build();

        // ---- 1. Retry: 3 attempts, exponential backoff, only on 5xx ----
        this.retry = Retry.of("catalog-retry", RetryConfig.custom()
                .maxAttempts(3)
                .waitDuration(Duration.ofMillis(200))       // base delay
                .retryOnException(e -> isTransient(e))      // only retry recoverable errors
                .build());

        // ---- 2. Circuit breaker: open after 50% failures in a 10s window ----
        this.circuitBreaker = CircuitBreaker.of("catalog-cb", CircuitBreakerConfig.custom()
                .failureRateThreshold(50)                    // open at 50% failures
                .slidingWindowSize(20)                       // over the last 20 calls
                .waitDurationInOpenState(Duration.ofSeconds(15))  // cool-down
                .build());
    }

    public Course getCourse(long id) {
        // ---- 3. Wrap the call: retry -> circuit breaker -> fallback ----
        Supplier<Course> call = () -> restClient.get()
                .uri("/api/courses/{id}", id)
                .retrieve()
                .body(Course.class);

        return circuitBreaker.executeSupplier(
                retry.decorateSupplier(call))          // retry inside breaker
                .orElse(Course.fallback());            // fallback if all failed
    }

    private boolean isTransient(Throwable t) {
        return t instanceof org.springframework.web.client.HttpServerErrorException
                || t instanceof java.net.SocketTimeoutException
                || t instanceof java.net.ConnectException;
    }
}
```

### Walking Through Each Part

**Part 1 — the retry.** `maxAttempts(3)` = original + 2 retries. `waitDuration` is the base backoff; real configs add `multiplier` for exponential growth. The critical line: `retryOnException` — **only retry transient failures** (5xx, timeouts, connection errors). Never retry 4xx (the request itself is wrong — retrying won't fix it) or permanent errors.

**Part 2 — the circuit breaker.** Three states:

- **CLOSED** (normal) — calls flow through; failures are counted.
- **OPEN** — after the threshold (50% failures over the last 20 calls), *every* call fails immediately (fast-fail) without touching the broken service. This protects both your app (no waiting) and the failing service (no more load).
- **HALF-OPEN** — after the cool-down (`waitDurationInOpenState` 15s), a few trial calls probe whether the service recovered; success closes the circuit, failure reopens it.

The breaker is *your* protection: when the catalog is down, your users get a fast, clean fallback instead of a 10-second hang per request.

**Part 3 — the composition.** `retry.decorateSupplier(call)` wraps the call with retry logic; `circuitBreaker.executeSupplier(...)` wraps that with the breaker. Order matters: the breaker decides *whether* to attempt, the retry decides *how many times* inside one attempt window. If everything fails, `orElse(Course.fallback())` serves a fallback object so your endpoint still returns 200 with graceful degraded data.

## The Failure Hierarchy — What Each Layer Handles

| Layer | Handles | Returns |
|---|---|---|
| Timeout | Slow-but-alive service | Exception (fail fast) |
| Retry | Transient blips (5xx, timeouts) | Success on 2nd/3rd try |
| Circuit breaker | Sustained failure | Fast fail (skip the retry storm) |
| Fallback | Everything above exhausted | Degraded-but-valid response |
| Bulkhead | One dependency hogging threads | Other dependencies unaffected |

## Retry Semantics — The Rules

1. **Retry idempotent requests only** — GET, PUT, DELETE, HEAD are safe to repeat. A bare POST that creates a resource is NOT — you'd create duplicates. If you must retry POSTs, use an **idempotency key** header (the server dedupes by key).
2. **Exponential backoff with jitter** — fixed 200ms retries from a thousand instances can re-stampede the server; backoff + random jitter spreads the retry waves.
3. **Bound the total time** — 3 attempts × (timeout + backoff) must fit inside *your* caller's patience. A 10s read timeout × 3 attempts = 30s worst case; choose numbers so the whole chain fits the SLO.

## Bulkheads — Contain the Blast Radius

A bulkhead partitions resources: each dependency gets its own thread pool, so one slow dependency can't exhaust the whole app's threads. With Resilience4j:

```java
Bulkhead bulkhead = Bulkhead.of("catalog", BulkheadConfig.custom()
        .maxConcurrentCalls(10)      // at most 10 concurrent catalog calls
        .maxWaitDuration(Duration.ofMillis(500))
        .build());
```

When the catalog is slow, at most 10 threads wait on it; the other 190 threads serve everything else normally. Without bulkheads, a single dying dependency can take down the entire service by hogging every thread.

## Testing Resilience

- **Unit**: verify `isTransient` classifies errors correctly; test the fallback path directly.
- **Contract tests**: mock the remote with a fault-injection server (WireMock) — return 500s, delay responses, drop connections — and assert your client retries/falls back correctly.
- **Chaos practice**: in staging, kill the dependency and watch the circuit breaker open; confirm degraded responses still flow.

## Common Beginner Pitfalls

1. **Retrying 4xx** — client errors never succeed on retry; you're just multiplying bad requests.
2. **Retrying non-idempotent POSTs** — duplicate resources. Idempotency keys or no retry.
3. **Breaker without timeouts** — the breaker opens *after* 20 slow calls have already consumed 10s each; timeouts make failures cheap so the breaker trips fast.
4. **Fallback that hides real outages** — log every fallback hit loudly; a silent fallback masks a dependency outage until it's severe.
5. **No jitter on retries** — synchronized retry storms amplify outages.
6. **Breaker state not monitored** — watch breaker-open events in metrics; a permanently open breaker is a production signal.

## Key Takeaways

- Assume dependencies fail; engineer for it: timeout → retry → circuit breaker → fallback.
- Retry only transient, idempotent requests; 4xx and POSTs are out.
- The circuit breaker fast-fails when a dependency is down, protecting both sides.
- Fallbacks serve degraded-but-valid responses; log them loudly.
- Bulkheads isolate slow dependencies from the rest of your app.
- Compose the layers: breaker decides whether, retry decides how many times, fallback decides what to serve.
