---
title: Querying — Derived, Annotated, and Paged
module: spring-data-jdbc
order: 3
minutes: 24
topics: ["derived queries", "@Query", "pagination", "sorting", "modifying queries"]
docs:
  - title: "Query methods (Spring Data JDBC)"
    url: "https://docs.spring.io/spring-data/jdbc/reference/jdbc/query-methods.html"
summary: Spring Data JDBC gives you three ways to query, in increasing power:
---

# Querying — Derived, Annotated, and Paged

## The Concept: Three Levels of Query Power

Spring Data JDBC gives you three ways to query, in increasing power:

1. **Derived queries** — `findByTitleContaining("x")`. The method *name* is the query; Spring parses it into SQL. Covers the 80% case with zero SQL.
2. **`@Query` annotated methods** — you write the SQL. Full control, real joins, native dialect.
3. **`Querydsl` / `JdbcTemplate`** — programmatic query building and raw access for the remaining cases.

Plus **paging and sorting** built into the method signatures — the same `Pageable`/`Sort` API you know from JPA.

## Derived Query — The Name IS the Query

```java
public interface CourseRepository extends CrudRepository<Course, Long> {

    List<Course> findByTitle(String title);

    List<Course> findByTitleContaining(String keyword);          // LIKE %keyword%

    List<Course> findByTitleContainingIgnoreCase(String keyword);

    List<Course> findByPublishedTrue();                          // boolean flag

    List<Course> findByMinutesGreaterThan(int min);              // comparison

    List<Course> findByLessonsTitle(String lessonTitle);         // nested: through the aggregate

    List<Course> findByPublishedTrueOrderByTitleAsc();           // sorting in the name

    Optional<Course> findFirstByOrderByPublishedAtDesc();        // most recent published
}
```

### The Grammar

```
find[First|Top N][By] Property [Comparison] [And/Or Property ...] [OrderBy...]
```

| Piece | Example | SQL produced |
|---|---|---|
| Property | `findByTitle` | `WHERE title = ?` |
| `Containing` | `findByTitleContaining` | `WHERE title LIKE '%' || ? || '%'` |
| `IgnoreCase` | `findByTitleContainingIgnoreCase` | `WHERE LOWER(title) LIKE ...` |
| Comparison | `GreaterThan`, `LessThan`, `Between`, `IsNull` | `>`, `<`, `BETWEEN`, `IS NULL` |
| Boolean | `findByPublishedTrue` | `WHERE published = true` |
| Nested | `findByLessonsTitle` | join/EXISTS through `course_lesson` |
| `OrderBy...Asc/Desc` | `findByTitleOrderByMinutesDesc` | `ORDER BY minutes DESC` |
| `First/Top` | `findFirstBy...` | `LIMIT 1` |

**Caution:** nested derived queries (`findByLessonsTitle`) are convenient but generate subqueries against child tables — for anything hot, prefer an explicit `@Query` you can inspect.

## @Query — Plain SQL, Named Parameters

```java
import org.springframework.data.jdbc.repository.query.Query;
import org.springframework.data.repository.query.Param;

public interface CourseRepository extends CrudRepository<Course, Long> {

    // Real SQL — joins across the aggregate's own tables are fine here
    @Query("""
            SELECT c.* FROM course c
            WHERE EXISTS (
                SELECT 1 FROM course_lesson cl
                WHERE cl.course = c.id AND cl.title = :lessonTitle
            )
            """)
    List<Course> coursesWithLesson(@Param("lessonTitle") String lessonTitle);

    // Aggregate function
    @Query("SELECT COUNT(*) FROM course WHERE published = true")
    long countPublished();

    // Modifying query — needs @Modifying and runs in a transaction
    @org.springframework.data.jdbc.repository.query.Modifying
    @Query("UPDATE course SET published = false WHERE id = :id")
    int unpublish(@Param("id") long id);
}
```

### Why `@Query` Matters Here

Because there's no JPQL translation layer, `@Query` **is** the SQL — your database's dialect, your joins, your optimizations. You can use window functions, CTEs, `ILIKE`, full-text search — whatever Postgres offers. For the `lesson` table this is where the N+1-killing, summary-only queries from the academy's own performance work live.

## Paging and Sorting

```java
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

public interface CourseRepository extends CrudRepository<Course, Long> {

    // Return a Page (total count + content + page metadata)
    Page<Course> findByPublishedTrue(Pageable pageable);
}

@Service
public class CatalogService {

    private final CourseRepository courses;

    public Page<Course> page(int page, int size) {
        // Page 0, 10 per page, newest first
        return courses.findByPublishedTrue(
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "publishedAt")));
    }
}
```

`Pageable` from the controller (`?page=2&size=10&sort=title,asc`) flows straight into the query — Spring translates it to `LIMIT/OFFSET` (or keyset) SQL. The controller just forwards it:

```java
@GetMapping("/courses")
public Page<Course> list(@PageableDefault(size = 10, sort = "title") Pageable pageable) {
    return service.page(pageable.getPageNumber(), pageable.getPageSize());
}
```

## The Escape Hatches

When derived + `@Query` aren't enough:

```java
// JdbcTemplate — raw, imperative, any SQL:
@Repository
public class CourseStatsDao {
    private final JdbcTemplate jdbc;

    public CourseStatsDao(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Map<String, Object> stats() {
        return jdbc.queryForMap("SELECT COUNT(*) AS courses, "
                + "(SELECT COUNT(*) FROM course_lesson) AS lessons FROM course");
    }
}
```

For dynamic queries (filters built at runtime), `Querydsl` support (`QuerydslPredicateExecutor`) composes predicates safely — or build SQL strings with named parameters via `JdbcTemplate`. **Never concatenate user input into SQL** — parameterize everything.

## Common Beginner Pitfalls

1. **Typos in derived method names** — a wrong property name fails at startup (`InvalidDataAccessApiUsageException`) — good (fast), but learn the grammar or use `@Query` for complex cases.
2. **`@Query` without `@Modifying` on UPDATE/DELETE** — Spring refuses to execute; add the annotation and a `@Transactional` wrapper.
3. **Nested derived queries in hot paths** — generated subqueries can be slow; write explicit `@Query` and inspect it.
4. **Unbounded queries** — `findAll` without paging on a big table; always page for user-facing lists.
5. **SQL injection via string concatenation** — never build queries with `+ userInput +`; use `:param` or `JdbcTemplate` parameters.
6. **Expecting JPQL** — this is plain SQL; Hibernate-specific syntax (e.g., `FETCH`) doesn't apply.

## Key Takeaways

- Three levels: derived queries (names), `@Query` (plain SQL), JdbcTemplate (raw).
- Derived grammar: `findBy Property + Comparison + And/Or + OrderBy`.
- `@Query` is your database's SQL — joins, aggregates, window functions all available.
- Paging via `Pageable`/`Sort` flows from controller to SQL automatically.
- `@Modifying` + `@Transactional` for writes; parameterize everything against injection.
- Inspect generated SQL for hot queries — predictability is the module's whole point.
