---
title: JUnit 5 — The Test Framework
summary: Lifecycle, @Test and friends, assertions, the test runner, and how Spring Boot's starter wires JUnit into Maven — the vocabulary every test speaks.
order: 1
minutes: 16
topics: [junit5, testing, lifecycle, assertions, test structure]
docs:
  - https://junit.org/junit5/docs/current/user-guide/
  - https://docs.spring.io/spring-boot/reference/testing/index.html
---

# JUnit 5 — The Test Framework

## The three sub-projects

JUnit 5 is a platform plus two programming models:

- **JUnit Platform** — the launcher that runs tests (what Maven/Gradle/IDEs talk to).
- **JUnit Jupiter** — the `@Test`-based API you write against (this lesson).
- **JUnit Vintage** — runs JUnit 4 tests on the new platform (for migrations).

Spring Boot's `spring-boot-starter-test` brings Jupiter, AssertJ, Mockito, MockMvc/WebTestClient and more — one dependency, everything for backend tests.

## The anatomy of a test

```java
class OrderServiceTest {

    private OrderService service;

    @BeforeEach                          // fresh state per test — isolation is the point
    void setUp() { service = new OrderService(new InMemoryOrderRepo()); }

    @AfterEach
    void tearDown() { /* cleanup */ }

    @Test
    void createsOrderWithComputedTotal() {
        Order o = service.create(List.of(new Line(2, new BigDecimal("9.99"))));

        assertEquals(new BigDecimal("19.98"), o.total());
        assertNotNull(o.id());
    }
}
```

The lifecycle in order: `@BeforeAll` (once, static) → `@BeforeEach` → `@Test` → `@AfterEach` → `@AfterAll` (once, static). **Each test runs on a fresh instance** — that's what makes tests independent and parallel-safe.

## Assertions: the failure messages matter

```java
assertEquals(expected, actual);            // use for values
assertNotEquals, assertNull, assertNotNull, assertTrue, assertFalse
assertSame(a, b);                           // identity — use deliberately
assertThrows(IllegalArgumentException.class, () -> service.create(null));  // exceptions!
assertTimeout(Duration.ofMillis(100), () -> service.slowOp());             // performance guard

// Always add a message for complex asserts:
assertTrue(orders.stream().allMatch(o -> o.status() == PENDING),
    "all created orders should start PENDING, got: " + orders);
```

**A failing assertion without a message is a debugging session waiting to happen.** For richer assertions (lists, maps, exception details) the project uses AssertJ — the next lesson.

## Display names, disabling, tagging

```java
@DisplayName("Order creation")
@Tag("unit")                 // run groups: -Dgroups=unit (JUnit 5) or includeTags in Gradle
class OrderServiceTest {

    @Test
    @DisplayName("computes total from line quantities and unit prices")
    void total() { ... }

    @Test
    @Disabled("flaky — re-enable after the tax refactor (JIRA-123)")
    void taxEdgeCase() { ... }
}
```

`@Disabled` with a reason, not a silence — the reason is what lets a future dev know whether to fix or delete.

## Nested tests and the ClassNameTest convention

```java
@Nested
class ValidationTests {
    @Test void rejectsNullCustomer() { ... }
    @Test void rejectsNegativeAmount() { ... }
}

@Nested
class MoneyTests {
    @Test void formatsWithTwoDecimals() { ... }
}
```

`@Nested` groups give you readable test reports (like sections in a spec). Convention: test class `OrderServiceTest` next to `OrderService`, same package — Maven's Surefire picks up `*Test`, `Test*`, `*Tests`, `*TestCase` by default.

## Running in Maven

```xml
<!-- spring-boot-starter-parent manages the versions -->
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-test</artifactId>
  <scope>test</scope>
</dependency>
```

```bash
mvn test                      # all unit tests (fast, no app context)
mvn test -Dtest=OrderServiceTest   # one class
mvn test -Dgroups=integration      # tagged tests only
mvn verify                   # + integration tests (failsafe) before packaging
```

Surefire (unit, `*Test`) and Failsafe (integration, `*IT`) are the two gates: `mvn test` runs fast unit tests, `mvn verify` adds the slow ones. In this academy, the deploy pipeline relies on the backend compiling + the live e2e checks.

## What makes a good unit test

1. **One behavior per test** — the test name is a sentence about a behavior, not a method.
2. **Isolated** — no shared mutable state, no database/network (that's integration territory).
3. **Fast** — a unit test suite runs in seconds; if it doesn't, it's an integration test wearing a unit-test costume.
4. **Tests the contract, not the implementation** — refactor-safe: `assertEquals(total)` survives an internal rewrite; asserting "method X was called with Y" (Mockito) pins implementation and should be used sparingly.
5. **Red, green, refactor** — see the TDD lesson; a test you've never seen fail proves nothing.

## Key takeaways

- JUnit 5 = Platform + Jupiter; Spring Boot's starter wires it with AssertJ/Mockito ready.
- `@Test` + lifecycle (`@BeforeEach`…) + assertions with messages; fresh instance per test.
- `@DisplayName`, `@Tag`, `@Nested`, `@Disabled(reason)` make the report readable.
- Surefire runs `*Test` on `mvn test`; Failsafe runs `*IT` on `mvn verify`.
- Fast, isolated, behavior-named tests — the suite is the safety net that makes refactoring cheap.

Official docs: [JUnit 5 User Guide](https://junit.org/junit5/docs/current/user-guide/) · [Spring Boot Testing](https://docs.spring.io/spring-boot/reference/testing/index.html)
