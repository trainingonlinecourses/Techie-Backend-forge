---
title: Spring Data JDBC — Repositories Without JPA
module: spring-data-jdbc
order: 1
minutes: 26
topics: ["Spring Data JDBC", "aggregates", "repositories", "derived queries", "no lazy loading"]
docs:
  - title: "Spring Data JDBC reference"
    url: "https://docs.spring.io/spring-data/jdbc/reference/"
---

# Spring Data JDBC — Repositories Without JPA

## The Concept: JPA's Simplicity, SQL's Honesty

JPA (covered in the Data JPA module) is a full **object-relational mapper**: it manages a persistence context, tracks entity changes, and generates SQL. That power comes with a cost — the *magic* (lazy loading, dirty checking, caching) can surprise you, and debugging generated SQL is a sport.

**Spring Data JDBC** takes a different philosophy: **plain SQL under the hood, repository convenience on top.** It gives you the *repository* API you love (`save`, `findById`, derived queries) but:

- **No persistence context** — no lazy loading, no dirty checking, no caching surprises. What you write is what you get.
- **Entities are aggregates** — a row maps to an object directly; nested objects (aggregates) are stored and loaded *eagerly* as part of the root.
- **SQL is explicit where it matters** — you can write `@Query` with real SQL anytime; no JPQL translation layer hiding behind you.

Think of it as: *the ergonomics of Spring Data, the predictability of JDBC.*

## Aggregate Mapping — How Nested Data Works

In JPA, a `Course` with a list of `Lesson`s uses lazy loading and joins. In Spring Data JDBC, a **Course aggregate** owns its lessons **in the same table rows** — the lesson data is loaded eagerly when the course is loaded:

```java
// The aggregate root — stored in the 'course' table
public class Course {
    @Id
    private Long id;
    private String title;

    // Nested aggregate: stored in 'course_lesson' table with a reference back
    private List<Lesson> lessons = new ArrayList<>();
}

// A child entity — no own id; lives inside the parent aggregate
public class Lesson {
    private String title;
    private int minutes;
}
```

Spring Data JDBC stores the *whole aggregate*: insert a `Course` → one insert for the course row + inserts for every lesson row. Load a `Course` → one select for the course + one for its lessons (with an `IN` clause). **No lazy loading exists** — aggregates load whole, which is exactly why the aggregate boundary matters: keep aggregates small.

## The Code Walkthrough

```java
import org.springframework.data.annotation.Id;
import org.springframework.data.jdbc.repository.query.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.repository.query.Param;

import java.util.List;

// ---- 1. The aggregate root ----
public class Course {
    @Id
    private Long id;
    private String title;
    private List<Lesson> lessons = new java.util.ArrayList<>();

    // constructors, getters... (Spring Data JDBC needs immutable-friendly
    // construction or setters; records work too with @Id component)
}

// ---- 2. The repository — same interface style as JPA ----
public interface CourseRepository extends CrudRepository<Course, Long> {

    // Derived query: SELECT * FROM course WHERE title LIKE ...
    List<Course> findByTitleContaining(String keyword);

    // Derived query on a nested property: WHERE lesson count matters is NOT derived;
    // but filtering aggregates by a root field works fine:
    List<Course> findByLessonsMinutesGreaterThan(int minutes);

    // ---- 3. Explicit SQL when you need it ----
    @Query("SELECT * FROM course WHERE id IN (SELECT course_id FROM course_lesson WHERE title = :lessonTitle)")
    List<Course> findCoursesWithLesson(@Param("lessonTitle") String lessonTitle);
}

// ---- 4. Usage ----
@Service
public class CatalogService {

    private final CourseRepository courses;

    public CatalogService(CourseRepository courses) { this.courses = courses; }

    public void addCourse(Course course) {
        courses.save(course);           // saves course + lessons atomically (one transaction)
    }

    public List<Course> search(String q) {
        return courses.findByTitleContaining(q);
    }
}
```

### Walking Through Each Part

**The aggregate** — `Course` is the aggregate root (`@Id` on its id); `Lesson` is an embedded child. Spring Data JDBC manages the aggregate as a unit: save → course row + lesson rows; load → eager, complete aggregate. The table names derive from the class names (`course`, `course_lesson`), overridable via `@Table`.

**The repository** — `CrudRepository<Course, Long>` gives `save`, `findById`, `findAll`, `deleteById` with zero SQL written. Derived queries (`findByTitleContaining`) become parameterized SQL automatically.

**Explicit `@Query`** — the escape hatch: real SQL, real joins, whatever the query needs. No JPQL translation — you write what the database executes.

**The service** — `save(course)` persists the whole aggregate in one transaction. If a lesson insert fails, the course insert rolls back — aggregate consistency for free.

## CrudRepository vs JpaRepository

| | Spring Data JDBC | JPA |
|---|---|---|
| Persistence context | None | Full (lazy, dirty checking, caching) |
| Nested data | Eager aggregate (whole thing) | Lazy/`FetchType`-managed |
| SQL | Plain SQL / derived | JPQL/Hibernate-generated |
| Best for | Simple-to-medium domains, predictable SQL | Complex object graphs, legacy schemas, heavy relationships |
| Pitfall avoided | N+1 via lazy loading (all eager) | Uncontrolled lazy-loading queries |

The famous quote attributed to the Spring team: *"Spring Data JDBC is the right choice for most applications."* Its predictability is a feature — you always know exactly what SQL ran.

## Common Beginner Pitfalls

1. **Expecting lazy loading** — it doesn't exist; an aggregate loads complete. This is a *feature*: keep aggregates small so loading is cheap.
2. **Aggregates with own-identity children** — children shouldn't have their own ids (they're part of the parent); giving them ids confuses the mapping.
3. **Deeply nested aggregates** — a `Course` → `Lesson` → `Paragraph` chain loads three tables per course; prefer flat aggregates or split.
4. **Expecting JPA behaviors** (cascades, orphan removal config) — Spring Data JDBC's model is simpler: save the root, everything under it goes.
5. **Writing JPQL in `@Query`** — it's plain SQL here. `:param` named params work, but the dialect is your database's.
6. **`save` with null id on an existing aggregate** — Spring Data JDBC decides insert vs update by whether `@Id` is null; keep ids stable when updating.

## Key Takeaways

- Spring Data JDBC = repository convenience + plain SQL + no persistence-context magic.
- Entities are aggregates: save/load the root, children go with it (eagerly).
- Derived queries and `@Query` with real SQL cover the query needs.
- No lazy loading, no dirty checking, no caching surprises — predictable SQL always.
- Choose JDBC-style for straightforward domains; JPA for complex object graphs.
- "What you write is what the database runs" — the debugging story is clean.
