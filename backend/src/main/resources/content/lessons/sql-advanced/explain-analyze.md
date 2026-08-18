---
title: EXPLAIN ANALYZE — Reading the Query Plan
module: sql-advanced
order: 4
minutes: 27
topics: ["EXPLAIN ANALYZE", "query plans", "seq scan", "index scan", "optimization", "cost estimation"]
docs:
  - title: "Using EXPLAIN (PostgreSQL docs)"
    url: "https://www.postgresql.org/docs/current/using-explain.html"
  - title: "EXPLAIN (PostgreSQL docs)"
    url: "https://www.postgresql.org/docs/current/sql-explain.html"
---

# EXPLAIN ANALYZE — Reading the Query Plan

## The Concept: The Database Shows You Its Work

A slow query is a mystery until you see *how* the database actually executes it. **`EXPLAIN`** reveals the query plan — the tree of steps the planner chose (scan this table, join these, filter there) — and **`EXPLAIN ANALYZE`** *runs* the query and reports what actually happened: rows produced, time taken, at every step. This is the single most important tool in SQL performance work, and reading it is a teachable skill — not intuition.

**The mental model:** the planner is a chef planning a meal. `EXPLAIN` shows the recipe it wrote: "grab the fridge contents (scan), then for each ingredient check freshness (filter)". `EXPLAIN ANALYZE` cooks the meal and times each step: "the 'grab everything from the fridge' step took 3 seconds and pulled 2 million ingredients — that's the problem." You don't guess at the bottleneck; the plan shows you exactly where the time goes, step by step.

## Running It and Reading the Output

```sql
EXPLAIN ANALYZE
SELECT * FROM orders WHERE customer_id = 42 AND total > 100;
```

```
Seq Scan on orders  (cost=0.00..2345.00 rows=512 width=32)
                      (actual time=0.05..23.41 rows=387 loops=1)
  Filter: ((customer_id = 42) AND (total > 100))
  Rows Removed by Filter: 19987
Planning Time: 0.18 ms
Execution Time: 23.6 ms
```

**Reading it line by line:**

- **`Seq Scan on orders`** — the *operation*: a sequential scan (read the whole table top to bottom). This is the red flag — the table has ~20,000 rows and we read every one. The fix (usually): an index on the filtered columns.
- **`cost=0.00..2345.00`** — the planner's *estimated* cost (arbitrary units): 0.00 to start, 2345.00 to finish. Estimates guide the plan choice; they're *estimates* — the actuals are what matter.
- **`rows=512`** — the planner's *guess* at how many rows will pass. It guessed 512; the reality follows.
- **`(actual time=0.05..23.41 rows=387 loops=1)`** — what *really* happened: 23.4ms total, 387 rows kept. When the estimate and the actual diverge wildly, you've found a **statistics problem** (stale or missing stats — often fixed by `ANALYZE`).
- **`Rows Removed by Filter: 19987`** — the smoking gun: 19,987 rows were read and discarded. 20,374 rows scanned to return 387. That's the waste a sequential scan represents.
- **`Planning Time` / `Execution Time`** — the split between planning and execution.

The verdict: 23ms isn't terrible — but at 10× the table size or under load, a sequential scan becomes the bottleneck. With an index, the plan becomes:

```
Index Scan using idx_orders_customer on orders  (actual time=0.02..0.38 rows=387 loops=1)
  Index Cond: (customer_id = 42)
  Filter: (total > 100)
```

The index scan touches only the customer's rows — 387 rows instead of 20,374. That's the whole point of the tool: the plan shows you the waste, and the fix is usually obvious once you see it.

## The Plan Vocabulary

The operations you'll see most, and what each means:

- **`Seq Scan`** — full table read. Fine for small tables; a red flag on big ones filtered by a non-indexed column.
- **`Index Scan`** — reads the index to find rows, then fetches them. Fast for selective queries.
- **`Index Only Scan`** — the query needs only indexed columns; the index itself answers without touching the table. The fastest scan.
- **`Bitmap Index Scan` + `Bitmap Heap Scan`** — the optimizer reads many index entries, builds a bitmap of candidate rows, then fetches — used when a filter matches *many* rows.
- **`Nested Loop` / `Hash Join` / `Merge Join`** — the join strategies from the joins lesson, each with its own cost profile.
- **`Sort`** — the planner sorted rows (for `ORDER BY` without an index, `GROUP BY`, or merge joins). Expensive for large sets; an index on the sort key removes it.
- **`Limit`** — stops early (good). If the `Limit` sits *after* an expensive Sort, you're paying to sort everything before keeping the top 10.

## The Optimization Workflow

**Step 1 — identify the slow query.** From logs (slow query log, `log_min_duration_statement`), from profiling (Spring Boot + p6spy/datasource-proxy), or from reports. Never optimize blind.

**Step 2 — `EXPLAIN ANALYZE` it.** Look for: sequential scans on big tables, `Rows Removed by Filter` far exceeding kept rows, sorts of large sets, and **estimate/actual divergence** (the stats problem).

**Step 3 — fix with evidence.** The standard plays, in order:

1. **Index the filter/join/sort columns.** `CREATE INDEX idx_orders_customer ON orders (customer_id);` — and for combined filters, a **composite index** on the columns in the right order (`(customer_id, total)`), because a composite index on `(customer_id, total)` serves both filters and avoids the residual filter.
2. **Refresh statistics** — `ANALYZE orders;` if estimates are far from actuals.
3. **Rewrite the query** — a join doing more work than needed, a `WHERE` on a function of a column (`WHERE YEAR(created_at) = 2025` — unindexable! use `created_at >= ... AND created_at < ...`), a missing `LIMIT`.
4. **Confirm with `EXPLAIN ANALYZE` again** — the plan should change (Seq Scan → Index Scan), and the actual times should prove it.

**The discipline:** every change is verified by the plan and the timings — this is evidence-based performance work, not folklore.

## The Three Golden Rules

1. **`EXPLAIN` (estimate) vs `EXPLAIN ANALYZE` (truth).** Analyze actually runs the query — on a production-sized table, use it in staging or wrap in a transaction you roll back (`BEGIN; EXPLAIN ANALYZE ...; ROLLBACK;`).
2. **Read bottom-up / right-to-left.** The plan is a tree; the *leaves* (bottom) execute first — scans and early filters — and the root (top) is the final result. The biggest `actual time` is usually where the work happens.
3. **Trust the actuals over the estimates.** The planner's cost model is a guess; a plan that guessed 512 rows and found 387 is healthy, but a guess of 512 against a reality of 2,000,000 means stale statistics — fix with `ANALYZE` before changing the query.

## Recap

`EXPLAIN ANALYZE` runs your query and shows the actual plan — the scan type (Seq Scan = red flag on big tables, Index Scan = good), the rows read vs kept (`Rows Removed by Filter` is the waste meter), the join strategy, and per-step timings. The optimization workflow is evidence-driven: find the slow query, analyze it, fix with indexes (composite for multi-column filters), refreshed statistics, or a query rewrite, then re-analyze to prove the improvement. Read plans bottom-up, trust actuals over estimates, and remember the tool's real power: it turns "this query is slow, I wonder why" into "this scan is reading 20,000 rows to keep 387 — there's the problem."
