---
title: Test Property Sources — @TestPropertySource and @DynamicPropertySource
summary: The property override mechanisms for tests, precedence vs application files, and the dynamic-port pattern for Testcontainers.
order: 10
minutes: 16
topics: [testpropertysource, dynamicpropertysource, test-properties, property-override, testcontainers-ports]
docs:
  - https://docs.spring.io/spring-framework/reference/testing/testcontext-framework/ctx-management.html
  - https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html
---

# Test Property Sources — @TestPropertySource and @DynamicPropertySource

## The concept: tests need different config, cleanly

Tests must point at test databases, stub URLs, and in-memory services — without touching production config files. Spring's test framework gives three mechanisms, in increasing power:

1. **`@SpringBootTest(properties = "...")`** — inline key/value overrides for one test class.
2. **`@TestPropertySource`** — point at a properties file (`classpath:test.properties`) or inline values.
3. **`@DynamicPropertySource`** — register property values *at runtime*, from code — the pattern for Testcontainers (ports are only known after the container starts).

```java
@SpringBootTest(properties = {
    "app.features.new-checkout=false",      // per-class inline override
    "app.retry.max=1"                       // speed up retry-heavy tests
})
class CheckoutTest { ... }
```

`@TestPropertySource` adds a whole file:

```java
@TestPropertySource(locations = "classpath:test.properties")
// or inline:
@TestPropertySource(properties = "app.db.url=jdbc:h2:mem:test")
class OrderServiceTest { ... }
```

## Precedence — where test properties sit

Test property sources are added with **higher precedence than `application.properties`** (but below command-line args and some env sources). So a test override *wins* over the app's config file — exactly what you want — while still letting environment-level sources (real env vars) override the test if needed.

The practical effect: `application-test.properties` (profile-based) vs `@TestPropertySource` (test-class-based) both work; the class-level annotation is more explicit about what a *specific* test needs, the profile file is shared by many tests.

## @DynamicPropertySource — the Testcontainers pattern

The container's port isn't known until the container starts, so the property must be registered *dynamically*:

```java
@DataJpaTest
@Testcontainers
class OrderRepositoryTest {
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @DynamicPropertySource
    static void datasourceProps(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }
}
```

The `registry.add(key, supplier)` form is key: the supplier is called **lazily** when the property is first resolved — which is after the container has started and its port is known. This is the canonical way to wire Testcontainers into Spring tests, and it works for Redis, Kafka, Elasticsearch, and every other containerized dependency.

## How we use it in an organization: the scenarios

**Scenario 1 — per-class behavior overrides.** One test class exercises the "feature flag off" path, another "on" — `properties = "app.features.x=false"` per class, no shared mutable state.

**Scenario 2 — the shared test profile.** Many tests share `application-test.properties` (in-memory DB, stub URLs, short timeouts), activated via `@ActiveProfiles("test")` — the team default for the fast suite.

**Scenario 3 — Testcontainers wiring.** `@DynamicPropertySource` for every containerized dependency — the pattern above, repeated per service (Postgres, Redis, Kafka, Elasticsearch).

**Scenario 4 — deterministic time.** Tests that need a fixed `Clock`/time zone override the property or inject a `Clock` bean — deterministic date-dependent logic.

## The pitfalls

- **`@DynamicPropertySource` methods must be static** — a non-static method fails with a clear error; the registry pattern requires static access.
- **Precedence confusion** — a test override *not* taking effect usually means a higher-precedence source (env var, command line) is winning; check the property source order (see the Environment lesson).
- **`application-test.properties` silently stale** — a shared test file drifts from what individual tests need; the class-level override is the escape hatch.
- **Secrets in test files** — test property files can carry dummy credentials; keep them clearly fake and never point tests at real prod-like secrets.
- **Testcontainers + `@DynamicPropertySource` with a shared context** — the container is per-class (static); tests sharing a cached context must not assume different containers.

## Key takeaways

- Three mechanisms: inline `properties`, `@TestPropertySource` (files/inline), `@DynamicPropertySource` (runtime values).
- Test property sources outrank `application.properties` — clean overrides without touching app config.
- `@DynamicPropertySource` + lazy suppliers is the Testcontainers wiring pattern.
- Use per-class `properties` for behavior toggles; a shared `application-test.properties` for the common fast suite.
- Watch precedence, keep test files free of real secrets, and keep the methods static.
