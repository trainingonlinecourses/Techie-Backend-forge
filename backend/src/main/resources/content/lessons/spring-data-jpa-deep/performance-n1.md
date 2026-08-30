---
title: N+1 Queries and Fetch Strategies
module: spring-data-jpa-deep
order: 3
minutes: 28
topics: ["N+1 problem", "fetch joins", "EntityGraph", "batch fetching", "lazy loading", "session per request"]
docs:
  - title: "Hibernate fetching"
    url: "https://docs.jboss.org/hibernate/orm/current/userguide/html_single/Hibernate_User_Guide.html#fetching"
summary: The N+1 problem is the most common JPA performance killer: one query for the parent, then N queries for each child. This lesson covers how N+1 happ...
---

# N+1 Queries and Fetch Strategies

The N+1 problem is the most common JPA performance killer: one query for the parent, then *N* queries for each child. This lesson covers how N+1 happens, the four fixes (fetch join, EntityGraph, batch fetching, second-level cache), and the lazy-loading traps that accompany them.

## What N+1 Looks Like

```java
// The innocent-looking code
List<Course> courses = courseRepository.findAll();
for (Course c : courses) {
    for (Lesson l : c.getLessons()) {     // 🔥 lazy load per course
        process(l);
    }
}
```

```sql
-- What actually hits the DB:
SELECT * FROM courses;                    -- 1 query (N courses)
SELECT * FROM lessons WHERE course_id = 1;  -- +1 per course
SELECT * FROM lessons WHERE course_id = 2;  -- +1
...                                         -- N total = N+1
```

With 100 courses: **101 queries** instead of 2. On Render's free Postgres (remote round-trips), that's seconds of latency per request.

## The Tell-Tale Signs

- Response time scales with list size, not with data volume
- `Hibernate SQL` logging shows repeating identical queries
- N+1 smells like "one per item" in the log

```yaml
spring:
  jpa:
    properties:
      hibernate:
        format_sql: true
logging:
  level:
    org.hibernate.SQL: DEBUG     # see the queries
    org.hibernate.stat: DEBUG    # see query counts
```

## Fix 1: The Fetch Join (JPQL)

```java
@Query("""
    select distinct c from Course c
    join fetch c.lessons
    where c.published = true
    """)
List<Course> findAllPublishedWithLessons();
```

One query, lessons loaded eagerly for this query only. **Caveats**:
- `distinct` matters — the join multiplies rows
- Multiple collection fetches in one query → Cartesian product (avoid: use separate queries or batch)
- Pagination + collection fetch → in-memory pagination warning

## Fix 2: @EntityGraph (declarative)

```java
@EntityGraph(attributePaths = {"lessons", "lessons.quiz"})
@Query("select c from Course c where c.published = true")
List<Course> findAllWithLessonsAndQuizzes();
```

Same effect as the fetch join, declared on the method. Supports nested paths — the cleanest option for multi-level graphs.

## Fix 3: Batch Fetching (the global fix)

```java
# application.yml
spring:
  jpa:
    properties:
      hibernate:
        default_batch_fetch_size: 50
```

With batch fetching, lazy collections load **in batches**:

```sql
-- Instead of 1 query per course:
SELECT * FROM lessons WHERE course_id IN (1, 2, 3, ..., 50);   -- 2 queries for 100 courses
```

**Why it's the default fix**: one property, no query changes, turns N+1 into ceil(N/50)+1. The trade-off: every lazy load now pays the batch size, and the generated SQL is less predictable than an explicit fetch join.

## Fix 4: Second-Level Cache

For read-heavy, rarely-changing data, cache the entities:

```java
@Entity
@Cacheable
@org.hibernate.annotations.Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
public class Course { ... }
```

```yaml
spring:
  jpa:
    properties:
      hibernate:
        cache:
          use_second_level_cache: true
```

Add `hibernate-jcache` + a provider (Caffeine/Ehcache). The second-level cache survives across transactions — the first-level cache doesn't.

## The Lazy Initialization Trap

```java
// LazyInitializationException: no Session
@Transactional
public List<CourseDto> list() {
    List<Course> courses = courseRepository.findAll();
    // ...return courses directly? 
    return courses.stream().map(c -> new CourseDto(c, c.getLessons().size())).toList();
    // ✅ mapped INSIDE the transaction — lessons load fine
}

// ❌ Outside the transaction:
// CourseDto dto = courseService.listUnwrapped();  // touching lessons → LazyInitializationException
```

**Rules**:
- Map/access lazy associations **inside** the transaction
- Return DTOs, never detached entities with lazy paths
- Or set `hibernate.enable_lazy_load_no_trans` (anti-pattern — hides the real problem)

## Choosing the Fetch Strategy

| Situation | Strategy |
|-----------|----------|
| Single entity, known graph | Fetch join / @EntityGraph |
| List of entities, one collection | @EntityGraph with attributePaths |
| List, multiple collections | Batch fetching (avoid Cartesian) |
| Paginated lists | Batch fetching (joins break pagination) |
| Read-heavy, stable data | Second-level cache |
| Default safety net | `default_batch_fetch_size: 50` |

## Measuring the Fix

```java
@DataJpaTest
@Testcontainers
class FetchStrategyTest {

    @Autowired CourseRepository repository;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void entityGraphLoadsLessonsInOneQuery() {
        // Enable query counting: Hibernate statistics
        Statistics stats = sessionFactory.getStatistics();
        stats.clear();

        List<Course> courses = repository.findAllWithLessons();
        courses.forEach(c -> assertEquals(3, c.getLessons().size()));

        assertEquals(1, stats.getQueryExecutionCount());   // ONE query
    }
}
```

## The Complete Performance Checklist

- ✅ `default_batch_fetch_size` set (50–100)
- ✅ Fetch joins / @EntityGraph for known hot paths
- ✅ No lazy access outside transactions
- ✅ No `select *` — projections for lists
- ✅ No collection fetch joins + pagination together
- ✅ SQL logging on in dev; query counts in tests
- ✅ Second-level cache for stable hot entities

## Summary

| Fix | When | Cost |
|-----|------|------|
| Fetch join | One known collection | Duplicate rows (distinct) |
| @EntityGraph | Declarative multi-level | Same as join |
| Batch fetch | Global safety net | Less predictable SQL |
| 2nd-level cache | Stable hot data | Staleness, memory |
| Projections | Wide entities | More methods to write |

N+1 is the difference between "works in dev" and "melts in prod" — every parent-child list is a hidden query explosion. Set batch fetching as the baseline, use EntityGraphs for the hot paths, keep lazy access inside transactions, and verify with query-count tests. The database will thank you.
