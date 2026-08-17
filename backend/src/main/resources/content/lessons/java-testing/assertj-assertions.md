---
title: AssertJ — Fluent Assertions
summary: Readable, failure-rich assertions — extracting fields, list/map matchers, exception assertions and soft assertions that collect every failure.
order: 2
minutes: 14
topics: [assertj, fluent assertions, test readability, soft assertions, exception testing]
docs:
  - https://assertj.github.io/doc/
  - https://www.assertj.org/assertj-core-features-highlight.html
---

# AssertJ — Fluent Assertions

## Why AssertJ

JUnit's `assertEquals` works, but its failure messages are terse and the API is limited. AssertJ is a **fluent assertion library**: `assertThat(actual).…` reads like a sentence, fails with messages that show the actual vs expected values, and covers collections, maps, exceptions, dates, paths and more — without a single custom matcher.

```java
import static org.assertj.core.api.Assertions.assertThat;

assertThat(order.total()).isEqualByComparingTo(new BigDecimal("19.98"));  // BigDecimal-safe!
assertThat(order.getStatus()).isEqualTo(OrderStatus.PENDING);
assertThat(order.getLines()).hasSize(2).allMatch(l -> l.qty() > 0);
assertThat(order.getCustomer().email()).endsWith("@example.com");
```

The killer feature for money: **`isEqualByComparingTo`** for `BigDecimal` — plain `assertEquals` on `new BigDecimal("19.9")` vs `new BigDecimal("19.90")` fails on scale, while AssertJ compares *value*.

## Collections: the common 90%

```java
assertThat(lines)
    .hasSize(2)
    .extracting(Line::productId)              // project a field — the money assert
    .containsExactly("p1", "p2")              // order matters; use containsExactlyInAnyOrder otherwise
    .doesNotContainNull();

assertThat(orderService.findByCustomer("ada"))
    .extracting(Order::status)
    .containsOnly(PENDING, COMPLETED);

assertThat(map)
    .containsEntry("tenant", "acme")
    .containsKeys("id", "name");
```

`extracting(Order::status)` + `containsExactly` is how you assert on *shapes of data* instead of whole objects — the whole test stays readable and the failure message lists exactly which elements didn't match.

## Exception assertions

```java
assertThatThrownBy(() -> service.create(null))
    .isInstanceOf(IllegalArgumentException.class)
    .hasMessageContaining("customer")
    .hasMessageStartingWith("Order requires");

// or the more declarative form:
assertThatCode(() -> service.cancel(paidOrder))
    .doesNotThrowAnyException();
```

`assertThatThrownBy` chains type + message + cause assertions — the cause is where the real story hides (`hasCauseInstanceOf`). Never assert on the exception alone; assert the message too, or a refactor that breaks the contract goes unnoticed.

## Soft assertions: report every failure

JUnit stops at the **first** failed assertion. `SoftAssertions` collects them all:

```java
SoftAssertions softly = new SoftAssertions();
softly.assertThat(order.id()).isNotNull();
softly.assertThat(order.total()).isEqualByComparingTo(new BigDecimal("19.98"));
softly.assertThat(order.status()).isEqualTo(PENDING);
softly.assertAll();   // throws with ALL collected failures at once
```

When one failed assert makes you rerun the test five times to find the rest, soft assertions fix it. Use them for **multi-field response validation** (a DTO's fields, a CSV row, a JSON payload) — the places where "fail fast" is just "fail repeatedly".

## Extracting nested data: the DTO test

```java
// Response DTO validation — the bread and butter of API tests:
assertThat(response.getBody())
    .extracting(OrderDto::id, OrderDto::total, OrderDto::status)
    .containsExactly(orderId, new BigDecimal("19.98"), "PENDING");

// Deep into the graph:
assertThat(orders)
    .flatExtracting(Order::getLines)          // one list of all lines across orders
    .extracting(Line::productId)
    .contains("p1");
```

`flatExtracting` and tuple-based `containsExactly(...)` assertions read like a spec table — ideal for asserting the *set* of a response without stringy parsing.

## Date/time and paths

```java
assertThat(order.createdAt())
    .isAfter(Instant.now().minusSeconds(5))
    .isBefore(Instant.now());

assertThat(Path.of("target/test.csv")).exists().isRegularFile().hasSizeGreaterThan(0);
```

## AssertJ + the rest of the starter

`spring-boot-starter-test` bundles AssertJ, so it's free in every `@SpringBootTest`. It pairs with Mockito (the next lesson): Mockito *stubs behavior*, AssertJ *asserts results* — the two rarely overlap.

## Key takeaways

- `assertThat(actual).isX()` — fluent, failure-rich, no custom matchers.
- `isEqualByComparingTo` for BigDecimal; `extracting` + `containsExactly` for list shapes.
- `assertThatThrownBy` with message/cause chains for exceptions.
- `SoftAssertions` collects every failure — use for multi-field validation.
- AssertJ asserts *results*; Mockito stubs *behavior*.

Official docs: [AssertJ](https://assertj.github.io/doc/) · [AssertJ features](https://www.assertj.org/assertj-core-features-highlight.html)
