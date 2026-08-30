---
title: GraphQL Resolvers — How Fields Get Their Values
module: graphql-deep
order: 2
minutes: 25
topics: ["resolvers", "field resolution", "@SchemaMapping", "data fetching", "batch resolution"]
docs:
  - title: "GraphQL resolvers (graphql.org)"
    url: "https://graphql.org/learn/execution/"
summary: In REST, an endpoint returns a preshaped object. In GraphQL, the client selects fields — so the server can't know in advance what to fetch. The ans...
---

# GraphQL Resolvers — How Fields Get Their Values

## The Concept: Every Field Is a Function

In REST, an endpoint returns a pre-shaped object. In GraphQL, the client *selects fields* — so the server can't know in advance what to fetch. The answer: **every field is resolved by a function** (a resolver). The execution engine walks the query tree, calling a resolver per field:

```
Query { courses { title lessons { title } } }
          |        |        |
      resolver  resolver  resolver
      (all courses) (course title) (course's lessons)
```

The parent resolver's result (a `Course`) becomes the *source* for its children's resolvers — field resolution composes down the tree. This is the **resolver chain**: `Query.courses` → for each Course → `Course.title` (trivial: read the field) → `Course.lessons` (a data fetch).

## Default Resolution — The 80% Case

If a field's value is already on the object (a plain getter), **no resolver is needed** — GraphQL reads it by name:

```java
public record Course(Long id, String title, int minutes, List<Lesson> lessons) {
    // 'id', 'title', 'minutes', 'lessons' all resolve by default
    // (record accessors ARE the getters)
}
```

The engine calls `course.id()`, `course.title()`, etc. Resolvers are only needed when the value must be *computed or fetched* — the interesting 20%.

## The Code Walkthrough — Resolvers for the Interesting Fields

```java
import org.springframework.graphql.data.method.annotation.SchemaMapping;
import org.springframework.stereotype.Controller;

@Controller
public class CourseResolvers {

    private final LessonRepository lessons;

    public CourseResolvers(LessonRepository lessons) { this.lessons = lessons; }

    // ---- 1. Resolve a field that requires a data fetch ----
    // Schema: type Course { ... lessons: [Lesson!]! }
    // The Course object from the parent resolver doesn't carry full lessons —
    // fetch them here:
    @SchemaMapping(typeName = "Course", field = "lessons")
    public List<Lesson> lessons(Course course) {
        return lessons.findByCourseId(course.id());   // a real query
    }

    // ---- 2. Computed fields ----
    // Schema: type Course { ... durationLabel: String }
    @SchemaMapping(typeName = "Course", field = "durationLabel")
    public String durationLabel(Course course) {
        int h = course.minutes() / 60;
        int m = course.minutes() % 60;
        return h > 0 ? h + "h " + m + "m" : m + " min";
    }
}
```

### Walking Through Each Part

**`@SchemaMapping(typeName = "Course", field = "lessons")`** — binds a method to a schema field: "when the client asks for `Course.lessons`, call `lessons(course)`." The method receives the *parent source* (the `Course` from the level above) and returns the field's value. This is where the **N+1 trap** lurks — see the next lesson.

**Computed fields** — fields that don't exist on the entity at all (`durationLabel`) are computed on demand by a resolver. The schema offers a *virtual* field; the resolver materializes it. This keeps the schema expressive without bloating the entity.

**Why resolvers compose** — the query `{ courses { lessons { title } } }` runs: `courses()` (fetch all) → per course, `lessons()` (fetch that course's lessons) → per lesson, `title` (default getter). The engine decides what to execute based on *which fields the client asked for* — an untouched field's resolver never runs.

## The Resolver Chain and Errors

Field-level resolution means **errors are field-scoped** too. If `Course.lessons` fails for one course:

```json
{
  "data": { "courses": [ { "id": 1, "lessons": null } ] },
  "errors": [ { "message": "...", "path": ["courses", 0, "lessons"] } ]
}
```

The other courses still resolve; the error is attached to the failing field's path. Clients see partial data + precise error locations — a big difference from REST (where one bad field fails the whole response).

## When You Need Resolvers (vs Defaults)

| Field | Resolver needed? |
|---|---|
| On the entity, client reads it | No — default getter |
| Requires a query (relationships, lazy data) | Yes — `@SchemaMapping` |
| Computed / derived | Yes |
| Needs auth context (e.g., `me` field) | Yes — use `@AuthenticationPrincipal`-style access |

The discipline: **keep the entity lean; resolve on demand.** Don't preload everything "just in case" — GraphQL's whole point is that untouched fields shouldn't be fetched.

## Common Beginner Pitfalls

1. **Preloading everything in the root resolver** — `courses()` fetches courses *and* all lessons *and* all users — the over-fetching you escaped in REST returns. Fetch the root; resolve children lazily (or batch — next lesson).
2. **Resolvers that return the entity with everything attached** — defeats the point; the client asked for 3 fields, you fetched 300.
3. **Name mismatches** — `@SchemaMapping(field = ...)` must match the schema exactly; a typo silently yields null (or boot failure for unknown fields).
4. **The N+1 problem** — per-course lesson fetches = N+1 queries (next lesson's topic).
5. **Side effects in queries** — queries should be side-effect-free (GET semantics); mutations are the write path.
6. **Ignoring error paths** — field-scoped errors are a feature; surface `path` in clients so users see which field failed.

## Key Takeaways

- Every GraphQL field is resolved by a function — a resolver chain down the query tree.
- Plain getters resolve by default; `@SchemaMapping` handles fetched/computed fields.
- The parent result is the source for child resolvers — resolution composes.
- Errors are field-scoped: partial data + precise `path` in the response.
- Fetch the root, resolve children on demand — don't preload everything.
- The N+1 trap is the resolver's classic pitfall — batched resolution is the fix (next lesson).
