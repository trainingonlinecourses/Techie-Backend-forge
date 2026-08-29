---
title: Enum Operations — valueOf, EnumSet, EnumMap and Strategy Patterns
summary: Using enums beyond simple constants — EnumSet for fast bitset operations, EnumMap for type-safe mapping, abstract methods per constant, and the strategy pattern that replaces whole class hierarchies.
order: 78
minutes: 20
topics: [enumset, enummap, enum-values, enum-valueof, enum-strategy, enum-abstract-method, bitwise-enum]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/enum.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/EnumSet.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/EnumMap.html
---

# Enum Operations — valueOf, EnumSet, EnumMap and Strategy Patterns

## The concept: enums are full-fledged types

Beginners use enums as named constants (`Status.ACTIVE`). But enums in Java are **full classes** — they can have fields, constructors, abstract methods, and implement interfaces. The JDK also provides specialized collections (`EnumSet`, `EnumMap`) that are dramatically faster than `HashSet`/`HashMap` for enum keys because they use bitmasks internally.

**The mental model:** an enum constant is a **singleton instance** of its enum type. `Status.ACTIVE` is literally `new Status()`. This means enums can carry behavior, not just names.

## Core enum operations: values() and valueOf()

```java
public enum Status {
    ACTIVE, INACTIVE, PENDING, DELETED;
}

// values() — returns ALL constants as an array (useful for iteration, validation)
Status[] all = Status.values();                    // [ACTIVE, INACTIVE, PENDING, DELETED]
for (Status s : Status.values()) {
    System.out.println(s.name() + " ordinal " + s.ordinal());
}
// ACTIVE ordinal 0, INACTIVE ordinal 1, PENDING ordinal 2, DELETED ordinal 3

// valueOf(String) — converts a string to the enum constant (throws IllegalArgumentException)
Status s = Status.valueOf("ACTIVE");              // s == Status.ACTIVE
Status bad = Status.valueOf("active");            // THROWS IllegalArgumentException!
// valueOf is CASE-SENSITIVE — must match the constant name exactly
```

**Line-by-line breakdown:**
- `Status.values()` — compiler generates this method; returns a **clone** of the internal array (safe to modify, but wasteful — cache the result if called repeatedly)
- `s.name()` — returns the String name of the constant (same as `toString()` by default)
- `s.ordinal()` — returns the position (0-based) in the declaration order; **don't persist ordinals** — reordering the enum breaks them
- `Status.valueOf("ACTIVE")` — the reverse of `name()`; useful for deserialization from JSON/DB, but beware the case sensitivity

## EnumSet — the fast bitset for enums

`EnumSet` is a `Set<Enum>` backed by a **bitmask** — each enum constant maps to a bit. This makes it the fastest `Set` implementation for enums (O(1) add/contains/remove, no hashing, no tree balancing).

```java
import java.util.EnumSet;

// Create an EnumSet
EnumSet<Status> activeStatuses = EnumSet.of(Status.ACTIVE, Status.PENDING);
EnumSet<Status> allStatuses = EnumSet.allOf(Status.class);          // every constant
EnumSet<Status> none = EnumSet.noneOf(Status.class);                // empty set
EnumSet<Status> range = EnumSet.range(Status.ACTIVE, Status.PENDING); // ACTIVE, INACTIVE, PENDING

// Bitwise operations — the killer feature
EnumSet<Status> deleted = EnumSet.of(Status.DELETED);
EnumSet<Status> notDeleted = EnumSet.complementOf(deleted);         // ACTIVE, INACTIVE, PENDING

// Set operations (all O(1) due to bitmask)
EnumSet<Status> combined = EnumSet.copyOf(activeStatuses);         // copy
combined.addAll(EnumSet.of(Status.DELETED));                        // union
combined.retainAll(EnumSet.of(Status.ACTIVE, Status.DELETED));      // intersection
combined.removeAll(EnumSet.of(Status.ACTIVE));                      // difference
```

**Line-by-line breakdown:**
- `EnumSet.of(Status.ACTIVE, Status.PENDING)` — creates a set with those two constants; internally a `long` with bits 0 and 2 set (`0b0101`)
- `EnumSet.allOf(Status.class)` — all bits set; equivalent to `EnumSet.of(Status.values())` but cleaner
- `EnumSet.range(A, C)` — all constants between A and C inclusive (by ordinal order)
- `EnumSet.complementOf(deleted)` — flips all bits; O(1) complement
- The bitmask operations make `contains()`, `add()`, and `remove()` essentially bit operations — **no hashing, no comparison, no allocation**

