---
title: EXPLAIN ANALYZE — Reading Query Execution Plans
summary: How to read EXPLAIN output, sequential vs index scans, join algorithms, cost estimation, and how organizations optimize slow SQL queries. Beginner-friendly with line-by-line code.
order: 5
minutes: 22
topics: [EXPLAIN, query plan, execution plan, index scan, sequential scan, join algorithm, cost estimation, query optimization]
docs:
  - https://www.postgresql.org/docs/current/using-explain.html
  - https://use-the-index-luke.com/
---

# EXPLAIN ANALYZE — Reading Query Execution Plans

## What is EXPLAIN ANALYZE? (From Zero)

When a SQL query is slow, you need to understand **how the database executes it**. `EXPLAIN ANALYZE` shows you the **query execution plan** — the step-by-step process the database uses to retrieve your data, including estimated costs, actual rows, and timing.

Think of it like GPS directions: instead of just saying "drive there," it shows you every turn, how long each segment takes, and which routes are fastest.

### EXPLAIN vs EXPLAIN ANALYZE

| Command | What it shows | Risk |
|---|---|---|
| `EXPLAIN` | Estimated plan (no execution) | Safe — never runs the query |
| `EXPLAIN ANALYZE` | Actual plan + real execution | Runs the query! Use with care on writes |
| `EXPLAIN (ANALYZE, BUFFERS)` | Plan + memory/disk usage | More detail, still runs the query |

---

## The Code — Line by Line

### Basic Usage

```sql
-- See the plan without running the query (safe):
EXPLAIN SELECT * FROM orders WHERE status = 'PAID';

-- See the plan AND run the query (shows actual timing):
EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'PAID';

-- With buffer/cache information:
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT * FROM orders WHERE status = 'PAID';
```

### Reading the Output

```sql
EXPLAIN ANALYZE
SELECT o.id, o.total, c.name
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE o.status = 'PAID'
ORDER BY o.created_at DESC
LIMIT 10;
```

```
Sort  (cost=1250.35..1250.38 rows=10 width=48) (actual time=15.234..15.236 rows=10 loops=1)
  Sort Key: o.created_at DESC
  Sort Method: top-N heapsort  Memory: 25kB
  ->  Hash Join  (cost=100.20..1245.00 rows=500 width=48) (actual time=2.145..15.102 rows=100 loops=1)
        Hash Cond: (o.customer_id = c.id)
        ->  Index Scan using idx_orders_status on orders o  (cost=0.29..1100.00 rows=500 width=20) (actual time=0.025..10.234 rows=500 loops=1)
              Filter: (status = 'PAID')
              Rows Removed by Filter: 200
        ->  Hash  (cost=80.00..80.00 rows=2000 width=36) (actual time=1.890..1.891 rows=2000 loops=1)
              Buckets: 2048  Batches: 1  Memory Usage: 129kB
              ->  Seq Scan on customers c  (cost=0.00..80.00 rows=2000 width=36) (actual time=0.008..1.234 rows=2000 loops=1)
Planning Time: 0.234 ms
Execution Time: 15.345 ms
```

### How to Read This (Line by Line)

```
Sort  (cost=1250.35..1250.38 rows=10 width=48) (actual time=15.234..15.236 rows=10 loops=1)
```
- **Node type**: `Sort` — sorting the results
- **Estimated cost**: 1250.35 (startup) to 1250.38 (total) — abstract units
- **Estimated rows**: 10 — the planner thinks 10 rows will match
- **Actual time**: 15.234ms (first row) to 15.236ms (last row) — real timing
- **Actual rows**: 10 — how many rows actually matched
- **loops=1**: This node executed once

```
->  Index Scan using idx_orders_status on orders o  (cost=0.29..1100.00 rows=500 width=20)
```
- **Index Scan** — using an index (fast!) instead of sequential scan (slow!)
- **`idx_orders_status`** — the index name
- **cost=0.29..1100.00** — very cheap to start (index lookup), expensive to scan 500 rows

