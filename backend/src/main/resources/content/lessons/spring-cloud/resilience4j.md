---
title: Resilience with Resilience4j — Breakers, Retries & Timeouts
summary: Circuit breaker, retry, time limiter, rate limiter and bulkhead — configured in yml, wired into Feign and Gateway.
order: 5
minutes: 22
topics: [resilience4j, circuit-breaker, retry, timelimiter, fallback]
docs:
  - https://docs.spring.io/spring-cloud-circuitbreaker/reference/
  - https://resilience4j.readme.io/
---

# Resilience with Resilience4j — Breakers, Retries & Timeouts

## The core insight

In a distributed system, **every call can fail or hang**. Resilience patterns contain the damage:

| Pattern | What it does | Default risk it covers |
|---|---|---|
| **Circuit breaker** | After N failures, stop calling and fail fast for a cooldown | Sick dependency dragging you down |
| **Retry** | Retry transient failures a few times | Flaky network, restarting instance |
| **Time limiter** | Kill calls that exceed a timeout | Hung dependency, leaked threads |
| **Rate limiter** | Reject excess calls | Abuse, overload |
| **Bulkhead** | Limit concurrent calls to a dependency | One slow call exhausting your pool |

## Spring Cloud Circuit Breaker: one API

Spring Cloud wraps Resilience4j (and alternatives) behind a common API. Add the starter, write a fallback, done:

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-circuitbreaker-resilience4j</artifactId>
</dependency>
```

```java
@Service
public class OrderLookup {

    private final InventoryClient inventory;
    private final CircuitBreakerFactory<?, ?> breakerFactory;

    public InventoryStock stock(String sku) {
        CircuitBreaker breaker = breakerFactory.create("inventory");
        return breaker.run(
                () -> inventory.getStock(sku),                        // protected call
                throwable -> new InventoryStock(sku, 0, "UNAVAILABLE") // fallback
        );
    }
}
```

## Feign + breaker + fallback (the pattern used in the demo)

```java
@FeignClient(name = "inventory-service", fallback = InventoryClientFallback.class)
public interface InventoryClient {
    @GetMapping("/api/inventory/{sku}")
    InventoryStock getStock(@PathVariable("sku") String sku);
}
```

```java
@Component
public class InventoryClientFallback implements InventoryClient {
    @Override
    public InventoryStock getStock(String sku) {
        return new InventoryStock(sku, 0, "CIRCUIT_OPEN_FALLBACK");
    }
}
```

```yaml
spring:
  cloud:
    openfeign:
      circuitbreaker:
        enabled: true     # wrap every Feign client in a circuit breaker
```

## Tuning: the resilience4j yml

```yaml
resilience4j:
  circuitbreaker:
    instances:
      inventory-service:                 # name = Feign client name
        slidingWindowSize: 10            # count the last 10 calls
        failureRateThreshold: 40         # open when ≥40% fail
        waitDurationInOpenState: 10s     # cooldown before trying again
        permittedNumberOfCallsInHalfOpenState: 3
  timelimiter:
    instances:
      inventory-service:
        timeoutDuration: 2s              # hard cap per call
  retry:
    instances:
      inventory-service:
        maxAttempts: 3
        waitDuration: 500ms              # backoff between attempts
```

The trio works together: **time limiter kills the hang → retry gives 2 more chances → circuit breaker stops calling altogether once the failure rate crosses the threshold.** Fallbacks make the caller's response graceful the whole way.

## Gateway routes get breakers too

```yaml
filters:
  - name: CircuitBreaker
    args:
      name: ordersCB
      fallbackUri: forward:/fallback/orders
```

## The state machine you'll be asked about in interviews

```
CLOSED  ── failure rate ≥ threshold ──▶  OPEN
   ▲                                        │
   │                                        │ waitDurationInOpenState
   └── allowed after probe calls ◀──────────▼
        (HALF_OPEN: 3 test calls)
        success → CLOSED    failure → OPEN again
```

## Exposing breaker state

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,metrics,circuitbreakers
  health:
    circuitbreakers:
      enabled: true
```

- `/actuator/health` shows breaker states (and flips health to DOWN when a breaker opens — alertable!).
- Metrics: `resilience4j.circuitbreaker.state`, `resilience4j.circuitbreaker.calls{kind="failed"}`, etc. → dashboards + alerts.
- `curl /actuator/circuitbreakers` dumps all breaker configs.

## Fallback hygiene

| Rule | Why |
|---|---|
| Fallbacks return **defaults**, not lies | Better `"UNAVAILABLE"` than stale data presented as fresh |
| Never throw from a fallback | That defeats the pattern |
| Log when a fallback runs | It's a reliability event worth an alert |
| Fallbacks are last resort — alert on them | They mask failures; you still need to know |

> **Why it matters (organizational view)** — Resilience is the org's answer to the *cascade failure*: service A calls B calls C; C slows down; A's threads pile up; A dies; everything dies. Standardizing on "every inter-service call has a timeout, retry, breaker and fallback" turns that into "the slowest service degrades gracefully." The rules: defaults for all four patterns on every client, fallbacks that return safe defaults, and alerts on breaker-open events.

## Key takeaways

- Circuit breaker + retry + time limiter + rate limiter + bulkhead — the toolbox.
- Feign + `fallback` + `spring.cloud.openfeign.circuitbreaker.enabled=true` = minimal wiring.
- Tune via `resilience4j.*` yml; expose state via actuator health/metrics.
- Gateway routes get breakers with fallback URIs.
- Fallbacks return defaults and log — they're the last line, not the answer.

**Official docs:** [Spring Cloud Circuit Breaker](https://docs.spring.io/spring-cloud-circuitbreaker/reference/) · [Resilience4j docs](https://resilience4j.readme.io/)
