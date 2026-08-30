---
title: Advanced SQL Patterns — Upserts, Pivots, and Time Bucketing
module: sql-advanced
order: 4
minutes: 27
topics: ["upsert", "ON CONFLICT", "pivot", "crosstab", "date_trunc", "generate_series", "full-text search"]
docs:
  - title: "INSERT ... ON CONFLICT (PostgreSQL docs)"
    url: "https://www.postgresql.org/docs/current/sql-insert.html"
  - title: "Aggregate Functions — FILTER (PostgreSQL docs)"
    url: "https://www.postgresql.org/docs/current/functions-aggregate.html"
summary: Beyond the fundamentals, production SQL is a handful of recurring recipes: upserts (insert or update depending on existence), pivots (rows → column...
---

# Advanced SQL Patterns — Upserts, Pivots, and Time Bucketing

## The Concept: Recipes for the Queries Every Real System Needs

Beyond the fundamentals, production SQL is a handful of recurring recipes: **upserts** (insert or update depending on existence), **pivots** (rows → columns), **time bucketing** (group events into hours/days/weeks), **date series** (fill missing dates), and **FILTER aggregates** (conditional sums without CASE). Each pattern solves a problem that otherwise forces awkward multi-query workarounds — and each is a small, learnable idiom.

**The mental model:** these patterns are the "standard library" of SQL. Beginners re-implement them with application code (fetch-then-decide, loop-per-day, CASE-in-Java); professionals let the database do it in one statement — faster, atomic, and correct under concurrency.

## Pattern 1: Upsert — ON CONFLICT

**The problem:** "save this daily metric — insert if it doesn't exist, update if it does." The naive app-level version (SELECT → decide → INSERT/UPDATE) has a race: two requests can both see "missing" and both INSERT — a duplicate-key error or a lost update. The database-native answer is **`INSERT ... ON CONFLICT DO UPDATE`** — atomic by design:

```sql
INSERT INTO daily_metrics (day, metric, value)
VALUES (CURRENT_DATE, 'revenue', 1234.50)
ON CONFLICT (day, metric)                    -- the unique constraint/columns
DO UPDATE SET value = EXCLUDED.value;        -- update the existing row
-- EXCLUDED refers to the row we TRIED to insert.
```

**Walking through it:** `ON CONFLICT (day, metric)` names the unique key; if a row with that key exists, the `DO UPDATE` runs instead of erroring. `EXCLUDED.value` is the value from the insert attempt — so "set the value to what we tried to write" = upsert. Add a `WHERE` for conditional updates (`DO UPDATE SET value = EXCLUDED.value WHERE daily_metrics.value < EXCLUDED.value` — only update if the new value is bigger). This is the pattern behind every "increment-or-insert" counter and idempotent ingest pipeline.

## Pattern 2: Pivot — Rows Into Columns

**The problem:** "show revenue by month, with one *column per product*." That's a pivot — turning values into column names. Two approaches:

```sql
-- Approach A — conditional aggregation (works in every SQL dialect):
SELECT
    date_trunc('month', created_at) AS month,
    COUNT(*) FILTER (WHERE product = 'laptop')   AS laptops,
    COUNT(*) FILTER (WHERE product = 'phone')    AS phones,
    COUNT(*) FILTER (WHERE product = 'tablet')   AS tablets
FROM sales
GROUP BY date_trunc('month', created_at)
ORDER BY month;

-- Approach B — PostgreSQL's dedicated crosstab (tablefunc extension):
CREATE EXTENSION IF NOT EXISTS tablefunc;
SELECT * FROM crosstab(
    'SELECT date_trunc(''month'', created_at)::date AS month, product, COUNT(*)
     FROM sales GROUP BY 1, 2 ORDER BY 1',
    'SELECT DISTINCT product FROM sales ORDER BY 1'
) AS ct(month date, laptops bigint, phones bigint, tablets bigint);
```

**The key insight — `FILTER`:** `COUNT(*) FILTER (WHERE product = 'laptop')` counts only laptop rows — a conditional aggregate *inside* the aggregation, without CASE. It's the modern replacement for `SUM(CASE WHEN ... THEN 1 ELSE 0 END)` — cleaner and faster. The conditional-aggregation pivot is the portable choice; `crosstab` is PostgreSQL's specialized power tool for dynamic pivots (the second query argument supplies the column list).

## Pattern 3: Time Bucketing and Filling Gaps

**The problem:** "events per hour for the last week" — but hours with zero events produce no rows, so the chart has gaps. Two idioms:

```sql
-- Bucketing: date_trunc groups timestamps into buckets.
SELECT date_trunc('hour', created_at) AS hour, COUNT(*)
FROM events
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1 ORDER BY 1;

-- Filling the gaps: generate_series produces EVERY bucket, then LEFT JOIN.
WITH hours AS (
    SELECT generate_series(
        date_trunc('hour', NOW() - INTERVAL '7 days'),
        date_trunc('hour', NOW()),
        interval '1 hour'
    ) AS hour
)
SELECT h.hour, COALESCE(COUNT(e.id), 0) AS events
FROM hours h
LEFT JOIN events e ON date_trunc('hour', e.created_at) = h.hour
GROUP BY h.hour ORDER BY h.hour;
```

**Walking through it:** `date_trunc('hour', ts)` snaps a timestamp to its hour — grouping by it buckets events. `generate_series(start, end, step)` *generates* a complete series of timestamps — every hour, including empty ones. The `LEFT JOIN` then attaches real event counts, with `COALESCE(..., 0)` turning missing hours into zeros. Result: a gapless time series — every hour present, zeros where nothing happened. This is the foundation of every dashboard's "requests over time" chart.

## Pattern 4: FILTER Everywhere

The `FILTER` clause generalizes to any aggregate — the cleanest conditional aggregation in SQL:

```sql
SELECT
    status,
    COUNT(*)                          AS total,
    COUNT(*) FILTER (WHERE amount > 100)  AS big_orders,
    SUM(amount)                       AS revenue,
    SUM(amount) FILTER (WHERE paid)   AS paid_revenue,
    AVG(amount) FILTER (WHERE status = 'shipped') AS avg_shipped_amount
FROM orders
GROUP BY status;
```

Compare with the CASE spelling (`SUM(CASE WHEN paid THEN amount END)`) — `FILTER` is shorter, faster (the planner understands it better), and reads like a sentence. Once you know it, you'll see the CASE version everywhere in legacy code and know exactly what to replace.

## Pattern 5: Full-Text Search Without a Search Engine

PostgreSQL's built-in **full-text search** (`tsvector`/`tsquery`) handles "find documents mentioning spring AND boot, ranked by relevance" — no Elasticsearch needed for modest needs:

```sql
-- 1. A generated column precomputes the search vector:
ALTER TABLE lessons
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || body)) STORED;

-- 2. Index it (GIN — the inverted-index equivalent):
CREATE INDEX lessons_search_idx ON lessons USING GIN (search_vector);

-- 3. Query with ranking:
SELECT title,
       ts_rank(search_vector, plainto_tsquery('english', 'spring boot')) AS rank
FROM lessons
WHERE search_vector @@ plainto_tsquery('english', 'spring boot')
ORDER BY rank DESC LIMIT 10;
```

**Walking through it:** `to_tsvector` tokenizes and stems the text into a search vector (like an inverted index per row); `@@` is the match operator; `plainto_tsquery` parses the query text; `ts_rank` scores for ordering; the **GIN index** makes it fast. The whole pipeline — stemming, matching, ranking — lives in the database. The rule of thumb: for a few thousand to a few hundred thousand documents, PostgreSQL full-text search is often the pragmatic choice; past that (or with fuzzy/language-heavy needs), Elasticsearch takes over.

## The Patterns at a Glance

| Problem | Pattern |
|---|---|
| Insert-or-update, race-free | `INSERT ... ON CONFLICT DO UPDATE` |
| Rows → columns | conditional aggregation with `FILTER` (or `crosstab`) |
| Group events into buckets | `date_trunc` + `GROUP BY` |
| Missing dates in a series | `generate_series` + `LEFT JOIN` + `COALESCE` |
| Conditional aggregates | `COUNT(*) FILTER (WHERE ...)` |
| Text search in the DB | `tsvector` + GIN index + `@@` + `ts_rank` |

## Recap

The advanced SQL patterns are the standard library of production queries: `ON CONFLICT DO UPDATE` for atomic, race-free upserts; conditional aggregation with `FILTER` (and `crosstab` for true pivots) to turn rows into columns; `date_trunc` plus `generate_series` for gapless time bucketing; and PostgreSQL's `tsvector` full-text search for ranked text queries without a separate engine. Each pattern replaces a fragile multi-step application workaround with one atomic, indexed, database-native statement. Master these five and the gap between "I can write SQL" and "I can build the data layer of a real product" closes dramatically.
