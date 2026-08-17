---
title: Performance Tuning in Practice
summary: The measurement-first checklist for a Spring Boot backend — latency targets, connection pools, JIT and warmup, and the anti-patterns that waste effort.
order: 5
minutes: 15
topics: [performance tuning, jit, warmup, connection pools, latency, throughput]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html
  - https://docs.spring.io/spring-boot/reference/actuator/metrics.html
---

# Performance Tuning in Practice

## The first rule: measure, then measure again

Tuning without a baseline is astrology. Before changing anything:

```bash
# Baseline: latency distribution + throughput under representative load
# (k6 / Gatling / wrk — the same tool the whole team uses):
wrk -t4 -c100 -d60s http://localhost:8080/api/content/lessons/jwt-auth
```

Capture: **p50 / p95 / p99 latency**, throughput (req/s), and error rate — under a load profile that resembles production (concurrency, data volume, cache warmth). The p99 is the number users feel; the error rate is the number that makes the p99 irrelevant.

## The tuning checklist, in order of payoff

**1. The database is usually the story.** Query count per request, index usage, N+1:

```sql
-- count queries per request with Hibernate:
logging.level.org.hibernate.SQL: DEBUG
-- or P6Spy; find the repeat query → join fetch / @EntityGraph (the query-methods lesson)
```

**2. Connection pools.** The pool bounds parallelism — too small and requests queue; too large and the DB thrashes. Spring Boot default (Hikari, 10) is a fine start; tune with the DB's own limits:

```yaml
spring.datasource.hikari.maximum-pool-size: 20   # not 200 — contention, not speed
spring.datasource.hikari.connection-timeout: 3000  # fail fast > queue forever
```

**3. HTTP client timeouts.** Every downstream call needs connect+read timeouts (the rest-clients lesson) — a 30s hang on a p95 path is a tuning problem with a two-line fix.

**4. Caching the read path** — `@Cacheable` on the hot read (the caching lesson). A 99% hit ratio on a hot endpoint beats any JVM flag.

**5. JSON serialization** — Jackson is fast; the cost is usually the *size* of the payload. Profile, then consider DTO projections over entity graphs.

## JIT and warmup: the first requests lie

The JVM **JIT-compiles** hot methods as they run — the 1st request is interpreter-speed, the 10,000th is optimized. Consequences:

- Load tests must **warm up** (discard the first N minutes) or every conclusion is wrong.
- p99 measured on a cold JVM ≠ p99 in production.
- For latency-critical services, **AppCDS** (`-XX:ArchiveClassesAtExit` / `-XX:SharedArchiveFile`) and **AOT** (GraalVM native — the cloud-native lesson) reduce startup and warmup; for most Spring Boot services, warming in a load test is enough.

## The four failure modes of tuning effort

1. **Tuning GC before profiling allocations** — fixing the symptom; the alloc profile shows the cause.
2. **Thread-pool magic numbers** — "100 threads" is a guess; the right number comes from measuring queue depth and downstream limits.
3. **Premature caching** — a cache on a cold key space is memory for nothing; measure the hit ratio (the caching lesson's metric).
4. **Local-only measurements** — a laptop benchmark of `BigDecimal` math is not the p99 of the deployed system. Test where it runs, with production-shaped data.

## The metrics that run the show (Actuator + Micrometer)

```yaml
management.endpoints.web.exposure.include: health,info,metrics,prometheus
```

```bash
curl localhost:8080/actuator/metrics/http.server.requests
```

The numbers to watch in production: **http.server.requests** (latency percentiles per endpoint), **hikaricp.connections.pending** (pool exhaustion), **jvm.gc.pause** (GC latency), **jvm.memory.used** (leak ratchet). A dashboard on these four catches the incident before users file it.

## The one-sentence methodology

**Baseline → hypothesis from data (profile, GC log, metrics) → one change → re-measure against the same baseline.** If the change didn't move the p99, revert it and form a new hypothesis. Discipline beats cleverness; most "performance work" is actually removing the one N+1 query nobody measured.

## Key takeaways

- Baseline p50/p95/p99 + throughput + errors before touching anything.
- The payoff order: query count → connection pool → timeouts → caching → payload size → JVM knobs.
- Warm up before measuring; JIT makes the first requests meaningless.
- Watch `http.server.requests`, pool pending, GC pauses, heap trend in production.
- One change, same baseline, re-measure — or revert.

Official docs: [java tool](https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html) · [Actuator metrics](https://docs.spring.io/spring-boot/reference/actuator/metrics.html)
