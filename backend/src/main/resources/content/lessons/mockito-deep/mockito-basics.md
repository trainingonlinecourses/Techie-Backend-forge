---
title: Mockito Basics — Mocks, Stubs, and the Test Double
module: mockito-deep
order: 2
minutes: 25
topics: ["Mockito", "mocks", "stubbing", "test doubles", "when thenReturn", "verify"]
summary: A unit test isolates one class. But real classes depend on other classes — repositories, web clients, clocks — and those dependencies bring their o...
docs:
  - title: "Mockito Documentation"
    url: "https://javadoc.io/doc/org.mockito/mockito-core/latest/org/mockito/Mockito.html"
  - title: "Mockito Reference (site.mockito.org)"
    url: "https://site.mockito.org/"
---

# Mockito Basics — Mocks, Stubs, and the Test Double

## The Concept: Why We Mock

A unit test isolates *one* class. But real classes depend on other classes — repositories, web clients, clocks — and those dependencies bring their own baggage: databases to set up, networks to reach, state to manage. **Mocking** replaces a real dependency with a **test double**: a stand-in object you fully control, which records how it was called and answers with values you dictate. The class under test behaves exactly as it would against the real dependency — but the test is fast, deterministic, and needs no infrastructure.

```java
**The mental model:** a mock is a stunt double for a collaborator. The hero (your service) performs the scene (the business logic) while the stunt double (the mock repository) plays the dangerous part (the database) — perfectly, every time, following your script. The mock doesn't *do* anything real; it *says* the lines you wrote and *reports back* who said what to it. Two powers follow: **stubbing** (program the mock's answers) and **verification** (assert what the code said to it).

**The crucial distinction:** a *mock* (what Mockito makes) is not a *fake*. A fake (like an in-memory repository) is a working lightweight implementation. A mock has *no behavior at all* until you stub it — it's a programmable recording device. That's why mocks are right for *interaction* testing (did the service call the repository with the right arguments?) and wrong for testing real logic you actually own (that belongs in the real class's own tests).
```

## Your First Mock


**What this code does — step by step:**

1. The Mockito JUnit 5 extension: initializes @Mock fields and enforces. Strict stubbing (unused stubs fail the test — a great hygiene rule).
2. `PaymentRepository repo;` — the test double
3. `PaymentService service;` — the REAL class under test
4. A plain @BeforeEach wires the real service to the mock: (or use @InjectMocks — the next lesson)
5. STUBBING: program the mock's answer.
6. The real code runs against the mock.
7. The result is exactly what we stubbed.

The same code, clean:

```java
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {

    @Mock
    PaymentRepository repo;

    PaymentService service;

    @org.junit.jupiter.api.BeforeEach
    void setup() {
        service = new PaymentService(repo);
    }

    @Test
    void findsPaymentById() {
        Payment p = new Payment("p1", 99.0);
        when(repo.findById("p1")).thenReturn(p);

        Payment result = service.getPayment("p1");

        assertEquals(p, result);
    }
}
```

**Walking through it:** `@ExtendWith(MockitoExtension.class)` activates Mockito's JUnit 5 support — it creates the `@Mock` field (a fully-controlled stand-in for `PaymentRepository`) and, with its *strict stubbing* default, fails tests that have unused stubs (catching stubs that no longer matter — the test-writer's lint). The real `PaymentService` receives the mock via its constructor. `when(repo.findById("p1")).thenReturn(p)` is the stubbing line: "when this method is called with exactly `"p1"`, return `p`." The service's real logic runs, calls the mock, gets the stubbed answer — and the test asserts the observable outcome. No database anywhere: fast, deterministic, isolated.

## Stubbing: The Answer Machine


**What this code does — step by step:**

1. Basic: one argument, one answer.
2. Argument MATCHERS — any argument:
3. Different answers for different arguments:
4. No match at all — the default for unstubbed methods: (null for objects, 0 for numbers, empty for collections)
5. Multiple consecutive answers (first call, second call, ...):
6. The modern alternative — doReturn/doThrow (works even on void and. On spies):

