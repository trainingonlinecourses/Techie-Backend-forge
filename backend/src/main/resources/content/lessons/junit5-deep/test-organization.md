---
title: Test Organization — Unit, Integration, and the Testing Pyramid
module: junit5-deep
order: 5
minutes: 25
topics: ["testing pyramid", "unit tests", "integration tests", "test naming", "naming conventions", "test strategy"]
docs:
  - title: "The Practical Test Pyramid (Martin Fowler)"
    url: "https://martinfowler.com/articles/practical-test-pyramid.html"
  - title: "Unit Testing Principles (Pragmatic Programmer)"
    url: "https://pragprog.com/titles/utp2/unit-testing-principles-practices-and-patterns/"
summary: A test suite isn't "a bunch of tests" — it's a portfolio with a strategy. The testing pyramid is the strategy the industry converged on: many fast ...
---

# Test Organization — Unit, Integration, and the Testing Pyramid

## The Concept: Tests Are a Portfolio, Not a Pile

A test suite isn't "a bunch of tests" — it's a *portfolio with a strategy*. The **testing pyramid** is the strategy the industry converged on: **many fast unit tests** at the base, **fewer integration tests** in the middle, **a handful of end-to-end tests** at the top. Each layer trades speed for confidence, and the shape — wide at the bottom, narrow at the top — reflects what each layer is *for*.

**The mental model:** unit tests are the factory's component checks — fast, isolated, each verifying one part. Integration tests are the assembly-line test — parts connected, one real boundary (database, HTTP) exercised. End-to-end tests are the test drive — the whole car on the road, slow and expensive, done rarely. The ratio exists because speed determines how often tests run: the fast layer runs on every keystroke (well, every commit), the slow layer runs only on release candidates. If the pyramid is inverted (mostly E2E), CI takes hours and nobody runs the tests — the suite dies.

## The Layers

**Layer 1 — Unit tests (the base, ~70%).** One class, dependencies mocked, milliseconds to run. They verify *logic*: a service's business rules, a utility's edge cases, a mapper's field mapping. They run on every commit, in seconds.

**Layer 2 — Integration tests (the middle, ~20%).** One real boundary: a repository against a real (containerized) database, a controller against MockMvc with a real context, a message consumer against a real broker. They verify *contracts* — the code works with the actual infrastructure, not just the mock. Slower (seconds each), run per-commit or per-PR.

**Layer 3 — End-to-end tests (the top, ~10%).** The whole system: UI through the API to the database. They verify the *user journeys* — "sign up, create a lesson, mark it complete." Slow, brittle, expensive — a handful, run on release candidates and major changes.

**The rule of the pyramid:** if a test *can* be a fast unit test, it should be. E2E tests are for journeys no lower layer can cover — not for logic that belongs in a unit test.

## Test Naming: The Specification Convention

The highest-leverage organizational habit is *naming*: a well-named test is executable documentation. The convention that works:

```java
// Naming = a sentence: methodUnderTest_scenario_expectedResult
// or the behavior-first style: should_expected_when_condition
class PaymentServiceTest {

    @Test
    void charge_declinedCard_throwsPaymentDeclined() {
        // ...reads like a spec line: "charge with a declined card
        // throws PaymentDeclined"
    }

    @Test
    void charge_validCard_deductsBalance() { }

    @Test
    void refund_overRefund_throwsIllegalArgument() { }
}
```

