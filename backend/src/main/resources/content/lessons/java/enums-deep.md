---
title: Enums in Depth — Constants with Behavior
summary: Why plain constants fail in production code, constant-specific methods, EnumMap/EnumSet, and the strategy-enum pattern organizations rely on.
order: 21
minutes: 22
topics: [enums, enummap, enumset, constant-specific-methods, strategy-pattern, switch-pitfalls]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/enum.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Enum.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/EnumMap.html
---

# Enums in Depth — Constants with Behavior

## The concept: why enums exist

An **enum** is a type whose values are a fixed, known set — `PaymentStatus`, `OrderState`, `UserRole`. Before enums (Java 5), teams used `public static final int` constants. That approach has three production failures:

1. **No type safety** — any `int` compiles, so `sendEmail(3)` is legal even when 3 is not a valid status.
2. **Logic scattered** — every `switch (status)` repeats the same branches in ten places, and adding a status means hunting down every switch.
3. **No behavior** — a status can't carry its own label, next-state, or color.

An enum solves all three: it is a **class**, so each constant can carry fields, methods, and even per-constant behavior. The compiler refuses values that aren't declared. That one property — compile-time exhaustiveness — is why `switch` over an enum is exhaustive-checked by the compiler, while `switch` over `int` is not.

## The structure of an enum

```java
public enum OrderState {
    CREATED, PAID, SHIPPED, DELIVERED, CANCELLED;
}
```

Each constant is a **singleton instance** of the enum class. `OrderState.PAID` is the *only* `PAID` that will ever exist — the JVM guarantees it, which makes enums safe to use as map keys and in `==` comparisons. Compare with strings: `"PAID".equals(x)` can be fooled by case, whitespace, and typos; `state == OrderState.PAID` cannot.

## How we use it in an organization: enum with fields and methods

Real enums carry data and behavior. Here is the payment-status enum from a payments microservice:

```java
public enum PaymentStatus {
    PENDING("Pending", "amber", 0),
    AUTHORIZED("Authorized", "blue", 1),
    CAPTURED("Captured", "green", 2),
    REFUNDED("Refunded", "grey", 3),
    FAILED("Failed", "red", 4);

    private final String label;
    private final String badgeColor;
    private final int displayOrder;

    PaymentStatus(String label, String badgeColor, int displayOrder) {
        this.label = label;
        this.badgeColor = badgeColor;
        this.displayOrder = displayOrder;
    }

    public String label() { return label; }
    public String badgeColor() { return badgeColor; }
    public boolean isTerminal() { return this == REFUNDED || this == FAILED; }

    public static PaymentStatus fromExternal(String code) {
        for (PaymentStatus s : values()) {
            if (s.name().equalsIgnoreCase(code)) return s;
        }
        throw new IllegalArgumentException("Unknown payment status: " + code);
    }
}
```

**What this buys the team:** the frontend renders `status.label()` and `status.badgeColor()` without its own lookup table; the audit service checks `status.isTerminal()` before closing a payment; and parsing gateway responses goes through `fromExternal` so a typo fails fast instead of silently defaulting.

## The strategy-enum pattern

The most powerful enum idiom: give each constant its **own implementation** of an abstract method. This replaces big `switch` blocks with polymorphic dispatch — the exact same idea Spring uses behind the scenes.

```java
public enum NotificationChannel {
    EMAIL {
        @Override public void send(Notification n) {
            emailGateway.send(n.recipient(), n.body());          // scenario: order confirmation emails
        }
    },
    SMS {
        @Override public void send(Notification n) {
            smsGateway.send(n.recipient(), truncate(n.body(), 160)); // scenario: delivery ETA texts
        }
    },
    PUSH {
        @Override public void send(Notification n) {
            pushService.send(n.recipient(), n.title(), n.body()); // scenario: app alerts for price drops
        }
    };

    public abstract void send(Notification n);
}
```

Callers never branch:

```java
// Before: switch(channel) { case EMAIL: ... case SMS: ... } — three switches, always out of sync
// After:
channel.send(notification);
```

Add a channel → add one constant. The compiler forces you to implement `send`. No switch to forget. This is why the *prefer enums over int constants* rule (Effective Java item 34) is a hard standard in most orgs' review checklists.

## EnumMap and EnumSet — why they exist

Because enum constants are known at compile time and ordered by declaration, the JVM can back maps and sets with **arrays indexed by ordinal** instead of hash tables.

```java
// Scenario: daily report of how many orders sit in each state
EnumMap<OrderState, Long> counts = orderRepo.countByState(); // keyed by enum — array-backed, fast

// Scenario: a user's permissions as a set of roles
EnumSet<UserRole> roles = EnumSet.of(UserRole.ADMIN, UserRole.SUPPORT);
if (roles.contains(UserRole.ADMIN)) { /* open admin panel */ }
```

`EnumMap` has no hashing cost at all and iterates in declaration order; `EnumSet` is a single `long` bitmask for ≤64 constants — dramatically smaller than a `HashSet<OrderState>`. Both are the defaults you should reach for whenever the key or element is an enum.

## The pitfalls that fail code review

- **Switch without default is a bug farm.** `switch (status)` with no `default` silently does nothing for a new constant. Prefer `switch` *expressions* (arrow syntax) which are exhaustive-checked, or the strategy-enum pattern above.
- **`ordinal()` is fragile.** It changes when you reorder constants. Never persist it — store `name()` or an explicit `code` field. This bit a team whose `INSERT ... VALUES (ordinal)` silently shifted after a reorder.
- **Don't put mutable state on an enum.** Constants are singletons shared by every thread — mutable fields are global mutable state. Keep enums immutable.
- **`values()` allocates a fresh copy each call** — cache it if you call it in a hot loop.

## Key takeaways

- Enums give compile-time type safety and exhaustiveness; prefer them over `int`/`String` constants.
- Each constant is a singleton — `==` comparison is correct and fast.
- Constant-specific methods turn switch-on-type into polymorphic dispatch.
- `EnumMap`/`EnumSet` are the array-backed, allocation-free choices for enum keys.
- Never rely on `ordinal()` for persistence or logic that must survive reordering.
