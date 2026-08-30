---
title: Postgres Performance Tuning
module: postgresql-deep
order: 5
minutes: 25
topics: ["EXPLAIN", "query tuning", "connection pooling", "work_mem", "vacuum", "monitoring"]
docs:
  - title: "PostgreSQL performance"
    url: "https://www.postgresql.org/docs/current/performance-tips.html"
summary: A slow database is almost never "Postgres is slow" — it's a missing index, a runaway query, a connection pool exhausted, or bloat from unvacuumed t...
---

# Postgres Performance Tuning

A slow database is almost never "Postgres is slow" — it's a missing index, a runaway query, a connection pool exhausted, or bloat from un-vacuumed tables. This lesson is the systematic approach: measure with EXPLAIN, fix the top causes, and monitor the health metrics that predict trouble.

## The Tuning Hierarchy

```
1. Schema (indexes, types)      ← 80% of fixes live here
2. Query (joins, predicates)
3. Configuration (work_mem, shared_buffers)
4. Hardware (RAM, disk, CPU)
```

**Indexes and query shape first** — config and hardware rarely fix a missing index.

## EXPLAIN ANALYZE: Reading the Plan

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT c.title, count(l.id)
FROM courses c
LEFT JOIN lessons l ON l.course_id = c.id
WHERE c.level = 'BEGINNER'
GROUP BY c.title;
```

```
HashAggregate  (cost=.. rows=..)
  -> Hash Left Join  (cost=.. rows=..)
       Hash Cond: (c.id = l.course_id)
       -> Seq Scan on courses c   ← ⚠️ full scan on the filter column
            Filter: (level = 'BEGINNER')
       -> Hash
            -> Seq Scan on lessons l
```

What to look for:

| Signal | Fix |
|--------|-----|
| `Seq Scan` on a hot filter column | Add an index |
| `rows=...` wildly off actual | Run ANALYZE (stale statistics) |
| `Nested Loop` with inner seq scan | Index on the join column |
| `Sort` of a big set | Index that provides the order |
| `Buffers: shared read` high | Not cached — warm it or fix query |

## The Top Five Performance Killers

### 1. Missing Index (the 90% case)

```sql
-- Slow query
SELECT * FROM orders WHERE customer_id = 42 ORDER BY created_at DESC;

-- Fix
CREATE INDEX idx_orders_customer_created
ON orders (customer_id, created_at DESC);
```

### 2. Select * (the payload bloat)

```java
// ❌ JPA fetches every column, including @Lob bodies
List<Course> courses = repository.findAll();

// ✅ Fetch only what the page needs (projection)
public interface CourseSummary {
    Long getId();
    String getTitle();
}
List<CourseSummary> findTop100ByOrderByCreatedAtDesc();
```

### 3. N+1 Queries (the JPA trap)

```java
// ❌ 1 course + N lessons = N+1 queries
for (Course c : courses) {
    c.getLessons().size();      // triggers a query per course
}
```

```java
// ✅ Fetch join or @EntityGraph — 1 query
@EntityGraph(attributePaths = "lessons")
List<Course> findAllWithLessons();
```

### 4. Connection Pool Exhaustion

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
      connection-timeout: 30000
      max-lifetime: 1800000
```

Symptoms: `Connection is not available, request timed out`, latency spikes, 500s. Fix: pool size ≈ `(cores × 2) + effective_spindle_count`, and **hunt the queries holding connections too long** (transactions around slow external calls — see NOT_SUPPORTED in the transactions module).

### 5. Table Bloat and Stale Stats

Postgres keeps dead row versions (MVCC). **VACUUM** reclaims space; **ANALYZE** refreshes planner statistics:

```sql
VACUUM (ANALYZE) courses;          -- manual
-- Autovacuum does this automatically — monitor it
SELECT relname, n_dead_tup, last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000 ORDER BY n_dead_tup DESC;
```

A table with huge `n_dead_tup` and no recent autovacuum = bloat — queries slow and disk grows.

## work_mem: The Sort/Hash Memory

```sql
-- Per-operation memory for sorts/hashes (default 4MB!)
SET work_mem = '64MB';
```

```yaml
# application.yml (via datasource init or connection param)
spring:
  datasource:
    hikari:
      connection-init-sql: SET work_mem = '64MB'
```

If EXPLAIN shows `Sort Method: external merge Disk:` — the sort spilled to disk; raise `work_mem`. Note it's **per operation, not per query** — 20 parallel sorts × 64MB = 1.28GB. Raise with care.

## The Health Metrics That Matter

```sql
-- Slow queries (longest first)
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 10;

-- Cache hit ratio (should be > 99%)
SELECT sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) AS ratio
FROM pg_statio_user_tables;

-- Connections in use
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Blocked queries
SELECT pid, wait_event_type, wait_event, query
FROM pg_stat_activity WHERE wait_event_type = 'Lock';
```

Enable `pg_stat_statements`:

```sql
-- postgresql.conf
shared_preload_libraries = 'pg_stat_statements'
```

It's the single best tool for finding the real slow queries in production.

## Spring Boot Integration

```java
@Configuration
public class DatabaseMonitoringConfig {

    @Bean
    public MeterBinder postgresMetrics(DataSource dataSource) {
        return new PostgresqlDatabaseMetrics(dataSource);   // Micrometer → Prometheus
    }
}
```

Plus Spring Boot Actuator's `db` health indicator and HikariCP metrics — connection pool usage, active/idle, waits — all in Grafana.

## The Tuning Checklist

- ✅ Every hot filter/join column indexed
- ✅ Projections instead of `select *` (no @Lob in lists)
- ✅ @EntityGraph / fetch joins for N+1
- ✅ Pool sized, timeouts set, no long tx around I/O
- ✅ Autovacuum healthy, stats fresh
- ✅ work_mem raised for sort-heavy queries
- ✅ pg_stat_statements enabled + monitored
- ✅ EXPLAIN ANALYZE before/after every change

## Summary

| Layer | Fix |
|-------|-----|
| Schema | Indexes (composite, covering, partial) |
| Query | Projections, fetch joins, no N+1 |
| Config | work_mem, shared_buffers, pool size |
| Hygiene | VACUUM/ANALYZE, no bloat |
| Monitoring | pg_stat_statements, cache-hit ratio, pool metrics |
| Process | EXPLAIN ANALYZE → fix → re-measure |

Performance tuning is a loop of measurement and targeted fixes: EXPLAIN ANALYZE shows the plan, the five killers explain most slowness, and pg_stat_statements finds what's actually slow in production. Index first, fetch less, and let the numbers — not intuition — drive the changes.
