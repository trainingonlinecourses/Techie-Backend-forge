---
title: Runtime Polymorphism and Dynamic Dispatch
summary: How Java resolves method calls at runtime, covariant return types, the method table, and why understanding dispatch is critical for designing extensible frameworks.
order: 42
minutes: 20
topics: [polymorphism, dynamic-dispatch, method-overriding, covariant-return, instanceof-pattern, dispatch-table]
docs:
  - https://docs.oracle.com/javase/tutorial/java/IandI/polymorphism.html
  - https://docs.oracle.com/javase/tutorial/java/IandI/subclass.html
---

# Runtime Polymorphism and Dynamic Dispatch

## The concept

**Polymorphism** (from Greek: "many forms") means the same method call behaves differently depending on the actual type of the object at runtime. When you write `animal.makeSound()`, Java does not execute the `makeSound()` defined in `Animal` — it executes the one defined in the *actual class* of `animal` at that moment, whether it's a `Dog`, `Cat`, or `Duck`.

This is called **dynamic dispatch** (or virtual method dispatch). The JVM maintains a **method table** for each class that maps method signatures to their implementations. When a method is called, the JVM looks up the actual class's method table and calls the entry there. If the actual class does not override the method, the parent's entry is used — walking up the inheritance chain.

This is the foundation of the **Template Method**, **Strategy**, **Decorator**, and **Factory Method** patterns, and it is the reason Spring can inject any implementation of an interface and the caller does not care.

## Compile-time vs runtime type

```java
Animal animal = new Dog();  // compile-time type: Animal, runtime type: Dog
animal.makeSound();          // dispatches to Dog.makeSound()
```

The **compile-time type** determines what methods the compiler allows you to call. The **runtime type** determines which implementation executes. Java's dispatch uses the runtime type.

## Method overriding rules

When a subclass overrides a method, these rules govern what the compiler accepts:

1. The method name, parameter list, and return type must match (or be covariant).
2. The access modifier must be **the same or more permissive** (you cannot widen a public method to private).
3. The method cannot throw broader checked exceptions than the parent.
4. `final`, `static`, and `private` methods **cannot** be overridden (and are not dispatched dynamically).

```java
public class PaymentProcessor {

    // not overridable — static methods are resolved at compile time
    public static String type() { return "GENERIC"; }

    // not overridable — final
    public final void validate(PaymentRequest request) {
        if (request.amount().signum() <= 0) throw new IllegalArgumentException();
    }

    // overridable — dynamic dispatch applies
    protected PaymentResult execute(PaymentRequest request) {
        return PaymentResult.success("processed");
    }
}

public class StripeProcessor extends PaymentProcessor {

    @Override
    protected PaymentResult execute(PaymentRequest request) {
        // Stripe-specific logic
        return PaymentResult.success("stripe-charged");
    }
}

// Usage
PaymentProcessor p = new StripeProcessor();
p.execute(request);  // dispatches to StripeProcessor.execute()
```

## Covariant return types

Since Java 5, an overriding method can return a **narrower** (more specific) type than the parent:

```java
public class OrderBuilder {

    public Order build() {
        return new Order();
    }
}

public class InternationalOrderBuilder extends OrderBuilder {

    @Override
    public InternationalOrder build() {  // covariant return — InternationalOrder extends Order
        InternationalOrder order = new InternationalOrder();
        order.setCustomsDeclaration(new CustomsDeclaration());
        return order;
    }
}
```

This means callers of `InternationalOrderBuilder.build()` get an `InternationalOrder` without a cast, while callers of the parent `OrderBuilder` still get `Order`. It is one of the few cases where overriding a method *strengthens* the contract.

## Dynamic dispatch and the method table

When the JVM encounters `animal.makeSound()`:

1. It looks at the **actual class** of `animal` (e.g., `Dog`).
2. It checks `Dog`'s method table for a `makeSound()` entry.
3. If found, it calls that implementation.
4. If not found, it walks up to `Animal`'s method table.

