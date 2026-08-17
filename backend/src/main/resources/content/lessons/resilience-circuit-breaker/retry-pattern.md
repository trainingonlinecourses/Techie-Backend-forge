---
title: Retry — Recovering From Transient Failures
module: resilience-circuit-breaker
order: 3
minutes: 25
topics: ["retry", "backoff", "jitter", "idempotency", "exponential backoff", "Resilience4j Retry"]
docs:
  - title: "Resilience4j Retry"
    url: "https://resilience4j.readme.io/docs/retry"
---

# Retry — Recovering From Transient Failures

## The Concept: Some Failures Are Just a Blip

Not all failures are outages. A database briefly restarts; a network packet drops; a service is *momentarily* overloaded (503). These **transient failures** often succeed on a second attempt. **Retry** is the pattern that tries again — with discipline.

The discipline matters because naive retries cause damage:

- **Retry storms** — thousands of clients retrying in lockstep can *cause* the outage they're retrying through.
- **Duplicate writes** — retrying a POST that already succeeded on the server creates duplicates.
- **Unbounded retries** — a truly dead service gets hammered forever.

The three controls: **what** to retry (only transient failures), **how many** attempts, and **when** (backoff with jitter).

## The Rules

1. **Retry only transient errors** — 5xx, timeouts, connection resets. Never 4xx (the request itself is wrong — it will fail forever) or permanent validation errors.
2. **Retry idempotent operations** — GET/PUT/DELETE (safe to repeat). Bare POSTs create resources — retry only with idempotency keys.
3. **Bound the attempts** — 2–5 attempts max; beyond that, it's not transient.
4. **Backoff with jitter** — wait longer between attempts (exponential), with random jitter to desynchronize retrying clients.

## The Code Walkthrough

```java
import io.github.resilience4j.retry.Retry;
import io.github.resilience4j.retry.RetryConfig;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Random;

@Service
public class NotificationService {

    private final Retry retry;

    public NotificationService() {
        this.retry = Retry.of("email-sender", RetryConfig.custom()
                .maxAttempts(4)                               // original + 3 retries
                .waitDuration(Duration.ofMillis(250))         // base backoff
                .intervalFunction(RetryConfig.IntervalFunction
                        .ofExponentialRandomBackoff(Duration.ofMillis(250),
                                2.0,                          // multiplier
                                Duration.ofSeconds(5)))       // cap
                .retryOnException(this::isTransient)
                .build());
    }

    public void sendEmail(Email email) {
        retry.executeRunnable(() -> emailClient.send(email));
    }

    private boolean isTransient(Throwable t) {
        return t instanceof org.springframework.web.client.HttpServerErrorException   // 5xx
                || t instanceof java.net.SocketTimeoutException                       // timeout
                || t instanceof java.net.ConnectException;                            // connection
    }
}
```

### Walking Through Each Part

**`maxAttempts(4)`** — original + 3 retries. Bounded: a permanently failing call gives up after 4 attempts and surfaces the error (the caller handles it or the breaker/fallback takes over).

**`waitDuration` + `intervalFunction`** — the backoff: 250ms base, doubling each attempt (250ms → 500ms → 1s → 2s...), capped at 5s, with **random jitter**. Jitter is the anti-stampede: 1,000 clients retrying at identical 1s intervals all hit the server at the same moment — a self-inflicted thundering herd. Jitter spreads the attempts.

**`retryOnException(isTransient)`** — the discrimination: only transient failures trigger a retry. A `400 Bad Request` throws immediately (retrying a wrong request is wasted load). This single predicate is the difference between resilience and amplification.

## Exponential Backoff, Demystified

| Attempt | Fixed 1s | Exponential 1s×2 | + jitter |
|---|---|---|---|
| 1 | 1s | 1s | ~0.8–1.2s |
| 2 | 1s | 2s | ~1.7–2.3s |
| 3 | 1s | 4s | ~3.6–4.4s |
| 4 | 1s | 8s | ~7.5–8.5s |

Exponential gives the server room to recover; jitter prevents synchronized waves. For long-running distributed systems, jittered exponential backoff is *the* standard (it's what AWS SDKs, Kubernetes, and most clients use).

## Idempotency — The Retry Safety Net

The danger case: a POST that creates a resource. Request succeeds server-side but the response is lost (timeout). Retrying creates a **duplicate**.

```java
// The fix: an idempotency key the server dedupes by
public void charge(ChargeRequest request) {
    request.setIdempotencyKey(UUID.randomUUID().toString());   // one key per logical operation
    retry.executeRunnable(() -> gateway.charge(request));
    // Server: "have I seen this key? -> return the original result, don't charge again"
}
```

With idempotency keys (or naturally idempotent operations like `UPDATE SET balance = balance - x` with a unique operation id), retries become safe: the second attempt returns the *same* result instead of creating a second effect.

## Retry + Circuit Breaker — The Correct Order

The composition question: retry first or breaker first? The standard layering:

```java
// Breaker OUTSIDE: decides whether to attempt at all (after failures accumulate)
// Retry INSIDE: tries multiple times within one breaker-permitted call
Supplier<Response> call = () -> retry.decorateSupplier(() -> client.get());
Response r = circuitBreaker.executeSupplier(call);
```

- The **breaker** stops the retry storm: when the dependency is down, the breaker opens and *no* retries happen (fast-fail).
- The **retry** handles blips *within* a breaker-closed period.

Order matters: breaker-outside means an open breaker prevents even the first attempt; retry-outside would burn retries on a dead dependency before the breaker sees the failure.

## Common Beginner Pitfalls

1. **Retrying 4xx** — client errors never heal; you're multiplying bad requests.
2. **Retrying non-idempotent POSTs without keys** — duplicate charges/creates.
3. **Unbounded retries** — infinite attempts on a dead service = permanent load.
4. **No jitter** — synchronized retry waves amplify outages (the thundering herd).
5. **Fixed short backoff** — retrying every 100ms gives the server no recovery window.
6. **Retries without a breaker** — a genuinely dead dependency gets retried forever (each attempt slow); the breaker must cut it off.
7. **Swallowing the final error** — after max attempts, *surface* the failure (fallback/log), don't pretend it succeeded.

## Key Takeaways

- Retry recovers from transient failures: 5xx, timeouts, connection resets — bounded, backoff, jitter.
- Never retry 4xx; retry idempotent operations only (or use idempotency keys).
- Exponential backoff + jitter prevents retry stampedes.
- Compose breaker-outside, retry-inside: the breaker stops the storm, the retry handles blips.
- After max attempts, surface the failure — fallback, log, alert.
- The discipline is what makes retry resilience instead of amplification.
