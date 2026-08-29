---
title: TDD & Testing Legacy Code
summary: Red-green-refactor in practice, characterization tests for code without tests, and the test-driven workflow that makes refactoring safe.
order: 5
minutes: 15
topics: [tdd, red green refactor, characterization tests, refactoring, testing legacy]
docs:
  - https://martinfowler.com/bliki/TestDrivenDevelopment.html
  - https://www.obeythetestinggoat.com/
---

# TDD & Testing Legacy Code

## The red-green-refactor loop

Test-Driven Development is a **workflow** that makes design and refactoring safe, not a testing ceremony:

```
1. RED    — write a failing test for the next behavior (it must fail for the RIGHT reason)
2. GREEN  — write the smallest code that passes it (no gold-plating)
3. REFACTOR — clean up, with the test as your safety net; repeat
```

```java
// 1. RED — the test fails because create() doesn't exist / returns null:
@Test void createComputesTotal() {
    Order o = service.create(List.of(new Line(2, TEN)));
    assertEquals(new BigDecimal("20.00"), o.total());
}

// 2. GREEN — minimal implementation:
public Order create(List<Line> lines) {
    return new Order(lines.stream().mapToMoney(...).sum());
}

// 3. REFACTOR — extract, rename, dedupe… the test keeps proving behavior
```

The discipline that makes it work: **watch each test fail once** for the right reason (a test that never failed proves nothing — it could be asserting the wrong thing, or passing vacuously), then keep the cycle tight — minutes, not hours.

## TDD as a design tool

TDD is less about testing than about **design pressure**:

- The test is the first *caller* — it forces you to design the API you'd want to use (naming, argument order, return types) before the implementation cements.
- "Can I test this easily?" exposes tight coupling early — a class that needs 6 mocks to construct is a class with too many dependencies.
- The tests become living documentation of the contract — the safest spec a team ever writes.

It's not a religion: for exploratory/UI/infrastructure code, write tests when the shape stabilizes. For **domain logic** (money, status transitions, rules), TDD pays its rent every single time.

## Testing legacy code without tests

Code that has no tests can't be safely refactored — which is why it stays untouchable. The unlock is **characterization tests**: tests that capture *current behavior* so refactoring preserves it, even if the behavior is imperfect.

```java
// 1. Write tests against the EXISTING behavior (they document the status quo):
@Test
void currentTaxRule_appliesFivePercentAboveThousand() {
    assertEquals(new BigDecimal("52.50"), legacyService.taxOn(1050));
}

// 2. Refactor freely — the characterization tests prove behavior didn't change.
// 3. Where the behavior is wrong, fix the TEST expectations FIRST (a deliberate decision),
//    then the code — never simultaneously.
```

The move: **test everything you're about to touch before you touch it** (Seam-based: Michael Feathers' *Working Effectively with Legacy Code*). A seam is a place where behavior can be altered without editing — extracting a method, injecting a collaborator, wrapping a call. Find the seam, put a characterization test through it, then refactor.

## The pyramid in practice

```
      e2e (few)
    integration (some — Testcontainers)
  slice tests (@WebMvcTest, @DataJpaTest)
unit tests (many — TDD'd domain logic)
```

TDD lives at the bottom: the fast, isolated layer where the loop is seconds. Slice and integration tests verify the wiring the unit tests can't see (real SQL, real HTTP, real serialization) — both layers, in CI, every commit.

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Test passes before the code exists | Wrong assertion (trivially true) | Watch it fail for the right reason |
| Every refactor breaks tests | Tests pin implementation (over-verify, deep mocks) | Assert behavior, not calls |
| Suite takes 10 minutes | Unit tests hit DB/network | Fake/Testcontainers at the right layer |
| Feature done, no tests | "Testing slows me down" | TDD the domain; the safety net pays for itself on the first regression |
| Refactor of legacy = terror | No characterization tests | Capture behavior first, then change |

## The one-line summary

TDD: red → green → refactor, in seconds, on the domain. Legacy: characterize → refactor → fix expectations deliberately. The suite is the asset that makes the codebase cheap to change — which is the entire point of tests in a professional codebase.

## Key takeaways

- RED (fail for the right reason) → GREEN (smallest code) → REFACTOR (safe now).
- The test is the first caller — it designs the API and exposes coupling.
- Legacy code: characterization tests capture current behavior before refactoring; change expectations deliberately, then code.
- TDD the domain logic; slice/integration tests cover the boundaries; both run in CI.

Official docs: [Test-Driven Development (Fowler)](https://martinfowler.com/bliki/TestDrivenDevelopment.html) · [Obey the Testing Goat](https://www.obeythetestinggoat.com/)
