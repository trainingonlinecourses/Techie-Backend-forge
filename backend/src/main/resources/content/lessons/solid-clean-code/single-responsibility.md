---
title: SRP — Single Responsibility Principle
module: solid-clean-code
order: 1
minutes: 22
topics: ["SRP", "single responsibility", "cohesion", "class design", "refactoring"]
summary: The Single Responsibility Principle (the S in SOLID) says: a class should have one reason to change. It should do one job — and do it completely — ...
docs:
  - title: "SOLID (Wikipedia)"
    url: "https://en.wikipedia.org/wiki/SOLID"
---

# SRP — Single Responsibility Principle

## The Concept: One Class, One Reason to Change

The **Single Responsibility Principle** (the *S* in SOLID) says: a class should have **one reason to change**. It should do one job — and do it completely — rather than being a grab-bag of unrelated tasks.

The crucial nuance: "one reason to change" is not "one thing it does" in the sense of "one method". A `UserService` legitimately creates users, updates them, and deletes them — that's still *one responsibility* (managing users). The principle is about **who asks for changes**:

- If the *database schema* changes → one class must change.
- If the *email template* changes → a *different* class must change.
- If the *business rule* about user creation changes → yet another class.

When one class must change for all three reasons, every modification risks breaking the other two concerns. And a class with three reasons to change has three audiences — making it hard to test, hard to reason about, and hard to reuse (you can't use the email logic without dragging in the database logic).

## The God Class — What SRP Prevents

```java
// The "God class" anti-pattern — one class doing everything:
class OrderProcessor {

    void process(Order order) {
        validate(order);                  // business logic
        saveToDatabase(order);            // persistence
        sendConfirmationEmail(order);     // email
        updateInventory(order);           // inventory
        writeAuditLog(order);             // auditing
    }

    void validate(Order o) { /* rules */ }
    void saveToDatabase(Order o) { /* JDBC/JPA */ }
    void sendConfirmationEmail(Order o) { /* SMTP */ }
    void updateInventory(Order o) { /* warehouse API */ }
    void writeAuditLog(Order o) { /* log file */ }
}
```

Five reasons to change, five audiences, one class. Changing email logic means touching the class that also owns SQL and inventory — and testing "validation" means constructing the whole monster.

## The Refactored Version

```java
// 1. Business logic — validates and orchestrates (the "what")
class OrderService {
    private final OrderRepository repository;      // persistence (injected)
    private final EmailService email;              // notification (injected)
    private final InventoryService inventory;      // inventory (injected)
    private final AuditLogger audit;               // auditing (injected)

    OrderService(OrderRepository r, EmailService e, InventoryService i, AuditLogger a) {
        this.repository = r; this.email = e; this.inventory = i; this.audit = a;
    }

    void place(Order order) {
        validate(order);
        repository.save(order);
        inventory.reserve(order.items());
        email.sendConfirmation(order);
        audit.record("order placed: " + order.id());
    }

    private void validate(Order o) { /* rules live HERE — one audience */ }
}

// 2. Persistence — "how orders are stored" (one audience: DB)
class OrderRepository {
    void save(Order o) { /* JPA code */ }
}

// 3. Notification — "how customers are told" (one audience: email team)
class EmailService {
    void sendConfirmation(Order o) { /* SMTP code */ }
}

// 4. Inventory — "how stock is tracked" (one audience: warehouse)
class InventoryService {
    void reserve(List<Item> items) { /* warehouse API */ }
}

// 5. Auditing — "how events are recorded" (one audience: compliance)
class AuditLogger {
    void record(String msg) { /* log code */ }
}
```

### What Changed and Why

- **Each concern is a class** — the business rule class, the persistence class, the notification class, the inventory class, the audit class. Each has exactly one audience.
- **`OrderService` orchestrates via injection** — it *delegates* to collaborators instead of implementing everything. The collaborators are dependencies (constructor parameters), so tests can supply fakes (mock the `EmailService`, test the rules in isolation).
- **A schema change** touches `OrderRepository` only; **an email template change** touches `EmailService` only. No cross-contamination.
- **Each class is independently testable and reusable** — `EmailService` can be reused by a refund flow without dragging in order persistence.

## Cohesion — The Measurement Behind SRP

The technical term for "things that belong together" is **cohesion**. SRP is really about *high cohesion*: the members of a class should be tightly related to one purpose. Signs of low cohesion (the SRP smell):

- Methods that don't share state or a common theme.
- A class whose name needs "And" (`OrderAndEmailAndAudit`).
- A class where you can split the methods into two groups with no interaction.
- A class with many injected dependencies that it uses in *different* methods (each dependency = a separate concern).

The classic refactoring move: **Extract Class** — pull the unrelated methods (and their dependencies) into their own class, and inject the new class into the old one (exactly what happened above).

## SRP at the Right Granularity

Two failure modes, both real:

- **Too coarse** — one giant class doing everything (the God class above).
- **Too fine** — a class per method, a file per concept, meaninglessly fragmented code. SRP doesn't mean "one method per class"; it means "one *responsibility* per class". A responsibility is a coherent job, and can contain several related methods.

A good test: **can you name the class's job in a short sentence without "and"?** `OrderRepository` — "stores orders." `EmailService` — "sends email." `OrderService` — "handles the order lifecycle." If you need "and", consider splitting.

## SRP in Spring Terms

Spring nudges you toward SRP structurally:

- **One `@Controller` per resource** — `UserController` for user endpoints, `OrderController` for order endpoints — not a `EverythingController`.
- **Services with one domain focus** — `OrderService`, not `OrderInvoiceInventoryEmailService`.
- **Repositories per aggregate** — `OrderRepository`, `UserRepository`.
- **`@RestControllerAdvice` per concern** — one class for validation errors, another for security errors.

When you see a Spring controller with 40 endpoints across four domains, that's SRP violated — split it.

## Common Beginner Pitfalls

1. **Confusing "one thing" with "one method"** — a service with 5 related methods still has one responsibility.
2. **The "utility grab-bag"** — a `Utils` class with string helpers, date helpers, and file helpers has three audiences; split it.
3. **Splitting too aggressively** — fragmentation is also a smell; group by *who changes it*.
4. **God classes in disguise** — a big class that delegates to `this.helper()` methods *within itself* is still one class with five jobs; the helpers belong in their own classes.
5. **Ignoring testability as the signal** — if testing one feature requires stubbing the whole world, SRP is violated.

## Key Takeaways

- SRP: one class, one reason to change — one audience, one job.
- It's about *who asks for changes*, not literal single-method classes.
- High cohesion = members share one purpose; the God class is the anti-pattern.
- Refactor by Extract Class: split concerns, inject the new collaborators.
- Testability is the canary: hard-to-test classes are usually multi-responsibility classes.
