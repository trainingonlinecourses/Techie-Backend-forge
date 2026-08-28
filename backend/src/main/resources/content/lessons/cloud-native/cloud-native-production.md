---
title: Cloud-Native Production — Complete Beginner's Guide
summary: Health checks, readiness probes, graceful shutdown, externalized config, and the 12-factor checklist for deploying Spring Boot to the cloud.
order: 4
minutes: 22
topics: [cloud-native, health checks, readiness, graceful shutdown, 12-factor, production]
docs:
  - https://docs.spring.io/spring-boot/reference/actuator/endpoints.html
  - https://docs.spring.io/spring-boot/reference/web/graceful-shutdown.html
---

# Cloud-Native Production — Complete Beginner's Guide

## What "cloud-native" means

A **cloud-native** application is designed to run in dynamic, automated environments (Kubernetes, ECS, Cloud Run). It's not about "being in the cloud" — it's about following patterns that make deployment, scaling, and recovery automatic.

```
Traditional app:                    Cloud-native app:
- Deploy once a month               - Deploy multiple times a day
- Manual scaling                     - Auto-scaling based on load
- SSH to debug                       - Logs + metrics + health checks
- Restart manually on crash          - Auto-restart on failure
- Config in properties files         - Config from environment variables
```

## The 12-Factor App checklist

The 12-Factor App is a methodology for building modern, cloud-native applications:

| Factor | What it means | Spring Boot implementation |
|---|---|---|
| 1. Codebase | One codebase in version control | Git |
| 2. Dependencies | Explicitly declare dependencies | `pom.xml` / `build.gradle` |
| 3. Config | Store config in environment | `application.yml` + env vars |
| 4. Backing services | Treat databases as attached resources | `DATABASE_URL` env var |
| 5. Build, release, run | Strict separation of build and run | Docker + CI/CD |
| 6. Processes | Stateless processes | No in-memory session state |
| 7. Port binding | Export services via port binding | Embedded Tomcat |
| 8. Concurrency | Scale via process model | Multiple container instances |
| 9. Disposability | Fast startup and graceful shutdown | `server.shutdown=graceful` |
| 10. Dev/prod parity | Keep environments as similar as possible | Docker + Testcontainers |
| 11. Logs | Treat logs as event streams | stdout/stderr + log aggregator |
| 12. Admin processes | Run admin tasks as one-off processes | `CommandLineRunner`, `@Job` |

## Health checks — how the cloud knows you're alive

Kubernetes and other orchestrators need to know if your app is healthy. Spring Boot Actuator provides two endpoints:

```yaml
# application.yml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus  # Line 1: Expose these endpoints
  endpoint:
    health:
      show-details: when-authorized              # Line 2: Show details to authenticated users
```

### Liveness vs Readiness

```
Liveness: "Is the app alive?" (If not → restart it)
Readiness: "Is the app ready to serve traffic?" (If not → stop sending requests)
```

```java
// Custom health indicator
@Component
public class DatabaseHealthIndicator implements HealthIndicator {
    private final DataSource dataSource;
    
    @Override
    public Health health() {
        try (Connection conn = dataSource.getConnection()) {
            conn.isValid(5);  // Line 1: Check if DB is reachable
            return Health.up()                    // Line 2: App is healthy
                .withDetail("database", "reachable")
                .build();
        } catch (Exception e) {
            return Health.down()                  // Line 3: App is unhealthy
                .withDetail("database", e.getMessage())
                .build();
        }
    }
}
```

```bash
# Check health
curl http://localhost:8080/actuator/health
# Response: {"status":"UP","components":{"db":{"status":"UP"}}}

# Kubernetes uses this for:
# livenessProbe: /actuator/health/liveness
# readinessProbe: /actuator/health/readiness
```

## Graceful shutdown — don't drop requests

When Kubernetes sends a SIGTERM to stop your app, you don't want to drop in-flight requests:

