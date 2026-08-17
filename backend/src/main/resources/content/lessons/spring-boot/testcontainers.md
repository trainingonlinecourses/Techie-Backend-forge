---
title: Integration Testing with Testcontainers
summary: Real Postgres, Kafka, Redis and more in tests — spinning up disposable containers, wiring them to Spring contexts, and the JUnit 5 lifecycle.
order: 11
minutes: 16
topics: [testcontainers, integration testing, docker, test lifecycle, @ServiceConnection]
docs:
  - https://docs.spring.io/spring-boot/reference/testing/testcontainers.html
  - https://java.testcontainers.org/
---

# Integration Testing with Testcontainers

## Why Testcontainers

An in-memory database (H2) is *almost* production — until a Postgres-only feature or a subtle dialect difference bites you. Testcontainers starts the **real thing**: a disposable Docker container per test run, torn down automatically. Same container image as production → the test is the deployment's first rehearsal.

## The minimal setup

```java
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OrderRepositoryIT {

    @Container
    @ServiceConnection                    // Boot wires the datasource from the container's metadata
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void persistsAndLoads() {
        // repository.save(...); repository.findById(...) — against real Postgres
    }
}
```

`@ServiceConnection` (Boot 3.1+) reads the container's connection info and configures the matching `DataSource`/connection factory automatically — no hard-coded JDBC URL. Without it, you'd extract `getJdbcUrl()` manually into a `DynamicPropertySource`:

```java
@DynamicPropertySource
static void props(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", postgres::getJdbcUrl);
    r.add("spring.datasource.username", postgres::getUsername);
    r.add("spring.datasource.password", postgres::getPassword);
}
```

## Sharing containers across tests

Starting a container per test class is slow. The standard patterns:

- **Singleton container** — a static field in a base class; JUnit reuses it for the whole suite (classic approach, used before `@ServiceConnection`).
- **Per-class lifecycle** — fine when each class needs a different image (e.g. one for Postgres, one for Kafka).
- JUnit's **`@Testcontainers`** + static `@Container` fields = containers start once per *class*; instance fields = per test method.

## Testing more than the database

```java
@Container
@ServiceConnection
static KafkaContainer kafka = new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.6.0"));

@Container
@ServiceConnection
static RedisContainer redis = new RedisContainer(DockerImageName.parse("redis:7-alpine"));
```

The same pattern covers MongoDB, Elasticsearch, RabbitMQ, MySQL, even **`LocalStackContainer`** for AWS services. `@ServiceConnection` supports all of them — one annotation per container, zero manual config. That's how you integration-test the outbox pattern, the cache, and the event pipeline with their real peers.

## The testing pyramid, placed correctly

```
        e2e (few, slow)
      integration (some, Testcontainers)
    slice tests (@WebMvcTest, @DataJpaTest)
  unit tests (many, fast)
```

- **Unit** — a service with mocked collaborators: fast, cover logic branches.
- **Slice** — `@DataJpaTest` with Testcontainers replaces the default H2: repository SQL is exercised against real Postgres.
- **Integration** — `@SpringBootTest` + containers: the whole context, real infra, full flows (like this academy's own tests against the real API).
- **E2E** — the deployed system (your live Render/Vercel checks).

## Common pitfalls

| Pitfall | Fix |
|---|---|
| Tests pass locally, fail in CI (no Docker) | Ensure the CI runner has Docker (GitHub-hosted runners do). |
| Container reused but state leaked between tests | `@Transactional` rollback doesn't cover container state; clean tables in `@BeforeEach`. |
| Slow first run | `@ServiceConnection` + singleton containers; warm the image in CI (`docker pull` early). |
| Flaky container health | Use `withStartupTimeout(Duration.ofSeconds(60))` on slow images. |
| Fixed ports (`5432`!) | Let Testcontainers allocate **random** ports — fixed ports collide in CI. |

## Key takeaways

- Testcontainers runs the real infrastructure: no H2-vs-Postgres drift, and your tests double as a deploy rehearsal.
- `@Testcontainers` + static `@Container` + `@ServiceConnection` is the minimal, idiomatic wiring.
- Share containers across the suite; let them pick random ports; clean state between tests.
- Use it at the integration level — keep the fast unit/slice layers on top of it.

Official docs: [Spring Boot + Testcontainers](https://docs.spring.io/spring-boot/reference/testing/testcontainers.html) · [Testcontainers for Java](https://java.testcontainers.org/)
