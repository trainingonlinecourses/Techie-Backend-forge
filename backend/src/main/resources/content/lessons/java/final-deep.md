---
title: The Final Keyword — Variables, Methods, and Classes
summary: What final actually guarantees at the JVM level, final vs effectively-final for lambdas, final fields and safe publication, and why some teams ban final locals while others require it everywhere.
order: 40
minutes: 18
topics: [final-variable, final-method, final-class, effectively-final, immutability, safe-publication]
docs:
  - https://docs.oracle.com/javase/tutorial/java/IandI/final.html
  - https://docs.oracle.com/javase/tutorial/java/javaOO/keywords.html
---

# The Final Keyword — Variables, Methods, and Classes

## The concept

The `final` keyword is a compile-time and runtime guarantee about **immutability and non-overridability**. It has three distinct meanings depending on where you place it, and each one serves a different safety purpose.

**`final` variable** — once assigned, the reference cannot change. For primitives, the value is locked. For objects, the *reference* is locked (the object's internal state can still change unless the object itself is immutable).

**`final` method** — subclasses cannot override it. This protects critical invariants in a class hierarchy.

**`final` class** — no class can extend it. This is the strongest form of sealing: the class's behavior is complete and tamper-proof.

The most common confusion: `final` on a local variable makes the *reference* immutable, not the object. `final List<String> names = new ArrayList<>()` — you cannot reassign `names`, but you can call `names.add("x")`. True immutability of the *object* requires an immutable type (`List.of()`, `Collections.unmodifiableList()`, or a custom immutable class).

## `final` variables and the JVM memory model

When a `final` field is set in a constructor, the Java Memory Model (JMM) guarantees that any thread that sees the object reference will also see the correct value of that final field. This is called **safe publication**. Without `final`, a thread could theoretically see a partially constructed object — the reference is non-null but the field still holds its default value (0, null, false).

This is why immutable value objects almost always use `final` fields:

```java
public record Money(BigDecimal amount, Currency currency) {
    // record fields are implicitly final — safe publication guaranteed
}
```

Even pre-Java-16, the pattern was:

```java
public class Money {
    private final BigDecimal amount;   // safe publication
    private final Currency currency;   // safe publication

    public Money(BigDecimal amount, Currency currency) {
        this.amount = amount;          // set once in constructor
        this.currency = currency;      // set once in constructor
    }

    public BigDecimal amount() { return amount; }
    public Currency currency() { return currency; }
}
```

If `amount` were not `final`, a thread reading `money.amount()` from a different thread could see `null` even after the constructor completed — the JMM has no obligation to reorder the writes for visibility.

## `final` method — protecting invariants

When a method is `final`, subclasses cannot override it. This is a design contract: "this method's correctness depends on invariants that subclasses might violate."

```java
public class BankAccount {

    private BigDecimal balance = BigDecimal.ZERO;

    // final — subclasses must not change the withdrawal logic
    public final synchronized void withdraw(BigDecimal amount) {
        if (amount.compareTo(balance) > 0) {
            throw new InsufficientFundsException();
        }
        balance = balance.subtract(amount);
        auditLog.record("WITHDRAW", amount);
    }

    // Subclasses can add behavior, but not change withdraw
    public void deposit(BigDecimal amount) {
        balance = balance.add(amount);
    }
}
```

```java
// This compiles, but withdraw() is inherited — cannot be overridden
public class PremiumAccount extends BankAccount {
    private BigDecimal overdraftLimit;

    @Override
    public void deposit(BigDecimal amount) {
        // allowed — deposit is not final
        super.deposit(amount);
        recalculateInterest();
    }

    // public void withdraw(BigDecimal amount) { }  ← WON'T COMPILE
}
```

**Why make `withdraw` final?** Because it contains critical logic (balance check + audit). If a subclass could override it, it might skip the audit or the balance check, breaking financial invariants.

## `final` class — preventing extension

A `final` class cannot be subclassed. The JDK uses this extensively: `String`, `Integer`, `LocalDate` are all `final`.

```java
public final class UserId {
    private final String value;

    public UserId(String value) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException();
        this.value = value;
    }

    public String value() { return value; }

    @Override
    public boolean equals(Object o) {
        return o instanceof UserId other && value.equals(other.value);
    }

    @Override
    public int hashCode() { return value.hashCode(); }

    @Override
    public String toString() { return "UserId(" + value + ")"; }
}
```

**Why `final`?** Because `equals`/`hashCode`/`toString` are defined on the assumption that `value` never changes and no subclass alters behavior. If someone extended `UserId` and added a field, `equals` might not compare it, leading to hidden bugs in hash maps.

## `final` in lambdas — effectively final

Java lambdas can capture local variables, but the variable must be **effectively final** — never reassigned after initialization:

```java
// Works: count is effectively final
int count = 0;
Runnable r = () -> System.out.println(count);  // ✅

// Doesn't compile: count is reassigned
int count = 0;
count++;                                        // reassigned
Runnable r = () -> System.out.println(count);  // ❌ compile error
```

This is because the lambda captures a *copy* of the value. If the variable could be reassigned, the lambda and the surrounding code would see different values — a source of subtle bugs.

## How we use it in organizations

### Scenario: final fields in a configuration POJO

```java
@ConfigurationProperties(prefix = "payment")
public record PaymentProperties(
    @DefaultValue("3") int retryAttempts,
    @DefaultValue("1000") Duration timeout,
    @DefaultValue("false") boolean sandboxMode,
    List<String> supportedCurrencies
) {}
```

Records make every field `final`. This means the configuration is **immutable after construction** — no thread can accidentally mutate it. Spring's `@ConfigurationProperties` binding creates the object once at startup; `final` guarantees no thread can change `retryAttempts` mid-request.

### Scenario: final local for lambda capture

```java
public List<Order> filterOrders(List<Order> orders, OrderStatus status) {
    return orders.stream()
        .filter(order -> order.status() == status)  // status must be effectively final
        .toList();
}
```

## Best practices

| Guideline | Reasoning |
|---|---|
| Make fields `final` by default | Prevents accidental mutation, enables safe publication |
| Use `final` on methods that encode invariants | Subclasses cannot break correctness |
| Make value classes `final` | Prevents subclass `equals`/`hashCode` violations |
| Don't ban `final` locals | Readability and lambda capture safety |
| Don't overuse `final` on class-level | `final` class prevents mocking; consider package-private constructors instead |
