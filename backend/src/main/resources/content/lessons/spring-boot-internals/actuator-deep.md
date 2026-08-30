---
title: Actuator — Production Insights Built In
module: spring-boot-internals
order: 5
minutes: 24
topics: ["actuator", "health", "metrics", "info", "endpoints", "readiness liveness"]
docs:
  - title: "Actuator (Spring Boot docs)"
    url: "https://docs.spring.io/spring-boot/reference/actuator/index.html"
summary: A deployed app is a black box: is it up? Is it healthy? How much memory? What's the request rate? Without tooling, answering means SSHing in and gu...
---

# Actuator — Production Insights Built In

## The Concept: The Dashboard the App Carries With It

A deployed app is a black box: is it up? Is it healthy? How much memory? What's the request rate? Without tooling, answering means SSHing in and guessing. **Spring Boot Actuator** answers from *inside* the app — a set of built-in **endpoints** that expose the application's runtime state over HTTP.

Add one dependency:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

And immediately:

```bash
curl http://localhost:8080/actuator/health
# {"status":"UP"}
curl http://localhost:8080/actuator/info
curl http://localhost:8080/actuator/metrics
curl http://localhost:8080/actuator/env          # (if exposed)
```

This is why Render/Railway health checks work against `/actuator/health`: the app *tells* the platform it's alive. It's also the foundation of observability: metrics feed Prometheus, logs correlate via tracing, health gates load balancers.

## The Health Endpoint — The Most Important One

`/actuator/health` is special:

- It aggregates every **`HealthIndicator`** in the app into one status.
- **`UP`** means everything reports healthy; **`DOWN`** means a critical dependency failed.
- The detail shows *which* component failed: `{"status":"DOWN","components":{"db":{"status":"DOWN"}}}`.
- It's what platforms poll for liveness/readiness.

Built-in indicators check the database (`DataSourceHealthIndicator`), disk space, RabbitMQ, Redis, Kafka, and more — automatically present when those libraries are on the classpath.

## Readiness vs Liveness (Kubernetes Concepts, Boot Native)

- **Liveness** — "is the process stuck?" (`/actuator/health/liveness`). If liveness fails, the platform restarts the app.
- **Readiness** — "is it ready to serve traffic?" (`/actuator/health/readiness`). If readiness fails, the platform stops routing traffic to it (but doesn't restart).

Boot 3 exposes both as groups automatically: `curl /actuator/health/readiness`. In your earlier turns you saw the Render health check `{"status":"UP","groups":["liveness","readiness"]}` — that's this feature. A classic use: report *not ready* during startup until the DB migration finishes; report *not live* only if truly wedged.

## The Code Walkthrough

```java
// ---- 1. Expose the endpoints you want (security-minded by default) ----
# application.properties
management.endpoints.web.exposure.include=health,info,metrics
management.endpoint.health.show-details=always
management.endpoint.health.probes.enabled=true

// ---- 2. Custom health indicator — check your own dependency ----
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

@Component
public class CurriculumHealthIndicator implements HealthIndicator {

    @Override
    public Health health() {
        boolean contentLoaded = ContentStats.isLoaded();   // your check
        if (contentLoaded) {
            return Health.up()
                    .withDetail("modules", ContentStats.moduleCount())
                    .build();
        }
        return Health.down()
                .withDetail("reason", "curriculum not loaded")
                .build();
    }
}
```

```java
// ---- 3. Info endpoint — static and dynamic metadata ----
// application.properties:
info.app.name=BackendForge Academy
info.app.description=Java & Spring end-to-end course platform

// dynamic info via InfoContributor:
@Component
public class VersionInfoContributor implements InfoContributor {
    @Override
    public void contribute(Info.Builder builder) {
        builder.withDetail("build", BuildInfo.buildNumber());   // from manifest/env
    }
}
```

### Walking Through Each Part

**Exposure** — actuator endpoints are **not exposed over HTTP by default** (only `health` is). You opt in via `management.endpoints.web.exposure.include`. In production, expose only what you need and put the actuator behind auth or the internal network — `/actuator/env` leaks environment variables (secrets!).

**`HealthIndicator`** — your custom check: implement `health()` and return `Health.up()/down()` with details. Every indicator contributes to the aggregate. This is how you make *your app's* real dependencies (content loaded, AI provider reachable, migrations done) visible to the platform's health checks.

**`InfoContributor`** — contributes to `/actuator/info`: version, commit SHA, environment name — the "what am I running?" endpoint for ops.

## Metrics — The Observability Backbone

`/actuator/metrics` lists metric names; `/actuator/metrics/{name}` gives values:

```bash
curl /actuator/metrics/http.server.requests
# {"name":"http.server.requests","measurements":[{"statistic":"COUNT","value":1234},...]}
```

Micrometer (covered in depth in the observability module) powers this: JVM memory, threads, GC, HTTP request counts/latencies, DB pool usage — all captured automatically. The same registry feeds Prometheus (`/actuator/prometheus`) and dashboards. Add your own counters easily:

```java
@Component
public class CourseMetrics {
    private final Counter lessonsViewed;

    CourseMetrics(MeterRegistry registry) {
        this.lessonsViewed = Counter.builder("academy.lessons.viewed")
                .description("Lessons viewed by students")
                .register(registry);
    }

    public void lessonViewed() { lessonsViewed.increment(); }
}
```

## Security — Don't Expose Your Internals Publicly

Actuator endpoints expose internals (`/actuator/env` shows environment variables — including secrets; `/actuator/beans` lists every bean). Guidance:

- **Expose only what's needed**: `health,info,metrics` in production.
- **Protect the rest** with Spring Security or a network policy (internal-only).
- With Spring Security present, actuator endpoints are **automatically protected** by default (403 without auth) — you must explicitly permit `/actuator/health` for your platform's health checks:

```java
http.securityMatcher("/actuator/**")
    .authorizeHttpRequests(auth -> auth
        .requestMatchers("/actuator/health/**").permitAll()   // platforms poll this
        .anyRequest().authenticated());
```

## Common Beginner Pitfalls

1. **Forgetting to expose endpoints** — `health` works, but `metrics`/`env` return 404 until you add `management.endpoints.web.exposure.include`.
2. **Exposing `/env` publicly** — leaks secrets. Never expose `env` or `configprops` without auth.
3. **`show-details=never` (default)** — a `DOWN` health shows no reason; set `show-details=always` (or `when-authorized`) in dev/ops environments.
4. **Liveness failing on slow-but-alive apps** — readiness for "warming up", liveness for "truly stuck"; don't make liveness fail during a long startup.
5. **Health checks against the wrong path** — your platform needs `/actuator/health` (and possibly `/actuator/health/readiness`), not `/`.
6. **Custom indicators that throw** — an exception in `health()` marks the whole health check erroring; catch and report `Health.down(...)` instead.

## Key Takeaways

- Actuator gives production insights (health, metrics, info) from inside the app — one dependency.
- `/actuator/health` aggregates all `HealthIndicator`s; platforms poll it for liveness/readiness.
- Custom `HealthIndicator` and `InfoContributor` make *your* app's state visible.
- Micrometer metrics feed dashboards and alerting (Prometheus/Grafana).
- Expose only what you need; protect the rest; never expose `/env` publicly.
- In Spring Security setups, permit `/actuator/health/**` explicitly for platform checks.
