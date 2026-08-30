---
title: Window Functions — RANK, ROW_NUMBER, and Running Totals
module: sql-advanced
order: 1
minutes: 26
topics: ["window functions", "OVER", "PARTITION BY", "ROW_NUMBER", "RANK", "running totals"]
docs:
  - title: "Window Functions (PostgreSQL docs)"
    url: "https://www.postgresql.org/docs/current/tutorial-window.html"
  - title: "Window Function Concepts (PostgreSQL docs)"
    url: "https://www.postgresql.org/docs/current/functions-window.html"
summary: GROUP BY collapses rows: it takes many rows and returns one row per group. But a huge class of real questions needs the opposite: keep every row, y...
---

# Window Functions — RANK, ROW_NUMBER, and Running Totals

## The Concept: Aggregate Every Row, Not Just the Groups

`GROUP BY` collapses rows: it takes many rows and returns *one row per group*. But a huge class of real questions needs the *opposite*: keep every row, yet compute something *across* a group of related rows — "show every employee with their department's average salary beside them", "number each row within its group", "running total over time". That's what **window functions** do: they compute an aggregate *over a window of rows* while preserving each individual row.

**The mental model:** imagine a class roster. `GROUP BY class` would give you one summary per class. A window function is like adding a *column* to every student's row that says "class average: 87.4" — each row stays, but it carries context computed from its group. The window is the "group of related rows" the function looks at; the function runs per window but the rows aren't collapsed.

**The syntax has three parts:**

```sql
FUNCTION() OVER (
    PARTITION BY column    -- 1. the "groups" (optional — all rows if omitted)
    ORDER BY column        -- 2. the order within each group (for rankings, totals)
    ROWS BETWEEN ...       -- 3. the frame: which rows within the group (for running calcs)
)
```

## Running a Ranking Report

Say we have `sales(region, salesperson, amount)` and we want to rank salespeople *within each region*:

```sql
SELECT
    region,
    salesperson,
    amount,
    ROW_NUMBER() OVER (PARTITION BY region ORDER BY amount DESC) AS row_num,
    RANK()       OVER (PARTITION BY region ORDER BY amount DESC) AS rank,
    DENSE_RANK() OVER (PARTITION BY region ORDER BY amount DESC) AS dense_rank,
    SUM(amount)  OVER (PARTITION BY region) AS region_total
FROM sales
ORDER BY region, rank;
```

**Walking through each window function:**

- `PARTITION BY region` creates one window per region — the rankings restart per region.
- `ORDER BY amount DESC` defines the order *within* each window — rankings follow it.
- **`ROW_NUMBER()`** — a plain sequence 1, 2, 3, ... with no ties: two equal amounts still get different numbers (by a tiebreak). Use it for "top N per group" and pagination.
- **`RANK()`** — ties get the same rank, and the *next* rank skips: 1, 2, 2, 4. "Two people tied for 2nd, next is 4th."
- **`DENSE_RANK()`** — ties get the same rank but no skips: 1, 2, 2, 3.
- **`SUM(amount) OVER (PARTITION BY region)`** — a window *aggregate*: the region total appears on **every row** of that region, without collapsing the rows.

The output shows the whole idea: each row keeps its identity, and beside it sit the computed window values.

## Running Totals and Moving Averages: The Frame

Without an explicit frame, `ORDER BY` inside `OVER` gives a **running** calculation: from the window's start to the current row:

```sql
SELECT
    day,
    revenue,
    SUM(revenue) OVER (ORDER BY day) AS running_total,
    AVG(revenue) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
        AS seven_day_avg
FROM daily_revenue
ORDER BY day;
```

- `SUM(revenue) OVER (ORDER BY day)` — the **running total**: each row sums everything up to and including itself (the default frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`).
- The explicit frame `ROWS BETWEEN 6 PRECEDING AND CURRENT ROW` — a **moving window**: the average of the current day plus the previous 6 — a 7-day moving average, the classic time-series smoothing tool.

**The frame clause** (`ROWS BETWEEN ... AND ...`) is what turns a window function into a sliding calculation: `UNBOUNDED PRECEDING` (window start), `N PRECEDING` (N rows back), `CURRENT ROW`, `N FOLLOWING`, `UNBOUNDED FOLLOWING` (window end).

## LAG and LEAD: Look at Other Rows

**`LAG`** and **`LEAD`** reach sideways to a neighboring row in the ordered window — the tool for "change vs previous period":

```sql
SELECT
    day,
    revenue,
    LAG(revenue, 1) OVER (ORDER BY day) AS previous_day,
    revenue - LAG(revenue, 1) OVER (ORDER BY day) AS day_over_day_change,
    LEAD(revenue, 1) OVER (ORDER BY day) AS next_day
FROM daily_revenue
ORDER BY day;
```

`LAG(revenue, 1)` grabs the value 1 row back; `LEAD` grabs 1 row forward (the offset defaults to 1, and you can give a third argument as the default for edge rows, e.g., `LAG(revenue, 1, 0)`). Day-over-day deltas, period-over-period comparisons, and "what happened right before this event" are all `LAG`/`LEAD` territory.

## The Classic Patterns

**Top-N per group** (the most common window use in production):

```sql
WITH ranked AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY sales DESC) AS rn
    FROM products
)
SELECT * FROM ranked WHERE rn <= 3;   -- top 3 products per category
```

**Deduplication** (keep the latest row per entity):

```sql
WITH numbered AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC) AS rn
    FROM order_events
)
DELETE FROM numbered WHERE rn > 1;    -- keep only the newest event per order
```

**Percentile / distribution** — `NTILE(4)` splits each window into quartiles; `PERCENT_RANK()` gives relative position; `CUME_DIST()` the cumulative distribution — "this salary is in the top 10%".

## Window Functions vs GROUP BY

| | `GROUP BY` | Window function |
|---|---|---|
| Rows returned | one per group | **every row**, with computed values |
| Use for | summaries, aggregations | rankings, running totals, per-row context |
| WHERE vs HAVING | filters groups via `HAVING` | filter after via subquery/CTE |
| Can nest | aggregations inside | **no nesting** — wrap in a subquery to filter |

The rule that trips people: **you cannot use a window function in WHERE** (it's computed after filtering). If you need "rows where rank ≤ 3", you must wrap the window query in a CTE/subquery and filter *outside* — exactly the `WITH ranked AS (...) SELECT ... WHERE rn <= 3` shape above.

## Performance Notes

- Window functions scan the partition — **indexes on the PARTITION BY and ORDER BY columns** help.
- They're more expensive than plain aggregates (per-row computation), but far cheaper than the self-joins they replace — a running total done with a self-join is O(n²); the window version is a single scan.
- In Spring Data JPA, window functions need native queries (`@Query(nativeQuery = true)`) or a spec — the JPA Criteria API doesn't model them. Hibernate 6+ supports them in HQL; check your version.

## Recap

Window functions compute aggregates *per row*, over a window defined by `PARTITION BY` (grouping), `ORDER BY` (order), and an optional frame (`ROWS BETWEEN`). `ROW_NUMBER` numbers rows, `RANK`/`DENSE_RANK` rank with different tie handling, `SUM`/`AVG` over an ordered window give running totals and moving averages, and `LAG`/`LEAD` reach to neighboring rows. The canonical patterns — top-N per group, deduplication, day-over-day deltas — are all window functions, wrapped in a CTE when you need to filter on the computed value. They're the difference between "I can get the summary" and "I can put the summary right next to every row" — one of the highest-value SQL skills you can add.