**The three rules:** name the *behavior* (not the implementation), state the *scenario* and the *expectation* explicitly, and let the report read like a specification — "charge valid card deducts balance" tells a reviewer what the system guarantees. (JUnit 5's `@DisplayName` gives you full sentences with spaces for reports: `@DisplayName("charging a declined card throws PaymentDeclined")`.)

## The Structure: Given-When-Then

Every test should follow the same three-part skeleton — the Arrange-Act-Assert (GWT) pattern:

```java
@Test
void charge_overDailyLimit_throwsLimitExceeded() {
    // GIVEN (arrange) — set up the world:
    Account account = new Account(balance = 1000);
    account.setDailyLimit(500);
    when(accountRepo.findById("a1")).thenReturn(account);

    // WHEN (act) — the single action under test:
    service.charge("a1", 600);

    // THEN (assert) — the observable outcome:
    assertThrows(DailyLimitExceededException.class,
                 () -> service.charge("a1", 600));
}
```

**The discipline:** one *when* per test (one action, one behavior under test); the given establishes the preconditions; the then verifies the outcome. Tests that violate it — four actions, ten assertions, setup sprawled through the body — are the ones that break confusingly. (And the mock interaction *verification* belongs in the then, not scattered: `verify(repo).save(any());`.)

## Organizing the Code

**The file convention:** one test class per production class, named `XxxTest`, in the same package under `src/test/java` — the Maven/Gradle default that makes discovery automatic (`mvn test`, Surefire finds `*Test.java`). For behavior-focused suites: one test class per *behavior cluster* (`PaymentServiceTest` with nested `@Nested` classes for "when card is declined", "when daily limit exceeded").

**The package rule:** tests live in the *same package* as the code they test — that's what gives access to package-private members (a legitimate test seam) and keeps imports clean.

## The Spring Boot Test Slices

Spring Boot's testing story is the pyramid made practical — **test slices** that spin up only the context slice a test needs:

```java
// Fast-ish unit-ish — the service layer, with mocks, NO Spring context:
class PaymentServiceTest {
    @Mock PaymentRepo repo;
    @InjectMocks PaymentService service;
    // ...pure unit test, milliseconds
}

// Integration slice — a real Spring context, but ONLY the web layer:
@WebMvcTest(PaymentController.class)     // controller + MVC machinery
class PaymentControllerTest {
    @MockBean PaymentService service;     // the service is mocked
    @Autowired MockMvc mockMvc;           // real HTTP-ish layer
    // ...the controller's mapping/serialization/validation, in seconds
}

// Integration slice — ONLY the data layer, real DB (H2 or Testcontainers):
@DataJpaTest
class PaymentRepositoryTest {
    @Autowired PaymentRepo repo;
    // ...real SQL against a real (containerized) database
}

// The full integration test — the whole context, the top of the pyramid:
@SpringBootTest
@AutoConfigureMockMvc
class PaymentApiIntegrationTest {
    // ...the whole app, real everything, slowest
}
```

**The slice philosophy** (covered deeply in the spring-testing-advanced module): use the *smallest* context that exercises the layer under test. A `@WebMvcTest` is faster than `@SpringBootTest` because it loads only the web slice; `@DataJpaTest` loads only the data layer. The pyramid becomes a *context-size* decision: the lower the layer, the smaller (and faster) the context it needs.

## The Test Strategy Checklist

1. **Shape the pyramid:** 70% unit / 20% integration / 10% E2E — and keep it that way as the codebase grows.
2. **Name behavior, structure given-when-then** — the suite reads as documentation.
3. **Mock at unit level, use real infrastructure at integration level** — mocks of `RestTemplate` are fine; mocks of the *database* hide SQL bugs.
4. **Use Spring test slices** to keep integration fast — smallest context per layer.
5. **Keep unit tests under a second each** — speed is what keeps the base of the pyramid exercised.
6. **Treat the E2E suite as precious** — a handful of journeys, run deliberately.

## Recap

Test organization is strategy, not housekeeping: the **testing pyramid** — many fast unit tests, fewer integration tests, a handful of E2E tests — encodes the speed/confidence trade-off that keeps suites alive. Naming tests as behavior sentences and structuring them as given-when-then makes the suite executable documentation. Files follow the one-class-per-test convention; Spring Boot's **test slices** (`@WebMvcTest`, `@DataJpaTest`, `@SpringBootTest`) make each layer's tests as fast as the layer allows. The habits — mock only what the layer needs, use real infrastructure at boundaries, keep the base fast — are what separate a suite that protects a codebase from a pile of tests that nobody runs.
