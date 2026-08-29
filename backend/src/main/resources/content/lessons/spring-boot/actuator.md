---
title: Actuator, Metrics & Observability
summary: Health checks, metrics, info, Micrometer, logging best practices and the golden signals.
order: 8
minutes: 16
topics: [actuator, metrics, health, micrometer, logging]
docs:
  - https://docs.spring.io/spring-boot/reference/actuator/index.html
  - https://docs.spring.io/spring-boot/reference/actuator/endpoints.html
---

# Actuator, Metrics & Observability

## Actuator: production features for free

Add the starter, expose a few endpoints, and your app reports on itself:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,env,conditions,loggers
  endpoint:
    health:
      show-details: when_authorized
```

| Endpoint | What it tells you |
|---|---|
| `/actuator/health` | Is the app alive? (probes, k8s, load balancers) |
| `/actuator/metrics` | JVM, HTTP, DB pool, GC — real numbers |
| `/actuator/info` | Build info, git commit |
| `/actuator/env` | Effective configuration |
| `/actuator/conditions` | Which auto-configurations applied and why |
| `/actuator/loggers` | Change log levels at runtime |

## Health checks you control

```java
@Component
public class DbPingHealthIndicator implements HealthIndicator {
    private final JdbcTemplate jdbc;

    @Override
    public Health health() {
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            return Health.up().build();
        } catch (Exception e) {
            return Health.down(e).build();
        }
    }
}
```

## Micrometer: metrics with standard names

Micrometer is the metrics facade — your code is vendor-neutral, the registry decides where it goes (Prometheus, Datadog, CloudWatch, ...):

```java
@Service
public class PaymentService {
    private final MeterRegistry registry;
    private final Counter payments;
    private final Timer paymentDuration;

    public PaymentService(MeterRegistry registry) {
        this.registry = registry;
        this.payments = registry.counter("payments.created");
        this.paymentDuration = registry.timer("payments.duration");
    }

    public Payment create(...) {
        return paymentDuration.record(() -> {
            Payment p = /* ... */;
            payments.increment();
            return p;
        });
    }
}
```

```xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
<!-- /actuator/prometheus → scrape me -->
```

## Logging: the debugging contract

```java
@Slf4j   // or private static final Logger log = LoggerFactory.getLogger(...)
@Service
public class AccountService {
    public Account findByIban(String iban) {
        log.info("finding account iban={}", iban);        // parameterized — never string concat
        try { ... }
        catch (Exception e) { log.error("failed to load account iban={}", iban, e); }  // + stack trace
    }
}
```

Rules: parameterized messages only (`log.info("x={}", x)` — lazy, no garbage), include the correlation/trace id in the pattern, `log.error` with the exception as the last arg, and never log secrets (passwords, tokens, card numbers).

## The golden signals

Track these per service: **latency** (p50/p95/p99), **traffic** (requests/sec), **errors** (rate), **saturation** (thread pool, DB pool, CPU). Boot + Micrometer give you the first three from `/actuator/metrics` immediately.

> **Why it matters (organizational view)** — Observability is the org's shared nervous system. Standard: every service exposes `/actuator/health` (liveness/readiness), ships metrics to one backend, logs JSON with trace ids, and every endpoint has at least one alert on p99 latency and error rate. "It works on my machine" is replaced by "here's the dashboard."

## Key takeaways

- Actuator: health, metrics, info, conditions, loggers — enabled by one starter.
- Health indicators you write for critical dependencies.
- Micrometer = portable metrics; Prometheus registry for scraping.
- Log parameterized, never log secrets, always include the exception.

**Official docs:** [Actuator](https://docs.spring.io/spring-boot/reference/actuator/index.html) · [Endpoints](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html)
