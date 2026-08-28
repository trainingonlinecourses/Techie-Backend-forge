---
title: Enums in Depth — Constants with Behavior
summary: Why plain int/String constants fail in production, constant-specific methods, EnumMap/EnumSet, and the strategy-enum pattern that eliminates switch blocks in organizations.
order: 21
minutes: 22
topics: [enums, enummap, enumset, constant-specific-methods, strategy-pattern, switch-pitfalls]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/enum.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Enum.html
---

## The Concept, From Zero

Before Java 5 added enums, teams stored fixed values as raw ints or Strings:

```java
public static final int STATUS_PENDING  = 0;
public static final int STATUS_ACTIVE   = 1;
public static final int STATUS_FAILED   = 2;
```

Three things went wrong repeatedly:

1. **Any int compiles** — `sendEmail(3)` passes the compiler even when 3 means nothing. The bug hides until runtime.
2. **Switches are never complete** — every `if/else` over int constants must be copy-pasted everywhere; adding a new status requires hunting down every check.
3. **No behavior attached** — you can't call `STATUS_FAILED.label()` because int constants don't carry methods.

An **enum** fixes all three. It is a full class whose instances are a fixed, compile-time-known set. The compiler rejects any value not declared. Each constant is a **singleton** — the JVM guarantees `OrderState.PAID` is the *only* `PAID` instance that will ever exist in the entire application, which makes `==` comparisons safe and fast.

## The Anatomy of an Enum

```java
public enum OrderState {
    CREATED, PAID, SHIPPED, DELIVERED, CANCELLED;
    //          ↑ each name is a static final instance of OrderState
}
```

Behind the scenes the compiler generates:

