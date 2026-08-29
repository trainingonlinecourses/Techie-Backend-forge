---
title: Abstract Classes vs Interfaces — When to Use Which
summary: The contract difference between abstract classes and interfaces, diamond problem rules, when an abstract class beats an interface, and the Java 8+ default-method overlap that confuses every team.
order: 39
minutes: 20
topics: [abstract-class, interface, diamond-problem, default-methods, template-method, is-a-vs-can-do]
docs:
  - https://docs.oracle.com/javase/tutorial/java/IandI/abstract.html
  - https://docs.oracle.com/javase/tutorial/java/IandI/index.html
---

# Abstract Classes vs Interfaces — When to Use Which

## The concept

In Java you define contracts — shapes that other classes must follow. There are two mechanisms: **abstract classes** and **interfaces**. Understanding when each one is appropriate is one of the most important design decisions you will make.

An **abstract class** is a class that can contain both implemented methods and abstract (unimplemented) methods. It can hold instance fields, constructors, and state. You cannot instantiate it directly — you must extend it.

An **interface** is a pure contract: it declares method signatures (and, since Java 8, optionally `default` method bodies). It cannot hold instance state (only `static final` constants). A class can implement many interfaces but extend only one class.

The key insight is about **identity and shared state**:

- **Abstract class** = "I am something." It shares code *and* state with subclasses. Use it when subclasses share a common identity and common behavior.
- **Interface** = "I can do something." It shares capability without imposing identity. Use it when unrelated classes need to advertise the same behavior.

## Why teams get confused after Java 8

Before Java 8, the line was clean: abstract classes hold state and constructors; interfaces hold only method signatures. Java 8 added `default` methods to interfaces, which let interfaces carry implemented methods. This blurred the line and caused debates in every codebase. The rule is still simple:

- An interface **cannot** declare instance fields (only `static final`). No constructor. No `this`.
- An abstract class **can** declare any field, any constructor, any access modifier.
- A class implements many interfaces but extends only one class.

When `default` methods collide from two interfaces, the compiler forces the implementing class to resolve the conflict — you must override the method. This is the **diamond problem** resolution.

## How we use it in an organization

### Scenario 1: Abstract class for shared state — payment processor hierarchy

A payment service has `CreditCardProcessor`, `BankTransferProcessor`, and `WalletProcessor`. They all need a common `process()` flow: validate → charge → record audit log. The shared code lives in an abstract base; each subclass overrides the charge step.

```java
public abstract class PaymentProcessor {

    protected final AuditLog auditLog;
    protected final PaymentRepository repository;

    // Constructor — interfaces cannot do this
    protected PaymentProcessor(AuditLog auditLog, PaymentRepository repository) {
        this.auditLog = auditLog;
        this.repository = repository;
    }

    // Template method: the flow is fixed, the charge step varies
    public final PaymentResult process(PaymentRequest request) {
        validate(request);                              // shared
        PaymentResult result = charge(request);         // abstract — subclass decides
        auditLog.record(request, result);               // shared
        repository.save(result);                        // shared
        return result;
    }

    protected void validate(PaymentRequest request) {
        if (request.amount().signum() <= 0) {
            throw new IllegalArgumentException("Amount must be positive");
        }
    }

    // Each subclass implements its own charging logic
    protected abstract PaymentResult charge(PaymentRequest request);
}
```

```java
public class CreditCardProcessor extends PaymentProcessor {

    private final StripeGateway stripe;

    public CreditCardProcessor(StripeGateway stripe, AuditLog audit, PaymentRepository repo) {
        super(audit, repo);
        this.stripe = stripe;
    }

    @Override
    protected PaymentResult charge(PaymentRequest request) {
        return stripe.charge(request.cardToken(), request.amount());
    }
}
```

**Why abstract class here, not interface?** Because `process()` is a fixed algorithm (template method) that depends on shared fields (`auditLog`, `repository`) and a constructor. An interface cannot hold those.

### Scenario 2: Interface for capability — things that are auditable

Now suppose *any* entity in the system — not just payments — can produce an audit trail. `Order`, `User`, `Payment`, `Shipment` are unrelated classes that share zero code. The right abstraction is an interface:

```java
public interface Auditable {
    AuditEntry toAuditEntry();
    String auditCategory();    // e.g., "PAYMENT", "ORDER", "USER"
}
```

```java
public class Order implements Auditable {
    private String orderId;
    private BigDecimal total;

    @Override
    public AuditEntry toAuditEntry() {
        return new AuditEntry("ORDER", orderId, Map.of("total", total.toString()));
    }

    @Override
    public String auditCategory() { return "ORDER"; }
}

public class Payment implements Auditable {
    private String paymentId;
    private PaymentStatus status;

    @Override
    public AuditEntry toAuditEntry() {
        return new AuditEntry("PAYMENT", paymentId, Map.of("status", status.name()));
    }

    @Override
    public String auditCategory() { return "PAYMENT"; }
}
```

```java
// Audit service works with ANY Auditable — Order, Payment, User, etc.
public class AuditService {
    public void record(Auditable entity) {
        AuditEntry entry = entity.toAuditEntry();
        auditRepository.save(entry);
    }
}
```

**Why interface here, not abstract class?** Because `Order` and `Payment` have nothing else in common. Forcing them to extend a shared base class would be an artificial hierarchy. The interface says "you *can* produce an audit entry" without forcing a shared identity.

### Scenario 3: Diamond problem with default methods

Two interfaces both provide a default `describe()` method. A class implementing both must resolve the conflict:

```java
public interface Loggable {
    default String describe() { return "Loggable entity"; }
}

public interface Cacheable {
    default String describe() { return "Cacheable entity"; }
}

// Compiler error if we don't override:
public class Session implements Loggable, Cacheable {
    @Override
    public String describe() {
        return Loggable.super.describe();  // pick one, or write a new implementation
    }
}
```

This is rare in practice because well-designed interfaces avoid overlapping default methods. When it happens, the compiler forces you to make a conscious decision — which is the right behavior.

## Decision matrix

| Situation | Use |
|---|---|
| Shared state + constructor + fixed algorithm | Abstract class |
| Unrelated classes share a capability | Interface |
| Need multiple inheritance of type | Interface |
| Need to evolve the API with backward compat | Interface (default methods) |
| Template Method pattern | Abstract class |
| Strategy / Plugin pattern | Interface |

## Common mistakes

1. **Making everything an interface** — leads to boilerplate because every implementor repeats the same code (e.g., audit logic).
2. **Making everything an abstract class** — prevents multiple inheritance, couples subclasses to a single hierarchy.
3. **Putting utility methods in an interface with no fields** — works, but if the method needs state, an abstract class is the right tool.
4. **Ignoring the diamond problem** — adding `default` methods to two interfaces in different modules can break consumers at compile time.