**Why EnumSet beats HashSet:**
| Operation | EnumSet | HashSet |
|---|---|---|
| `contains(x)` | Bit test (O(1)) | Hash + equals (O(1) avg, O(n) worst) |
| Memory | 1 long for ≤64 constants | Hash table + Node objects |
| GC pressure | Zero (no object per entry) | One Node per entry |
| Iteration | Linear scan of bits | Hash table traversal |

## EnumMap — the fast map for enum keys

`EnumMap` uses the enum's ordinal as the array index — same bitmask advantage, but for key-value pairs:

```java
import java.util.EnumMap;

EnumMap<Status, Integer> counts = new EnumMap<>(Status.class);
counts.put(Status.ACTIVE, 150);
counts.put(Status.PENDING, 23);

// Type-safe — keys must be the enum type
int activeCount = counts.getOrDefault(Status.ACTIVE, 0);           // 150
int deletedCount = counts.getOrDefault(Status.DELETED, 0);         // 0 (default)

// Iteration order matches declaration order (not HashMap's hash-order)
for (Map.Entry<Status, Integer> entry : counts.entrySet()) {
    System.out.println(entry.getKey() + ": " + entry.getValue());
}
// ACTIVE: 150, PENDING: 23 — guaranteed declaration order
```

**Line-by-line breakdown:**
- `new EnumMap<>(Status.class)` — allocates an array of size `Status.values().length`; nulls for unset entries
- `counts.put(Status.ACTIVE, 150)` — sets `array[Status.ACTIVE.ordinal()] = 150`; O(1)
- `counts.getOrDefault(Status.DELETED, 0)` — returns `array[ordinal]` or the default; O(1)
- Iteration is in **declaration order** (because it's array iteration) — unlike `HashMap` which has no order guarantee

## Abstract methods in enums — the strategy pattern

Each enum constant can **override an abstract method**, turning the enum into a strategy pattern without separate classes:

```java
public enum PaymentMethod {
    CREDIT_CARD {
        @Override
        public void process(BigDecimal amount) {
            gateway.chargeCard(amount);
        }
    },
    BANK_TRANSFER {
        @Override
        public void process(BigDecimal amount) {
            bank.initiateTransfer(amount, accountNumber);
        }
    },
    CRYPTO {
        @Override
        public void process(BigDecimal amount) {
            blockchain.transfer(walletAddress, amount);
        }
    };

    // Abstract method — each constant MUST implement it
    public abstract void process(BigDecimal amount);

    // Shared method — all constants inherit this
    public void processWithFee(BigDecimal amount, BigDecimal fee) {
        process(amount.add(fee));
    }
}

// Usage — clean, no switch statement needed
PaymentMethod method = PaymentMethod.valueOf(userChoice);
method.process(orderTotal);      // dispatches to the right implementation
```

**Line-by-line breakdown:**
- Each constant (`CREDIT_CARD`, `BANK_TRANSFER`, `CRYPTO`) is an **anonymous subclass** of `PaymentMethod` that overrides `process()`
- `public abstract void process(...)` — declared in the enum body; every constant must implement it or the code won't compile
- `processWithFee()` — a concrete shared method; all constants inherit it without overriding
- `method.process(orderTotal)` — polymorphic dispatch; no `switch` statement, no `if/else` chain

**Why this beats a switch:**
| Approach | Problem |
|---|---|
| `switch (method)` | Forgetting a case → silent default; adding a new constant doesn't cause a compile error |
| Enum with abstract method | Adding a new constant without implementing the method → **compile error**; impossible to forget |

## Instance fields and constructors in enums

```java
public enum HttpStatus {
    OK(200, "Success"),
    NOT_FOUND(404, "Not Found"),
    INTERNAL_SERVER_ERROR(500, "Internal Server Error");

    private final int code;
    private final String message;

    // Constructor — called once per constant; PRIVATE by default
    HttpStatus(int code, String message) {
        this.code = code;
        this.message = message;
    }

    public int getCode() { return code; }
    public String getMessage() { return message; }

    // Lookup by code — the "reverse map" pattern
    private static final Map<Integer, HttpStatus> BY_CODE =
        Arrays.stream(values()).collect(Collectors.toMap(HttpStatus::getCode, s -> s));

    public static HttpStatus fromCode(int code) {
        return BY_CODE.getOrDefault(code, INTERNAL_SERVER_ERROR);
    }
}
```

**Line-by-line breakdown:**
- `HttpStatus(200, "Success")` — this is a **constructor call** inside the enum declaration; equivalent to `new HttpStatus(200, "Success")`
- `private final int code` — enum constants are `static final` by default; these fields are set once in the constructor and never change
- `private static final Map<Integer, HttpStatus> BY_CODE` — built once at class load time; provides O(1) reverse lookup
- `Arrays.stream(values()).collect(...)` — builds the reverse map from all constants; a clean one-liner

## Comparing enums: == vs .equals()

```java
Status a = Status.ACTIVE;
Status b = Status.ACTIVE;

// == is correct and preferred for enums (they're singletons)
if (a == b) { /* always true for same constant */ }

// .equals() works too but is redundant (and may be overridden by a custom equals — rare but possible)
if (a.equals(b)) { /* also true, but slower and unnecessary */ }
```

**Rule:** use `==` for enum comparison. It's null-safe (won't throw NPE if left side is null), faster (no method call), and semantically correct (enums are singletons).