```
Filter: (status = 'PAID')
Rows Removed by Filter: 200
```
- The index returned 700 rows (500 matching + 200 filtered out)
- **200 rows were scanned but discarded** — the index isn't perfectly selective

### Key Numbers to Watch

| Metric | Good | Bad | What It Means |
|---|---|---|---|
| **Seq Scan** | Small tables only | Large tables | Full table scan — needs an index |
| **Index Scan** | Most queries | — | Using an index — fast |
| **rows Removed by Filter** | 0-10% of scanned | >50% of scanned | Index not selective enough |
| **actual time** | <10ms | >100ms | Query is slow |
| **loops** | 1 | >1 | Nested loops — check if N+1 problem |

---

## Real-World Scenarios

### Scenario 1: Slow Query — Missing Index

```sql
-- Before: 5 seconds (sequential scan on 1M rows)
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 12345;
-- Seq Scan on orders  (cost=0.00..25000.00 rows=1 width=20)
--   Filter: (customer_id = 12345)
--   Rows Removed by Filter: 999999

-- Add an index:
CREATE INDEX idx_orders_customer_id ON orders(customer_id);

-- After: 0.1ms (index scan)
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 12345;
-- Index Scan using idx_orders_customer_id on orders  (cost=0.29..8.31 rows=1 width=20)
```

### Scenario 2: N+1 Query Problem

```sql
-- BAD: N+1 queries (one for each order)
EXPLAIN ANALYZE SELECT * FROM orders WHERE id = 1;
EXPLAIN ANALYZE SELECT * FROM orders WHERE id = 2;
-- ... repeated 1000 times!

-- GOOD: Single query with IN clause
EXPLAIN ANALYZE SELECT * FROM orders WHERE id IN (1, 2, 3, ...);
-- Single Index Scan using idx_orders_pkey
```

### Scenario 3: Subquery vs JOIN

```sql
-- Subquery (often slower):
EXPLAIN ANALYZE
SELECT * FROM orders
WHERE customer_id IN (SELECT id FROM customers WHERE region = 'US');
-- Hash Semi Join  (cost=100.20..1245.00 rows=500 width=20)

-- JOIN (usually faster):
EXPLAIN ANALYZE
SELECT o.* FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE c.region = 'US';
-- Hash Join  (cost=100.20..1240.00 rows=500 width=20)
```

---

## Common Mistakes

| Mistake | Why It's a Problem | Fix |
|---|---|---|
| Not checking EXPLAIN before optimizing | Guessing instead of measuring | Always `EXPLAIN ANALYZE` slow queries first |
| Adding indexes to every column | Slows down writes, wastes disk space | Add indexes only for WHERE/JOIN columns you query often |
| Ignoring "Seq Scan" on small tables | Sequential scan is actually faster for tiny tables | Only optimize when table > 10K rows |
| Using EXPLAIN ANALYZE on DELETE/UPDATE | Actually modifies data! | Use EXPLAIN (no ANALYZE) for writes, or wrap in a transaction and ROLLBACK |
| Not considering statistics freshness | Stale stats → bad plans | Run `ANALYZE` after bulk data changes |

---

## Key Takeaways

- **EXPLAIN ANALYZE shows the actual execution plan** — use it to understand WHY a query is slow.
- **Seq Scan on large tables = add an index**. Index Scan = using an index (fast).
- **Watch "rows Removed by Filter"** — if it's high, the index isn't selective enough.
- **EXPLAIN is safe, EXPLAIN ANALYZE actually runs the query** — be careful with writes.
- **Most slow queries need one or two well-placed indexes**, not a complete rewrite.

Official docs: [EXPLAIN (PostgreSQL)](https://www.postgresql.org/docs/current/using-explain.html) · [Use The Index, Luke](https://use-the-index-luke.com/)
