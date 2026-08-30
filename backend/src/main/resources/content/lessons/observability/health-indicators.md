---
title: Health Indicators & Readiness
module: observability
order: 2
minutes: 20
topics: ["HealthIndicator", "readiness vs liveness", "custom indicators", "HealthContributor", "probes"]
summary: /actuator/health is the first thing every orchestrator, load balancer, and uptime monitor checks. Making it accurate — reporting real dependency he...
docs:
  - title: "Health"
    url: "https://docs.spring.io/spring-boot/reference/actuator/health.html"
---

# Health Indicators & Readiness

`/actuator/health` is the first thing every orchestrator, load balancer, and uptime monitor checks. Making it *accurate* — reporting real dependency health, not just "the JVM is up" — is what separates a health endpoint from a lie.

## Built-In Health Indicators

Spring Boot auto-registers health indicators for everything it sees on the classpath:

- `db` — database connection
- `redis` — Redis reachability
- `kafka` — Kafka brokers
- `diskSpace` — free disk threshold
- `ping` — always UP (the liveness probe)
- `rabbit`, `mongo`, `elasticsearch`, `mail` — per dependency

```bash
curl localhost:8080/actuator/health
# {"status":"UP","components":{"db":{"status":"UP"},"diskSpace":{"status":"UP"},"ping":{"status":"UP"}}}
```

## Readiness vs. Liveness

Kubernetes and orchestration platforms probe two different questions:

| Probe | Question | Status source |
|-------|----------|---------------|
| **Liveness** | Is the process alive (or deadlocked)? | `ping` indicator |
| **Readiness** | Can it serve traffic yet? | All real dependency indicators |

- **Liveness failing** → the platform restarts the pod.
- **Readiness failing** → traffic is drained, pod stays up (may recover).

Spring Boot groups them:

```yaml
management:
  endpoint:
    health:
      probes:
        enabled: true
      group:
        readiness:
          include: db,redis,diskSpace
        liveness:
          include: ping
```

```bash
/actuator/health/liveness   → {"status":"UP"}
/actuator/health/readiness  → {"status":"UP","components":{"db":{"status":"UP"},"redis":{"status":"UP"}}}
```

## Custom HealthIndicator

An indicator for *your* dependency — the payments gateway:

```java
@Component
public class PaymentGatewayHealthIndicator implements HealthIndicator {

    private final GatewayClient gatewayClient;

    @Override
    public Health health() {
        try {
            boolean up = gatewayClient.ping().block(Duration.ofSeconds(2));
            if (up) {
                return Health.up()
                    .withDetail("latencyMs", gatewayClient.lastLatencyMs())
                    .build();
            }
            return Health.down().withDetail("reason", "ping returned false").build();
        } catch (Exception e) {
            return Health.down(e).build();
        }
    }
}
```

```json
{
  "status": "DOWN",
  "components": {
    "paymentGateway": {
      "status": "DOWN",
      "details": { "reason": "ping returned false" }
    }
  }
}
```

## OUT_OF_SERVICE and UNKNOWN

Four statuses are first-class:

| Status | Meaning | Orchestrator action |
|--------|---------|---------------------|
| `UP` | Healthy | Route traffic |
| `DOWN` | Broken | Take out of rotation / restart |
| `OUT_OF_SERVICE` | Intentionally stopped (maintenance) | Stop routing, don't restart |
| `UNKNOWN` | Can't determine | Treat as unhealthy |

```java
Health.outOfService().withDetail("reason", "scheduled maintenance").build();
```

## Timeout Discipline

Health checks run on the scheduler thread; a slow dependency makes health checks pile up. Always bound the check:

```java
@Override
public Health health() {
    try {
        boolean up = gatewayClient.ping().block(Duration.ofMillis(1500));
        return up ? Health.up().build() : Health.down().build();
    } catch (TimeoutException e) {
        return Health.down().withDetail("reason", "timeout after 1.5s").build();
    }
}
```

## Health Groups

Different consumers need different subsets:

```yaml
management:
  endpoint:
    health:
      group:
        external:
          include: paymentGateway,redis
        internal:
          include: db,diskSpace,ping
```

- `/actuator/health/external` — the uptime monitor's view
- `/actuator/health/internal` — the platform's view

## Readiness Gates

Beyond indicators, a bean can block readiness until initialized. Implement `ReadinessStateContributor` or use `ApplicationAvailability`:

```java
@Component
public class CacheWarmupReadiness implements ApplicationListener<ApplicationReadyEvent> {

    private final ApplicationAvailability availability;

    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        // app is "ready" only after the cache is warm
        cacheWarmer.warm();
        availability.getReadinessState();
    }
}
```

Better: use `AvailabilityChangeEvent` to flip readiness:

```java
@Component
public class StartupGate {

    private final AtomicBoolean ready = new AtomicBoolean(false);

    public void markReady() {
        ready.set(true);
    }

    @Component
    public class StartupReadiness implements ReadinessStateContributor {
        @Override
        public Contribution<ReadinessState> getContribution() {
            return ready.get()
                ? Contribution.accept(ReadinessState.ACCEPTING_TRAFFIC)
                : Contribution.reject(ReadinessState.REFUSING_TRAFFIC);
        }
    }
}
```

## Testing Health

```java
@SpringBootTest
@AutoConfigureMockMvc
class HealthTest {

    @Autowired MockMvc mockMvc;

    @Test
    void healthReportsUp() throws Exception {
        mockMvc.perform(get("/actuator/health"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    void readinessIncludesCustomIndicator() throws Exception {
        mockMvc.perform(get("/actuator/health/readiness"))
            .andExpect(jsonPath("$.components.paymentGateway.status").exists());
    }
}
```

## Summary

| Concern | Practice |
|---------|----------|
| Defaults | Let Spring auto-indicate for known dependencies |
| Readiness vs liveness | Separate groups; real deps in readiness, ping in liveness |
| Custom deps | One `HealthIndicator` per external dependency |
| Timeouts | Bound every check — slow checks poison the pool |
| Statuses | Use `OUT_OF_SERVICE` for intentional downtime |
| Consumers | Health groups per audience (platform vs uptime monitor) |

An accurate health endpoint is cheap to build and priceless in production: it's the difference between a platform that self-heals and one that restarts healthy pods forever.
