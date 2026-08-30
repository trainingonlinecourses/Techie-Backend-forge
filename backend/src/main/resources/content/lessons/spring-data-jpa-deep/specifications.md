---
title: Specifications and Dynamic Queries
module: spring-data-jpa-deep
order: 4
minutes: 22
topics: ["Specification", "Criteria API", "dynamic queries", "composable predicates", "JpaSpecificationExecutor"]
docs:
  - title: "JPA Specifications"
    url: "https://docs.spring.io/spring-data/jpa/reference/jpa/specifications.html"
summary: Filter forms with ten optional fields can't use one hardcoded query. Specifications — Spring Data's wrapper around the Criteria API — let you compo...
---

# Specifications and Dynamic Queries

Filter forms with ten optional fields can't use one hardcoded query. **Specifications** — Spring Data's wrapper around the Criteria API — let you compose query predicates dynamically and type-safely. This is the production answer to "how do I build the WHERE clause at runtime?"

## The Problem

```java
// A search with 5 optional filters needs 32 query methods — insane
List<Course> findByLevel(String level);
List<Course> findByLevelAndPublishedTrue(String level);
List<Course> findByLevelAndMinutesGreaterThan(String level, int min);
// ... 32 combinations
```

## The Specification

```java
public interface CourseRepository extends JpaRepository<Course, Long>,
        JpaSpecificationExecutor<Course> {
    // Specifications work through JpaSpecificationExecutor
}
```

```java
// One specification per filter — composable
public class CourseSpecifications {

    public static Specification<Course> hasLevel(String level) {
        return (root, query, cb) ->
            level == null ? null : cb.equal(root.get("level"), level);
    }

    public static Specification<Course> isPublished() {
        return (root, query, cb) -> cb.isTrue(root.get("published"));
    }

    public static Specification<Course> minutesAtLeast(Integer min) {
        return (root, query, cb) ->
            min == null ? null : cb.greaterThanOrEqualTo(root.get("minutes"), min);
    }

    public static Specification<Course> titleContains(String text) {
        return (root, query, cb) ->
            text == null ? null
                : cb.like(cb.lower(root.get("title")), "%" + text.toLowerCase() + "%");
    }
}
```

**The contract**: return `null` for "no filter" — the predicate is skipped. Each specification is a `(Root, CriteriaQuery, CriteriaBuilder) → Predicate` lambda.

## Composing at Runtime

```java
@Service
public class CourseSearchService {

    private final CourseRepository repository;

    public List<Course> search(CourseFilter filter, Pageable pageable) {
        Specification<Course> spec = Specification
            .where(CourseSpecifications.hasLevel(filter.level()))
            .and(CourseSpecifications.isPublished())
            .and(CourseSpecifications.minutesAtLeast(filter.minMinutes()))
            .and(CourseSpecifications.titleContains(filter.title()));

        return repository.findAll(spec, pageable).getContent();
    }
}
```

```java
// The controller — 10 filters, ONE endpoint, zero query methods
@GetMapping("/courses/search")
public Page<Course> search(CourseFilter filter, Pageable pageable) {
    return repository.findAll(buildSpec(filter), pageable);
}
```

## Specification Combinators

```java
Specification<Course> spec = Specification.where(null);   // start empty

if (level != null)        spec = spec.and(hasLevel(level));
if (minMinutes != null)   spec = spec.and(minutesAtLeast(minMinutes));
if (publishedOnly)        spec = spec.and(isPublished());

// OR composition
Specification<Course> beginnerOrAdvanced =
    hasLevel("BEGINNER").or(hasLevel("ADVANCED"));

// Negation
Specification<Course> notArchived = Specification.not(isArchived());
```

`where()` is the null-safe start — composing with a null spec is a no-op.

## Joins in Specifications

```java
public static Specification<Course> hasTag(String tag) {
    return (root, query, cb) -> {
        Join<Course, Tag> tags = root.join("tags");
        return cb.equal(tags.get("name"), tag);
    };
}

// Left join for "courses without lessons"
public static Specification<Course> hasNoLessons() {
    return (root, query, cb) -> {
        Join<Course, Lesson> lessons = root.join("lessons", JoinType.LEFT);
        return cb.isNull(lessons.get("id"));
    };
}
```

## Sorting and Distinct

```java
// Sort inside the specification (avoids duplicate rows from joins)
public static Specification<Course> orderedByMinutes() {
    return (root, query, cb) -> {
        query.orderBy(cb.desc(root.get("minutes")));
        return null;    // predicate null — only sorting
    };
}

// Distinct for join-expanded results
public static Specification<Course> distinct() {
    return (root, query, cb) -> {
        query.distinct(true);
        return null;
    };
}
```

## Combining With Pagination

```java
Page<Course> page = repository.findAll(
    spec,
    PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "minutes")));
```

Specifications compose with `Pageable` and `Sort` natively — filters and pagination are orthogonal.

## The CriteriaBuilder Toolbox

| Method | Use |
|--------|-----|
| `equal`, `notEqual` | Equality |
| `like`, `ilike` (Postgres) | Text patterns |
| `greaterThan`, `lessThanOrEqualTo` | Comparisons |
| `between` | Range |
| `in` | Lists |
| `isNull`, `isNotNull` | NULL checks |
| `and`, `or`, `not` | Composition |
| `isTrue`, `isFalse` | Booleans |
| `exists` (subquery) | Existence checks |
| `concat`, `lower`, `upper` | String functions |

## Testing Specifications

```java
@DataJpaTest
@Testcontainers
class SpecificationTest {

    @Autowired CourseRepository repository;

    @Test
    void composesOptionalFilters() {
        repository.save(course("Java", "BEGINNER", 30, true));
        repository.save(course("Spring", "ADVANCED", 45, true));
        repository.save(course("Draft", "BEGINNER", 10, false));

        Specification<Course> spec = Specification
            .where(CourseSpecifications.hasLevel("BEGINNER"))
            .and(CourseSpecifications.isPublished())
            .and(CourseSpecifications.minutesAtLeast(20));

        List<Course> results = repository.findAll(spec);

        assertEquals(1, results.size());
        assertEquals("Java", results.get(0).getTitle());
    }

    @Test
    void nullFiltersAreIgnored() {
        Specification<Course> spec = Specification
            .where(CourseSpecifications.hasLevel(null))     // skipped
            .and(CourseSpecifications.isPublished());

        assertEquals(2, repository.findAll(spec).size());   // 2 of 3 published
    }
}
```

## When to Use Specifications

| Use Specifications | Use @Query |
|--------------------|------------|
| Many optional filters | Fixed query shape |
| Filters composed at runtime | Complex joins with fixed semantics |
| Search forms | Reporting queries |
| Admin filters | Native SQL features |

## Summary

| Concept | Mechanism |
|---------|-----------|
| A Specification | `(root, query, cb) → Predicate` |
| Null = no filter | Return null to skip |
| Composition | `where().and().or().not()` |
| Joins | `root.join("tags")` |
| Pagination | `findAll(spec, pageable)` |
| Setup | Extend `JpaSpecificationExecutor` |

Specifications turn dynamic filters from 32 hand-written methods into a composable algebra: one predicate per filter, combined at runtime, type-checked by the compiler. They're the standard solution for search forms and admin filters — and they play perfectly with the pagination and sorting you already use.
