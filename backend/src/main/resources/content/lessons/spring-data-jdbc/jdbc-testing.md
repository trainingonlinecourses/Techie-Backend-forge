---
title: Testing Spring Data JDBC — DataJdbcTest and Testcontainers
module: spring-data-jdbc
order: 5
minutes: 25
topics: ["@DataJdbcTest", "Testcontainers", "repository tests", "test slices", "H2 vs Postgres"]
docs:
  - title: "@DataJdbcTest (Spring Boot docs)"
    url: "https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html#testing.spring-boot-applications.autoconfigured-spring-data-jdbc"
---

# Testing Spring Data JDBC — DataJdbcTest and Testcontainers

## The Concept: Test the Repository Against a Real Database

Repository tests are the most valuable and the most error-prone layer: they must verify that your derived queries match the schema, that aggregates save and load correctly, and that SQL is valid. The two big questions:

1. **What database do I test against?**
2. **How do I keep tests fast, isolated, and reliable?**

Spring Boot's answer to #1 is the **`@DataJdbcTest` slice**: a focused test that loads only the JDBC stack (repositories, `JdbcTemplate`, `DataSource` config) — no controllers, no services, no security — then runs against a database and **rolls back** each test's changes automatically.

The answer to #2 (in production-quality setups) is **Testcontainers**: run a real Postgres in a throwaway Docker container per test run. You test against *the actual database you deploy to* — catching dialect and constraint issues H2 would miss.

## Why "Just Use H2" Is Tempting but Risky

H2 in-memory is fast and needs no Docker — but it's a *different* database:

- Postgres-specific SQL in `@Query` (e.g., `ILIKE`, `jsonb`, `DISTINCT ON`, `FOR UPDATE`) fails or behaves differently.
- Constraint and type behaviors differ (serial vs identity, `text` vs `varchar`).
- Your tests pass on H2 and break on Postgres in production — the classic "works on my machine" for databases.

The industry answer: **test against Postgres** (Testcontainers), use H2 only for throwaway smoke tests or when you consciously accept the drift.

## The Code Walkthrough

```java
// ---- 1. The slice test ----
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.data.jdbc.DataJdbcTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;

@Testcontainers
@DataJdbcTest                       // loads only the JDBC stack
class CourseRepositoryTest {

    // ---- 2. A real Postgres in Docker, wired automatically ----
    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @Autowired
    CourseRepository courses;

    @Test
    void savesAndLoadsAggregate() {
        Course course = new Course("Spring Data JDBC");
        course.addLesson("Aggregates", 20);
        course.addLesson("Queries", 15);

        courses.save(course);

        Course loaded = courses.findById(course.getId()).orElseThrow();
        assertThat(loaded.getTitle()).isEqualTo("Spring Data JDBC");
        assertThat(loaded.getLessons()).hasSize(2);     // children came with the root
    }

    @Test
    void derivedQueryMatchesSchema() {
        Course a = new Course("Advanced Java");
        courses.save(a);

        List<Course> hits = courses.findByTitleContaining("Java");
        assertThat(hits).hasSize(1);
        assertThat(hits.get(0).getTitle()).isEqualTo("Advanced Java");
    }
}
```

### Walking Through Each Part

**`@DataJdbcTest`** — the slice annotation: only JDBC-related beans load (repositories, `JdbcTemplate`, JDBC auto-config). Tests start fast and stay focused. **Each test is transactional and rolls back** — no cleanup code needed, tests are independent.

**Testcontainers `@Container` + `@ServiceConnection`** — starts a real Postgres 16 container once for the test class; `@ServiceConnection` (Boot 3.1+) auto-configures the `DataSource` from the container — no connection-string plumbing. The tests run against exactly the database your app runs against in production.

**The aggregate round-trip test** — save a `Course` with two lessons, load it back, assert the children came with the root. This is *the* core behavior to pin down: aggregate persistence, including child tables (`course_lesson`).

**The derived-query test** — pins the generated SQL against the real schema. If the property name maps to a non-existent column or the LIKE behavior differs, this test catches it.

## Testing the Whole Stack — @SpringBootTest

When you need services + transactions + the full context (not just the slice):

```java
@SpringBootTest
@Testcontainers
class OrderServiceTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @Autowired
    OrderService orders;

    @Test
    @Transactional                       // roll back after the test
    void placesOrderWithLines() {
        Order order = orders.placeOrder(1L, List.of(
                new OrderLineRequest("Course A", 1, new Money(BigDecimal.TEN, "USD"))));
        assertThat(order.getLines()).hasSize(1);
        assertThat(order.getTotal().amount()).isEqualByComparingTo("10.00");
    }
}
```

Rule of thumb: **unit tests for services with mocked repositories; `@DataJdbcTest` for repository behavior; `@SpringBootTest` for integration flows** — don't boot the whole app to test one query.

## Schema Management in Tests

Tests need the schema. Options:

1. **Flyway migrations run against the Testcontainers DB** — the tests use the *same* migrations as production. This is the gold standard: migrations are tested before they ever hit prod.

```java
@DataJdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class ... {
    @Container @ServiceConnection static PostgreSQLContainer<?> postgres = ...;
    // Flyway auto-runs the migrations; schema is production-identical
}
```

2. **`spring.sql.init`** — simple `schema.sql`/`data.sql` for throwaway tests.

## The Testing Pyramid for Persistence

| Layer | Test | What it verifies |
|---|---|---|
| Repository | `@DataJdbcTest` + Testcontainers | Derived queries, aggregate round-trips, `@Query` SQL |
| Service | Unit test + mocked repo | Business logic, transaction boundaries |
| Integration | `@SpringBootTest` + Testcontainers | The full flow against a real DB |

Skip levels deliberately: if your derived query has never run against Postgres, it hasn't been tested.

## Common Beginner Pitfalls

1. **H2-only testing** — SQL drift silently; use Testcontainers for real coverage.
2. **`@DataJdbcTest` with a service dependency** — the slice doesn't load services; inject repositories directly (that's the point).
3. **Forgetting `@Transactional` on service tests** — changes leak between tests; each test should roll back.
4. **Docker not available on CI** — set up Docker on CI runners (GitHub Actions has it); Testcontainers is the standard for this reason.
5. **Slow test suites** — one shared container per class (as shown) instead of per-test containers.
6. **Asserting on generated SQL rather than behavior** — test what the repository *does*, not implementation details of the SQL.

## Key Takeaways

- `@DataJdbcTest` loads only the JDBC stack; each test rolls back automatically.
- Testcontainers gives you a real Postgres — the SQL you test is the SQL you deploy.
- `@ServiceConnection` wires the container's DataSource for free.
- Test aggregates round-trip (children come with the root) and derived queries against the real schema.
- Run Flyway migrations in tests so migrations are validated pre-production.
- Pyramid: unit (mocked) → slice (`@DataJdbcTest`) → integration (`@SpringBootTest`).
