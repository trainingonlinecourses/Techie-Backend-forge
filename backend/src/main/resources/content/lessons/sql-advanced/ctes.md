---
title: Common Table Expressions — WITH, Recursion, and Query Structure
module: sql-advanced
order: 2
minutes: 25
topics: ["CTE", "WITH", "recursive queries", "query structure", "subqueries"]
summary: A common table expression (CTE) lets you name a subquery and use it like a table in the rest of the query. Written with WITH, it turns a wall of ne...
docs:
  - title: "WITH Queries (PostgreSQL docs)"
    url: "https://www.postgresql.org/docs/current/queries-with.html"
  - title: "WITH (Common Table Expressions) (SQLite docs)"
    url: "https://sqlite.org/lang_with.html"
---

# Common Table Expressions — WITH, Recursion, and Query Structure

## The Concept: Named Subqueries That Read Like Steps

A **common table expression (CTE)** lets you name a subquery and use it like a table in the rest of the query. Written with `WITH`, it turns a wall of nested parentheses into a sequence of named, readable steps:

```sql
WITH recent_orders AS (
    SELECT * FROM orders WHERE created_at > CURRENT_DATE - INTERVAL '30 days'
)
SELECT customer_id, COUNT(*) FROM recent_orders GROUP BY customer_id;
```

**The mental model:** CTEs are like local variables in a query — you compute a named intermediate result once (`recent_orders`), then reference it as if it were a table. Instead of reading deeply nested `SELECT ... FROM (SELECT ... FROM (SELECT ...))`, you read top-down steps: "first, define this; then, use it." Beyond readability, CTEs give you **recursion** — the ability to walk hierarchical data (org charts, category trees, comment threads) that plain SQL can't express — and **modularity** (reuse the same named result in several places within one query).

## Why CTEs Beat Nested Subqueries

Compare the same query two ways — "top customers by revenue this month":

```sql
-- Nested: the logic is inside-out, hard to read, hard to debug.
SELECT customer_id, total
FROM (
    SELECT customer_id, SUM(amount) AS total
    FROM orders
    WHERE created_at >= date_trunc('month', CURRENT_DATE)
    GROUP BY customer_id
) AS t
WHERE total > 1000
ORDER BY total DESC;

-- CTE: the same logic reads top-to-bottom like steps in a recipe.
WITH monthly_totals AS (
    SELECT customer_id, SUM(amount) AS total
    FROM orders
    WHERE created_at >= date_trunc('month', CURRENT_DATE)
    GROUP BY customer_id
)
SELECT customer_id, total
FROM monthly_totals
WHERE total > 1000
ORDER BY total DESC;
```

Both are correct. The CTE version names the intermediate idea ("monthly_totals"), separates the *computation* from the *filtering*, and is far easier to extend — add another CTE, join them, reuse one result twice. In real queries with several stages (clean → aggregate → rank → filter), CTEs are the difference between maintainable and unreadable.

## Chaining Multiple CTEs

```sql
WITH
clean_events AS (          -- step 1: clean the raw data
    SELECT *, COALESCE(user_id, 'anonymous') AS effective_user
    FROM events
    WHERE event_type IN ('click', 'purchase')
),
user_sessions AS (         -- step 2: aggregate per user
    SELECT effective_user, COUNT(*) AS events, SUM(CASE WHEN event_type = 'purchase' THEN 1 ELSE 0 END) AS purchases
    FROM clean_events
    GROUP BY effective_user
),
conversion AS (            -- step 3: compute the metric
    SELECT effective_user,
           ROUND(100.0 * purchases / NULLIF(events, 0), 1) AS conv_pct
    FROM user_sessions
)
SELECT * FROM conversion WHERE conv_pct > 5 ORDER BY conv_pct DESC;
```

Each CTE can reference the previous ones — the pipeline pattern. (Note the defensive `NULLIF(events, 0)` to avoid division by zero.) This is how professional analytical queries are written: a sequence of named, testable stages rather than one giant expression.

## Recursive CTEs: Walking Trees in SQL

The killer feature: **recursive CTEs** let a query walk hierarchical data — "every employee under Alice", "the full category tree", "all ancestors of this comment". Syntax:

```sql
WITH RECURSIVE org_tree AS (
    -- Anchor: the starting row(s).
    SELECT id, name, manager_id, 1 AS depth
    FROM employees
    WHERE manager_id IS NULL                -- the CEO (root)

    UNION ALL

    -- Recursive step: join the tree so far to the next level.
    SELECT e.id, e.name, e.manager_id, t.depth + 1
    FROM employees e
    JOIN org_tree t ON e.manager_id = t.id  -- children of what we found
)
SELECT * FROM org_tree ORDER BY depth, name;
```

**Walking through it:** a recursive CTE has two parts joined by `UNION ALL`. The **anchor** selects the starting set (here: the CEO, whose `manager_id` is NULL). The **recursive term** selects the *next* level by joining `employees` to the tree built so far — each iteration adds one generation. The recursion stops when an iteration adds no new rows (no more reports). The result: the entire org chart as rows with a `depth` column. The same pattern walks category trees, BOMs (bill of materials), comment threads, and any parent-child data.

**The two guards to know:** recursive CTEs need a `UNION ALL` (not `UNION`) between the parts, and a runaway query (a cycle in the data, or a missing termination) can loop forever — PostgreSQL caps it with `SET work_mem` pressure but the real protection is data without cycles (or a `depth < 20` guard).

## CTE vs Subquery vs View

| | CTE | Subquery | View |
|---|---|---|---|
| Scope | the one query | the one query | persistent schema object |
| Readability | best — named steps | worst — nesting | good — named, reusable across queries |
| Reuse across queries | no | no | **yes** |
| Recursion | **yes** | no | no |
| When to use | complex single query | simple inline need | a query you run everywhere |

**The engineering rule:** use a **view** when the logic is genuinely shared across many queries (it's a schema object — indexed, permissions-able, versioned); use a **CTE** when the logic belongs to one query (it's self-contained and doesn't pollute the schema). The common smell — creating a view nobody else uses — argues for CTEs; the opposite smell — copying the same 30-line subquery into five queries — argues for a view.

## Performance: What the Optimizer Does

A CTE is *not* necessarily executed once — modern PostgreSQL (12+) inlines simple, non-recursive CTEs into the main query (so the planner can reorder and optimize), and only materializes them when they're referenced multiple times or contain side-effecting operations. The practical guidance: **write CTEs for readability first**; if a CTE is expensive and referenced several times, PostgreSQL's materialization handles it. For genuinely expensive shared computations, a materialized view or a temp table is the heavier-duty tool. Don't pre-optimize — profile with `EXPLAIN ANALYZE` and respond to evidence.

## Recap

CTEs (`WITH name AS (query)`) are named subqueries that turn nested SQL into readable, top-down steps — and they unlock recursion, the only way to walk hierarchical data in plain SQL. Chain them for multi-stage pipelines (clean → aggregate → rank → filter), use `WITH RECURSIVE` with an anchor plus a `UNION ALL` recursive term for org charts and category trees, and choose views over CTEs only when the logic genuinely spans many queries. The readability win alone justifies the habit — and the recursion capability is one of those skills that suddenly makes a whole category of "impossible in SQL" questions trivial.
