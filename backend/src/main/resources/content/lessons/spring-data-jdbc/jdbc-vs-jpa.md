---
title: Spring Data JDBC vs JPA — Choosing Your Persistence
module: spring-data-jdbc
order: 4
minutes: 25
topics: ["JDBC vs JPA", "persistence choice", "ORM trade-offs", "lazy loading", "when to pick"]
docs:
  - title: "Spring Data JDBC vs JPA (Spring blog)"
    url: "https://spring.io/blog/2018/09/24/spring-data-jdbc-references-and-aggregates"
---

# Spring Data JDBC vs JPA — Choosing Your Persistence

## The Concept: Two Philosophies for the Same Job

Both Spring Data JDBC and Spring Data JPA give you repositories, derived queries, and transactions. But underneath, they answer the fundamental question — *"how do objects and tables relate?"* — completely differently:

- **JPA**: *The object graph is the truth.* Hibernate maintains a persistence context, tracks changes, and generates SQL to sync objects to tables. Relationships (`@OneToMany`, `@ManyToOne`) are first-class; lazy loading fetches on demand; the ORM shields you from SQL.

- **Spring Data JDBC**: *The database is the truth.* Aggregates map directly to tables; there is no persistence context, no change tracking, no lazy loading. The SQL is either derived from method names or written by you. Simpler mental model, more predictable behavior.

Neither is "better" — they're different contracts with different failure modes. The skill is matching the tool to the domain.

## The Comparison Table

| Aspect | JPA | Spring Data JDBC |
|---|---|---|
| Mental model | Object graph + ORM magic | Aggregates + plain SQL |
| Persistence context | Yes (dirty checking, first-level cache) | No |
| Lazy loading | Yes (`FetchType.LAZY`) | No — aggregates load whole |
| N+1 risk | Hidden (lazy loading fires per access) | None (eager aggregate) |
| SQL control | JPQL/Hibernate-generated, can escape to native | Your SQL or derived |
| Schema generation | `ddl-auto` can create it | You own the schema |
| Relationships | Rich (`@OneToMany`, `@ManyToMany`, inheritance) | Aggregates + id references |
| Predictability | Surprises possible (cache, lazy) | High — what you write runs |
| Learning curve | Steep (the whole ORM) | Shallow |
| Best fit | Complex object graphs, legacy schemas, heavy relations | Straightforward CRUD domains, predictable SQL |

## The Code Contrast

```java
// ---- JPA: relationship-driven ----
@Entity
public class Course {
    @Id @GeneratedValue
    private Long id;

    @OneToMany(mappedBy = "course", fetch = FetchType.LAZY)
    private List<Lesson> lessons = new ArrayList<>();
    // Hibernate manages loading, caching, cascades...
}

// ---- Spring Data JDBC: aggregate-driven ----
public class Course {
    @Id
    private Long id;
    private List<Lesson> lessons = new ArrayList<>();
    // Loads the whole aggregate eagerly; no lazy, no cache
}
```

```java
// The N+1 story:
// JPA: courseRepository.findAll() then course.getLessons() per course
//      -> N extra queries (unless you fetch-join) — the classic N+1
//
// JDBC: courseRepository.findAll() loads course + lessons in 2 queries total
//      -> the aggregate IS the fetch unit — N+1 by construction impossible
```

That contrast is the whole decision: JPA gives you power over *relationships* but you must master fetch strategies (see the N+1 lesson in the Data JPA module); JDBC gives you predictability — the aggregate is the unit, period.

## When to Choose JPA

- **Complex object graphs** — deep hierarchies, polymorphic inheritance (`@Inheritance`), many-to-many everywhere.
- **Legacy schemas you can't redesign** — mapping existing tables with quirks is JPA's strength (`@Column(name=...)`, join tables).
- **A team fluent in ORM** — JPA's power is only safe in practiced hands.
- **You need caching/lazy semantics deliberately** — second-level cache, entity graphs for selective fetching.

## When to Choose Spring Data JDBC

- **CRUD + simple nesting** — most business apps: an aggregate root, some children, straightforward queries.
- **SQL predictability matters** — financial/audit domains where every query must be reviewable.
- **You want the app to be the single source of truth for SQL** — no ORM-generated surprises.
- **Performance-sensitive simple reads** — eager aggregates with `IN`-clause child loading beat naive JPA lazy loading.
- **Your domain *is* aggregates** — DDD-style: bounded aggregates, references by id (see the aggregate-design lesson).

## The Hybrid Reality

Real apps often use **both**:

- JPA for the rich core (users, roles, relationships).
- Spring Data JDBC (or `JdbcTemplate`) for read models, reporting queries, and hot paths where you want exact SQL.

Spring lets them coexist — different repositories against the same `DataSource`, both transactional. The academy's own codebase is an example: JPA entities with batch-fetching for the curriculum, plus summary projections and explicit queries where SQL control mattered.

## The Migration Question

If you're on JPA and everything is fine, **don't migrate for fashion**. Migration pain is real (schema ownership, aggregate boundaries, query rewrite). Move when:

- Lazy-loading N+1s keep biting and fetch-join gymnastics dominate your code.
- You can't reason about what SQL runs in production.
- A new bounded module (reporting, analytics, a new aggregate) wants SQL control from day one.

For *new* projects: start with Spring Data JDBC; escalate to JPA only when the domain's relationship complexity demands it.

## Common Beginner Pitfalls

1. **Migrating to JPA "for features you never use"** — lazy loading you don't need is a liability, not a feature.
2. **Expecting JPA behaviors in JDBC** — `cascade`, `orphanRemoval`, second-level cache don't exist; the model is simpler by design.
3. **Building a relationship-heavy domain in JDBC** — many-to-many across aggregates means manual id choreography; JPA is the right tool there.
4. **Schema generation differences** — JPA can `ddl-auto` your schema; JDBC expects you to own it (use Flyway — see the db-migrations module).
5. **Judging by micro-benchmarks** — both can be fast; the decision is about predictability, complexity, and team fit.
6. **The "one-size" assumption** — hybrid (JPA core + JDBC read paths) is legitimate and common.

## Key Takeaways

- JPA = object-graph truth, ORM magic, rich relationships, N+1 hidden.
- JDBC = database truth, aggregates, plain SQL, eager-by-design, N+1 impossible.
- Choose JPA for complex graphs/legacy schemas; JDBC for predictable CRUD and SQL control.
- The aggregate boundary in JDBC is your main design lever — keep aggregates small.
- Hybrid stacks are normal: JPA for the rich core, JDBC/JdbcTemplate for hot read paths.
- Know which philosophy you're in — the failure modes are entirely different.
