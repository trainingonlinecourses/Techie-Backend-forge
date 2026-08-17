---
title: Parameterized & Repeated Tests
summary: One test, many inputs — @ParameterizedTest with sources, argument conversion, and the table-driven tests that kill copy-paste test code.
order: 4
minutes: 13
topics: [parameterized tests, junit5, csvsource, methodsource, test data]
docs:
  - https://junit.org/junit5/docs/current/user-guide/#writing-tests-parameterized-tests
---

# Parameterized & Repeated Tests

## The copy-paste test smell

Three tests that differ only in input/output are three maintenance problems:

```java
@Test void rejectsNegative() { assertThrows(..., () -> validate(-1)); }
@Test void rejectsZero()     { assertThrows(..., () -> validate(0)); }
@Test void acceptsTen()      { assertEquals(OK, validate(10)); }
```

`@ParameterizedTest` collapses them into one test with a **table of inputs** — when a bug shows up, you fix the logic once and the whole table re-verifies.

## The common sources

```java
@ParameterizedTest
@ValueSource(ints = { -100, -1, 0 })                       // simple scalars
void rejectsInvalidAmounts(int amount) {
    assertThrows(IllegalArgumentException.class, () -> validate(amount));
}

@ParameterizedTest
@NullAndEmptySource                                         // null + "" + "  " — the null family in one shot
@ValueSource(strings = { " ", "\t" })
void rejectsBlankCustomer(String value) { ... }

@ParameterizedTest
@CsvSource({                                               // the workhorse: input,expected pairs
    "PENDING,true",
    "SHIPPED,false",
    "CANCELLED,false"
})
void isActionable(String status, boolean expected) {
    assertEquals(expected, OrderStatus.valueOf(status).isActionable());
}

@ParameterizedTest
@MethodSource("validOrders")                               // programmatic cases
void acceptsValidOrders(Order order) { ... }

static Stream<Arguments> validOrders() {
    return Stream.of(
        Arguments.of(OrderBuilder.valid()),
        Arguments.of(OrderBuilder.valid().withPriority()));
}
```

Rules of thumb: `@ValueSource` for scalars, `@CsvSource` for input→expected tables, `@MethodSource` when cases need objects or programmatic generation, `@NullAndEmptySource` for the null/blank family.

## CSV quoting and conversion

`@CsvSource` handles quotes: `"a,b"` is one field with a comma, `'x'` swaps in single quotes. Arguments convert automatically for common types; register a `@ConvertWith` or `@CsvTo`-style factory for custom types:

```java
@ParameterizedTest
@CsvSource({ "2026-08-17,PENDING" })
void appliesEffectiveDate(@JavaTimeConversionPattern("yyyy-MM-dd") LocalDate date, String status) { ... }
```

(Or simply accept `String` and convert in the test body — often clearer than converters.)

## Display names: make the report a spec

```java
@ParameterizedTest(name = "amount {0} is rejected")
@ValueSource(ints = { -1, 0 })
void rejectsInvalid(int amount) { ... }

@ParameterizedTest(name = "{0} → actionable={1}")
@CsvSource({ "PENDING,true", "SHIPPED,false" })
void isActionable(String status, boolean expected) { ... }
```

`{0}`, `{1}` reference arguments; the report reads "amount -1 is rejected" — the failure tells you *which row* broke without opening the file.

## Repeated and dynamic tests

- `@RepeatedTest(5)` — run the same test N times; useful for flakiness checks (rarely the right tool; better: fix the nondeterminism).
- `@TestFactory` dynamic tests — generate cases at runtime, e.g. from a data file:

```java
@TestFactory
Stream<DynamicTest> fromContractFile() throws IOException {
    return Files.readAllLines(Path.of("contract.csv")).stream()
        .map(line -> DynamicTest.dynamicTest(line, () -> assertTrue(validate(line))));
}
```

## Property-style coverage without the framework

If you don't want a property-testing library (jqwik/quicktheories), a cheap approximation is `@MethodSource` + random values with invariants:

```java
@ParameterizedTest
@MethodSource("randomOrders")
void totalNeverNegative(Order o) {
    assertTrue(o.total().signum() >= 0, "total must never be negative");
}
```

## Key takeaways

- One `@ParameterizedTest` replaces N copy-pasted tests — the table is the spec.
- `@ValueSource` scalars · `@CsvSource` input/expected tables · `@MethodSource` objects · `@NullAndEmptySource` the null family.
- Name the test with `{0}`, `{1}` so failures point at the exact row.
- Fix the logic once; the whole table re-verifies — parameterized tests make edge cases cheap to add.

Official docs: [JUnit 5 Parameterized Tests](https://junit.org/junit5/docs/current/user-guide/#writing-tests-parameterized-tests)
