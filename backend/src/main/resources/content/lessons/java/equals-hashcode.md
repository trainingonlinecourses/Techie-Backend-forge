---
title: equals, hashCode & toString — The Object Contracts
summary: The equals/hashCode contract, why HashSet and HashMap break when you violate it, and how records made the boilerplate obsolete.
order: 24
minutes: 20
topics: [equals, hashcode, contract, hashmap, hashset, records, identity-vs-equality]
docs:
  - https://docs.oracle.com/javase/tutorial/java/IandI/objectclass.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Object.html
---

## The Concept, From Zero

Every Java object inherits three methods from `java.lang.Object` — but their default behavior is almost always wrong for business objects. Understanding *why* they're wrong and *how* to fix them is one of the most important Java fundamentals.

### Identity vs Equality — What's the difference?

```java
Customer a = new Customer(1L, "Amy");
Customer b = new Customer(1L, "Amy");
Customer c = a;

System.out.println(a == b);       // false — different objects in memory
System.out.println(a.equals(b));  // false by default! — same data, different reference
System.out.println(a == c);       // true  — c points to the exact same object as a
```

The default `equals()` from `Object` is just `==` — it asks "are these the **same object in memory**?" For a business system, you usually want "do they represent the **same customer**?" — meaning the same `id`, not the same memory address.

## equals() — How to Override Correctly

```java
@Override                                          // tells compiler: I intend to override Object.equals
public boolean equals(Object o) {                   // MUST take Object, not Customer — see pitfall below
    if (this == o) return true;                    // fast path: same reference → trivially equal
    if (o == null || getClass() != o.getClass()) return false;  // different type → never equal
    Customer other = (Customer) o;                  // safe cast: we know the type now
    return id.equals(other.id);                     // compare by BUSINESS identity (the id field)
}
```

Line-by-line:

| Line | Why it matters |
|---|---|
| `@Override` | Without this annotation, if you misspell the signature (e.g. `equals(Customer o)`), it silently becomes a *new* method instead of an override — the `HashMap` still uses the default, and you don't find out until a bug surfaces in production |
| `Object o` (not `Customer o`) | The parameter type must be `Object` to actually override the inherited method. If you write `equals(Customer o)` you're overloading, not overriding |
| `if (this == o) return true` | Cheap reference check first — saves the cost of field comparisons when both variables point to the same object |
| `if (o == null) return false` | A `null` can never equal anything — this prevents a NullPointerException when calling `o.getClass()` |
| `getClass() != o.getClass()` | Different classes are never equal (a `PremiumCustomer` is never equal to a regular `Customer`, even with the same `id`) |
| `(Customer) o` | Now safe to cast — we've confirmed it's the right type |
| `id.equals(other.id)` | The **one field** that defines business identity — not email, not name, just the id |

> **Modern alternative:** If your class is just data, use a `record` — it generates correct `equals`/`hashCode`/`toString` for you automatically.

## hashCode() — The Contract Partner

Hash-based collections (`HashMap`, `HashSet`) work in two steps: find the right bucket using `hashCode()`, then confirm equality with `equals()` within that bucket. This creates **the Golden Contract**:

> If `a.equals(b)` is true, then `a.hashCode() == b.hashCode()` **must** be true.

If you override `equals()` but forget `hashCode()`:

```java
Set<Customer> customers = new HashSet<>();
customers.add(new Customer(1L, "Amy"));
customers.add(new Customer(1L, "Amy"));
System.out.println(customers.size());  // 2 — WRONG! Should be 1, but hashCode is different
```

The fix:

```java
@Override
public int hashCode() {
    return Objects.hash(id);   // same field used in equals — contract satisfied
}
```

Line-by-line:

| Line | Why |
|---|---|
| `Objects.hash(id)` | Utility method that combines fields into a well-distributed hash using a standard algorithm |
| `id` (only) | Use the **same fields** as `equals()` — not more, not fewer. Using different fields breaks the contract |

## toString() — Making Objects Debuggable

```java
// Default: "Customer@1b6d3586" — useless in logs at 3 AM
// Override to:
@Override
public String toString() {
    return "Customer{id=" + id + ", email='" + email + "'}";
}
// Now: "Customer{id=1, email='Amy'}" — immediately useful
}
```

**Org scenario:** A payment fails at 2 AM. Engineers read logs. `Payment@7a81197d` tells them nothing. `Payment{orderId=8891, amount=49.99, status=FAILED}` lets support resolve the ticket without opening the database.

## Records — The Modern Escape Hatch

Since Java 16, you can replace all three methods with a one-liner:

```java
public record Customer(Long id, String email) { }
// Automatically generates: constructor, getters, equals(), hashCode(), toString()
// Immutable by default — all fields are final
```

This is why most new Java code uses records for data carriers. The boilerplate is gone, the contract is always satisfied, and the compiler enforces immutability.

## Real-World Incidents

**Scenario 1 — The HashSet leak.** An e-commerce platform put mutable JPA entities into a `HashSet`. After updating an `id`-used-by-`hashCode()` field, `contains()` could no longer find the entry — it was "lost" in the set. Fix: hash only immutable fields, or store IDs in sets, not entities.

**Scenario 2 — The test that always passed.** A team wrote `assertEquals(expected, actual)` where `equals()` defaulted to `==`. Tests passed because the same factory object was reused. When factories were refactored to return new objects, 47 tests broke simultaneously.

**Scenario 3 — The Duplicate Key crash.** A `ConcurrentHashMap` threw `ConcurrentModificationException` because one thread modified a field used by `hashCode()` while another was reading. Root cause: mutable fields in `hashCode()` under concurrent access.

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| `equals(Customer o)` instead of `equals(Object o)` | HashMap silently broken — override never fires | Always `@Override` + `Object` parameter |
| Different fields in equals vs hashCode | Duplicate entries in HashSet/HashMap | Identical field sets in both |
| Mutable fields in hashCode | "Lost" entries after field change | Hash only immutable fields |
| Missing @Override on equals | New method instead of override — compile succeeds, runtime broken | Always annotate |
| Using `==` instead of `.equals()` for objects | Compares memory addresses, not data | Always `.equals()` for value objects |
