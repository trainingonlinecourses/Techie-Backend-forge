---
title: The N+1 Problem and DataLoader — Batching Field Resolution
module: graphql-deep
order: 3
minutes: 27
topics: ["N+1", "DataLoader", "batch loading", "BatchingLoader", "query efficiency"]
docs:
  - title: "DataLoader (graphql-java)"
    url: "https://www.graphql-java.com/documentation/data-fetching/"
---

# The N+1 Problem and DataLoader — Batching Field Resolution

## The Concept: The Resolver Chain's Hidden Cost

The resolver chain is elegant — and potentially catastrophic for performance. Consider the innocent query:

```graphql
{ courses { title lessons { title } } }
```

The execution: `courses()` fetches all courses (1 query) → **for each course**, `lessons(course)` runs **its own query**. With 100 courses, that's **1 + 100 = 101 queries** — the classic **N+1 problem** (the same one that plagues JPA lazy loading, covered in the Data JPA module). Each resolver runs independently; nothing tells it "your siblings are also loading lessons."

**DataLoader** fixes it with two tricks, applied per level of the tree:

1. **Batching** — within one query execution, all `lessons` resolvers register their *ids* instead of querying. At the end of the tick, **one** query loads all of them (`WHERE course_id IN (...)`), and each resolver receives its slice.
2. **Caching** — within the same request, the same id is loaded once.

Result: 100 lesson fetches collapse into **1** batched query. The N+1 becomes 1+N→2.

## The Code Walkthrough

```java
// ---- 1. A DataLoader: loads many lessons by course ids in ONE query ----
import org.springframework.graphql.execution.BatchLoaderRegistry;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.concurrent.CompletableFuture;

@Component
public class LessonBatchLoader {

    public LessonBatchLoader(BatchLoaderRegistry registry, LessonRepository repo) {
        // Register: "for a list of course ids, return the lessons for each"
        registry.forTypePair(Long.class, List.class)
                .registerMappedBatchLoader((courseIds, env) -> {
                    // ONE query for all requested courses:
                    List<Lesson> all = repo.findByCourseIdIn((List<Long>) courseIds);
                    // Group by course id — the framework matches each resolver to its slice:
                    return Mono.just(all.stream()
                            .collect(java.util.stream.Collectors.groupingBy(
                                    Lesson::getCourseId,
                                    java.util.stream.Collectors.toList())));
                });
    }
}

// ---- 2. The resolver now USES the loader instead of querying directly ----
import org.springframework.graphql.data.method.annotation.BatchMapping;
import org.springframework.graphql.data.method.annotation.SchemaMapping;
import org.springframework.stereotype.Controller;

@Controller
public class CourseResolvers {

    private final LessonRepository lessons;

    public CourseResolvers(LessonRepository lessons) { this.lessons = lessons; }

    // WITHOUT batching — the N+1:
    // @SchemaMapping(typeName = "Course", field = "lessons")
    // public List<Lesson> lessons(Course course) {
    //     return lessons.findByCourseId(course.id());     // N queries
    // }

    // WITH batching — Spring GraphQL calls this ONCE for all courses:
    @BatchMapping(typeName = "Course", field = "lessons")
    public Map<Course, List<Lesson>> lessons(List<Course> courses) {
        // ONE query for all courses:
        List<Lesson> all = lessons.findByCourseIdIn(
                courses.stream().map(Course::getId).toList());
        return all.stream().collect(java.util.stream.Collectors.groupingBy(
                Lesson::getCourse, java.util.stream.Collectors.toList()));
    }
}
```

### Walking Through Each Part

**`BatchLoaderRegistry`** — where you register a *batch loader*: given a collection of keys (course ids), return a map of key → values (course → its lessons). The framework collects all pending loads for that field *within one query execution* and calls your loader once.

**`@BatchMapping`** — the simple Spring GraphQL form: the resolver receives **all** the parent objects (`List<Course>`) at once and returns a map. You write the batched query yourself (`findByCourseIdIn`) — one query, grouped results. The N+1 collapses to 1 query per level.

**The one-query trick** — `IN` clauses: `WHERE course_id IN (1,2,3,...,100)`. One round trip to the database returns everything; the grouping distributes lessons to their courses.

## The Dataloader Semantics

- **Per-request scope** — loaders cache within one query execution (a request); each new request gets a fresh loader. This is deliberate: results must reflect current data.
- **Deduping** — the same id requested by multiple resolvers loads once (the cache), even across sibling queries in the same request.
- **Async by design** — loaders return `CompletableFuture`/`Mono`; the framework parallelizes loading while resolvers wait.

## Where N+1 Hides in GraphQL

| Pattern | The trap |
|---|---|
| Nested object fields (`course.lessons`) | 1 + N queries per level |
| List fields with per-element fetches | Same, with N = list size |
| Computed fields that query (`durationLabel` reads the repo) | Silent N+1 in a "cheap" field |
| Deep nesting (`courses → lessons → comments`) | N+1 per level, multiplied |

**The audit rule:** count the database queries per query execution. If it scales with the result size, you have N+1 — batch it. Spring Boot's `logging.level.org.hibernate.SQL=DEBUG` (JPA) or the database's query log will show you the truth.

## The Profiling-First Discipline

Before reaching for DataLoader: **measure** (the observability module's tools). The N+1 only matters when it's in the hot path and the result sizes are real. The order of attack:

1. **Measure** the query count and latency.
2. **Fix the obvious** — indexes on the FK columns (`course_id`).
3. **Batch** — `@BatchMapping`/DataLoader for the relationship levels.
4. **Re-measure** — confirm the query count dropped.

## Common Beginner Pitfalls

1. **Not batching at all** — 101 queries where 2 suffice; the #1 GraphQL performance bug.
2. **Batching the wrong level** — batch the *children* (lessons), not the root (courses) — root is already one query.
3. **Forgetting the index** — an `IN` query without an index on `course_id` scans the table; add the index.
4. **Batch loaders that query per key anyway** — a loader that loops and queries per id is just N+1 wearing a costume.
5. **Caching across requests** — loaders must be per-request; stale cached results across requests are a correctness bug.
6. **Batching everything preemptively** — measure first; simple schemas with shallow queries may never need loaders.

## Key Takeaways

- The resolver chain causes N+1: one query per child field per parent.
- DataLoader/`@BatchMapping` collects per-level loads and runs ONE batched query (`IN`).
- Batch at the child level, index the FK, and group results by parent.
- Loaders are per-request (fresh data), dedupe ids, and are async by design.
- Audit query count per execution — that's the metric that matters.
- Measure first, batch second, re-measure after.
