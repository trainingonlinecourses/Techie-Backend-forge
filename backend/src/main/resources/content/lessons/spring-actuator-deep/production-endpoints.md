---
title: Spring Boot Actuator — Production Monitoring Endpoints
summary: What Actuator provides, health checks, metrics, info endpoints, custom health indicators, custom metrics, and how organizations monitor production systems.
order: 3
minutes: 30
topics: [actuator, health, metrics, info, custom-health, custom-metrics, production-monitoring]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/html/actuator.html
---

## The Concept, From Zero

Spring Boot Actuator adds production-ready features to your application:
- **Health checks** — is the app alive and connected to dependencies?
- **Metrics** — how many requests, how fast, how much memory?
- **Info** — build version, git commit, custom info
- **Environment** — configuration properties (sanitized)

```yaml
# application.yml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus,env
  endpoint:
    health:
      show-details: when-authorized
```

---

## The Built-in Endpoints


**What this code does — step by step:**

1. Health endpoint
2. Response:
3. Metrics endpoint
4. Lists all available metrics
5. Response:
6. Info endpoint
7. Response:
8. Prometheus endpoint
9. Returns metrics in Prometheus format for scraping

The same code, clean:

```java
GET /actuator/health
{
    "status": "UP",
    "components": {
        "db": { "status": "UP", "details": { "database": "PostgreSQL" } },
        "diskSpace": { "status": "UP" },
        "redis": { "status": "DOWN", "details": { "error": "Connection refused" } }
    }
}

GET /actuator/metrics

GET /actuator/metrics/jvm.memory.used
{
    "name": "jvm.memory.used",
    "measurements": [{ "statistic": "VALUE", "value": 268435456 }],
    "availableTags": [...]
}

GET /actuator/info
{
    "app": { "name": "My App", "version": "1.0.0" },
    "git": { "commit": { "id": "abc123" } }
}

GET /actuator/prometheus
```

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. Line 1: Custom health indicator
2. Try to execute a simple query
3. Line 2: Custom health indicator for external API
4. Line 3: Custom info contributor
5. Line 4: Custom metrics with Micrometer
6. `orderCounter.increment();` — increment the counter
7. Line 5: Custom meter (gauge)

The same code, clean:

```java
import org.springframework.boot.actuate.health.*;
import org.springframework.boot.actuate.info.InfoContributor;
import org.springframework.stereotype.Component;
import java.util.Map;

@Component
public class DatabaseHealthIndicator implements HealthIndicator {

    private final DataSource dataSource;

    public DatabaseHealthIndicator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public Health health() {
        try (Connection conn = dataSource.getConnection()) {
            conn.createStatement().execute("SELECT 1");
            return Health.up()
                .withDetail("database", "PostgreSQL")
                .withDetail("connectionPool", "active=5, idle=3")
                .build();
        } catch (Exception e) {
            return Health.down()
                .withDetail("database", "PostgreSQL")
                .withDetail("error", e.getMessage())
                .build();
        }
    }
}

@Component
public class ExternalApiHealthIndicator implements HealthIndicator {

    private final HttpClient httpClient;

    @Override
    public Health health() {
        try {
            var response = httpClient.send(
                HttpRequest.newBuilder()
                    .uri(URI.create("https://api.external.com/health"))
                    .timeout(Duration.ofSeconds(3))
                    .GET()
                    .build(),
                HttpResponse.BodyHandlers.ofString()
            );

            if (response.statusCode() == 200) {
                return Health.up()
                    .withDetail("externalApi", "Available")
                    .withDetail("responseTime", response.headers()
                        .firstValue("X-Response-Time").orElse("unknown"))
                    .build();
            } else {
                return Health.down()
                    .withDetail("externalApi", "Unhealthy")
                    .withDetail("statusCode", response.statusCode())
                    .build();
            }
        } catch (Exception e) {
            return Health.down()
                .withDetail("externalApi", "Unavailable")
                .withDetail("error", e.getMessage())
                .build();
        }
    }
}

@Component
public class AppInfoContributor implements InfoContributor {

    @Override
    public void contribute(Info.Builder builder) {
        builder.withDetail("app", Map.of(
            "name", "Order Service",
            "version", "2.1.0",
            "environment", System.getenv().getOrDefault("ENV", "local"),
            "javaVersion", System.getProperty("java.version"),
            "startupTime", ManagementFactory.getRuntimeMXBean().getStartTime()
        ));
    }
}

@RestController
public class OrderController {

    private final MeterRegistry meterRegistry;
    private final Counter orderCounter;
    private final Timer orderTimer;

    public OrderController(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.orderCounter = Counter.builder("orders.created")
            .description("Total orders created")
            .tag("service", "order-service")
            .register(meterRegistry);
        this.orderTimer = Timer.builder("order.processing.time")
            .description("Order processing time")
            .publishPercentiles(0.5, 0.95, 0.99)
            .register(meterRegistry);
    }

    @PostMapping("/orders")
    public Order createOrder(@RequestBody CreateOrderRequest request) {
        return orderTimer.record(() -> {
            Order order = orderService.create(request);
            orderCounter.increment();
            return order;
        });
    }
}

@Component
public class QueueSizeMetrics {

    public QueueSizeMetrics(MeterRegistry registry, MessageQueue queue) {
        Gauge.builder("queue.size", queue, MessageQueue::size)
            .description("Current queue size")
            .register(registry);
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Kubernetes readiness probe

```yaml
# kubernetes deployment.yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: app
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
```

### Scenario 2: Prometheus + Grafana monitoring

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'spring-boot'
    metrics_path: '/actuator/prometheus'
    static_configs:
      - targets: ['localhost:8080']
    scrape_interval: 10s

# application.yml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  metrics:
    export:
      prometheus:
        enabled: true
    tags:
      application: ${spring.application.name}
```

### Scenario 3: Custom health check with dependencies

@Component
public class CompositeHealthIndicator implements HealthIndicator {

    private final DatabaseHealthIndicator dbHealth;
    private final RedisHealthIndicator redisHealth;
    private final ExternalApiHealthIndicator apiHealth;

    @Override
    public Health health() {
        Health db = dbHealth.health();
        Health redis = redisHealth.health();
        Health api = apiHealth.health();

        if (db.getStatus() == Status.UP &&
            redis.getStatus() == Status.UP &&
            api.getStatus() == Status.UP) {
            return Health.up().build();
        }

        return Health.down()
            .withDetail("database", db.getStatus())
            .withDetail("redis", redis.getStatus())
            .withDetail("externalApi", api.getStatus())
            .build();
    }
}

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Exposing all endpoints | Security risk | Only expose what's needed |
| Not sanitizing sensitive data | `/env` leaks passwords | Configure `management.endpoint.env.keys-to-sanitize` |
| Health check too slow | Startup delays | Add timeouts to health checks |
| Not monitoring metrics | Blind in production | Set up Prometheus + Grafana |
| Forgetting custom health indicators | Dependencies not checked | Add health indicators for external services |

## References

- [Codecademy — Learn Java course](https://www.codecademy.com/learn/learn-java)
- [docs.spring.io/spring-boot/reference/features/actuator.html](https://docs.spring.io/spring-boot/reference/features/actuator.html)
