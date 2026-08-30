---
title: Assertions in Depth and Parameterized Tests
module: junit5-deep
order: 2
minutes: 26
topics: ["assertions", "assertAll", "parameterized tests", "ValueSource", "CsvSource", "MethodSource", "ArgumentSources"]
docs:
  - title: "Assertions (JUnit 5 User Guide)"
    url: "https://junit.org/junit5/docs/current/user-guide/#writing-tests-assertions"
  - title: "Parameterized Tests (JUnit 5 User Guide)"
    url: "https://junit.org/junit5/docs/current/user-guide/#writing-tests-parameterized-tests"
summary: Two JUnit 5 features separate "tests that pass" from "tests that prove something": assertion composition (assertAll — report every failure, not jus...
---

# Assertions in Depth and Parameterized Tests

## The Concept: The Two Pillars of Test Value

Two JUnit 5 features separate "tests that pass" from "tests that prove something": **assertion composition** (`assertAll` — report every failure, not just the first) and **parameterized tests** (run the same test logic against many inputs — the difference between 4 tests and 400). Together they turn a test suite from a red/green toggle into a detailed diagnostic instrument.

**The mental model:** a test is a hypothesis about your code. `assertAll` is the scientific report that lists *every* way the hypothesis failed, not just the first — so one fix cycle addresses the whole failure set. Parameterized tests are the experiment run across the full input space — the same hypothesis, many data points, each with its own name in the report. The combination means: fewer test methods, more coverage, better failure reports.

## assertAll: See Every Failure

```java
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class OrderTest {

    static record Order(String id, double total, String status) {}

    @Test
    void orderFieldsAreValid() {
        Order order = createOrder();

        // WITHOUT assertAll: the first failing assertion aborts the test —
        // you fix it, rerun, find the next one. One failure at a time.
        // WITH assertAll: ALL assertions run; every failure is reported
        // together, each with its own message and stack.
        assertAll("order fields",
            () -> assertNotNull(order.id(), "id must not be null"),
            () -> assertTrue(order.total() > 0, "total must be positive"),
            () -> assertTrue(order.total() < 10_000, "total under sanity cap"),
            () -> assertEquals("PENDING", order.status(), "initial status")
        );
        // If three of these fail, the report shows ALL THREE at once.
    }

    Order createOrder() { return new Order("o1", 99.0, "PENDING"); }
}
```

**The lambda shape matters:** each assertion is a `() -> ...` — they're *all executed* even when one fails, and the failures aggregate into a single `MultipleFailuresError` listing every message. This is the single biggest report-quality upgrade for state-heavy assertions (DTO validation, entity invariants, response shapes) — one test run shows the complete failure picture.

## Parameterized Tests: One Test, Many Inputs

The feature that collapses copy-pasted tests:

```java
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import static org.junit.jupiter.api.Assertions.*;

class ParameterizedDemo {

    // The @ValueSource provides the inputs; the test runs once per value.
    @ParameterizedTest
    @ValueSource(strings = { "racecar", "radar", "level", "hello" })
    void isPalindrome(String word) {
        assertEquals(new StringBuilder(word).reverse().toString().equals(word),
                     isPalindromeCheck(word), word + " palindrome check");
    }

    boolean isPalindromeCheck(String w) {
        return new StringBuilder(w).reverse().toString().equals(w);
    }

    // @CsvSource — MULTIPLE arguments per invocation, as CSV rows:
    @ParameterizedTest
    @CsvSource({
        "0, 1",     // n, expected
        "1, 1",
        "2, 2",
        "3, 6",
        "5, 120"
    })
    void factorial(int n, long expected) {
        assertEquals(expected, factorial(n), "factorial(" + n + ")");
    }

    long factorial(int n) {
        long r = 1;
        for (int i = 2; i <= n; i++) r *= i;
        return r;
    }

    // @MethodSource — the most flexible: a static method returns the inputs
    // (Stream of Arguments / a record / simple values):
    @ParameterizedTest
    @MethodSource("amounts")
    void chargeRejectsInvalidAmounts(BigDecimal amount) {
        assertThrows(IllegalArgumentException.class,
                     () -> new PaymentService().charge("acc-1", amount));
    }

    static java.util.stream.Stream<java.math.BigDecimal> amounts() {
        return java.util.stream.Stream.of(
                java.math.BigDecimal.ZERO,
                java.math.BigDecimal.valueOf(-1),
                java.math.BigDecimal.valueOf(-1000));
    }
}
```

**Walking through the sources:**

- **`@ValueSource`** — the simplest: a single array of values (strings, ints, longs, doubles, enums). One argument per invocation.
- **`@CsvSource`** — *multiple* arguments per invocation, written as CSV rows (also `@CsvFileSource` for a file — the standard for big data tables). Note the type conversion: JUnit converts strings to int/long/whatever the parameter declares.
- **`@MethodSource`** — the workhorse: a (static) factory method returns the inputs as a `Stream`. Most flexible — records, objects, complex arguments, computed data. (In modern JUnit 5.9+, the factory doesn't need to be static if the class is `@TestInstance(PER_CLASS)`.)
- Also in the family: `@EnumSource` (enumerate enum values), `@NullSource`/`@EmptySource`/`@NullAndEmptySource` (explicit null/empty cases — the classic bug-finder for string handling).

**The report payoff:** each invocation is a *separate test case* with its own name — `factorial(int, long)[3] factorial(5) = 120` appears as its own pass/fail in CI. When one input fails, you see exactly which input — no more bisecting a loop by hand.

## Customizing the Display Names

```java
@ParameterizedTest
@CsvSource({ "2, 1", "3, 2", "10, 55" })
@DisplayName("fib({0}) = {1}")
void fib(int n, long expected) {
    // each invocation shows: fib(2) = 1, fib(3) = 2, fib(10) = 55
}
```

The `{0}`, `{1}` placeholders inject the invocation arguments into the display name — the report reads like a table of cases instead of `[1]`, `[2]`, `[3]`.

## The Practical Rules

1. **Parameterize when the *logic* is the same and only the *data* differs** — validation rules, math functions, parsing, boundaries ("0, negative, huge, empty"). Don't parameterize tests that need different *arrangements* — those are different scenarios, keep them separate.
2. **Include the boundary cases explicitly** — zero, negative, empty, null, max — the inputs where bugs actually live.
3. **Name the display** with arguments so failures are self-explanatory.
4. **Keep `@MethodSource` factories near the test** (same class) — the "method not found" error is the classic parameterized-test setup failure; the factory must be *static* (unless PER_CLASS) and the name must match exactly.
5. **Combine with `assertAll`** for multi-field expectations in each case.

## Recap

`assertAll` aggregates every assertion failure into one report — the difference between fixing one bug per run and seeing the whole failure picture at once. Parameterized tests (`@ValueSource`, `@CsvSource`, `@MethodSource`, `@EnumSource`) run one test body against many inputs, each invocation reported as its own named case — collapsing copy-pasted tests into data-driven coverage with self-documenting names. The craft: parameterize same-logic-different-data, include boundaries, name with placeholders, and keep sources next to their tests. Combined, these two features are what make a JUnit suite a *diagnostic instrument* rather than a checkbox.
