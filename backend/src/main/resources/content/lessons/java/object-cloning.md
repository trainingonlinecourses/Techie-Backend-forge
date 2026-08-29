---
title: Cloning & Copying — clone(), Copy Constructors and Defensive Copies
summary: Why Object.clone is broken, copy constructors and factories, shallow vs deep copies, and the defensive-copy patterns that prevent mutation bugs.
order: 35
minutes: 18
topics: [clone, copy-constructor, shallow-copy, deep-copy, defensive-copy, immutability, record-copy]
docs:
  - https://docs.oracle.com/javase/tutorial/java/data/objectref.html
  - https://www.baeldung.com/java-deep-copy
---

# Cloning & Copying — clone(), Copy Constructors and Defensive Copies

## The concept: reference copies vs value copies

```java
Order a = new Order(1, "PAID");
Order b = a;              // NOT a copy — a and b are the SAME object
b.setStatus("REFUNDED");  // a.status is now REFUNDED too!
```

Copying an object has two depths:

- **Shallow copy** — a new object whose *fields point at the same nested objects* as the original.
- **Deep copy** — a new object whose *nested objects are also copied*, fully independent.

Whether shallow is enough depends on whether the nested objects are immutable. For a `Order` whose `items` list is mutable, a shallow copy shares the list — mutating one mutates the other. That's usually not what "give me a copy" means.

## Why Object.clone() is the wrong default

`Object.clone()` exists but is widely considered **broken-by-design**:

- `clone()` is `protected` on `Object` — you must implement `Cloneable` and override it, and forget it and you get `CloneNotSupportedException`.
- It does a **shallow** copy via a JVM-native field copy — the nested objects are shared.
- `Cloneable` is a marker with no methods — the compiler can't help.
- Copying a `final` field's reference is fine, but cloning final fields in general is awkward.

Effective Java's verdict: **prefer copy constructors and copy factories over `clone()`**. The modern idioms:

```java
// Copy constructor
public Order(Order other) {
    this.id = other.id;
    this.status = other.status;
    this.items = new ArrayList<>(other.items);   // deep for mutable parts
}

// Copy factory
public static Order copyOf(Order other) { return new Order(other); }

// Records give you a copy via with... (Java 21+):
Order updated = order.withStatus("REFUNDED");    // a NEW record — originals untouched
```

## How we use it in an organization: the scenarios

**Scenario 1 — defensive copies at API boundaries.** The #1 org pattern: **never expose your internal mutable state**. If you return the internal list, callers can mutate your object; if you store the caller's list, callers can corrupt you:

```java
public final class Order {
    private final List<OrderItem> items;         // mutable internally

    public Order(List<OrderItem> items) {
        this.items = new ArrayList<>(items);      // defensive copy ON INPUT
    }

    public List<OrderItem> getItems() {
        return Collections.unmodifiableList(new ArrayList<>(items));  // defensive copy ON OUTPUT
        // or: return items.stream().toList(); — an immutable copy
    }
}
```

`List.copyOf(...)` (Java 10+) returns an immutable copy in one call — the modern tool for this exact pattern. The rule: **immutable inside, immutable at the boundary** — the internal list is never handed out by reference.

**Scenario 2 — versioned domain objects (the "edit draft" pattern).** A change request starts as a copy of the current state so the original stays intact until approval:

```java
Order working = Order.copyOf(original);     // independent working copy
working.applyChanges(edit);                 // mutate the copy freely
if (approver.ok(working)) orderRepo.save(working);
```

**Scenario 3 — deep copy for cache or messaging.** When an object crosses a trust boundary (put into a cache, sent to a queue, handed to a plugin), a deep copy prevents aliasing bugs — the receiver can't corrupt the sender's object.

## Deep copy techniques

- **Copy constructors / factories** — explicit, type-safe, the org standard. Deep for the mutable fields, shallow (share) for immutable ones.
- **`List.copyOf` / `Map.copyOf`** — immutable copies of collections in one call.
- **Records** — deep by design for their components; `withX(...)` (Java 21) produces modified copies.
- **Serialization-based deep copy** — serialize then deserialize. Works generically but is slow, fragile (final fields, non-serializable), and a code smell in review. Avoid.
- **Reflection/cloning libraries (Apache Commons `SerializationUtils`, `deepCopy` libs)** — convenient, but hide what's copied and break on exotic types. Use for JSON DTO round-trips if at all.

## The pitfalls

- **A copy that shares mutable state is a bug disguised as a fix** — the classic "I cloned it but the original changed too". Trace the nested objects; deep-copy the mutable ones.
- **Exposing internal collections** — returning `this.items` directly lets callers mutate your object's state. `getItems()` must return a copy or an unmodifiable view.
- **`clone()` in new code** — review will flag it; use copy constructors/factories.
- **Copying immutable objects unnecessarily** — if the object (a `record`, an enum, a `String`) is immutable, sharing the reference is safe and correct; "deep copy everything" is overkill and wastes memory.

## Key takeaways

- Reference assignment is not a copy — only constructors/factories create independent objects.
- Shallow copies share mutable nested objects; deep copies don't — know which you need per field.
- Prefer copy constructors/factories and `List.copyOf` over `Object.clone()`.
- Defensive-copy at boundaries: copy input and output so callers can't corrupt your state.
- Immutable objects (records, strings, enums) can be shared safely — don't copy them needlessly.
