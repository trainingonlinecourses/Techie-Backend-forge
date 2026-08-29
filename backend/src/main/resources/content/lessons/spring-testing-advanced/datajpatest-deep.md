---
title: @DataJpaTest in Depth — Real JPA Against a Real Database
summary: The slice test for repositories, why H2 differs from Postgres, flush/clear assertions, and Testcontainers for the real thing.
order: 10
minutes: 17
topics: [datajpatest, slice-test, h2, testcontainers, repository-test, flush, rollback]
docs:
  - https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html#testing.spring-boot-applications.autoconfigured-spring-data-jpa
  - https://docs.spring.io/spring-data/jpa/reference/repositories/core-domain-events.html
---

# @DataJpaTest in Depth — Real JPA Against a Real Database

## The concept: the persistence slice

`@DataJpaTest` boots only the **JPA layer** — repositories, the `EntityManager`, and the transaction machinery — without controllers, services, or security:

```java
@DataJpaTest
class OrderRepositoryTest {
    @Autowired OrderRepository orderRepo;
    @Autowired TestEntityManager entityManager;   // helper: persistAndFlush, find, clear

    @Test
    void derivedQueryFiltersByStatus() {
        entityManager.persistAndFlush(new Order("PAID"));
        entityManager.persistAndFlush(new Order("DRAFT"));

        assertThat(orderRepo.findByStatus("PAID")).hasSize(1);
    }
}
```

Each test method runs in a **transaction that rolls back** after the test — fast, isolated, no cleanup code. The slice is the right home for: derived-query correctness, JPQL syntax, mappings (columns/relations), and constraint behavior.

## H2 vs Postgres — the fidelity gap

`@DataJpaTest` defaults to **H2** (in-memory) — fast, zero setup, but *not* Postgres:

| | H2 | Postgres (Testcontainers) |
|---|---|---|
| Speed | instant | seconds per context |
| SQL dialect | H2 | real Postgres |
| Functions/types | `now()`, `uuid` differ | real |
| Partial indexes, JSONB, arrays | unsupported | supported |
| Prod-fidelity | medium | high |

**The org rule:** H2 for *fast everyday* repository tests (query shape, mappings); **Testcontainers-Postgres for anything touching Postgres-specific behavior** (partial indexes, `ON CONFLICT`, JSONB, window functions). The classic bug: a query that passes on H2 and fails on Postgres (or vice versa) — H2's dialect is *similar but not equal*.

```java
@DataJpaTest
@Testcontainers
class OrderRepositoryPostgresTest {
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }
    // ... the real-DB assertions
}
```

Teams often run **both**: an H2 suite in the fast path (every push) and the Testcontainers suite on the full pipeline or nightly. The fidelity decision is a review item: "does this test depend on Postgres behavior? then it needs the container."

## The flush/clear discipline in tests

JPA defers writes until flush. A test that saves and immediately asserts a *query* can see stale state:

```java
@Test
void saveThenQuery() {
    orderRepo.save(new Order("PAID"));
    // assert orderRepo.findByStatus("PAID") — may NOT find it yet!
    // (the INSERT is pending; the same persistence context may return it,
    //  a fresh query in another context might not — nondeterministic)
}
```

The fix — force the flush, and clear the context to simulate a fresh read:

```java
orderRepo.saveAndFlush(new Order("PAID"));      // INSERT now
entityManager.clear();                          // detach — next query is a real SELECT
assertThat(orderRepo.findByStatus("PAID")).hasSize(1);
```

`TestEntityManager.persistAndFlush` and `clear` are exactly for this. Tests that assert *query results* (not just object identity) should always flush + clear — otherwise they can pass vacuously against the in-memory context.

## What @DataJpaTest does and doesn't cover

- **Covers:** repository method derivation, JPQL syntax (validated at context load), mappings (columns, relations, cascade), constraint violations, `@Modifying` bulk queries.
- **Doesn't cover:** service orchestration (that's `@SpringBootTest`/unit tests), transactions across services (transactions-deep), the full HTTP stack (E2E tests), or `@EnableJpaAuditing` unless the slice picks up the config — add `@Import(JpaAuditingConfig.class)` or `@EnableJpaAuditing` when testing auditing.

**Auditing gotcha:** `@CreatedDate` needs the auditing configuration in the slice — a test that saves and asserts `createdAt` is null without `@Import`ing the auditing config fails confusingly.

## How we use it in an organization: the scenarios

**Scenario 1 — query-shape regression tests.** Every derived query and `@Query` with an important predicate gets a `@DataJpaTest`: the SQL is validated when the context loads (bad JPQL fails startup) and the result shape is asserted against real data.

**Scenario 2 — mapping contract tests.** New relationships, cascade config, and column definitions verified: "saving the aggregate persists the children", "orphanRemoval deletes the child", "unique constraint rejects duplicates" — the mapping decisions locked in by tests.

**Scenario 3 — Postgres-specific coverage.** Partial indexes (soft delete!), JSONB columns, and `ON CONFLICT` updates — the Testcontainers variant.

**Scenario 4 — bulk-query tests.** `@Modifying` update/delete semantics, including the "clear after bulk update" behavior — verified with the flush/clear discipline.

## Pitfalls

- **H2-only tests that pass but break prod** — dialect drift; use Testcontainers for Postgres-specific behavior.
- **Not flushing/clearing** — vacuous or flaky assertions against the persistence context.
- **`@DataJpaTest` + `@Transactional` services** — the slice rolls back per test; a service under test that commits inside its own transaction behaves differently. Test service transactions with `@SpringBootTest`, not the slice.
- **Replacing the database via `@AutoConfigureTestDatabase(replace = NONE)`** without providing a datasource — the context fails to start; provide the container/props.
- **Slow contexts** — each `@DataJpaTest` with different imports rebuilds a context; keep imports minimal and consistent so the context cache hits.

## Key takeaways

- `@DataJpaTest` boots only JPA — fast, transactional, rolled back per test.
- H2 for fast query/mapping tests; Testcontainers-Postgres for dialect-specific behavior.
- Always `flush` (or `saveAndFlush`) + `entityManager.clear()` before asserting query results.
- The slice covers repositories/mappings/JPQL — not services or the HTTP stack.
- Import auditing config explicitly when testing `@CreatedDate`/`@LastModifiedDate`.
