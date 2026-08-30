---
title: Records, Sealed Classes and Pattern Matching
module: java-advanced-language
order: 1
minutes: 25
topics: ["records", "sealed classes", "pattern matching", "switch expressions", "destructuring"]
docs:
  - title: "Java language changes"
    url: "https://docs.oracle.com/en/java/javase/21/language/java-language-changes.html"
summary: Java 16–21 completed the biggest language evolution in decades: records (immutable data carriers), sealed classes (closed type hierarchies), and pa...
---

# Records, Sealed Classes and Pattern Matching

Java 16–21 completed the biggest language evolution in decades: **records** (immutable data carriers), **sealed classes** (closed type hierarchies), and **pattern matching** (destructuring with type tests). Together they replace entire boilerplate idioms and enable the switch expressions that make domain logic read like a spec.

## Records: Data Carriers Without Boilerplate

```java
public record Course(Long id, String title, String level, int minutes) {}
```

This one line gives you:
- A final class with final fields
- Canonical constructor
- `id()`, `title()`, `level()`, `minutes()` accessors
- `equals`/`hashCode` (by component)
- `toString`

```java
Course c = new Course(1L, "Spring Boot", "BEGINNER", 25);
c.title();                    // accessor, not getTitle()
c.equals(new Course(1L, "Spring Boot", "BEGINNER", 25));  // true
```

## Compact Constructors: Validation

```java
public record Course(Long id, String title, String level, int minutes) {

    public Course {
        if (minutes < 0) throw new IllegalArgumentException("minutes < 0");
        Objects.requireNonNull(title, "title is required");
        if (level == null) level = "BEGINNER";   // normalize
    }
}
```

The compact constructor runs before field assignment — the canonical place for validation and normalization.

## Custom Accessors

```java
public record Course(Long id, String title, String level, int minutes) {

    public boolean isLong() { return minutes >= 40; }

    public Course withTitle(String newTitle) {
        return new Course(id, newTitle, level, minutes);   // immutable update
    }

    // custom accessor shadows the default
    public String title() {
        return title == null ? "Untitled" : title;
    }
}
```

Records are immutable by design — updates create new instances.

## Sealed Classes: Closed Hierarchies

`sealed` restricts *who* may extend a type — the compiler enforces it:

```java
public sealed interface Payment permits CardPayment, BankTransfer, WalletPayment {}

public record CardPayment(String token, String last4) implements Payment {}
public record BankTransfer(String iban) implements Payment {}
public record WalletPayment(String provider, String walletId) implements Payment {}
```

The three permitted subtypes are exhaustive — the compiler knows every possible `Payment`. Add a fourth subtype? You must update the `permits` list and every switch.

## Pattern Matching for Switch: The Killer Feature

```java
public String describe(Payment payment) {
    return switch (payment) {
        case CardPayment cp  -> "Card ending " + cp.last4();
        case BankTransfer bt -> "Bank transfer to " + bt.iban();
        case WalletPayment wp -> wp.provider() + " wallet";
    };
    // exhaustive: the compiler forces all three cases
}
```

- `case CardPayment cp` — type test **and** destructuring in one step
- `->` arrow syntax — no fall-through, no break
- Exhaustiveness — sealed hierarchies make missing cases a compile error

## Guarded Patterns

```java
public String describe(Payment payment) {
    return switch (payment) {
        case CardPayment cp when cp.last4().startsWith("4") -> "Visa card " + cp.last4();
        case CardPayment cp                                 -> "Card " + cp.last4();
        case BankTransfer bt                                -> "Bank transfer";
        case WalletPayment wp                               -> wp.provider() + " wallet";
    };
}
```

`when` clauses add predicates; order matters — the first matching guard wins.

## Pattern Matching for instanceof

The old cast dance:

```java
// OLD
if (obj instanceof String) {
    String s = (String) obj;
    System.out.println(s.length());
}

// NEW — pattern variable
if (obj instanceof String s) {
    System.out.println(s.length());
}
```

With flow scoping — `s` is usable *only where it's safe*:

```java
if (obj instanceof String s && s.length() > 5) {
    System.out.println(s.toUpperCase());   // s in scope here
}
// s NOT in scope here (condition could have failed)
```

## Record Patterns: Nested Destructuring

```java
public record Point(int x, int y) {}
public record Line(Point start, Point end) {}

public boolean isHorizontal(Line line) {
    return line instanceof Line(Point(var x1, _), Point(var x2, _)) && x1 == x2;
}
```

Nested patterns destructure in one expression. `_` (unnamed variable, Java 22) skips components you don't need.

## Switch Expressions as Statements

```java
public int timeEstimate(Payment payment) {
    int base = switch (payment) {
        case CardPayment cp -> 5;
        case BankTransfer bt -> 24 * 60;
        case WalletPayment wp -> 2;
    };
    return base;
}
```

Arrow-switch returns values; the whole expression assigns. No `break`, no mutable accumulator.

## Records + Sealed + Switch: The Domain Trio

```java
public sealed interface OrderEvent permits OrderPlaced, OrderPaid, OrderCancelled {}

public record OrderPlaced(Long orderId, BigDecimal total) implements OrderEvent {}
public record OrderPaid(Long orderId, String paymentRef) implements OrderEvent {}
public record OrderCancelled(Long orderId, String reason) implements OrderEvent {}

public class OrderStateMachine {

    public OrderState apply(OrderState state, OrderEvent event) {
        return switch (event) {
            case OrderPlaced op -> state.withStatus("PLACED");
            case OrderPaid op   -> state.withStatus("PAID");
            case OrderCancelled oc -> state.withStatus("CANCELLED");
        };
    }
}
```

Every event is immutable data; the state machine is an exhaustive switch; the compiler guarantees no unhandled event type. This trio is the modern Java idiom for domain modeling.

## JSON Interop

Records work with Jackson out of the box (Spring Boot 3):

```java
record CourseDto(Long id, String title, String level) {}

// deserialization
CourseDto dto = objectMapper.readValue(json, CourseDto.class);

// serialization
String json = objectMapper.writeValueAsString(dto);
```

No annotations needed for the common case — records' canonical constructor matches JSON properties.

## Summary

| Feature | Solves | Since |
|---------|--------|-------|
| Records | Boilerplate DTOs, immutability | Java 16 |
| Sealed classes | Exhaustive, controlled hierarchies | Java 17 |
| Pattern matching for switch | Type-test + destructure + exhaustive | Java 21 |
| instanceof patterns | Safe casts | Java 16 |
| Record patterns | Nested destructuring | Java 21 |

Records make data immutable and terse; sealed classes make hierarchies exhaustive; pattern matching makes handling them elegant and compiler-checked. This trio is the foundation of modern Java domain modeling — and it composes perfectly with the next lesson's switch expressions and richer language features.
