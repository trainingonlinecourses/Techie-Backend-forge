---
title: Rate Limiting — Protecting Capacity
module: resilience-circuit-breaker
order: 4
minutes: 24
topics: ["rate limiter", "token bucket", "fixed window", "sliding window", "429", "Resilience4j"]
summary: Every service has a capacity: threads, DB connections, API quota, cost. Rate limiting is the mechanism that caps how many requests a caller may mak...
docs:
  - title: "Resilience4j RateLimiter"
    url: "https://resilience4j.readme.io/docs/rate-limiter"
---

# Rate Limiting — Protecting Capacity

## The Concept: Too Much of a Good Thing

Every service has a capacity: threads, DB connections, API quota, cost. **Rate limiting** is the mechanism that caps *how many requests a caller may make in a window* — protecting the service from overload, abuse, and runaway costs.

Think of a nightclub: the door (rate limiter) lets people in at a controlled rate. A sudden surge doesn't crush the dance floor (the service) because the door enforces the pace. Legitimate guests (users) are fine; a flood (a buggy client, an attacker, a runaway job) is throttled.

Rate limiting answers three questions:

1. **Per what?** — per user, per IP, per API key, per service.
2. **How many?** — the limit (requests per minute, tokens per day).
3. **What happens at the limit?** — reject (429), queue, or slow down.

## The Three Core Algorithms

### Fixed window

```
Limit: 100 requests per minute
Minute 1: 97 requests used, 3 left    <- 97th accepted, 3 more ok
Minute 2: fresh window, 100 available
```

Simple, but bursty at the boundaries: 100 requests at 11:59:59 + 100 at 12:00:00 = 200 in one second.

### Sliding window

A true rolling window (last 60 seconds, however they align) — smooth, no boundary burst. More bookkeeping.

### Token bucket (the classic)

A bucket holds N tokens; each request spends one; tokens refill at a rate. Bursts up to N are allowed instantly, sustained traffic is capped at the refill rate:

```
Bucket capacity: 10 tokens, refill 2/sec
Burst of 8:  -> allowed (8 <= 10)
Immediately 3 more: -> 2 allowed, 1 rejected (refill hasn't caught up)
```

The token bucket is the standard: it allows *bursts* while capping *sustained* rate — the right shape for most APIs.

## The Code Walkthrough

```java
import io.github.resilience4j.ratelimiter.RateLimiter;
import io.github.resilience4j.ratelimiter.RateLimiterConfig;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
public class AiQuotaService {

    private final RateLimiter limiter;

    public AiQuotaService() {
        // ---- 1. Token bucket: 10 calls per minute, bursts up to 5 ----
        this.limiter = RateLimiter.of("ai-quota", RateLimiterConfig.custom()
                .limitForPeriod(10)                       // 10 tokens per period
                .limitRefreshPeriod(Duration.ofMinutes(1))// the period
                .timeoutDuration(Duration.ofMillis(100))  // wait briefly for a token
                .build());
    }

    public String ask(String question) {
        // ---- 2. The guarded call ----
        return limiter.executeSupplier(() -> aiProvider.answer(question));
        // When tokens are exhausted (and the timeout expired):
        // throws RequestNotPermitted (the caller maps it to 429)
    }
}
```

### Walking Through Each Part

**`limitForPeriod(10)` + `limitRefreshPeriod(1 min)`** — 10 tokens per minute (a token bucket internally). The user gets 10 AI calls per minute; bursts up to the bucket capacity pass instantly.

**`timeoutDuration(100ms)`** — the limiter *waits* briefly for a token before rejecting. A 100ms wait smooths small bursts; beyond that, `RequestNotPermitted` throws — the caller converts it to a **429 Too Many Requests** with a `Retry-After` header.

**The guarded call** — the limiter wraps the expensive operation (the AI call — which costs money). The quota is enforced *before* the call, not after.

## Where Rate Limits Belong

| Layer | What's limited | Note |
|---|---|---|
| **API gateway** | Per-client requests to the API | Global protection, one place |
| **Application** (this lesson) | Per-user/per-key access to expensive features | Feature-level quotas |
| **Provider boundary** | Calls to third parties (AI, payment) | Cost + provider limits |

The academy's AI tutor is the perfect example: without a limiter, a scripted client could hammer the AI provider — burning quota and money in minutes. A per-user rate limit caps the blast radius.

## The 429 Contract

When a limit is hit, return `429 Too Many Requests` with a `Retry-After` header:

```java
@GetMapping("/api/tutor")
public ResponseEntity<?> ask(@RequestParam String q) {
    try {
        return ResponseEntity.ok(limiter.executeSupplier(() -> tutor.answer(q)));
    } catch (RequestNotPermitted e) {
        return ResponseEntity.status(429)
                .header(HttpHeaders.RETRY_AFTER, "60")
                .body(Map.of("error", "RATE_LIMITED", "retryAfterSeconds", 60));
    }
}
```

Clients that honor `Retry-After` back off politely; the limit becomes a coordination signal rather than an error.

## Rate Limit vs Bulkhead vs Breaker

| Pattern | Controls | Rejects when |
|---|---|---|
| Rate limiter | Requests **per time window** | Quota exceeded (429) |
| Bulkhead | Concurrent calls **at a moment** | Too many in flight |
| Circuit breaker | Calls **while dependency is failing** | Dependency deemed down |

Different axes: time-based (limiter), concurrency-based (bulkhead), health-based (breaker). They compose — a resilient API typically has all three at different layers.

## Common Beginner Pitfalls

1. **Per-IP limits only** — a NAT (many users, one IP) gets unfairly throttled; combine per-user + per-IP.
2. **No `Retry-After`** — clients can't coordinate; they retry immediately and hit the wall again.
3. **Limiting after the expensive work** — the limiter must run *before* the call, or the cost/protection is moot.
4. **Fixed windows for burst-sensitive features** — the boundary burst (11:59:59 + 12:00:00) defeats the intent; use token bucket/sliding window.
5. **One global limit for all endpoints** — login deserves a tight limit (brute-force), content reads a loose one; limit per resource class.
6. **No monitoring** — a permanently-429ing endpoint is a silent capacity problem; alert on rejection rates.
7. **Rate limits as the only defense** — they protect capacity, not abuse; pair with auth, quotas, and anomaly detection.

## Key Takeaways

- Rate limiting caps requests per window — protecting capacity, cost, and availability.
- Token bucket (burst-tolerant) is the standard algorithm; sliding window for smooth limits.
- Enforce *before* the expensive call; return 429 + `Retry-After`.
- Limit per user/key/IP, per resource class — not one global number.
- Rate limiter (time) + bulkhead (concurrency) + breaker (health) compose.
- Monitor rejection rates — sustained 429s are a signal, not noise.
