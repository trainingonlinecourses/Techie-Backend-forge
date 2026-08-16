---
title: Modern Java — Records, Sealed Types & Pattern Matching
summary: The Java 16-21 features that eliminate boilerplate and make invalid states unrepresentable.
order: 4
minutes: 15
topics: [records, sealed, pattern-matching, switch-expressions, text-blocks]
docs:
  - https://docs.oracle.com/en/java/javase/21/language/pattern-matching.html
  - https://docs.oracle.com/en/java/javase/21/language/text-blocks.html
---

# Modern Java — Records, Sealed Types & Pattern Matching

Java 21 (LTS) is the version teams write today. These features remove whole categories of boilerplate.

## Records: data carriers without ceremony

```java
public record OrderLine(String productId, int quantity, Money unitPrice) {}

OrderLine line = new OrderLine("SKU-1", 2, new Money(new BigDecimal("9.99"), "EUR"));
line.productId();        // accessor (no getX naming)
line.quantity();
line.equals(other);      // structural equality, generated
line.hashCode();         // consistent with equals, generated
line.toString();         // OrderLine[productId=SKU-1, quantity=2, ...]
```

Records are **immutable** — every field is `final`. You can add validation and derived accessors in the compact constructor:

```java
public record Email(String value) {
    public Email {
        if (!value.matches("^[^@]+@[^@]+$")) throw new IllegalArgumentException("invalid email");
    }
    public String domain() { return value.substring(value.indexOf('@') + 1); }
}
```

## Sealed types: exhaustiveness the compiler enforces

```java
sealed interface TransferResult permits Success, InsufficientFunds, Rejected {}

record Success(String reference)       implements TransferResult {}
record InsufficientFunds(String iban)  implements TransferResult {}
record Rejected(String reason)         implements TransferResult {}

String describe(TransferResult r) {
    return switch (r) {                        // exhaustive: no default needed
        case Success s            -> "ok: " + s.reference();
        case InsufficientFunds f  -> "no funds on " + f.iban();
        case Rejected re          -> "rejected: " + re.reason();
    };
}
```

Add a new result type → the compiler forces every `switch` to handle it. **Invalid states become unrepresentable.**

## Pattern matching + switch expressions

```java
// instanceof pattern matching (no more cast+null dance)
if (obj instanceof TransferResult r && r instanceof Success s) {
    return s.reference();
}

// switch as an EXPRESSION with pattern matching
String tier = switch (points) {
    case int p when p >= 1000 -> "gold";
    case int p when p >= 500  -> "silver";
    default                   -> "bronze";
};
```

## Text blocks for configs, SQL and prompts

```java
String prompt = """
        You are a payment fraud analyst.
        Classify the transaction as APPROVE or REJECT.
        Transaction: %s
        """.formatted(transaction);

String sql = """
        SELECT id, iban, balance
        FROM accounts
        WHERE customer_id = ?
        ORDER BY created_at DESC
        """;
```

## Null-safety with Optional

```java
public Optional<Customer> findByEmail(String email) { /* ... */ }

Customer c = findByEmail(email)
        .filter(Customer::isActive)
        .orElseThrow(() -> new CustomerNotFoundException(email));
```

> **Why it matters (organizational view)** — Modern Java is a productivity multiplier for teams. Records replace hundreds of hand-written getters/setters (and the bugs in hand-rolled `equals`). Sealed types + exhaustive switch move "did we handle every case?" from a code-review question to a compile-time guarantee. Organizations adopting Java 21 see shorter PRs and fewer review nits.

## Key takeaways

- Records for data, sealed interfaces for closed hierarchies, pattern matching for safe deconstruction.
- Exhaustive switches are checked by the compiler — use them for state machines and results.
- Text blocks make SQL/prompts/JSON readable in code.
- Prefer `Optional` returns over `null`.

**Official docs:** [Pattern matching](https://docs.oracle.com/en/java/javase/21/language/pattern-matching.html) · [Text blocks](https://docs.oracle.com/en/java/javase/21/language/text-blocks.html) · [Records](https://docs.oracle.com/en/java/javase/21/language/records.html)
