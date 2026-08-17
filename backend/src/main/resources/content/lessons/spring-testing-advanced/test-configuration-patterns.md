---
title: Test Configuration & Isolation Patterns
module: spring-testing-advanced
order: 5
minutes: 22
topics: ["@TestConfiguration", "@MockBean", "profile isolation", "context caching", "random ports", "flaky test prevention"]
docs:
  - title: "Testing configuration"
    url: "https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html"
---

# Test Configuration & Isolation Patterns

The hardest part of testing Spring isn't writing assertions — it's **configuring the context** so tests are fast, isolated, and deterministic. This lesson covers `@TestConfiguration`, bean mocking, profile isolation, context caching, and the patterns that keep suites from going flaky.

## @TestConfiguration: Test-Only Beans

Add beans only tests need, without polluting production config:

```java
@WebMvcTest(CourseController.class)
class CourseControllerTest {

    // registered as an inner static class = applied automatically
    @TestConfiguration
    static class TestConfig {
        @Bean
        CourseMapper courseMapper() {
            return new CourseMapper();   // needed by the controller under test
        }
    }

    @Autowired MockMvc mockMvc;
    @MockBean CourseService courseService;
}
```

**Inner `@TestConfiguration` classes are applied automatically** to the enclosing test. Standalone classes must be imported:

```java
@TestConfiguration
public class TestClockConfig {
    @Bean
    Clock clock() { return Clock.fixed(Instant.parse("2026-08-18T10:00:00Z"),
        ZoneOffset.UTC); }
}

// usage:
@Import(TestClockConfig.class)
class ExpiringTokenTest { ... }
```

The fixed `Clock` bean is a classic: tests for expiry, TTL, and time-based logic become deterministic.

## @MockBean vs. @MockitoBean

```java
@MockBean CourseService courseService;      // Spring Boot 3.4+ replaces MockBean
// or, modern:
@MockitoBean CourseService courseService;
```

Both replace the real bean in the context with a Mockito mock. Consequences:

- The context **changes** → new context cached for tests sharing the same mock set.
- Every mock reset between tests.
- Only use where the slice needs it — prefer real beans in integration tests.

**The context-caching trap**: each *different* combination of `@MockBean`s creates a new application context (expensive). Keep mock sets consistent across test classes:

```java
// Base class declares all mocks once → every subclass reuses the context
@WebMvcTest
abstract class WebMvcTestBase {
    @MockBean CourseService courseService;
    @MockBean LessonService lessonService;
}
```

## @SpyBean: Real Bean, Selective Stubbing

```java
@SpyBean PaymentGateway gateway;    // real implementation, spy on top

@Test
void fallsBackWhenGatewayFails() {
    doThrow(new GatewayException("down"))
        .when(gateway).charge(any());

    Order order = checkoutService.checkout(cart);

    assertNotNull(order.getFallbackStatus());
}
```

Unstubbed methods run for real; stubbed ones are intercepted.

## Profiles: Isolate Environments

```java
@SpringBootTest
@ActiveProfiles("test")
class IntegrationTest { ... }
```

```yaml
# application-test.yml
spring:
  datasource:
    url: jdbc:tc:postgresql:16:///db   # Testcontainers JDBC URL
  task:
    scheduling:
      enabled: false                    # no background jobs in tests
  jackson:
    default-property-inclusion: non_null
```

## Disabling Background Work

Scheduled tasks and message listeners make tests flaky. Turn them off:

```java
@SpringBootTest(
    properties = {
        "spring.task.scheduling.enabled=false",
        "app.jobs.cache-refresh-enabled=false"
    })
class ServiceTest { ... }
```

## Random Ports for Real HTTP

```java
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
class HttpEndpointTest {

    @LocalServerPort
    int port;

    @Autowired TestRestTemplate restTemplate;   // pre-configured for the port

    @Test
    void healthIsUp() {
        ResponseEntity<String> resp =
            restTemplate.getForEntity("/actuator/health", String.class);
        assertTrue(resp.getBody().contains("\"status\":\"UP\""));
    }
}
```

`RANDOM_PORT` avoids port collisions across parallel test runs.

## Test Data: The Builder Pattern

Factories beat scattered `new` calls:

```java
public final class TestData {

    public static Course course(String title) {
        return Course.builder()
            .title(title)
            .level("BEGINNER")
            .minutes(25)
            .published(true)
            .build();
    }

    public static Course course() { return course("Default Course"); }
}
```

```java
@Test
void filtersByLevel() {
    repository.save(TestData.course("Java"));
    repository.save(TestData.course("Spring").withLevel("ADVANCED"));
    ...
}
```

## Reset and Isolation

- **`@Transactional` tests** — JPA tests roll back automatically; state never leaks.
- **`@DirtiesContext`** — nukes the context after the test. Slow; use sparingly (static state, singleton caches).
- **`@Sql`** — seed/cleanup SQL per test:

```java
@Test
@Sql("/sql/seed-courses.sql")
void listsSeededCourses() { ... }

@Test
@Sql(statements = "DELETE FROM lessons", executionPhase = AFTER_TEST_METHOD)
void cleansUp() { ... }
```

## Preventing Flaky Tests

| Flakiness source | Fix |
|------------------|-----|
| Shared mutable state | Fresh test data per test, `@Transactional` |
| Background jobs | Disable scheduling in tests |
| Real network calls | Stub with MockRestServiceServer |
| Time-dependent logic | Fixed `Clock` bean |
| Async timing | Awaitility `await().atMost(...)` |
| Parallel DB contention | One container per class, rollback between |
| Port collisions | `RANDOM_PORT` |
| Order dependence | Never rely on test order — each test self-sufficient |

## Test Suite Strategy

```
Fast lane (every commit):
  Unit tests + @WebMvcTest slices       ← seconds

Medium lane (CI):
  @DataJpaTest + Testcontainers         ← minutes

Slow lane (pre-release):
  @SpringBootTest full-stack + e2e      ← the safety net
```

## Summary

| Pattern | Use for |
|---------|---------|
| `@TestConfiguration` | Test-only beans, fixed clocks |
| `@MockBean`/`@MockitoBean` | Replace dependencies in slices |
| `@SpyBean` | Real bean with selective stubs |
| `@ActiveProfiles("test")` | Environment-specific config |
| `RANDOM_PORT` + TestRestTemplate | Real HTTP integration tests |
| `@Sql` | Deterministic data setup |
| Awaitility | Async assertions |
| Base-class mocks | Context reuse, fast suites |

Test configuration is where suites are won or lost: shared contexts keep them fast, fixed clocks keep them deterministic, and disabled background work keeps them stable. Get these patterns right and your tests become something you *trust*.
