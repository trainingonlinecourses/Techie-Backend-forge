---
title: Production Readiness
summary: Profiles, logging, graceful shutdown, Docker, health probes and the 12-factor checklist.
order: 9
minutes: 16
topics: [production, docker, 12-factor, graceful-shutdown, profiles]
docs:
  - https://docs.spring.io/spring-boot/reference/deployment/index.html
  - https://12factor.net
---

# Production Readiness

## The production checklist

- [ ] Runs from one artifact (`java -jar app.jar`) — no source, no IDE
- [ ] Configuration via environment, not code
- [ ] Health/readiness endpoints for the platform
- [ ] Logs to stdout as JSON with trace ids
- [ ] Graceful shutdown on SIGTERM
- [ ] Sealed in a container with a non-root user
- [ ] All secrets external (env/vault)
- [ ] JVM flags for production (see java-platform lesson)

## Graceful shutdown

```yaml
server:
  shutdown: graceful
spring:
  lifecycle:
    timeout-per-shutdown-phase: 20s
```

On SIGTERM the app stops accepting new requests, drains in-flight ones (up to the timeout), runs `@PreDestroy` hooks, then exits. Zero dropped requests during deploys.

## Docker

```dockerfile
# Multi-stage: build with Maven, run with a slim JRE
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q package -DskipTests

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S app && adduser -S app -G app
USER app
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:+UseG1GC", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
```

```bash
docker build -t payments-api .
docker run -p 8080:8080 -e DB_URL=... -e APP_JWT_SECRET=... payments-api
```

## 12-factor in one table

| Factor | In Spring terms |
|---|---|
| Codebase | One repo per service |
| Dependencies | Declared in pom.xml — never rely on the environment |
| Config | `application.yml` + env vars |
| Backing services | URL/credentials via env, swappable |
| Build/release/run | Identical artifact across environments |
| Processes | Stateless; state in DB/cache |
| Port binding | Self-contained: Boot embeds Tomcat |
| Concurrency | Scale with instances, not threads |
| Disposability | Fast startup + graceful shutdown |
| Dev/prod parity | Testcontainers instead of "works on my machine" |
| Logs | Event stream to stdout |
| Admin tasks | One-off jobs/`ApplicationRunner`, not manual DB edits |

## Kubernetes probes

```yaml
# deployment.yaml (excerpt)
livenessProbe:
  httpGet: { path: /actuator/health/liveness, port: 8080 }
  initialDelaySeconds: 30
  periodSeconds: 10
readinessProbe:
  httpGet: { path: /actuator/health/readiness, port: 8080 }
  periodSeconds: 5
```

Liveness = "restart me"; readiness = "stop routing to me". Boot provides both groups out of the box.

> **Why it matters (organizational view)** — Production readiness is a *standard*, not an afterthought: every service ships with health probes, graceful shutdown, JSON logs, externalized secrets, and a slim container. When everything behaves the same way, the platform team can operate 50 services with the same runbook.

## Key takeaways

- One artifact + env config = promotable releases.
- Graceful shutdown drains requests; probes guide the platform.
- Multi-stage Docker: build fat jar, run as non-root.
- 12-factor is the shared contract between dev and ops.

**Official docs:** [Deployment](https://docs.spring.io/spring-boot/reference/deployment/index.html) · [12-factor](https://12factor.net)
