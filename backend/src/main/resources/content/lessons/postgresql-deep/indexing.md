---
title: Indexing for Performance
module: postgresql-deep
order: 2
minutes: 28
topics: ["B-tree indexes", "composite indexes", "covering indexes", "EXPLAIN ANALYZE", "index-only scans", "partial indexes"]
docs:
  - title: "PostgreSQL indexes"
    url: "https://www.postgresql.org/docs/current/indexes.html"
summary: An index is a sorted copy of a column (or columns) that lets the database find rows without scanning the whole table. This lesson covers what index...
---

# Indexing for Performance

An index is a sorted copy of a column (or columns) that lets the database find rows without scanning the whole table. This lesson covers what indexes actually do, the four index designs that matter, and how `EXPLAIN ANALYZE` tells you whether your index is working.

## Why Indexes Work

```
SELECT * FROM courses WHERE level = 'BEGINNER';

Without index:  seq scan — read ALL rows, check each (O(n))
With index:     btree seek — jump straight to the matches (O(log n))
```

A B-tree index stores `(level, row location)` sorted — the database binary-searches it and fetches only matching rows.

## Creating Indexes

```sql
CREATE INDEX idx_courses_level ON courses (level);

-- Unique (also a constraint)
CREATE UNIQUE INDEX idx_courses_code ON courses (code);

-- Multi-column
CREATE INDEX idx_courses_level_minutes ON courses (level, minutes);
```

In JPA, via `@Index`:

```java
@Entity
@Table(indexes = {
    @Index(name = "idx_courses_level", columnList = "level"),
    @Index(name = "idx_courses_level_minutes", columnList = "level, minutes")
})
public class Course { ... }
```

## Composite Indexes: Column Order Is Everything

```sql
CREATE INDEX idx ON courses (level, minutes, id);
```

| Query | Uses index? |
|-------|-------------|
| `WHERE level = 'BEGINNER'` | ✅ leftmost prefix |
| `WHERE level = ? AND minutes > 30` | ✅ |
| `WHERE minutes > 30` | ❌ (skips the leftmost column) |
| `WHERE level = ? ORDER BY minutes` | ✅ (sorted by the index) |

**The rule**: put the most selective / most-filtered column first; the index only helps queries that use its *leftmost prefix*.

## Covering Indexes: Index-Only Scans

```sql
-- Query only needs level + count
SELECT level, COUNT(*) FROM courses GROUP BY level;

-- Covering index: the index itself contains the data — no table fetch
CREATE INDEX idx_courses_level_covering ON courses (level) INCLUDE (id);
```

`INCLUDE` stores extra columns in the index leaf without sorting on them. An **index-only scan** never touches the table — the fastest possible query.

## Partial Indexes: Index Only What Matters

```sql
-- Index only active courses — smaller, faster
CREATE INDEX idx_courses_active ON courses (minutes)
WHERE published = true;

-- The query must match the predicate to use it
SELECT * FROM courses WHERE published = true AND minutes > 40;
```

Partial indexes shrink the index by excluding rows you never query — a common win for status-filtered tables.

## EXPLAIN ANALYZE: The Truth

```sql
EXPLAIN ANALYZE
SELECT * FROM courses WHERE level = 'BEGINNER';
```

```
Seq Scan on courses  (cost=0.00..183.00 rows=9000 width=88)
  Filter: ((level)::text = 'BEGINNER'::text)
  Rows Removed by Filter: 21000
  Planning Time: 0.3 ms
  Execution Time: 45.0 ms
```

`Seq Scan` = full table scan — the index isn't helping (or doesn't exist). Add the index:

```
Bitmap Heap Scan on courses  (cost=... rows=9000)
  Recheck Cond: (level = 'BEGINNER')
  -> Bitmap Index Scan on idx_courses_level
     Execution Time: 2.1 ms
```

**The workflow**: write query → `EXPLAIN ANALYZE` → see `Seq Scan` on a hot column → add index → re-run → see `Index Scan`. Indexing without EXPLAIN is guessing.

## When Indexes Hurt

| Cost | Detail |
|------|--------|
| Write slowdown | Every INSERT/UPDATE/DELETE must maintain every index |
| Disk space | Indexes duplicate data |
| Planner confusion | Too many overlapping indexes → wrong choices |

**Rules**:
- Index hot *read* columns, not columns you never filter
- Don't index low-selectivity columns alone (`published` boolean — 50/50 split)
- Remove redundant indexes (`(level, minutes)` makes `(level)` alone redundant)
- Indexes on write-heavy tables cost real throughput

## The Common Index Set for a Spring Entity

```java
@Entity
@Table(name = "courses", indexes = {
    @Index(name = "idx_courses_code", columnList = "code", unique = true),
    @Index(name = "idx_courses_level_minutes", columnList = "level, minutes"),
    @Index(name = "idx_courses_status_created", columnList = "status, created_at DESC")
})
public class Course { ... }
```

## Summary

| Index type | Use for |
|-----------|---------|
| Single-column | Exact-match filters on one column |
| Composite | Multi-column filters / sort — leftmost prefix rule |
| Covering (INCLUDE) | Queries that only need indexed columns |
| Partial (WHERE) | Filters that always include a predicate |
| Unique | Uniqueness constraint + lookup |

Indexes are the difference between a database that responds and one that times out — but they cost writes and space. `EXPLAIN ANALYZE` before and after, follow the leftmost-prefix rule, cover your hottest queries, and prune redundant indexes.
