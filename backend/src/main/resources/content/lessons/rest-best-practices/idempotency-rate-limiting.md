---
title: Idempotency Keys and Rate Limiting
module: rest-best-practices
order: 5
minutes: 25
topics: ["idempotency keys", "retries", "rate limiting", "Bucket4j", "429 handling", "concurrency safety"]
docs:
  - title: "Rate limiting with Bucket4j"
    url: "https://github.com/bucket4j/bucket4j"
---

# Idempotency Keys and Rate Limiting

Two protections every public API needs: **idempotency** so retries don't double-execute, and **rate limiting** so one misbehaving client can't take the API down. Both are contracts you implement once and every client benefits from.

## The Retry Problem

Networks drop requests. Clients retry. If a `POST /api/payments` request times out *after* the server processed it, the client's retry creates a second payment. Idempotency keys solve exactly this: the client sends a key, the server deduplicates.

## Idempotency Key Pattern

```
POST /api/payments
Idempotency-Key: 9f8e7d6c-5b4a-3210

{
  "amount": 2500,
  "currency": "USD"
}
```

Server contract:
1. Key not seen → process, store `key → result`, return result.
2. Key seen (in-flight or done) → return the **stored result**, don't re-process.
3. Same key, different payload → 422 or 409.

### Implementation

```java
@Entity
public class IdempotencyRecord {
    @Id private String key;
    private String requestHash;
    private String responseBody;
    private Integer statusCode;
    private Instant expiresAt;
    // getters/setters...
}
```

```java
@Service
public class IdempotencyService {

    private final IdempotencyRepository repository;

    public Optional<IdempotencyRecord> find(String key) {
        return repository.findById(key);
    }

    public IdempotencyRecord start(String key, String requestHash) {
        // Atomic claim: insert only if absent
        IdempotencyRecord record = new IdempotencyRecord();
        record.setKey(key);
        record.setRequestHash(requestHash);
        record.setExpiresAt(Instant.now().plus(Duration.ofHours(24)));
        try {
            return repository.save(record);   // throws on duplicate key
        } catch (DataIntegrityViolationException e) {
            IdempotencyRecord existing = repository.findById(key).orElseThrow();
            if (!existing.getRequestHash().equals(requestHash)) {
                throw new IdempotencyKeyConflictException(key);
            }
            return existing;
        }
    }

    public void complete(String key, int status, String body) {
        repository.findById(key).ifPresent(r -> {
            r.setStatusCode(status);
            r.setResponseBody(body);
            repository.save(r);
        });
    }
}
```

```java
@PostMapping("/payments")
public ResponseEntity<?> createPayment(
        @RequestHeader("Idempotency-Key") String key,
        @Valid @RequestBody PaymentRequest request) {

    String hash = sha256(json(request));
    IdempotencyRecord record = idempotency.start(key, hash);

    if (record.getStatusCode() != null) {
        // Already completed — replay the stored response
        return ResponseEntity.status(record.getStatusCode())
            .body(record.getResponseBody());
    }

    Payment payment = paymentService.charge(request);
    String body = json(PaymentResponse.from(payment));
    idempotency.complete(key, 201, body);
    return ResponseEntity.status(HttpStatus.CREATED).body(body);
}
```

### Concurrency Note

The unique constraint on the key column is what makes `start` atomic — two simultaneous requests with the same key race, one insert wins, the other gets `DataIntegrityViolationException` and reads the winner's record. The DB, not the application code, is the source of truth.

## Rate Limiting With Bucket4j

Bucket4j is a JVM token-bucket implementation that works with Spring via a filter or interceptor.

### Token Bucket Refresher

A bucket holds `N` tokens. Each request removes one. Tokens refill at `R` per second. Bursts up to `N` pass; sustained traffic above `R` is throttled.

### Spring Integration

```xml
<dependency>
    <groupId>com.bucket4j</groupId>
    <artifactId>bucket4j-core</artifactId>
    <version>8.10.1</version>
</dependency>
```

```java
@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response, Object handler)
            throws IOException {

        String clientKey = clientKey(request);   // IP, API key, or user id
        Bucket bucket = buckets.computeIfAbsent(clientKey, this::newBucket);

        if (bucket.tryConsume(1)) {
            return true;
        }
        response.setStatus(429);
        response.setHeader("Retry-After", "60");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"error\":\"rate limit exceeded\"}");
        return false;
    }

    private Bucket newBucket(String key) {
        // 10 requests, refill 1 per second
        Bandwidth limit = Bandwidth.classic(10, Refill.greedy(1, Duration.ofSeconds(1)));
        return Bucket.builder().addLimit(limit).build();
    }

    private String clientKey(HttpServletRequest request) {
        String apiKey = request.getHeader("X-API-Key");
        return apiKey != null ? "key:" + apiKey : "ip:" + request.getRemoteAddr();
    }
}
```

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final RateLimitInterceptor interceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(interceptor)
            .addPathPatterns("/api/**")
            .excludePathPatterns("/api/auth/**");   // don't rate-limit login (or do, carefully)
    }
}
```

### Bucket4j With Redis

In a cluster, in-memory buckets are per-instance (3 replicas = 3× the limit). Bucket4j's `ProxyManager` with Redis makes limits global:

```java
@Bean
public ProxyManager<String> bucketProxyManager(RedisConnectionFactory factory) {
    RedisBasedProxyManager<String> manager = RedisBasedProxyManager
        .builderFor(new LettuceBasedRedisClient(factory))
        .build();
    return new ProxyManager<String>() {
        public Bucket getProxy(String key, Supplier<BucketConfiguration> config) {
            return manager.getProxy(key, config);
        }
    };
}
```

### Multiple Tiers

```java
// Per-key: 10 req/s
Bandwidth perKey = Bandwidth.classic(10, Refill.greedy(1, Duration.ofSeconds(1)));
// Global: 1000 req/s across all keys
Bandwidth global = Bandwidth.classic(1000, Refill.greedy(100, Duration.ofSeconds(1)));
Bucket bucket = Bucket.builder().addLimit(perKey).addLimit(global).build();
```

## The 429 Response

```json
HTTP/1.1 429 Too Many Requests
Retry-After: 60
Content-Type: application/json

{ "error": "rate limit exceeded", "retryAfterSeconds": 60 }
```

`Retry-After` is the contract clients use to back off. Send it on every 429.

## Client-Side Backoff

Clients should retry with exponential backoff + jitter:

```java
public <T> T withRetry(Supplier<T> call, int maxAttempts) {
    for (int attempt = 1; ; attempt++) {
        try {
            return call.get();
        } catch (HttpClientErrorException.TooManyRequests e) {
            if (attempt >= maxAttempts) throw e;
            long retryAfter = e.getResponseHeaders()
                .getFirst("Retry-After") != null
                ? Long.parseLong(e.getResponseHeaders().getFirst("Retry-After"))
                : (long) Math.pow(2, attempt);
            sleep(retryAfter * 1000L + randomJitter());
        }
    }
}
```

## Summary

| Concern | Mechanism | Key detail |
|---------|-----------|------------|
| Retry safety | Idempotency-Key header | Unique DB constraint = atomic claim |
| Duplicate detection | Request hash | Same key + different body → 409 |
| Burst control | Token bucket (Bucket4j) | `N` burst tokens, refill `R`/s |
| Cluster-wide limits | Bucket4j + Redis ProxyManager | In-memory buckets are per-instance |
| Backoff | `Retry-After` header | Clients honor it, with jitter |

Idempotency makes retries *safe*; rate limiting makes the API *available*. Together they're what turns an API from a prototype into a service other teams can depend on.
