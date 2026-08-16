---
title: OOP & Encapsulation
summary: Classes, interfaces, records, polymorphism and the encapsulation discipline production code depends on.
order: 3
minutes: 20
topics: [oop, encapsulation, polymorphism, records, interfaces]
docs:
  - https://docs.oracle.com/javase/tutorial/java/concepts/
  - https://docs.oracle.com/en/java/javase/21/language/records.html
---

# OOP & Encapsulation

## The four pillars, applied

| Pillar | Meaning in production code |
|---|---|
| **Encapsulation** | Fields private; behavior + invariants live *inside* the class |
| **Inheritance** | "is-a" reuse — use sparingly; prefer composition |
| **Polymorphism** | One interface, many implementations — the foundation of DI |
| **Abstraction** | Hide complexity behind narrow contracts |

## Behavior over getters/setters

A domain object should protect its invariants. Nobody should be able to put an account into a negative balance by calling a setter:

```java
import java.math.BigDecimal;
import java.util.Objects;

/** IMMUTABLE value object — records are the idiomatic way. */
record Money(BigDecimal amount, String currency) {
    Money {
        Objects.requireNonNull(currency, "currency");
        if (amount == null || amount.signum() < 0)
            throw new IllegalArgumentException("amount must be >= 0");
    }
    Money add(Money o) {
        if (!currency.equals(o.currency)) throw new IllegalArgumentException("currency mismatch");
        return new Money(amount.add(o.amount), currency);
    }
}

class InsufficientFundsException extends RuntimeException {
    InsufficientFundsException(String iban) { super("insufficient funds on " + iban); }
}

/** ENTITY: identity + encapsulated invariants. */
public class Account {
    private final String iban;   // set once
    private Money balance;       // private: no outside mutation

    public Account(String iban, Money opening) {
        this.iban = Objects.requireNonNull(iban);
        this.balance = opening;
    }
    public void debit(Money m) {
        if (balance.amount().compareTo(m.amount()) < 0) throw new InsufficientFundsException(iban);
        balance = new Money(balance.amount().subtract(m.amount()), balance.currency());
    }
    public void credit(Money m) { balance = balance.add(m); }
    public Money balance() { return balance; }
}
```

Note the rules: **use `BigDecimal` for money** (never `double`), validate in constructors, and expose behavior (`debit`), not internals.

## Polymorphism: the pattern behind Spring DI

```java
interface FeePolicy { Money fee(Money amount); }

record StandardFee() implements FeePolicy {
    public Money fee(Money a) { return new Money(a.amount().multiply(new BigDecimal("0.01")), a.currency()); }
}
record VipFee() implements FeePolicy {
    public Money fee(Money a) { return new Money(BigDecimal.ZERO, a.currency()); }
}

// Caller depends on the ABSTRACTION, not the implementation:
FeePolicy policy = account.isVip() ? new VipFee() : new StandardFee();
Money fee = policy.fee(amount);
```

This is exactly how Spring works: beans implement an interface, and Spring decides *which implementation* to inject (that's dependency injection — see the Spring Core module).

## Interfaces vs abstract classes vs records

- **Interface** — a contract; multiple inheritance of types. Default methods allow evolution.
- **Abstract class** — shared state/behavior *and* a contract; single inheritance only.
- **Record** — immutable data carrier with `equals`/`hashCode`/`toString` generated.

```java
// sealed hierarchies: the compiler knows all implementations
sealed interface Payment permits Card, Wire, Crypto {}
record Card(String pan, String cvc) implements Payment {}
record Wire(String iban) implements Payment {}
record Crypto(String address) implements Payment {}
```

## Composition over inheritance

```java
// WRONG: modeling "a Car IS-A Vehicle with an Engine" via inheritance chains
// RIGHT: Car HAS-A Engine (composition)
class Engine { void start() { /* ... */ } }
class Car {
    private final Engine engine = new Engine();
    void start() { engine.start(); }
}
```

> **Why it matters (organizational view)** — Encapsulation is the rule that makes teams safe to grow: if every object guards its own invariants, refactoring one class can't silently corrupt another's state. Reviews enforce "no public fields, no getters that expose mutable internals, behavior lives with data." Records and sealed types (Java 16/17/21) make the *good* design the *easy* design.

## Key takeaways

- Encapsulate invariants; expose behavior, not fields.
- Depend on abstractions (interfaces) — Spring DI is built on this.
- Prefer composition and records; reach for inheritance rarely.
- Money is `BigDecimal`, always.

**Official docs:** [OOP concepts](https://docs.oracle.com/javase/tutorial/java/concepts/) · [Records](https://docs.oracle.com/en/java/javase/21/language/records.html)