The same code, clean:

```java
@Test
void stubbingStyles() {
    when(repo.findById("p1")).thenReturn(payment);

    when(repo.findById(anyString())).thenReturn(payment);

    when(repo.findById("p1")).thenReturn(payment);
    when(repo.findById("missing")).thenThrow(new PaymentNotFoundException("p-missing"));


    when(repo.count()).thenReturn(1, 2, 3);

    doThrow(new RuntimeException("db down")).when(repo).delete("p1");
}
```

**The stubbing rules that matter:**

1. **Matchers**: `anyString()`, `anyLong()`, `eq(value)`, `any()`, `isNull()` — use them when the exact argument doesn't matter or is unknown at stub time. **The trap:** you can't mix matchers and raw values in one call — `when(repo.find("p1", anyInt()))` is an error; use `eq("p1")` for the raw side.
2. **Unstubbed methods return safe defaults** — null/0/empty — which is *silent*: a method returning null that your code dereferences fails with NPE later, in confusing places. Stub what matters.
3. **`doThrow`/`doReturn`/`doAnswer`** — the `do*` family works where `when` can't: **void methods** and **spies**. The rule of thumb: use `when().thenReturn()` for values, `doThrow()` for exceptions on voids.

## Verification: Did the Code Say the Right Thing?

```java
Stubbing controls the mock's *answers*; **verification** checks the code's *calls* — the interaction assertions:

@Test
void chargeDeductsBalanceAndSaves() {
    Account a = new Account(1000);
    when(repo.findById("a1")).thenReturn(a);

    service.charge("a1", 200);

    // Did the service SAVE the account with the right balance?
    verify(repo).save(argThat(saved -> saved.getBalance() == 800));

    // Exactly how many times was findById called?
    verify(repo, times(1)).findById("a1");

    // Never called with something it shouldn't:
    verify(repo, never()).delete(anyString());

    // At least / at most:
    verify(repo, atLeastOnce()).findById(anyString());
}
```

**The verification vocabulary:** `times(n)` (exactly n), `never()`, `atLeastOnce()`, `atMostOnce()`, `atLeast(n)`. The argument matcher `argThat(...)` asserts on the *arguments passed* — the strongest interaction check ("the service saved an account with balance 800"). The discipline: **verify what you care about and nothing more** — verifying every interaction makes tests brittle (any refactor breaks them); verifying none misses the point of mocking.

## When to Mock, When Not To

**Mock (interaction-focused, no behavior):**
- External boundaries — repositories, web clients, message producers, the clock.
- Collaborators whose real implementation belongs to someone else's tests.

**Don't mock:**
- **Your own business logic** — a service's real behavior tested via mocks of *its* dependencies, but never the service itself mocked.
- **Value objects, records, DTOs** — no behavior to mock; use real instances.
- **The database when you're testing queries** — that's integration territory (`@DataJpaTest` + Testcontainers); a mocked repository verifies *calls*, not SQL.
- **Third-party libraries' internals** — test the *contract*, not the implementation.

The smell test: if a test needs a mock of a mock, or stubs three layers deep to get one value through, the design is wrong — the code should be restructured (a seam) rather than the test tortured.

## Recap

Mockito creates test doubles — programmable stand-ins that answer stubs (`when(...).thenReturn(...)`) and record calls for verification (`verify(...).times(...)`). `@ExtendWith(MockitoExtension.class)` + `@Mock` wires them into JUnit 5 with strict-stubbing hygiene. The craft is knowing *what* to mock — external boundaries and collaborators, never your own logic or the real database — and stubbing deliberately (matchers, `do*` for voids, safe defaults) while verifying only the interactions that matter. A well-mocked unit test is fast, deterministic, and precisely documents the contract between the class and its collaborators — the base of the testing pyramid.

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [javadoc.io/doc/org.mockito/mockito-core/latest/org/mockito/Mockito.html](https://javadoc.io/doc/org.mockito/mockito-core/latest/org/mockito/Mockito.html)
