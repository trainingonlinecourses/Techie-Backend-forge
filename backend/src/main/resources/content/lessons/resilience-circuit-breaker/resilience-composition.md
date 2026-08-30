---
title: Composing Resilience — Timeout, Retry, Breaker, Bulkhead, Fallback
module: resilience-circuit-breaker
order: 5
minutes: 27
topics: ["pattern composition", "timeout", "fallback", "resilience stack", "degraded responses"]
docs:
  - title: "Resilience4j documentation"
    url: "https://resilience4j.readme.io/"
summary: No single pattern is enough. A complete resilience story composes five layers, each with a distinct job:
---

# Composing Resilience — Timeout, Retry, Breaker, Bulkhead, Fallback

## The Concept: The Five-Layer Defense

No single pattern is enough. A complete resilience story composes five layers, each with a distinct job:

```
1. TIMEOUT       - how long one call may take
2. RETRY         - how many times to try (transient failures)
3. CIRCUIT BREAKER - whether to call at all (dependency health)
4. BULKHEAD      - how many calls may be in flight (thread protection)
5. FALLBACK      - what to serve when everything fails
```

Each layer answers one question, and together they cover the failure space: slow (timeout), blip (retry), down (breaker), saturated (bulkhead), and exhausted (fallback). The skill is *ordering* and *calibrating* the layers.

## The Failure Matrix

| Failure | Layer that catches it | Result |
|---|---|---|
| Slow-but-alive (8s response) | **Timeout** | Fail fast at 3s |
| 500 blip (recovers in 2s) | **Retry** | Success on attempt 2 |
| Sustained outage (10 min) | **Circuit breaker** | Fail instantly after threshold |
| Dependency saturated | **Bulkhead** | Reject beyond concurrency limit |
| Everything above exhausted | **Fallback** | Degraded-but-valid response |
| Client flooding | **Rate limiter** | 429 + Retry-After |

## The Layering Order (and Why)

```java
public PaymentResult pay(PaymentRequest request) {

    // Layer 5: FALLBACK - the final safety net
    Supplier<PaymentResult> fallback = () -> PaymentResult.declined("temporarily unavailable");

    // Layer 2+3+4: retry INSIDE breaker, breaker INSIDE bulkhead
    Supplier<PaymentResult> call = () ->
            paymentBulkhead.executeSupplier(          // 4: at most N concurrent
                    () -> retry.decorateSupplier(    // 2: transient retries
                            () -> gateway.charge(request)));

    // Layer 1: TIMEOUT around the whole thing
    call = TimeLimiter.decorateSupplier(call, Duration.ofSeconds(5));

    try {
        return circuitBreaker.executeSupplier(call); // 3: the decision-maker
    } catch (Exception e) {
        return fallback.get();                       // 5: serve degraded
    }
}
```

### Why This Order

- **Bulkhead outermost (beneath breaker)** — limits concurrency *before* anything else consumes threads.
- **Breaker above retry** — the breaker decides "should we even try?"; when OPEN, retries never run (no storm).
- **Retry inside** — handles blips within one breaker-permitted window.
- **Timeout around the call** — bounds each attempt's duration so failures are cheap (a slow call must not occupy the bulkhead slot for 8 minutes).
- **Fallback last** — catches everything: breaker open, retries exhausted, timeout, bulkhead full.

**The key discipline:** timeout must be **inside** the retry's visibility (each attempt times out individually) but **outside** the individual network call — and the *total* budget (timeout × attempts) must fit your SLO.

## The Time Budget

```
Budget check:
  read timeout:         3s
  max attempts:         3
  backoff:              0.25s + 0.5s + 1s  (jittered)
  worst case per call:  3 × 3s + ~1.75s  ≈ 10.75s
  breaker half-open:    probes add their own budget

The CALLER's timeout must exceed this (or the caller's timeout is the real budget
and you must shrink the layers to fit inside it).
```

The math forces the discipline: **the layers must fit inside the caller's patience.** If your API SLO is 2s, a 10-second retry stack violates it — shrink timeouts or attempts.

## Degraded Responses — The Art of the Fallback

A good fallback isn't "null". It's the *best valid answer available*:

```java
// Serve from cache when the source is down:
public Course getCourse(long id) {
    try {
        return breaker.executeSupplier(() -> catalog.getCourse(id));
    } catch (Exception e) {
        Course cached = cache.get(id);                  // stale but valid
        if (cached != null) {
            metrics.cacheHits.increment();              // MEASURE the fallback!
            return cached.withFlag("stale=true");       // tell the client
        }
        throw new ServiceUnavailableException("catalog down, no cache");
    }
}
```

The rules:

1. **Return something valid** — cached data, defaults, a minimal object.
2. **Mark it** — a `stale` flag or header so clients know the data is degraded.
3. **Measure it** — a cache-hit-during-outage counter is an ops alarm; a silent fallback masks the outage.
4. **Log it loudly** — every fallback hit is a dependency problem worth knowing about.

## The Complete Stack in Spring (Resilience4j annotations)

```java
@Service
public class TutorService {

    @Bulkhead(name = "ai", fallbackMethod = "fallback")
    @TimeLimiter(name = "ai")                       // async methods: CompletableFuture
    @CircuitBreaker(name = "ai", fallbackMethod = "fallback")
    @Retry(name = "ai", fallbackMethod = "fallback")
    public CompletableFuture<String> ask(String question) { ... }

    public CompletableFuture<String> fallback(String question, Exception e) {
        return CompletableFuture.completedFuture(
                "I couldn't reach the AI service right now — please try again.");
    }
}
```

Annotations compose on one method; Resilience4j wraps them in the declared order; one fallback catches all failure modes. Config in properties keeps the numbers tunable per environment.

## Common Beginner Pitfalls

1. **Missing the timeout** — the whole stack is moot if a hung call occupies a bulkhead slot forever.
2. **Wrong layering** — retry outside the breaker burns retries on a dead dependency; timeout outside the retry lets one attempt eat the whole budget.
3. **Silent fallbacks** — degraded data served without flags, counters, or logs hides the outage.
4. **Budget ignorance** — a retry stack slower than the caller's timeout is a stack that never completes.
5. **All-or-nothing** — applying the full stack to every endpoint; trivial reads need a timeout, not five layers.
6. **No monitoring** — breaker state, fallback hits, and timeout rates are the *signals*; without them, resilience is unverifiable.
7. **Testing only happy paths** — fault-inject (kill the dependency, delay responses) and assert each layer behaves.

## Key Takeaways

- Five layers, five jobs: timeout (slow), retry (blip), breaker (down), bulkhead (saturated), fallback (exhausted).
- Layer correctly: bulkhead → breaker → retry → timeout, fallback outermost.
- The time budget must fit the caller's patience — size the layers to the SLO.
- Fallbacks serve valid, *marked*, measured, logged degraded responses.
- Annotations compose in Spring; config stays tunable in properties.
- Fault-injection testing proves the stack works when it matters.
