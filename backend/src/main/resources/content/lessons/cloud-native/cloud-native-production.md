---
title: 12-Factor & Cloud-Native Production
summary: The twelve factors that make an app run anywhere — config, disposability, observability, and the production checklist for a Spring Boot service.
order: 6
minutes: 14
topics: [12 factor, cloud native, observability, autoscaling, production checklist]
docs:
  - https://12factor.net/
  - https://docs.spring.io/spring-boot/reference/deployment/cloud.html
---

# 12-Factor & Cloud-Native Production

## The twelve factors, mapped to Spring Boot

The 12-factor manifesto is the "works anywhere" contract — every factor maps to a concrete Spring Boot practice:

| Factor | The rule | In Spring Boot |
|---|---|---|
| 1. Codebase | one repo per app, deployable anywhere | one `backend/`, built the same everywhere |
| 2. Dependencies | explicit, isolated | `pom.xml`/`gradle` — declare everything, no ambient system packages |
| 3. Config | config in **environment**, not code | `APP_JWT_SECRET`, `DATABASE_URL` (this academy's env-var pattern) |
| 4. Backing services | attached resources are swappable | `DATABASE_URL` swap = new DB, zero code change (`DatabaseConfig`) |
| 5. Build/release/run | build once, release with config, run immutably | CI builds the image once; deploy = config + run |
| 6. Processes | stateless processes | no local state; sessions in Redis/DB (Spring Session lesson) |
| 7. Port binding | the app is self-contained, exports HTTP | embedded Tomcat on `$PORT` |
| 8. Concurrency | scale via processes, not threads | horizontal replicas (k8s/Render) — the free-tier keepalive keeps them warm |
| 9. Disposability | fast start, graceful stop | startupProbe + `server.shutdown: graceful` (k8s lesson) |
| 10. Dev/prod parity | same stack everywhere | Testcontainers — real Postgres in tests (the testing lesson) |
| 11. Logs | logs are streams, not files | stdout + structured logging (the logging lesson) |
| 12. Admin processes | one-off scripts as release processes | migrations run in the deploy, not ad-hoc |

The one this academy demonstrates end to end: **config in environment** — the same jar runs with H2 locally, Postgres on Render, and (soon) a k8s Secret — the binary never knows where it lives.

## Observability: the production trinity

A cloud-native app is *auditable* — three pillars, all from the code:

1. **Metrics** — Actuator + Micrometer: `http.server.requests`, JVM, Hikari pool (the performance lesson's list). Prometheus scrapes; Grafana draws.
2. **Logs** — structured stdout with a correlation ID per request (the logging lesson); the platform (Loki/CloudWatch/ELK) collects.
3. **Traces** — Micrometer Tracing propagates `traceId`/`spanId` (the distributed-tracing lesson); each log line and each downstream call shares the trace.

The Spring Boot checklist: `management.endpoints.web.exposure.include: health,info,metrics,prometheus`, probes wired to `/actuator/health/*`, and a dashboard that answers "is it healthy, is it slow, where is the time going?" — before the alert fires, ideally.

## Autoscaling: when the platform scales for you

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: academy-api }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: academy-api }
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: 70 }
```

The conditions for autoscaling to be *correct*: the app is stateless (factor 6), pods take traffic only when ready (readiness), and there's no hard external limit being pounded (DB connections scale with pods — the pool sizing lesson). Autoscaling on CPU is the baseline; latency/queue-depth targets come later. On Render's free tier this is moot (one instance); on k8s it's the point.

## The production readiness checklist

```text
□ health endpoints: /actuator/health/liveness + readiness, wired to probes
□ graceful shutdown configured (server.shutdown: graceful)
□ resource requests/limits set; JVM sized with MaxRAMPercentage
□ config via env/ConfigMap/Secret — no secrets in the image
□ logs to stdout, structured, with correlation IDs
□ metrics exposed and scraped; dashboard exists before the incident
□ migrations run in the deploy (Flyway), validated in CI
□ backups for the database (the platform's managed backup — this academy's free Postgres expires Sep 16; upgrade for a permanent DB)
□ image pinned + scanned; dependency updates automated (renovate)
□ a rollback path rehearsed (rollout undo / redeploy previous release)
```

Every item on this list is a *deploy-day* habit, not a project — the checklist is how "it worked on my machine" becomes "it works on the platform".

## Key takeaways

- The 12 factors = the "runs anywhere" contract; env-based config is the one that makes everything else possible.
- Observability = metrics + logs + traces, all emitted by the code, consumed by the platform.
- Autoscaling is only correct on stateless apps with readiness-gated traffic and bounded downstreams.
- Run the production readiness checklist per deploy; rehearse rollback before you need it.

Official docs: [12-factor](https://12factor.net/) · [Spring Boot Cloud Deployment](https://docs.spring.io/spring-boot/reference/deployment/cloud.html)