```yaml
# application.yml
server:
  shutdown: graceful                    # Line 1: Enable graceful shutdown

spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s    # Line 2: Wait up to 30s for requests to complete
```

**What happens during graceful shutdown:**
1. Kubernetes sends SIGTERM to your app
2. Tomcat stops accepting NEW connections
3. Existing requests continue processing (up to 30s)
4. `@PreDestroy` methods run (close DB connections, flush caches)
5. App exits cleanly

```java
// Cleanup on shutdown
@Component
public class ShutdownCleanup {
    @PreDestroy
    public void cleanup() {
        // Line 1: Close database connections
        // Line 2: Flush caches
        // Line 3: Deregister from service discovery
        // Line 4: Stop background threads
        System.out.println("Cleaning up before shutdown...");
    }
}
```

## Externalized config — environment variables

```yaml
# application.yml — defaults for local development
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/academy
    username: academy
    password: dev-secret

app:
  jwt:
    secret: dev-secret-key-at-least-32-chars
```

```bash
# Production — override via environment variables
export DATABASE_URL="jdbc:postgresql://prod-db:5432/academy"
export APP_JWT_SECRET="production-secret-key-must-be-32-chars"
# Spring Boot reads these automatically — no code changes needed
```

**Spring Boot's property resolution order (highest to lowest priority):**
1. Command-line arguments (`--server.port=9090`)
2. Environment variables (`DATABASE_URL`)
3. `application-prod.yml` (profile-specific)
4. `application.yml` (default)
5. Defaults in code

## The production checklist

```yaml
# Complete production configuration
server:
  port: 8080
  shutdown: graceful                    # Graceful shutdown

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  endpoint:
    health:
      probes:
        enabled: true                   # Enable liveness/readiness probes

spring:
  datasource:
    url: ${DATABASE_URL}
    hikari:
      maximum-pool-size: 20             # Connection pool size
      connection-timeout: 5000          # Fail fast if DB is down

logging:
  level:
    root: INFO
    com.acme: DEBUG                     # App-specific debug logging

# JVM flags for containers
# -XX:MaxRAMPercentage=75.0             # Use 75% of container memory
# -XX:+UseG1GC                          # Garbage collector
# -Djava.security.egd=file:/dev/./urandom  # Faster startup
```

## Real-world scenario — deploying to Kubernetes

```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: academy-api
spec:
  replicas: 3                          # Run 3 instances
  selector:
    matchLabels:
      app: academy-api
  template:
    spec:
      containers:
      - name: academy-api
        image: academy-api:latest
        ports:
        - containerPort: 8080
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
        livenessProbe:
          httpGet:
            path: /actuator/health/liveness
            port: 8080
          initialDelaySeconds: 30      # Wait 30s before first check
          periodSeconds: 10            # Check every 10s
        readinessProbe:
          httpGet:
            path: /actuator/health/readiness
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
```

## Common mistakes

| Mistake | Why it fails | Fix |
|---|---|---|
| Config in properties files | Can't change without redeploy | Use environment variables |
| No health checks | Orchestrator can't detect failures | Add Actuator health endpoints |
| No graceful shutdown | Requests dropped on deploy | Enable `server.shutdown: graceful` |
| Hardcoded URLs | Breaks in different environments | Use `DATABASE_URL` env var |
| No resource limits | One app consumes all container memory | Set memory/CPU limits |

## Key takeaways

- Cloud-native = stateless, configurable via env vars, health-checked, gracefully shutdown
- Health checks: liveness (alive?) and readiness (ready?) — Kubernetes uses both
- Graceful shutdown: stop accepting new requests, finish existing ones, then exit
- Externalized config: environment variables override `application.yml`
- The 12-Factor checklist is your production deployment guide

**Official docs:** [Actuator Endpoints](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html) · [Graceful Shutdown](https://docs.spring.io/spring-boot/reference/web/graceful-shutdown.html)
