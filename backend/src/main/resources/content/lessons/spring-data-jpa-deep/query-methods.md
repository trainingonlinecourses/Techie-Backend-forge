---
title: Repository Query Methods in Depth
module: spring-data-jpa-deep
order: 2
minutes: 25
topics: ["derived queries", "@Query", "JPQL", "native queries", "modifying queries", "named queries", "projections"]
summary: Spring Data JPA gives you three ways to query: derived methods (name = query), @Query with JPQL, and native SQL. Each has a place — this lesson cov...
docs:
  - title: "Spring Data JPA queries"
    url: "https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods.html"
---

# Repository Query Methods in Depth

Spring Data JPA gives you three ways to query: **derived methods** (name = query), **`@Query` with JPQL**, and **native SQL**. Each has a place — this lesson covers when to use which, the full syntax of each, and the pitfalls (spellings, parameter binding, modifying queries).

## The Three Query Styles

| Style | Syntax | When |
|-------|--------|------|
| Derived | `findByTitleContainingIgnoreCase(String)` | Simple filters |
| JPQL | `@Query("select c from Course c where ...")` | Complex logic, joins |
| Native | `@Query(value = "SELECT * FROM ...", nativeQuery = true)` | DB-specific SQL |

## Derived Queries: The Name IS the Query

```java
@Repository
public interface CourseRepository extends JpaRepository<Course, Long> {

    List<Course> findByLevel(String level);

    List<Course> findByLevelAndPublishedTrue(String level);

    List<Course> findByTitleContainingIgnoreCase(String title);

    List<Course> findByMinutesGreaterThanEqual(int minutes);

    List<Course> findByPublishedTrueOrderByMinutesDesc();

    long countByLevel(String level);

    boolean existsByCode(String code);

    void deleteByArchivedTrue();
}
```

**The subject parts**:

```
find | read | get | query | count | exists | delete
  └── By ── property ── operator ── And/Or ── ...
```

| Operator | Meaning |
|----------|---------|
| `Containing` / `Like` | LIKE %value% |
| `StartingWith` / `EndingWith` | LIKE value% / %value |
| `IgnoreCase` | Case-insensitive |
| `Between`, `LessThan`, `GreaterThanEqual` | Comparisons |
| `In`, `NotIn` | IN lists |
| `IsNull`, `NotNull` | NULL checks |
| `True`, `False` | Boolean |
| `OrderBy` | Sorting |
| `Top3`, `First` | Limiting |

**The pitfall**: a typo in the property name fails at **startup** (Spring validates derived queries) — that's good, but it means the entire context won't boot. Spell properties exactly (case-insensitive property names, exact relation paths).

## JPQL: Query the Objects, Not the Tables

```java
@Query("""
    select c from Course c
    where c.level = :level
      and c.published = true
    order by c.minutes desc
    """)
List<Course> findPublishedByLevel(@Param("level") String level);
```

JPQL operates on **entity names and properties**, not table/column names. It supports:

```java
// Joins
@Query("""
    select c from Course c
    join fetch c.lessons l          -- fetch join: load lessons in the SAME query
    where c.id = :id
    """)
Optional<Course> findWithLessons(@Param("id") Long id);

// Projections
@Query("select c.title, c.minutes from Course c where c.level = :level")
List<Object[]> findTitleAndMinutesByLevel(String level);

// Aggregate
@Query("select c.level, count(c) from Course c group by c.level")
List<Object[]> countByLevelGrouped();

// Subqueries
@Query("""
    select c from Course c
    where c.minutes = (select max(c2.minutes) from Course c2)
    """)
List<Course> findLongestCourses();
```

## The Fetch Join: Killing N+1

```java
// ❌ N+1: course.lessons triggers a query per course
List<Course> courses = courseRepository.findAll();
for (Course c : courses) {
    c.getLessons().size();      // N extra queries
}

// ✅ Fetch join: one query, lessons pre-loaded
@Query("select distinct c from Course c join fetch c.lessons")
List<Course> findAllWithLessons();

// ✅ Or @EntityGraph — the declarative fetch join
@EntityGraph(attributePaths = "lessons")
@Query("select c from Course c")
List<Course> findAllWithLessons();
```

`@EntityGraph` is the cleaner option: it declares what to fetch without JPQL.

## Modifying Queries