| Generated piece | What it does |
|---|---|
| `values()` | Returns a fresh array `[CREATED, PAID, ...]` in declaration order |
| `valueOf(String)` | Looks up `"PAID"` → `OrderState.PAID`, throws if not found |
| `name()` | Returns `"PAID"` (the source-code name) |
| `ordinal()` | Returns `1` (position in declaration order — fragile, don't persist it) |

## Enums with Fields and Methods — Real Org Usage

Raw names aren't enough in production. A payments team attaches display metadata to each constant:

```java
public enum PaymentStatus {
    PENDING("Pending", "amber", 0),        // each constant passes values to the constructor
    AUTHORIZED("Authorized", "blue", 1),
    CAPTURED("Captured", "green", 2),
    REFUNDED("Refunded", "grey", 3),
    FAILED("Failed", "red", 4);

    private final String label;             // once set in the constructor, never changes → safe
    private final String badgeColor;
    private final int displayOrder;

    // Each constant passes its data to this shared constructor
    PaymentStatus(String label, String badgeColor, int displayOrder) {
        this.label = label;                 // store on the instance
        this.badgeColor = badgeColor;
        this.displayOrder = displayOrder;
    }

    public String label() { return label; }                           // frontend reads this
    public String badgeColor() { return badgeColor; }                 // CSS class selector
    public boolean isTerminal() {                                     // business rule: can't move forward
        return this == REFUNDED || this == FAILED;                    // terminal states
    }

    public static PaymentStatus fromExternal(String code) {           // gateway sends "CAPTURED"
        for (PaymentStatus s : values()) {                            // check every constant
            if (s.name().equalsIgnoreCase(code)) return s;            // case-insensitive match
        }
        throw new IllegalArgumentException("Unknown status: " + code);// fail fast on garbage input
    }
}
```

Line-by-line:

| Line | Why it matters |
|---|---|
| `PENDING("Pending", "amber", 0)` | Each constant is an object; the constructor args are its unique data |
| `private final` fields | Immutable — enums are singletons shared across threads, mutable fields = global mutable state |
| `this == REFUNDED` | Enums are singletons so `==` comparison is correct (unlike String where you must use `.equals()`) |
| `for (PaymentStatus s : values())` | Iterates in declaration order; for small enums this is fast enough |
| `name().equalsIgnoreCase(code)` | Gateway responses are `"CAPTURED"` (uppercase), our enum constant is also uppercase |

**What this gives the organization:** The frontend renders `status.label()` without its own lookup table. The audit service calls `status.isTerminal()` before closing a payment. Gateway response parsing goes through `fromExternal`, so a typo fails fast instead of silently defaulting.

## The Strategy Enum Pattern — Eliminating Switch Blocks

The most powerful idiom: give each constant its own implementation of an abstract method. This replaces every `switch` with polymorphic dispatch.

```java
public enum NotificationChannel {
    EMAIL {
        @Override public void send(Notification n) {
            emailGateway.send(n.recipient(), n.body());
        }
    },
    SMS {
        @Override public void send(Notification n) {
            smsGateway.send(n.recipient(), truncate(n.body(), 160));
        }
    },
    PUSH {
        @Override public void send(Notification n) {
            pushService.send(n.recipient(), n.title(), n.body());
        }
    };

    public abstract void send(Notification n);   // each constant MUST implement this
}
```

Now callers never branch:

```java
// BEFORE (fragile — new channel means updating every switch in the codebase):
switch (channel) {
    case EMAIL: emailGateway.send(...); break;
    case SMS:   smsGateway.send(...);   break;
    case PUSH:  pushService.send(...); break;
    // forgot to add TELEGRAM — silent bug
}

// AFTER (adding a channel means adding ONE constant; the compiler forces you to implement send):
channel.send(notification);
```

> 💡 This is the same principle as Spring's Strategy pattern. Effective Java item 34 makes "prefer enums over int constants" a hard standard in most code review checklists.

## EnumMap and EnumSet — Why They Exist

Because enum constants are known at compile time and have integer ordinals, the JVM can back maps and sets with **arrays indexed by ordinal** instead of hash tables.

```java
// Count orders by state — no hashing, no bucket collisions
EnumMap<OrderState, Long> counts = orderRepo.countByState();
// Iteration happens in declaration order (CREATED → CANCELLED) — useful for reports

// User permissions — a compact set of roles
EnumSet<UserRole> roles = EnumSet.of(UserRole.ADMIN, UserRole.SUPPORT);
if (roles.contains(UserRole.ADMIN)) {
    return adminController.handle(request);
}
```

Line-by-line:

| Call | Why it's better than HashMap/HashSet |
|---|---|
| `EnumMap<OrderState, Long>` | Array-backed: no hashing, no `hashCode()`, no collisions; iteration in declaration order |
| `EnumSet.of(ADMIN, SUPPORT)` | For ≤64 constants this is a single `long` bitmask — dramatically smaller than a HashSet |
| `roles.contains(ADMIN)` | O(1) bitmask check vs HashSet's hash → equals chain |

**Org scenario:** A reporting dashboard uses `EnumMap<State, List<Order>>` to bucket 50k orders into a state-based grid. The benchmark shows 4× less memory than `HashMap` and 2× faster iteration — the JVM knows the exact set of keys at compile time.

## Real-World Incidents

**Scenario 1 — The ordinal disaster.** A team persisted `ordinal()` to the database. After adding a `CANCELLED` constant before `SHIPPED`, every `SHIPPED` record became `CANCELLED` in production. Fix: always persist `name()` or an explicit `code` field.

**Scenario 2 — Mutable enum fields.** A cache stored per-request data on enum constants. Under concurrent load, one thread's data leaked to another. The rule: enums are immutable singletons, never mutable state holders.

## Common Mistages

| Mistake | Symptom | Fix |
|---|---|---|
| `switch` without `default` | New constant silently does nothing | Use switch expressions (arrow syntax) for exhaustiveness checks, or strategy enum |
| Persisting `ordinal()` | Data corruption after reordering | Use `name()` or a dedicated `code` field |
| Mutable fields on enums | Thread-safety bugs | All fields must be `final` |
| Calling `values()` in a hot loop | Unnecessary garbage allocation each time | Cache in a static final array |
| Using int constants instead of enums | `sendEmail(3)` compiles with no safety | Enums = compile-time type safety |
