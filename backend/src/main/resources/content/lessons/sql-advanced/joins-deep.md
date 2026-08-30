---
title: Advanced Joins — Beyond the Basics
module: sql-advanced
order: 3
minutes: 26
topics: ["joins", "self-join", "lateral join", "anti-join", "join strategies", "cross join"]
summary: Beginners learn INNER JOIN and LEFT JOIN and stop. But joins are a family of set operations, and the advanced members solve problems the basic ones...
docs:
  - title: "Joins (PostgreSQL docs)"
    url: "https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-JOIN"
  - title: "LATERAL Subqueries (PostgreSQL docs)"
    url: "https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-LATERAL"
---

# Advanced Joins — Beyond the Basics

## The Concept: Joins Are Set Operations

Beginners learn `INNER JOIN` and `LEFT JOIN` and stop. But joins are a family of set operations, and the advanced members solve problems the basic ones can't — or can't do efficiently. **`SELF JOIN`** compares a table to itself (employees and their managers). **`ANTI JOIN`** finds rows that have *no* match (customers with no orders). **`LATERAL`** joins run a subquery *per row* of the outer table — the closest SQL comes to a correlated computation with full power. This lesson is the vocabulary of that family.

**The mental model:** every join is a question about *which pairs of rows relate*. INNER = "pairs that exist". LEFT/RIGHT = "all of one side, plus pairs where they exist". FULL OUTER = "all of both, paired where possible". CROSS = "every possible pair". ANTI = "rows with no pair". SELF = "pairs within one table". Once you name the set you want, the join keyword writes itself.

## Self-Join: The Table Meets Itself

The classic: an `employees` table with `manager_id` pointing at another row *in the same table*. To show each employee with their manager's name, you join the table to itself — with an **alias** so the two roles are distinct:

```sql
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id   -- LEFT: managers with no boss
ORDER BY manager, employee;
```

**Walking through it:** the same table appears twice — `e` (the employee's view) and `m` (the manager's view). The join condition `e.manager_id = m.id` pairs each employee with the row that is their manager. `LEFT JOIN` (not INNER) keeps employees whose `manager_id` is NULL (the CEO) — with `m.name` NULL. The alias requirement is the self-join's only "trick": without `AS e` and `AS m`, the columns are ambiguous. The same pattern handles "friend pairs", "related products", "parent/child categories" — any data where rows reference each other.

## Anti-Join: Finding the Orphans

"Which customers have never ordered?" That's an **anti-join** — rows in A with no matching row in B. Two equivalent spellings:

```sql
-- Spelling 1: NOT EXISTS (the clearest, usually the fastest):
SELECT c.id, c.name
FROM customers c
WHERE NOT EXISTS (
    SELECT 1 FROM orders o WHERE o.customer_id = c.id
);

-- Spelling 2: LEFT JOIN + IS NULL (the classic trick):
SELECT c.id, c.name
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;
```

**Which to use:** `NOT EXISTS` is the modern recommendation — it reads as intent ("no order exists for this customer"), short-circuits on the first match, and plays best with the optimizer. The `LEFT JOIN ... WHERE o.id IS NULL` spelling is the old classic and still appears in legacy code — understand it (a customer with no orders produces a row with all-NULL order columns, and the NULL test selects exactly those), but prefer `NOT EXISTS` in new code. The anti-join answers a whole family: "students with no grades", "accounts with no activity", "inventory items never sold".

## CROSS JOIN and the Lateral Join

**`CROSS JOIN`** produces every pair — `A × B` — used for generating combinations (all sizes × all colors):

```sql
SELECT s.size, c.color
FROM sizes s CROSS JOIN colors c;   -- every (size, color) pair
```

**`LATERAL`** is the powerful one: a subquery that can reference columns of the *outer* query, and runs **once per outer row**. This makes it the tool for "for each X, compute Y":

```sql
-- For each customer, the 3 most recent orders:
SELECT c.name, recent.order_id, recent.total
FROM customers c
CROSS JOIN LATERAL (
    SELECT o.id AS order_id, o.total
    FROM orders o
    WHERE o.customer_id = c.id          -- references the OUTER row
    ORDER BY o.created_at DESC
    LIMIT 3                             -- top-3 per customer, in one query
) AS recent
ORDER BY c.name;
```

**Walking through it:** the `LATERAL` subquery sees `c.id` from the outer row (a correlated subquery) — and because it runs *per customer*, its `LIMIT 3` means "top 3 per customer", not "top 3 overall". This is the query pattern for "top N per group" that predates (and complements) window functions, and `LATERAL` generalizes: per-row computations, per-row function calls that return sets, and per-row aggregation with ordering. It's the escape hatch when a join alone can't express "for each row, do something different."

## The Join Strategies: What the Optimizer Actually Does

Behind the scenes, the planner picks an execution strategy per join — and knowing them explains *why* some joins are fast and others aren't:

- **Nested loop join** — for each row in A, scan B for matches. O(A×B) worst case, but *excellent* when B is tiny or an index narrows each probe. The default for small/selective cases.
- **Hash join** — build a hash table on one side, probe with the other. O(A+B) — the workhorse for large, unindexed equi-joins.
- **Merge join** — both sides sorted, merged like zipping. Fastest for large *pre-sorted* inputs (sorted by an index), including range conditions (`<=`).

**The practical rules:** joins on **indexed foreign keys** are the norm (nested loops with index probes — fast); joining on non-indexed columns triggers hash joins (fine, but scans both tables); and `EXPLAIN ANALYZE` shows you the chosen strategy — reading "Nested Loop" vs "Hash Join" vs "Merge Join" turns query debugging from guessing into evidence.

## Join Mistakes That Haunt Real Queries

1. **The fan-out surprise:** joining orders to order_items *and* to shipments multiplies rows — aggregates double-count unless you dedupe or aggregate at the right level. "Why is the total 4× too big?" — a join fan-out.
2. **INNER JOIN silently dropping rows:** a customer with no orders vanishes from an INNER-joined report. If the report should show everyone, it's a LEFT JOIN.
3. **Duplicate keys:** joining on a non-unique column (e.g., `category` instead of `category_id`) explodes row counts. Join on keys.
4. **Filtering a LEFT JOIN in WHERE:** `LEFT JOIN ... WHERE o.id IS NOT NULL` silently converts it back into an INNER JOIN (the NULL rows are filtered out). Put the condition in the `ON` clause if you want to keep the LEFT semantics.

## Recap

Joins are a family of set operations: `SELF JOIN` (aliases, for manager/employee and friends), `ANTI JOIN` (`NOT EXISTS` — the modern spelling for "no match"), `CROSS JOIN` (all pairs), and `LATERAL` (a per-row subquery — the "top N per group" and per-row computation tool). The optimizer picks nested-loop, hash, or merge strategies, chosen by indexes and size — visible in `EXPLAIN ANALYZE`. The discipline: join on keys, choose LEFT vs INNER by "must every row appear?", avoid fan-out, and never filter the preserved side in WHERE. Name the set you want, and the join writes itself.