```java
@Modifying
@Query("update Course c set c.published = false where c.archived = true")
int archiveAll();

@Modifying
@Query("delete from Course c where c.id = :id")
int deleteById(@Param("id") Long id);
```

**The critical requirement**: modifying queries run in a **transaction** and **clear the persistence context** by default:

```java
@Service
public class CourseService {

    @Transactional                       // REQUIRED for @Modifying
    public int archiveAll() {
        int updated = courseRepository.archiveAll();
        courseRepository.flush();         // sync context before clearing
        return updated;
    }
}
```

`@Modifying(clearAutomatically = true, flushAutomatically = true)` — recommended to keep the context consistent.

## Native Queries

```java
@Query(value = """
    SELECT * FROM courses
    WHERE level = :level
      AND metadata @> CAST(:filter AS jsonb)
    """, nativeQuery = true)
List<Course> findByJsonAttribute(@Param("level") String level,
                                 @Param("filter") String jsonFilter);
```

- **Exact SQL control** — JSONB operators, window functions, DB-specific features
- **Bypasses the second-level cache** and entity lifecycle
- Native queries return projections; mapping to entities is manual (or use `@SqlResultSetMapping`)

## Named Queries

```java
@Entity
@NamedQuery(name = "Course.findTopByLevel",
            query = "select c from Course c where c.level = :level order by c.minutes desc")
public class Course { ... }
```

```java
List<Course> top = entityManager.createNamedQuery(
    "Course.findTopByLevel", Course.class)
    .setParameter("level", "BEGINNER")
    .setMaxResults(5)
    .getResultList();
```

Named queries are validated at startup (good) — but `@Query` on the repository does the same with less ceremony.

## Projections: Fetch Only What You Need

```java
// Interface projection
public interface CourseSummary {
    Long getId();
    String getTitle();
    int getMinutes();
}

List<CourseSummary> findTop10ByPublishedTrueOrderByMinutesDesc();

// Class projection (DTO)
public record CourseSummaryDto(Long id, String title, int minutes) {}

@Query("select new com.academy.dto.CourseSummaryDto(c.id, c.title, c.minutes) " +
       "from Course c where c.published = true")
List<CourseSummaryDto> findSummaries();
```

Projections avoid loading `@Lob` bodies and full entity graphs — the fix for slow list endpoints.

## Parameter Binding

```java
// ❌ Positional (fragile with many params)
@Query("select c from Course c where c.level = ?1 and c.minutes > ?2")
List<Course> findByLevel(String level, int minutes);

// ✅ Named — the modern way
@Query("""
    select c from Course c
    where (:level is null or c.level = :level)
      and (:minMinutes is null or c.minutes >= :minMinutes)
    """)
List<Course> search(@Param("level") String level,
                    @Param("minMinutes") Integer minMinutes);

// ✅ SpEL for dynamic parts (Java 8+ / Spring Data 3)
@Query("select c from Course c where c.#{#entityName}.level = :level")
List<Course> findByLevel(@Param("level") String level);
```

The `:param is null or ...` pattern enables **optional filters** in one query.

## Testing Queries

```java
@DataJpaTest
@Testcontainers
class QueryMethodTest {

    @Autowired CourseRepository repository;

    @Test
    void derivedQueryFiltersCorrectly() {
        repository.save(course("A", "BEGINNER", 25));
        repository.save(course("B", "ADVANCED", 40));

        List<Course> beginners = repository.findByLevel("BEGINNER");
        assertEquals(1, beginners.size());
    }

    @Test
    void fetchJoinLoadsLessons() {
        // No LazyInitializationException outside the tx:
        // the lessons were fetched in the same query
        Course course = repository.findWithLessons(1L).orElseThrow();
        assertEquals(3, course.getLessons().size());
    }
}
```

## Summary

| Need | Mechanism |
|------|-----------|
| Simple filter | Derived method |
| Complex join / logic | JPQL @Query |
| DB-specific SQL | Native query |
| N+1 fix | `join fetch` / `@EntityGraph` |
| Bulk update/delete | `@Modifying` + @Transactional |
| Only some columns | Projections |
| Optional filters | `(:p is null or ...)` |
| Startup safety | JPQL validated at boot |

The three query styles cover the spectrum: derived methods for filters, JPQL for object-graph logic, native SQL for DB power. The skills that separate the levels are the fetch join (killing N+1), projections (right-sized payloads), and `@Modifying` discipline (transaction + context clearing).
