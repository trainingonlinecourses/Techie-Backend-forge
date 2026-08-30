---
title: Testcontainers for Real Dependencies
module: spring-testing-advanced
order: 4
minutes: 25
topics: ["Testcontainers", "@ServiceConnection", "PostgreSQL", "Redis", "Kafka", "container lifecycle"]
docs:
  - title: "Testcontainers docs"
    url: "https://java.testcontainers.org/"
summary: Inmemory substitutes (H2 for Postgres, embedded Redis) drift from production. Testcontainers runs the real thing — actual Postgres, actual Redis, a...
---

# Testcontainers for Real Dependencies

In-memory substitutes (H2 for Postgres, embedded Redis) drift from production. Testcontainers runs **the real thing** — actual Postgres, actual Redis, actual Kafka — in disposable Docker containers, for the duration of your test. No drift, no setup, no leftovers.

## Why Not H2?

H2 is not Postgres:

- Different SQL dialect (Postgres-specific functions, JSONB, `ON CONFLICT` fail)
- Different constraint behavior (H2 is lax)
- Different index/optimizer behavior
- **You test against a database you don't run in production**

The drift means "passes in CI, fails in prod". Testcontainers eliminates the entire class.

## The Basic Setup

```java
@DataJpaTest
@Testcontainers
class CourseRepositoryTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres =
        new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired CourseRepository repository;
}
```

`@ServiceConnection` (Spring Boot 3.1+) auto-wires the container's connection into the context — no `spring.datasource.url` properties needed.

## Multiple Dependencies

```java
@SpringBootTest
@Testcontainers
class FullStackIntegrationTest {

    @Container @ServiceConnection
    static PostgreSQLContainer<?> postgres =
        new PostgreSQLContainer<>("postgres:16-alpine");

    @Container @ServiceConnection
    static GenericContainer<?> redis =
        new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

    @Container @ServiceConnection
    static KafkaContainer kafka = new KafkaContainer(DockerImageName
        .parse("confluentinc/cp-kafka:7.5.0"));

    @Autowired CourseRepository repository;
    @Autowired StringRedisTemplate redisTemplate;
    @Autowired KafkaTemplate<String, String> kafkaTemplate;
}
```

One context, three real dependencies, everything wired. Tests exercise the exact stack production runs.

## Testcontainers Lifecycle

| Strategy | Pattern |
|----------|---------|
| Per-class (`static @Container`) | One container shared across test methods — fast |
| Per-test (`@Container` instance field) | Fresh container each test — isolated, slow |
| Singleton (Spring Boot 3.1+) | `@ServiceConnection` on a static field |

The static pattern is the default: one container per test class, state reset between methods (via `@Transactional` rollback or explicit cleanup).

## Dynamic Properties (pre-@ServiceConnection)

For older setups, wire manually:

```java
@DynamicPropertySource
static void datasourceProps(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgres::getJdbcUrl);
    registry.add("spring.datasource.username", postgres::getUsername);
    registry.add("spring.datasource.password", postgres::getPassword);
}
```

## Reusing Containers Across Classes

```java
@Testcontainers(disabledWithoutDocker = true)
abstract class ContainerTestBase {

    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16");

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        // ...
    }
}
```

Extend `ContainerTestBase` from every JPA test — one container, many test classes.

## Testing Flyway Migrations

The killer use case: verify migrations apply cleanly to a fresh DB.

```java
@DataJpaTest
@Testcontainers
class MigrationTest {

    @Container @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @Autowired DataSource dataSource;

    @Test
    void schemaMatchesEntities() throws Exception {
        try (Connection conn = dataSource.getConnection()) {
            DatabaseMetaData meta = conn.getMetaData();
            assertTrue(tableExists(meta, "courses"));
            assertTrue(tableExists(meta, "lessons"));
        }
    }

    @Test
    void seededDataPresent() {
        jdbcTemplate.queryForObject(
            "SELECT count(*) FROM courses WHERE published = true", Integer.class);
    }
}
```

## Testing Kafka Flows

```java
@SpringBootTest
@Testcontainers
class OrderEventFlowTest {

    @Container @ServiceConnection
    static KafkaContainer kafka = new KafkaContainer(
        DockerImageName.parse("confluentinc/cp-kafka:7.5.0"));

    @Autowired KafkaTemplate<String, OrderEvent> kafkaTemplate;

    @Test
    void orderPlacedEventConsumed() throws Exception {
        kafkaTemplate.send("orders", new OrderEvent("o1", 2500)).get();

        // Await the consumer side (Testcontainers + Awaitility):
        await().atMost(Duration.ofSeconds(10))
            .untilAsserted(() ->
                assertEquals(1, orderListener.getProcessedCount()));
    }
}
```

`await()` (Awaitility) is essential for async flows — poll until the assertion holds, with a timeout.

## CI Considerations

```yaml
- name: Tests
  run: ./mvnw -B verify
  env:
    TESTCONTAINERS_RYUK_DISABLED: "true"   # don't kill containers after (CI cleanup)
```

- CI runners need Docker (GitHub Actions ubuntu runners have it).
- `disabledWithoutDocker = true` skips containers gracefully on machines without Docker.
- Cache images: pull `postgres:16-alpine` etc. in a warm-up step to avoid per-test pulls.

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Tests hang pulling images | Pre-pull in CI, use `-alpine` images |
| Port conflicts | Containers get random host ports automatically |
| Container left running | Testcontainers reaper (Ryuk) cleans up |
| Slow first run | One static container per class, not per test |
| No Docker in CI | `disabledWithoutDocker = true` or run Docker-in-Docker |
| Secrets in containers | Use env vars, not defaults |

## Summary

| Substitute | Real (Testcontainers) |
|------------|----------------------|
| H2 | PostgreSQL 16 |
| Embedded Redis | Redis 7 |
| Embedded Kafka | Confluent Kafka |
| Fake S3 | LocalStack |

Testcontainers turns "the tests pass but prod breaks" into "the tests run against prod's actual dependencies". The cost — a few seconds of container startup — is repaid the first time a Postgres-only SQL bug is caught in CI instead of production.