This means the parent's implementation is always a fallback. The JVM does **not** re-resolve on every call in practice — HotSpot optimizes this with inline caches and devirtualization. But the JLS guarantees the runtime behavior regardless of optimizations.

## How we use it in organizations

### Scenario 1: Strategy pattern — notification dispatch

```java
public interface NotificationSender {
    void send(Notification notification);
    String channel();  // "EMAIL", "SMS", "PUSH"
}

@Component("emailSender")
public class EmailSender implements NotificationSender {
    @Override
    public void send(Notification notification) {
        // SMTP logic
    }

    @Override
    public String channel() { return "EMAIL"; }
}

@Component("smsSender")
public class SmsSender implements NotificationSender {
    @Override
    public void send(Notification notification) {
        // Twilio API
    }

    @Override
    public String channel() { return "SMS"; }
}

@Service
public class NotificationDispatcher {

    private final Map<String, NotificationSender> senders;

    // Spring injects all NotificationSender beans, keyed by channel
    public NotificationDispatcher(List<NotificationSender> senderList) {
        this.senders = senderList.stream()
            .collect(Collectors.toMap(NotificationSender::channel, s -> s));
    }

    public void dispatch(Notification notification) {
        NotificationSender sender = senders.get(notification.channel());
        sender.send(notification);  // dynamic dispatch — the right sender runs
    }
}
```

The dispatcher calls `sender.send()` without knowing which implementation it holds. Adding `PushSender` requires zero changes to `NotificationDispatcher`.

### Scenario 2: Template Method — data export pipeline

```java
public abstract class DataExporter {

    // Template method — final, algorithm fixed
    public final ExportResult export(ExportRequest request) {
        List<RawRecord> data = fetchData(request);       // abstract
        List<ProcessedRecord> processed = transform(data); // abstract
        validate(processed);                                // concrete
        return write(processed, request);                  // abstract
    }

    protected abstract List<RawRecord> fetchData(ExportRequest request);
    protected abstract List<ProcessedRecord> transform(List<RawRecord> raw);
    protected abstract ExportResult write(List<ProcessedRecord> records, ExportRequest request);

    protected void validate(List<ProcessedRecord> records) {
        if (records.isEmpty()) throw new EmptyExportException();
    }
}

public class CsvExporter extends DataExporter {
    @Override protected List<RawRecord> fetchData(ExportRequest request) { /* JDBC */ }
    @Override protected List<ProcessedRecord> transform(List<RawRecord> raw) { /* map */ }
    @Override protected ExportResult write(List<ProcessedRecord> records, ExportRequest request) {
        return new ExportResult("csv", records.size());
    }
}

public class JsonExporter extends DataExporter {
    @Override protected List<RawRecord> fetchData(ExportRequest request) { /* REST API */ }
    @Override protected List<ProcessedRecord> transform(List<RawRecord> raw) { /* filter */ }
    @Override protected ExportResult write(List<ProcessedRecord> records, ExportRequest request) {
        return new ExportResult("json", records.size());
    }
}
```

Adding a new export format means writing a new subclass. The `export()` algorithm never changes.

### Scenario 3: instanceof pattern matching (Java 16+)

```java
public String describe(Object obj) {
    return switch (obj) {
        case Order o    -> "Order: " + o.orderId();
        case Payment p  -> "Payment: " + p.id() + " [" + p.status() + "]";
        case User u     -> "User: " + u.email();
        case null       -> "null";
        default         -> "Unknown: " + obj.getClass().getSimpleName();
    };
}
```

Pattern matching replaces verbose `instanceof` + cast chains with readable, compiler-checked dispatch.

## Common mistakes

| Mistake | Consequence |
|---|---|
| Overloading instead of overriding (wrong params) | Parent implementation runs unexpectedly — silent bug |
| Overriding a private/static method | Compiles but is not polymorphic — no dispatch |
| Calling overridden method from constructor | Subclass fields not yet initialized — NPE |
| Returning a broader type in override | Compile error — covariant only narrows |
