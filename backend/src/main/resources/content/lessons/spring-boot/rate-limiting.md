---
title: Spring Boot Rate Limiting — API Protection Patterns
summary: Token bucket, sliding window and fixed window algorithms, Bucket4j integration, per-user and per-endpoint limits, Redis-backed distributed rate limiting, and how production APIs prevent abuse without blocking legitimate traffic.
order: 48
minutes: 20
topics: [rate-limiting, token-bucket, sliding-window, bucket4j, api-abuse, throttling, backpressure]
docs:
  - https://github.com/bucket4j/bucket4j
---

# Spring Boot Rate Limiting — API Protection Patterns

## The concept

**Rate limiting** restricts how many requests a client can make in a given time window. Without it, a single client can flood your API, consuming all resources and degrading service for everyone else.

Three common algorithms:

**Fixed Window** — Count requests in a fixed time period (e.g., 100 per minute). Reset counter at the start of each period. Simple but has a burst problem: 100 requests at 11:59 + 100 at 12:00 = 200 requests in 2 seconds.

**Sliding Window** — Count requests in a rolling window (e.g., "the last 60 seconds"). Smoother than fixed window but requires more memory.

**Token Bucket** — A bucket fills with tokens at a steady rate. Each request consumes a token. If no tokens remain, the request is rejected. Allows controlled bursts (bucket can hold N tokens) while enforcing average rate.

## How we use it in organizations

### Scenario 1: Per-user rate limiting with Bucket4j

```java
@Component
public class UserRateLimiter {
    private final Bucket userBucket;

    public UserRateLimiter() {
        // 100 requests per minute, refill 2 tokens per second
        Bandwidth limit = Bandwidth.classic(100, Refill.greedy(2, Duration.ofSeconds(1)));
        userBucket = Bucket.builder().addLimit(limit).build();
    }

    public boolean tryConsume(String userId) {
        // In production, create separate buckets per userId
        return userBucket.tryConsume(1);
    }
}
```

### Scenario 2: Filter-based rate limiting

```java
@Component
@Order(2)  // after auth filter
public class RateLimitFilter extends OncePerRequestFilter {

    private final LoadingCache<String, Bucket> buckets = Caffeine.newBuilder()
        .maximumSize(10_000)
        .expireAfterAccess(Duration.ofMinutes(10))
        .build(new CacheLoader<>() {
            @Override
            public Bucket load(String key) {
                Bandwidth limit = Bandwidth.classic(100, Refill.greedy(10, Duration.ofSeconds(1)));
                return Bucket.builder().addLimit(limit).build();
            }
        });

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws IOException, ServletException {
        String clientId = extractClientId(request);
        Bucket bucket = buckets.get(clientId);

        if (bucket.tryConsume(1)) {
            chain.doFilter(request, response);
        } else {
            response.setStatus(429);
            response.setHeader("Retry-After", "1");
            response.setHeader("X-RateLimit-Limit", "100");
            response.setHeader("X-RateLimit-Remaining", "0");
            response.getWriter().write("{\"error\":\"Rate limit exceeded\"}");
        }
    }
}
```

### Scenario 3: Redis-backed distributed rate limiting

For multiple application instances, use Redis to share rate limit state:

```java
@Component
public class DistributedRateLimiter {
    private final StringRedisTemplate redis;

    public boolean tryConsume(String key, int maxRequests, Duration window) {
        long now = System.currentTimeMillis();
        long windowStart = now - window.toMillis();

        // Lua script for atomic sliding window rate limit
        String script = """
            redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
            local count = redis.call('ZCARD', KEYS[1])
            if count < tonumber(ARGV[2]) then
                redis.call('ZADD', KEYS[1], ARGV[3], ARGV[3])
                redis.call('EXPIRE', KEYS[1], ARGV[4])
                return 1
            end
            return 0
        """;

        Long allowed = redis.execute(
            new DefaultRedisScript<>(script, Long.class),
            List.of("rate:" + key),
            String.valueOf(windowStart),
            String.valueOf(maxRequests),
            String.valueOf(now),
            String.valueOf(window.toSeconds()));

        return allowed != null && allowed == 1L;
    }
}
```

### Scenario 4: Endpoint-specific limits

Different endpoints have different limits:

```java
@Configuration
public class RateLimitConfig {
    @Bean
    public Map<String, RateLimit> endpointLimits() {
        Map<String, RateLimit> limits = new HashMap<>();
        limits.put("POST /api/auth/login", new RateLimit(5, Duration.ofMinutes(1)));   // strict
        limits.put("GET /api/products", new RateLimit(100, Duration.ofMinutes(1)));     // normal
        limits.put("POST /api/orders", new RateLimit(20, Duration.ofMinutes(1)));       // moderate
        return limits;
    }
}
```

### Scenario 5: Rate limit headers

Always inform clients about their rate limit status:

```java
@Component
public class RateLimitResponseHeaders {
    public void addHeaders(HttpServletResponse response, int limit, int remaining, long resetSeconds) {
        response.setHeader("X-RateLimit-Limit", String.valueOf(limit));
        response.setHeader("X-RateLimit-Remaining", String.valueOf(remaining));
        response.setHeader("X-RateLimit-Reset", String.valueOf(resetSeconds));
    }
}
```

Output:
```
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 45
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Using IP address only for identification | Shared IPs (NAT, corporate proxies) penalize innocent users |
| Fixed window without considering burst | Legitimate burst traffic rejected |
| Not returning Retry-After header | Client doesn't know when to retry |
| Rate limiting health check endpoints | Monitoring breaks |
| In-memory only in multi-instance deployment | Each instance has independent limits |
| No rate limit on login endpoint | Brute-force attacks succeed |
