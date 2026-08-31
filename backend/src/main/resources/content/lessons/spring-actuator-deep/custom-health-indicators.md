---
title: Custom Health Indicators — Beyond /actuator/health
summary: Building custom HealthIndicator beans for database connections, message queues, and external services, plus readiness vs liveness probe patterns for Kubernetes.
order: 4
minutes: 20
topics: [health-indicator, readiness-probe, liveness-probe, kubernetes-health, custom-health]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/html/actuator.html
---

## The Concept, From Zero

Spring Boot's /actuator/health endpoint by default checks disk space and database connections. But in production, you need to know if your service is truly ready to handle traffic — not just that it's running.

A HealthIndicator is a plugin that adds one specific check to the health endpoint. Spring calls all registered indicators and aggregates the results into UP or DOWN. In Kubernetes, you need two different checks: liveness (is the process alive?) and readiness (can it handle requests?).

## The Code

### Custom Health Indicator
```java
@Component
public class ExternalApiHealthIndicator implements HealthIndicator {

    private final RestTemplate restTemplate;
    private final String apiUrl;

    public ExternalApiHealthIndicator(RestTemplate restTemplate,
            @Value("${payment.api.url}") String apiUrl) {
        this.restTemplate = restTemplate;
        this.apiUrl = apiUrl;
    }

    @Override
    public Health health() {
        try {
            ResponseEntity<String> response = restTemplate.getForEntity(
                apiUrl + "/ping", String.class);
            if (response.getStatusCode().is2xxSuccessful()) {
                return Health.up()
                    .withDetail("api", apiUrl)
                    .withDetail("latency", response.getHeaders()
                        .getFirst("X-Response-Time"))
                    .build();
            }
            return Health.down()
                .withDetail("api", apiUrl)
                .withDetail("status", response.getStatusCode())
                .build();
        } catch (Exception e) {
            return Health.down()
                .withDetail("api", apiUrl)
                .withException(e)
                .build();
        }
    }
}
```

### Separate Liveness & Readiness
```java
// Liveness: Is the process alive?
@Component
public class LivenessIndicator implements HealthIndicator {
    @Override
    public Health health() {
        return Health.up().build();  // If we're here, we're alive
    }
}

// Readiness: Can we handle requests?
@Component
public class ReadinessIndicator implements HealthIndicator {

    @Autowired private DataSource dataSource;
    @Autowired private RedisConnectionFactory redis;

    @Override
    public Health health() {
        boolean dbOk = checkDatabase();
        boolean cacheOk = checkRedis();

        if (dbOk && cacheOk) {
            return Health.up().build();
        }
        return Health.down()
            .withDetail("database", dbOk ? "UP" : "DOWN")
            .withDetail("cache", cacheOk ? "UP" : "DOWN")
            .build();
    }

    private boolean checkDatabase() {
        try (Connection conn = dataSource.getConnection()) {
            return conn.isValid(3);
        } catch (Exception e) {
            return false;
        }
    }

    private boolean checkRedis() {
        try {
            redis.getConnection().ping();
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
```

### Kubernetes Configuration
```yaml
# kubernetes deployment.yaml
livenessProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /actuator/health/readiness
    port: 8080
  initialDelaySeconds: 15
  periodSeconds: 5
  failureThreshold: 3
```

## Key Takeaways

1. **HealthIndicator** = plugin for /actuator/health — one per concern
2. **Liveness** = "is my process alive?" — restart if false
3. **Readiness** = "can I handle traffic?" — remove from load balancer if false
4. **Always include latency** in health details for monitoring dashboards
5. **Kubernetes uses both probes** to decide restart vs traffic routing