## Real-world scenarios

**Scenario 1 — Order status with lifecycle enforcement:**
```java
public enum OrderStatus {
    CREATED {
        @Override public OrderStatus next() { return CONFIRMED; }
    },
    CONFIRMED {
        @Override public OrderStatus next() { return SHIPPED; }
    },
    SHIPPED {
        @Override public OrderStatus next() { return DELIVERED; }
    },
    DELIVERED {
        @Override public OrderStatus next() { throw new IllegalStateException("Already delivered"); }
    };

    public abstract OrderStatus next();
}

// Usage — the state machine is the enum itself
OrderStatus status = OrderStatus.CREATED;
status = status.next();   // CONFIRMED
status = status.next();   // SHIPPED
status = status.next();   // DELIVERED
status = next();          // THROWS IllegalStateException
```

**Scenario 2 — Feature flags using EnumSet:**
```java
public enum Feature { DARK_MODE, BETA_FEATURES, ANALYTICS, NOTIFICATIONS }

EnumSet<Feature> enabledFeatures = EnumSet.of(Feature.DARK_MODE, Feature.ANALYTICS);

// Check in templates/controllers
if (enabledFeatures.contains(Feature.DARK_MODE)) {
    // show dark mode toggle
}
```

**Scenario 3 — Permission matrix using EnumMap:**
```java
EnumMap<Role, EnumSet<Permission>> permissions = new EnumMap<>(Role.class);
permissions.put(Role.ADMIN, EnumSet.allOf(Permission.class));
permissions.put(Role.USER, EnumSet.of(Permission.READ, Permission.WRITE));
permissions.put(Role.VIEWER, EnumSet.of(Permission.READ));

// Check permission
EnumSet<Permission> userPerms = permissions.getOrDefault(Role.USER, EnumSet.noneOf(Permission.class));
if (userPerms.contains(Permission.DELETE)) { /* denied */ }
```

## Common mistakes

| Mistake | Why it's wrong | Fix |
|---|---|---|
| Using `ordinal()` as a key or DB value | Reordering enum constants breaks ordinals | Use `name()` or a dedicated code field |
| `valueOf("active")` — case mismatch | `valueOf` is case-sensitive; throws `IllegalArgumentException` | Use `name().equalsIgnoreCase()` or handle the exception |
| Using `switch` instead of abstract methods | Forgetting a case compiles with `default`; adding constants doesn't force updates | Use abstract methods — missing implementation = compile error |
| Using `HashSet<Status>` | Wasteful — hashing + object overhead for a type that fits in a `long` | Use `EnumSet.of(...)` instead |
| Using `HashMap<Status, V>` | Same overhead — array index would be faster | Use `new EnumMap<>(Status.class)` instead |
| `== null || enum.equals(other)` | Enum comparison should be `==`; `.equals()` is redundant | Use `enum == other` (null-safe on the left side) |

## Key takeaways

- `values()` returns all constants (cache it); `valueOf(String)` converts name to constant (case-sensitive).
- `EnumSet` is a bitmask-backed `Set` — O(1) everything, zero GC pressure, the fastest `Set` for enums.
- `EnumMap` uses ordinals as array indices — O(1), declaration-ordered iteration.
- Abstract methods in enums make each constant a strategy — adding a constant without implementing the method is a compile error (impossible to forget).
- Use `==` for enum comparison; never use `ordinal()` as a persisted or external key.

**Official docs:** [Enum tutorial](https://docs.oracle.com/javase/tutorial/java/javaOO/enum.html) · [EnumSet API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/EnumSet.html) · [EnumMap API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/EnumMap.html)
