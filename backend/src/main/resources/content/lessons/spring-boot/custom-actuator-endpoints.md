---
title: Custom Actuator Endpoints & Health Indicators — Ops Visibility
summary: Building custom HealthIndicator beans, custom @Endpoint operations, and the metrics patterns that make an app's operational state visible.
order: 22
minutes: 17
topics: [actuator, healthindicator, custom-endpoint, metrics, readiness, liveness, ops]
docs:
  - https://docs.spring.io/spring-boot/reference/actuator/endpoints.html
  - https://docs.spring.io/spring-boot/reference/actuator/endpoints.html#actuator.endpoints.implementing-custom
---

# Custom Actuator Endpoints & Health Indicators — Ops Visibility

## The concept: Actuator is the ops window

Spring Boot Actuator exposes the app's operational state as HTTP endpoints: `/actuator/health`, `/actuator/metrics`, `/actuator/env`, `/actuator/info`. The framework provides the window — and **the extension points** for your app's *own* signals:

- **`HealthIndicator`** — a bean that reports the health of one subsystem (a database, a downstream API, a disk). The aggregate feeds `/actuator/health` and, crucially, **readiness/liveness probes** for Kubernetes.
- **`@Endpoint` + `@ReadOperation`/`@WriteOperation`** — custom endpoints exposing app-specific state (a queue depth, a cache snapshot, a manual reindex trigger).

## HealthIndicator — the pattern

```java
@Component
public class PaymentGatewayHealthIndicator implements HealthIndicator {
    private final PaymentGatewayClient client;

    @Override
    public Health health() {
        try {
            var status = client.ping();                       // cheap probe, short timeout
            return status.isUp()
                ? Health.up().withDetail("latencyMs", status.latencyMs()).build()
                : Health.down().withDetail("reason", status.reason()).build();
        } catch (Exception e) {
            return Health.down(e).build();                    // exception → DOWN with cause
        }
    }
}
```

- The aggregate `/actuator/health` returns `UP` only when **all** indicators are up (or `OUT_OF_SERVICE` for statuses you set).
- **Details are hidden by default** — `management.endpoint.health.show-details=when-authorized` (or `always` for internal networks) controls whether the per-component details are visible.
- **Keep probes cheap and fast** — a health endpoint that blocks 30s waiting on a dependency makes the *probe itself* the outage.

## Custom endpoints — the pattern

```java
@Component
@Endpoint(id = "queueDepth")                                // → /actuator/queueDepth
public class QueueDepthEndpoint {
    private final MessageQueue queue;

    @ReadOperation
    public QueueDepthInfo depth() {
        return new QueueDepthInfo(queue.pending(), queue.consumers());
    }

    @WriteOperation
    public void drain() {                                    // POST /actuator/queueDepth
        queue.drain();
    }

    @DeleteOperation
    public void purge() { ... }                              // DELETE — purge the queue
    public record QueueDepthInfo(long pending, int consumers) {}
}
```

Operations: `@ReadOperation` (GET), `@WriteOperation` (POST), `@DeleteOperation` (DELETE). Custom endpoints are how teams expose *their* knobs: cache eviction, feature-flag refresh, job triggers, queue stats — visible to ops without a bespoke admin UI.

## Liveness vs readiness — the Kubernetes distinction

- **Liveness probe** (`/actuator/health/liveness`) — "is the JVM alive and making progress?" If it fails, the platform **restarts** the pod.
- **Readiness probe** (`/actuator/health/readiness`) — "is this instance able to serve traffic?" If it fails, the platform **stops routing** traffic (but does not restart).

Enable both:

```properties
management.endpoint.health.probes.enabled=true
# then /actuator/health/liveness and /actuator/health/readiness are available
```

**The critical design rule:** a *dependency* being down (database, gateway) should flip **readiness** DOWN (stop traffic, keep serving the degraded parts that don't need it), not liveness DOWN (don't kill the pod for an external outage — restarting won't fix a dead database). Custom `HealthIndicator`s default to contributing to readiness in Boot 3 — use `@HealthIndicator` with `Status` choices deliberately.

## How we use it in an organization: the scenarios

**Scenario 1 — dependency health in one place.** A `HealthIndicator` per critical dependency (DB via the auto-configured `DataSourceHealthIndicator`, Redis, Kafka, payment gateway, search index) — the ops dashboard shows each subsystem's status at a glance and the probe wiring uses the same source of truth.

**Scenario 2 — a manual "reload config" knob.** `@WriteOperation` on a config endpoint: ops POSTs to refresh a feature flag without restarting:

```java
@Component @Endpoint(id = "featureFlags")
public class FeatureFlagEndpoint {
    @WriteOperation
    public void refresh(@Selector String name) { flagService.reload(name); }
}
```

**Scenario 3 — cache statistics for capacity planning.** A `@ReadOperation` exposing hit-rate, size, and eviction counts — the data that tells you when a cache needs a bigger limit.

**Scenario 4 — the degraded-mode readiness signal.** An indicator that reports `DOWN` only when the *core* dependency fails but `UP` (or `OUT_OF_SERVICE`) for optional ones — so the platform keeps routing during partial outages and only isolates a truly broken instance.

## Pitfalls

- **Health probes that do real work** — a health check that runs a heavy query or calls a slow API can take down the app under load (probes fire every few seconds). Keep probes cheap; heavy checks belong in scheduled jobs.
- **Exposing sensitive endpoints** — `env`, `configprops`, `heapdump`, `loggers` can leak secrets; secure Actuator (`management.endpoint.env.access=...` or Spring Security rules) and only expose what ops needs.
- **`show-details=always` on a public health endpoint** — leaks internal state (DB names, version strings). Default to `when-authorized`.
- **Liveness vs readiness confusion** — restarting pods on external dependency failure makes outages worse, not better.
- **Custom endpoints without security** — a `@WriteOperation` that purges a queue must be protected, or anyone can trigger destructive ops.

## Key takeaways

- `HealthIndicator` beans aggregate into `/actuator/health` — one per critical subsystem.
- Custom `@Endpoint`s expose app-specific state and knobs to ops via GET/POST/DELETE operations.
- Liveness = restart me; readiness = stop routing to me — keep dependency failures on readiness.
- Keep probes cheap and fast; secure sensitive endpoints; hide details by default.
- Health indicators are the source of truth for Kubernetes probes and ops dashboards alike.
