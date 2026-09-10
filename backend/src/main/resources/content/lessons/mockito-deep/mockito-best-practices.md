---
title: Mockito Best Practices — Design, Strictness, and Testability
module: mockito-deep
order: 3
minutes: 24
topics: ["best practices", "testability", "strict stubs", "design for testing", "anti-patterns", "mockito hygiene"]
summary: Here's the uncomfortable truth about mocking: how much mocking your tests require is a direct measurement of your code's design. Code with clear se...
docs:
  - title: "Mockito Best Practices (site.mockito.org)"
    url: "https://site.mockito.org/"
  - title: "Mocking — Kent Beck's advice"
    url: "https://www.martinfowler.com/bliki/TestDouble.html"
---

# Mockito Best Practices — Design, Strictness, and Testability

## The Concept: Mocks Are a Design Report Card

Here's the uncomfortable truth about mocking: **how much mocking your tests require is a direct measurement of your code's design.** Code with clear seams (constructor injection, small collaborators, explicit boundaries) needs little mocking. Code that's hard to test (hidden dependencies, static calls, god objects) needs mocking gymnastics — and every gymnastics session is a design debt payment. This lesson is the professional discipline: write mocks that document intent, use strictness as a linter, and treat "this is hard to mock" as a design signal, not a test problem.

## Rule 1: Constructor Injection Is the Testability Foundation


**What this code does — step by step:**

1. HARD to test — the dependency is created inside the method:
2. `EmailClient client = new EmailClient();` — no seam!
3. EASY to test — the dependency arrives via the constructor:
4. `public EasyToTestService(EmailClient client) {` — the seam
5. The test then needs ONE line: EasyToTestService service = new EasyToTestService(mockClient);

The same code, clean:

```java
class HardToTestService {
    public void sendReport() {
        EmailClient client = new EmailClient();
        client.send("report");
    }
}

class EasyToTestService {
    private final EmailClient client;
    public EasyToTestService(EmailClient client) {
        this.client = client;
    }
    public void sendReport() {
        client.send("report");
    }
}
```

**The rule:** dependencies enter through the **constructor** (or an explicit setter — never via `new` inside methods or static singletons). This is the single highest-leverage testability practice, and it's exactly what Spring's constructor injection enforces in production code — the framework's design philosophy *is* the testability philosophy. When you see a class that's awkward to mock, the fix is usually in the class, not the test.

## Rule 2: Strict Stubbing Is Your Linter

Mockito's JUnit 5 extension defaults to **strict stubs** — and you should keep it that way:

@ExtendWith(MockitoExtension.class)   // strict by default
class ServiceTest {
    @Mock Collaborator collab;

    @Test
    void works() {
        when(collab.help()).thenReturn(1);
        when(collab.unused()).thenReturn(99);   // NEVER called
        // -> with strict stubs, this test FAILS with "unnecessary stubbings":
        //    the unused stub is dead code in the test, hiding rot.
    }
}

**Why strictness matters:** an unused stub means the test's *setup describes behavior the code no longer performs* — a stale expectation that will eventually mislead (the stub "documents" a call that doesn't happen, and a future refactor may silently break the real contract). Strict stubs fail the test immediately, forcing cleanup. The rule: **stub exactly what the path under test uses** — no more. (The escape hatch for genuinely conditional stubs is `lenient()`: `lenient().when(...)...` — use it sparingly and knowingly.)

## Rule 3: Verify Behavior, Not Implementation


**What this code does — step by step:**

1. GOOD — verifies the OBSERVABLE contract:
2. QUESTIONABLE — verifies incidental implementation details:
3. `verify(repo, times(1)).findById(1L);` — does the call count matter?
4. `verify(metrics).record("cache.hit");` — implementation detail?
5. The test should pin the BEHAVIOR ("a pending order was saved"),. Not the internal choreography. Over-verification makes every. Refactor break tests that weren't testing anything real.

The same code, clean:

```java
verify(repo).save(argThat(o -> o.status().equals("PENDING")));

verify(repo, times(1)).findById(1L);
verify(metrics).record("cache.hit");
```

**The discipline:** verify interactions that are *contractual* — "the payment was captured," "the audit entry was written," "the cache was invalidated." Skip the incidental — helper call counts, intermediate method invocations, logging. When a refactor that changes no behavior breaks your tests, the tests were over-verified.

## Rule 4: Don't Mock What You Don't Own

The hierarchy of what to mock:

1. **Mock external boundaries** — repositories, HTTP clients, message producers, the clock. You don't own their internals, and you must control them in tests.
2. **Never mock value objects, records, or DTOs** — they have no behavior; real instances are trivial and truthful.
3. **Never mock your own business classes to test their own logic** — mock the *collaborators* of the class under test, never the class itself (except spy-partial cases).
4. **Never mock the database when testing queries** — that's the data layer's integration test (`@DataJpaTest` + Testcontainers); a mocked repository verifies calls, not SQL correctness.

The smell: `mock(TransactionManager.class)` to "test" your transaction logic — you're testing a fiction. The real integration test (a failing save rolls back) is where that behavior belongs.

## Rule 5: The Mock Pyramid Within a Test

A test's structure should be *mostly real, thinly mocked*:


**What this code does — step by step:**

1. REAL: value objects, DTOs, the class under test.
2. MOCKED: the boundary.
3. REAL: the behavior under test.
4. `assertTrue(ok);` — assert the outcome...
5. `verify(orderRepo).save(order);` — ...and the contract

The same code, clean:

```java
@Test
void placesOrder() {
    Order order = new Order("c1", 25.0);

    when(payments.charge("c1", 25.0)).thenReturn(true);

    boolean ok = service.placeOrder(order);

    assertTrue(ok);
    verify(orderRepo).save(order);
}
```

If a test needs mocks for *everything* and asserts on *nothing real* (all outcomes come from stubs, all verifications are on stubs), it's testing the mock configuration, not the code. The rule of thumb: **at least one assertion should depend on real logic** — otherwise the test would pass even if the code under test were replaced by a no-op.

## Rule 6: The Real-World Async and Time Rules

- **Inject the clock, don't mock time:** `Clock` passed to the service — tests supply a fixed `Clock.fixed(...)`; no mocking needed, deterministic timestamps.
- **Inject executors for async:** an `Executor` (or `ExecutorService`) parameter — tests run it synchronously (an executor that runs inline) instead of racing real threads.
- **Never stub random** — inject a seeded `Random` or a value factory.
- These are the *design* fixes that eliminate whole classes of flaky tests — better than any Mockito feature.

## The Best-Practice Checklist

1. Constructor injection everywhere — the seam is the testability.
2. Strict stubs on — unused stubs fail; `lenient()` only with a reason.
3. Verify contracts, not choreography.
4. Mock boundaries only — real values for records/DTOs, real infrastructure for data-layer contracts.
5. Keep the test mostly real, thinly mocked — at least one real-logic assertion.
6. Inject clocks/executors/random — design out the nondeterminism.
7. When a test needs elaborate mocking, **redesign the code** — the mock difficulty is the report card.

## Recap

Mockito best practices are really design practices: **constructor injection** creates the seams that make mocking trivial; **strict stubs** act as a linter against dead expectations; **verify contracts not implementation** keeps tests refactor-proof; and **mock only boundaries** — never value objects, never your own logic, never the database when you're testing queries. Keep tests mostly real and thinly mocked, inject clocks and executors instead of mocking time, and treat elaborate mocking as a design signal. The professional insight: a test suite that mocks gracefully isn't a suite with good Mockito skills — it's a suite whose *code* was designed for testing, and Mockito is simply the tool that makes the seams pay off.

