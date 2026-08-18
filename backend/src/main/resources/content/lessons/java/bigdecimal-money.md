---
title: BigDecimal & Money — Never Use double for Currency
summary: Why floating point corrupts money, scale and rounding modes, BigDecimal arithmetic, and the money-handling standards organizations enforce.
order: 22
minutes: 24
topics: [bigdecimal, money, rounding, scale, floating-point, monetary-arithmetic, currency]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/math/BigDecimal.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/math/RoundingMode.html
  - https://joda-money.github.io/
---

# BigDecimal & Money — Never Use double for Currency

## The concept: why double is wrong for money

Floating-point types (`float`, `double`) store values as binary fractions — `1/10` is *not* exactly representable in binary, the way `1/3` is not exactly representable in decimal. So:

```java
double a = 0.1;
double b = 0.2;
System.out.println(a + b); // 0.30000000000000004  ← not 0.3!
```

A billing system that computes `0.1 + 0.2` and gets `0.30000000000000004` will, after a million transactions, drift by more than the value of the transaction itself. Rounding hides the error on screen but it is still in the number — and in the audit trail. Every payments organization therefore has a hard rule: **money is `BigDecimal` (or an integer minor-unit count), never `double`**.

## BigDecimal: arbitrary precision + explicit scale

`BigDecimal` stores an **unscaled integer** and a **scale** (number of digits after the decimal point):

```java
BigDecimal price = new BigDecimal("19.99");   // unscaled 1999, scale 2
BigDecimal qty   = new BigDecimal("3");        // unscaled 3, scale 0
BigDecimal total = price.multiply(qty);        // 59.97, scale 2
```

Two rules the codebase enforces:

1. **Construct from `String`, never from `double`.** `new BigDecimal(0.1)` produces the exact binary expansion `0.1000000000000000055511151231257827021181583404541015625`. `new BigDecimal("0.1")` produces exactly `0.1`. This one line is the source of most money bugs.
2. **Declare the scale explicitly** with `setScale(2, RoundingMode.HALF_UP)` whenever arithmetic could produce extra digits.

## How we use it in an organization: an invoice service

Here is the calculation core of an invoicing service — the exact code a payments team would review:

```java
@Service
public class InvoiceCalculator {
    private static final int MONEY_SCALE = 2;
    private static final RoundingMode ROUND = RoundingMode.HALF_UP;

    public Money computeLineTotal(BigDecimal unitPrice, BigDecimal quantity, BigDecimal taxRatePct) {
        // Scenario 1: line total = unit price × quantity, rounded to cents
        BigDecimal gross = unitPrice.multiply(quantity).setScale(MONEY_SCALE, ROUND);

        // Scenario 2: tax computed on the rounded gross, not the raw product —
        // rounding order must be consistent across every invoice or totals won't match
        BigDecimal tax = gross.multiply(taxRatePct)
                              .divide(BigDecimal.valueOf(100), MONEY_SCALE, ROUND);
        return new Money(gross.add(tax), Currency.getInstance("USD"));
    }
}
```

**Why the rounding order matters:** compute tax on the *rounded* gross, never on raw unrounded values, and always at the same scale. If invoice generation and the refund path round differently, refunds will never equal original charges and reconciliation breaks — a real incident class in fintech.

## The divide() trap

`divide` can produce a non-terminating decimal (`10 / 3 = 3.3333…`). Without a scale and rounding mode it throws `ArithmeticException`. The rule: **every `divide` passes a scale and RoundingMode** — the compiler can't enforce it, so it lives in the review checklist and in static-analysis config:

```java
// Fails at runtime: ArithmeticException: Non-terminating decimal expansion
// BigDecimal ratio = gross.divide(total);

// Correct — always specify scale + rounding
BigDecimal ratio = gross.divide(total, 6, RoundingMode.HALF_UP); // keep 6 digits for ratios
```

## Comparing and storing money

- **Never use `equals` for comparison** — `new BigDecimal("2.0").equals(new BigDecimal("2.00"))` is `false` because the scales differ. Use `compareTo` (`compareTo == 0` means "same value"), or normalize with `stripTrailingZeros()` first.
- **Never use `==` or `<`** — they don't exist for objects; use `compareTo`.
- **Persistence:** store as `NUMERIC(19,2)` (or `DECIMAL`), not `DOUBLE`/`FLOAT`. The database column declares scale so every layer agrees.
- **APIs:** serialize as a **string** (`"19.99"`), never a JSON number, so JavaScript clients don't lose precision. Jackson serializes `BigDecimal` as a number by default — most orgs configure `ToStringSerializer` or a DTO with `String` money fields.

## Scenarios teams hit

- **Subscription proration:** `daysUsed / daysInMonth` × price must be computed with a defined scale and rounding, and the same rule on upgrade and downgrade paths, or refunds don't match.
- **Multi-currency:** currency belongs *with* the amount. Wrap `BigDecimal amount + Currency currency` in a `Money` value object (like Joda-Money) so nothing mixes EUR and USD silently.
- **Taxes per region:** different rounding modes per jurisdiction (`HALF_UP` vs `HALF_EVEN`) — put the mode in configuration, not in the arithmetic.

## Key takeaways

- `double` cannot represent `0.1` exactly — money must use `BigDecimal` or integer minor units.
- Always construct from `String`; always pass scale + `RoundingMode` to `divide` and `setScale`.
- Compare with `compareTo`, never `equals`; persist as `NUMERIC`; serialize as strings.
- Round at one consistent point and scale across every code path touching the same money.
