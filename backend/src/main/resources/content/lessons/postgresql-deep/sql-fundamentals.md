---
title: SQL Fundamentals for Backend Developers
module: postgresql-deep
order: 1
minutes: 25
topics: ["SQL", "joins", "aggregations", "window functions", "CTEs", "query structure"]
docs:
  - title: "PostgreSQL documentation"
    url: "https://www.postgresql.org/docs/current/queries.html"
summary: SQL is the most important language most backend developers write least well. This lesson covers the parts that actually matter in production Spring...
---

# SQL Fundamentals for Backend Developers

SQL is the most important language most backend developers write least well. This lesson covers the parts that actually matter in production Spring apps: the execution-order mental model, joins, aggregations, window functions, and CTEs — the difference between queries that work and queries that scale.

## The Execution Order (the mental model)

SQL looks like it runs top-to-bottom — it doesn't:

```sql
SELECT   ...          -- 5. compute the output columns
FROM     ...          -- 1. start with the source
WHERE    ...          -- 2. filter rows
GROUP BY ...          -- 3. group
HAVING   ...          -- 4. filter groups
ORDER BY ...          -- 6. sort
LIMIT    ...          -- 7. trim
```

This order explains the classic errors:
- You can't use an alias from `SELECT` in `WHERE` (WHERE runs first)
- `HAVING` filters *groups*, `WHERE` filters *rows*

```sql
-- ✅ WHERE on raw rows, HAVING on the aggregate
SELECT level, COUNT(*)
FROM courses
WHERE published = true
GROUP BY level
HAVING COUNT(*) > 5;
```

## Joins: The Four Types

```sql
-- INNER: only matches (the default)
SELECT c.title, l.title AS lesson
FROM courses c
JOIN lessons l ON l.course_id = c.id;

-- LEFT: all courses, lessons may be null
SELECT c.title, l.title
FROM courses c
LEFT JOIN lessons l ON l.course_id = c.id;

-- RIGHT: all lessons, course may be null
SELECT c.title, l.title
FROM courses c
RIGHT JOIN lessons l ON l.course_id = c.id;

-- FULL: everything, nulls where missing
SELECT c.title, l.title
FROM courses c
FULL JOIN lessons l ON l.course_id = c.id;
```

**The anti-pattern**: joining then filtering with WHERE kills the LEFT JOIN's purpose:

```sql
-- ❌ WHERE turns LEFT JOIN into INNER (lessons.course_id IS NULL rows removed)
SELECT c.title, l.title
FROM courses c
LEFT JOIN lessons l ON l.course_id = c.id
WHERE l.course_id IS NOT NULL;   -- pointless

-- ✅ filter in the JOIN clause to keep null rows
SELECT c.title, l.title
FROM courses c
LEFT JOIN lessons l ON l.course_id = c.id AND l.published = true;
```

## Aggregations

```sql
SELECT level,
       COUNT(*)              AS course_count,
       SUM(minutes)          AS total_minutes,
       AVG(minutes)          AS avg_minutes,
       MIN(minutes)          AS shortest,
       MAX(minutes)          AS longest,
       COUNT(DISTINCT title) AS unique_titles
FROM courses
GROUP BY level
ORDER BY total_minutes DESC;
```

`COUNT(*)` counts rows; `COUNT(column)` counts non-nulls; `COUNT(DISTINCT column)` counts unique non-nulls.

## Window Functions: Aggregates Without Collapsing Rows

Window functions compute over a **frame** while keeping every row — the tool for rankings, running totals, and "previous row" comparisons:

```sql
SELECT title, minutes, level,
       RANK() OVER (PARTITION BY level ORDER BY minutes DESC) AS rank_in_level,
       AVG(minutes) OVER (PARTITION BY level)                AS level_avg,
       SUM(minutes) OVER (ORDER BY id)                       AS running_total,
       LAG(minutes) OVER (ORDER BY id)                       AS prev_minutes
FROM courses;
```

| Function | Computes |
|----------|----------|
| `ROW_NUMBER()` | Sequential number per partition |
| `RANK()` / `DENSE_RANK()` | Rank with gaps / without |
| `LAG()` / `LEAD()` | Previous / next row |
| `SUM/AVG/COUNT OVER(...)` | Running aggregates |
| `NTILE(n)` | Bucket into n groups |

**Classic use**: top-N per group:

```sql
SELECT * FROM (
    SELECT c.*, ROW_NUMBER() OVER (PARTITION BY level ORDER BY minutes DESC) rn
    FROM courses c
) ranked
WHERE rn <= 3;
```

## CTEs: Named Subqueries

```sql
WITH long_courses AS (
    SELECT * FROM courses WHERE minutes >= 40
),
level_stats AS (
    SELECT level, COUNT(*) AS cnt FROM long_courses GROUP BY level
)
SELECT level, cnt
FROM level_stats
ORDER BY cnt DESC;
```

CTEs (WITH) make complex queries readable and are the foundation of recursive queries:

```sql
-- Recursive: build a category tree
WITH RECURSIVE category_tree AS (
    SELECT id, name, parent_id, 1 AS depth
    FROM categories WHERE parent_id IS NULL
    UNION ALL
    SELECT c.id, c.name, c.parent_id, ct.depth + 1
    FROM categories c
    JOIN category_tree ct ON c.parent_id = ct.id
)
SELECT * FROM category_tree;
```

## The Boolean Logic Trap

Three-valued logic: `NULL` comparisons are `NULL`, not false:

```sql
-- ❌ NULL rows silently dropped
SELECT * FROM courses WHERE level != 'BEGINNER';
-- (level IS NULL rows vanish!)

-- ✅ explicit null handling
SELECT * FROM courses WHERE level IS DISTINCT FROM 'BEGINNER';
```

## Common Production Queries

```sql
-- Pagination (offset)
SELECT * FROM courses ORDER BY id LIMIT 20 OFFSET 40;

-- Keyset pagination (fast deep pages)
SELECT * FROM courses WHERE id > :last_id ORDER BY id LIMIT 20;

-- Upsert
INSERT INTO courses (code, title, minutes)
VALUES (:code, :title, :minutes)
ON CONFLICT (code) DO UPDATE SET
    title = EXCLUDED.title,
    minutes = EXCLUDED.minutes,
    updated_at = now();

-- Dedupe
SELECT DISTINCT ON (level) * FROM courses ORDER BY level, minutes DESC;
```

## Testing Queries in Spring

```java
@DataJpaTest
class QueryTest {

    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void windowFunctionRanksCourses() {
        List<RankedCourse> ranked = jdbcTemplate.query("""
            SELECT title, minutes,
                   RANK() OVER (ORDER BY minutes DESC) AS rnk
            FROM courses
            """, (rs, n) -> new RankedCourse(
                rs.getString("title"), rs.getInt("minutes"), rs.getInt("rnk")));

        assertEquals(1, ranked.get(0).rnk());   // longest course
    }
}
```

## Summary

| Concept | Key fact |
|---------|----------|
| Execution order | FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT |
| JOIN filter | WHERE after JOIN = INNER; JOIN-clause filter keeps nulls |
| Aggregates | GROUP BY collapses; window functions don't |
| Ranking | ROW_NUMBER/RANK with PARTITION BY |
| CTEs | Named subqueries + recursion |
| NULLs | Three-valued logic — use IS DISTINCT FROM |
| Upsert | ON CONFLICT DO UPDATE |

SQL is a declarative language with a fixed execution order — master the order, the four joins, and window functions, and you can write every query a backend needs. The next lessons go deeper: indexes, transactions/isolation, and JSONB.
