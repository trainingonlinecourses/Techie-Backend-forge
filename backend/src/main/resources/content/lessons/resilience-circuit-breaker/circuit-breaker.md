---
title: Circuit Breaker — Fail Fast When the Dependency Is Down
module: resilience-circuit-breaker
order: 1
minutes: 26
topics: ["circuit breaker", "states", "failure rate", "half-open", "Resilience4j", "fail fast"]
docs:
  - title: "Resilience4j CircuitBreaker"
    url: "https://resilience4j.readme.io/docs/circuitbreaker"
summary: Your app calls a downstream service (a payment gateway, an AI provider, a catalog API). The service starts failing — slowly at first, then every ca...
---

# Circuit Breaker — Fail Fast When the Dependency Is Down

## The Concept: Stop Calling a Service That's Down

Your app calls a downstream service (a payment gateway, an AI provider, a catalog API). The service starts failing — slowly at first, then every call hangs for 10 seconds before erroring. What happens to *your* app?

- Every request occupies a thread for 10 seconds.
- Threads pile up; your app exhausts its pool.
- Other (healthy) features that share the pool stall.
- Your "dependency is down" becomes "**my whole app is down**."

The **circuit breaker** is the electrical metaphor made software: like a fuse that cuts power when the current is dangerous, the breaker **cuts calls to a failing dependency** after a failure threshold, letting the dependency "cool down" instead of being hammered.

## The Three States

```
        failures > threshold
 CLOSED ───────────────────────▶ OPEN
   ▲                              │
   │                              │ (after cool-down)
   │      success (recovered)     │
   └──────────────────────────────┘
              HALF-OPEN
```

- **CLOSED** — normal operation. Calls flow through; failures are counted in a sliding window.
- **OPEN** — the threshold was crossed (e.g., 50% of the last 20 calls failed). **Every call fails immediately** (fast-fail) without touching the broken service. This protects: your threads (no 10s waits), your app (no pileup), and the dying service (no more load).
- **HALF-OPEN** — after the cool-down period, a few *trial* calls probe the dependency. Success → CLOSED (recovered); failure → OPEN again (still down).

## Why "Fail Fast" Wins

When the dependency is down, the *best* behavior is to fail **quickly** with a clean error — not to retry, not to wait. The breaker converts a 10-second hang into an instant, predictable failure that callers can handle (fallback, degraded response, cache). Combined with retries (next lesson) and fallbacks, the breaker is the backbone of resilient systems.

## The Code Walkthrough

```java
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.function.Supplier;

@Service
public class PaymentService {

    private final CircuitBreaker breaker;

    public PaymentService(PaymentGateway gateway) {
        // ---- 1. Configure the breaker ----
        this.breaker = CircuitBreaker.of("payment-gateway", CircuitBreakerConfig.custom()
                .failureRateThreshold(50)                  // open at 50% failures
                .slidingWindowSize(20)                     // over the last 20 calls
                .minimumNumberOfCalls(5)                   // don't judge tiny samples
                .waitDurationInOpenState(Duration.ofSeconds(15))   // cool-down
                .permittedNumberOfCallsInHalfOpenState(3)  // probe 3 calls
                .build());
    }

    public PaymentResult charge(ChargeRequest request) {
        // ---- 2. Wrap the call ----
        Supplier<PaymentResult> call = () -> gateway.charge(request);

        return breaker.executeSupplier(call);   // breaker decides: run, or fast-fail
        // When OPEN, this throws CallNotPermittedException INSTANTLY (no network call)
    }
}
```

### Walking Through Each Part

**`failureRateThreshold(50)` + `slidingWindowSize(20)`** — the breaker tracks the last 20 calls; if 50%+ failed, it opens. The sliding window means recent behavior matters (a service that recovered 10 minutes ago re-enters CLOSED naturally).

**`minimumNumberOfCalls(5)`** — don't open on 2 out of 3 calls; wait for a meaningful sample. This prevents flapping from small windows.

**`waitDurationInOpenState`** — how long the breaker stays OPEN before probing (HALF-OPEN). Too short: it hammers a still-down service every 15s. Too long: recovery is delayed. Tune per dependency (15–60s is common).

**`permittedNumberOfCallsInHalfOpenState`** — how many trial calls probe recovery. All succeed → CLOSED; any fail → OPEN again.

**`executeSupplier`** — the wrapper. In CLOSED: calls through. In OPEN: throws `CallNotPermittedException` *immediately* — no network, no wait. This is the fail-fast that protects your threads.

## The Spring Integration

```java
@CircuitBreaker(name = "paymentGateway", fallbackMethod = "chargeFallback")
public PaymentResult charge(ChargeRequest request) { ... }

public PaymentResult chargeFallback(ChargeRequest request, Throwable t) {
    return PaymentResult.declined("gateway temporarily unavailable");
}
```

With Resilience4j + Spring Boot, the `@CircuitBreaker` annotation wraps the method; the `fallbackMethod` serves a degraded response when the breaker is open. Add `spring-boot-starter-aop` and the `resilience4j-spring-boot3` dependency, and configuration can live in properties:

```yaml
resilience4j.circuitbreaker:
  instances:
    paymentGateway:
      slidingWindowSize: 20
      failureRateThreshold: 50
      waitDurationInOpenState: 15s
```

## Monitoring the Breaker

The breaker's state is production gold: **an OPEN breaker is a loud signal that a dependency is down.** Expose and alert on:

- Current state (`CLOSED`/`OPEN`/`HALF-OPEN`).
- Failure rate (the metric driving the decision).
- Call counts (total, failed, not-permitted).

Resilience4j publishes Micrometer metrics (`resilience4j.circuitbreaker.state`); wire them to your dashboard and alert on `OPEN` state lasting more than a few minutes. A permanently open breaker means the dependency is *still* down — someone must act.

## Common Beginner Pitfalls

1. **No minimum calls** — the breaker opens on 2 failures out of 2 calls (a blip, not an outage); require a sample.
2. **Cool-down too short** — a still-down service gets probed constantly; the "protection" becomes a polite knock every 5 seconds.
3. **Fallback that hides everything** — a fallback serving stale data *loudly* logs; a silent fallback masks an outage until it's severe.
4. **Breaker around non-critical calls** — wrapping an optional dependency with tight thresholds opens constantly, degrading the main path; calibrate per dependency.
5. **Ignoring the state** — a breaker that opens and stays open without alerts is an undiagnosed outage; monitor it.
6. **Breaker vs retry confusion** — the breaker stops calls; retries repeat them. They compose (breaker outside, retry inside) but aren't interchangeable.

## Key Takeaways

- The circuit breaker converts a dependency outage into instant, clean failure — protecting your threads and the dying service.
- CLOSED → OPEN (threshold crossed) → HALF-OPEN (cool-down + probes) → CLOSED.
- `@CircuitBreaker(name, fallbackMethod)` + config in properties = the Spring way.
- Calibrate: minimum calls, failure threshold, cool-down, half-open probes.
- Monitor breaker state — an OPEN breaker is an alert-worthy signal.
- Fail fast, fall back gracefully, alert loudly.
