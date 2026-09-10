---
title: Interface Defaults and Static Methods — Contracts That Implement Code
summary: How default methods solve the diamond problem in interface hierarchies, why static methods on interfaces exist, and the patterns that replace abstract base classes.
order: 27
minutes: 18
topics: [interfaces, default methods, static methods, diamond problem, abstract class vs interface, compatibility]
docs:
  - https://docs.oracle.com/javase/tutorial/java/IandI/defaultmethods.html
  - https://docs.oracle.com/javase/specs/jls/se21/html/jls-9.html
---

# Interface Defaults and Static Methods — Contracts That Implement Code

## The concept: interfaces can now carry code

Before Java 8, interfaces were pure contracts — methods with no body. Adding a new method to a widely-implemented interface broke every implementor. Default methods solved this by letting interfaces provide a method body that implementors inherit unless they override it. Static methods on interfaces gave them a namespace for factory methods and utilities without needing a separate helper class.

## Default methods — backward-compatible evolution

A default method has a body (using the `default` keyword) and is inherited by all implementing classes:

public interface Cache<K, V> {
    V get(K key);
    void put(K key, V value);

    // Default: get-or-compute pattern, inherited by all implementations
    default V getOrDefault(K key, java.util.function.Supplier<V> compute) {
        V value = get(key);
        if (value == null) {
            value = compute.get();
            put(key, value);
        }
        return value;
    }
}

// RedisCache and CaffeineCache both inherit getOrDefault without writing a line
public class RedisCache<K, V> implements Cache<K, V> { /* only implements get + put */ }
public class CaffeineCache<K, V> implements Cache<K, V> { /* only implements get + put */ }

**The org power:** add a new method to a 50-class interface hierarchy without touching any existing code. The default body runs everywhere; classes override only when they need a specialized implementation.

## The diamond problem — when two defaults collide

A class can implement two interfaces that have the same default method name. Java forces you to resolve the ambiguity:


**What this code does — step by step:**

1. COMPILE ERROR: class C inherits unrelated defaults for greet(). Class C implements A, B { }
2. Solution 1: override and pick one (or combine)
3. `A.super.greet();` — call A's default explicitly. Or B.super.greet(); or write your own logic
4. Solution 2: if one interface extends the other, the subinterface's default wins
5. A class implementing both A and C gets C's greet() — no conflict

The same code, clean:

```java
interface A {
    default void greet() { System.out.println("Hello from A"); }
}
interface B {
    default void greet() { System.out.println("Hello from B"); }
}


class C implements A, B {
    @Override
    public void greet() {
        A.super.greet();
    }
}

interface C extends A {
    @Override
    default void greet() { System.out.println("Hello from C (extends A)"); }
}
```

## Static methods on interfaces — namespace without a class

Interfaces can have static methods, which belong to the interface itself (not to implementing classes):

public interface Money {
    long cents();
    String currency();

    // Factory method — no MoneyFactory class needed
    static Money of(long cents, String currency) {
        return new Money() {
            @Override public long cents() { return cents; }
            @Override public String currency() { return currency; }
        };
    }

    // Static utility
    static Money sum(Money a, Money b) {
        if (!a.currency().equals(b.currency())) {
            throw new IllegalArgumentException("Currency mismatch");
        }
        return Money.of(a.cents() + b.cents(), a.currency());
    }
}

// Usage:
Money price = Money.of(1999, "USD");
Money total = Money.sum(price, Money.of(500, "USD"));

**The org pattern:** use static methods on interfaces for factory methods (`of()`, `from()`, `valueOf()`), comparison utilities (`Comparator.naturalOrder()`), and validation helpers. The interface becomes a self-contained domain object.

## Interface as a type — the polymorphism engine

Interfaces enable the "program to an interface" pattern. The caller depends only on the contract, not the implementation:


**What this code does — step by step:**

1. Service layer depends on the interface
2. `private final MessageSender sender;` — interface, not concrete class
3. Implementations are swappable
4. At runtime, inject the right one
5. `new NotificationService(new EmailSender());` — production
6. `new NotificationService(new SlackSender());` — dev notifications

The same code, clean:

```java
public class NotificationService {
    private final MessageSender sender;

    public NotificationService(MessageSender sender) {
        this.sender = sender;
    }

    public void notifyUser(User user, String message) {
        sender.send(user.email(), message);
    }
}

public interface MessageSender {
    void send(String to, String body);
}
public class EmailSender implements MessageSender { /* SMTP */ }
public class SmsSender implements MessageSender { /* Twilio */ }
public class SlackSender implements MessageSender { /* Webhook */ }

new NotificationService(new EmailSender());
new NotificationService(new SlackSender());
```

## Abstract class vs interface — when to use which

| Feature | Interface | Abstract class |
|---|---|---|
| Multiple inheritance | Yes (implement many) | No (extend one) |
| State (instance fields) | Only `public static final` | Any field |
| Constructors | No | Yes |
| Default methods | Yes (Java 8+) | Yes (always) |
| Access modifiers on methods | `public` only | Any visibility |
| Performance | Slightly slower (invokeinterface) | Slightly faster (invokevirtual) |

**Use an interface when:** defining a contract that unrelated classes implement (e.g., `Comparable`, `Serializable`, `Cache`), or when you need multiple inheritance of type.

**Use an abstract class when:** sharing state, constructors, or non-public helpers among closely related classes in a hierarchy (e.g., `AbstractList` provides most of `List`'s methods).

// Interface: a capability that any class can have
public interface Loggable {
    default String logContext() { return getClass().getSimpleName(); }
}

// Abstract class: shared implementation for a family
public abstract class BaseRepository<T> {
    private final JdbcTemplate jdbc;

    protected BaseRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    protected List<T> queryForList(String sql, RowMapper<T> mapper) {
        return jdbc.query(sql, mapper);
    }
}

## Key takeaways

- Default methods let you add methods to interfaces without breaking existing implementations — the single biggest interface evolution tool.
- When two defaults collide, override and use `InterfaceName.super.method()` to call the one you want.
- Static methods on interfaces replace utility classes and provide factory methods (`of()`, `from()`).
- Program to interfaces for polymorphism and testability; use abstract classes when you need shared state or constructors.
- Interfaces can extend multiple other interfaces; abstract classes can only extend one.

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/)
