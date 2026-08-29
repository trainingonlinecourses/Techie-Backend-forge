---
title: The Object Class — Every Class's Hidden Parent
summary: toString, equals, hashCode, getClass, clone and finalize — what each method does, how every Java object inherits them, and why organizations override three of them in almost every entity.
order: 68
minutes: 25
topics: [object-class, tostring, equals, hashcode, getclass, clone]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Object.html
---

## The Concept, From Zero

Here is a fact that surprises most beginners: **every single class you ever write in Java automatically extends `java.lang.Object`** — even when you don't write `extends` at all.

```java
public class Customer { }
```

Behind the scenes the compiler treats this as:

```java
public class Customer extends Object { }
```

Why does this matter? Because it means **every object in your application already has 11 methods** the moment it is created: `toString()`, `equals()`, `hashCode()`, `getClass()`, `clone()`, `finalize()`, `wait()` (3 overloads), and `notify()`/`notifyAll()`. You never wrote them — they came free from `Object`.

This is also why you can pass **anything** to methods like `System.out.println(...)` or store anything in a pre-generics collection: those APIs accept `Object`, and `Object` is the common ancestor of all types.

The catch: the inherited default implementations are usually **not what you want in a real application**. Let's walk through each method, see what the default does, why that's often wrong for business objects, and how organizations override them.

## Method 1: `toString()` — "Describe yourself as text"

### What the default does

```java
Customer c = new Customer();
System.out.println(c);
// Prints something like: Customer@1b6d3586
```

Line by line:

| Line | What happens |
|---|---|
| `System.out.println(c)` | println receives an object, calls `c.toString()`, then prints the returned string |
| `Customer@1b6d3586` | Default format = class name + `@` + hex of the identity hash code |

That output is useless for debugging. Which customer is it? What's their email? You can't tell.

### Why organizations always override it

```java
public class Customer {
    private final Long id;
    private final String email;

    public Customer(Long id, String email) {
        this.id = id;          // store the id on THIS instance's field
        this.email = email;    // store the email on THIS instance's field
    }

    @Override                                       // ask compiler to verify Object really has this method
    public String toString() {                      // same signature as Object.toString()
        return "Customer{id=" + id + ", email='" + email + "'}";
        // build a human-readable description using our fields
    }
}
```

Now logging `c` prints `Customer{id=42, email='amy@corp.com'}` — immediately useful at 3 AM during an incident.

> 💡 **Org scenario:** When a payment fails in production, engineers read logs. A log line saying `Payment@7a81197d` tells them nothing; `Payment{orderId=8891, amount=49.99, status=FAILED}` lets support resolve the ticket without opening the database. Most style guides (Google, Spring itself) mandate meaningful `toString()` on all domain classes.

## Method 2: `equals()` — "Are two objects logically the same?"

### What the default does

```java
Customer a = new Customer(1L, "amy@corp.com");
Customer b = new Customer(1L, "amy@corp.com");
System.out.println(a.equals(b)); // false !!
```

The default `equals()` is just `==` — it compares **memory addresses**, asking "is this literally the same object?" Two separate objects holding identical data are *not* the same object, so it returns false.

But in business terms these ARE the same customer. That's why we override:

```java
@Override
public boolean equals(Object o) {          // must take Object, not Customer — see pitfall below
    if (this == o) return true;            // fast path: same reference means trivially equal
    if (!(o instanceof Customer)) return false; // different type can never be equal
    Customer other = (Customer) o;         // now safe to cast, we know the type
    return id.equals(other.id);            // compare by BUSINESS identity (the id field)
}
```

Line-by-line reasoning:

1. `this == o` — cheap check first; if both variables point to the same object, skip everything.
2. `instanceof` — protects against `null` (null is never an instance of anything) and against comparing a Customer to, say, an Invoice.
3. Cast — required because the parameter type is `Object`.
4. Compare fields — choose the field(s) that define *identity* in your domain, not every field.

## Method 3: `hashCode()` — equals()'s contract partner

Hash-based collections (`HashMap`, `HashSet`) work in two steps: find the right bucket via `hashCode()`, then confirm equality within the bucket via `equals()`. This creates **the golden contract**:

> If `a.equals(b)` is true, then `a.hashCode() == b.hashCode()` MUST be true.

If you override `equals()` but not `hashCode()`, lookups break silently:

```java
Set<Customer> customers = new HashSet<>();
customers.add(new Customer(1L, "amy@corp.com"));
customers.add(new Customer(1L, "amy@corp.com"));
System.out.println(customers.size()); // 2 — duplicate! hashCode defaults differ
```

The fix:

```java
@Override
public int hashCode() {
    return Objects.hash(id);   // utility builds hash from the SAME fields used in equals()
}
```

- `Objects.hash(...)` takes your equality fields and combines them safely.
- Use exactly the same field list as `equals()`. Fewer or more fields breaks the contract.
- Modern shortcut: write a `record` instead — records auto-generate correct `equals`/`hashCode`/`toString`.

> ⚠️ **Classic production bug:** putting mutable JPA entities into a `HashSet` and then modifying a field used by `hashCode()`. The object's hash changes while inside the set, so `contains()` can no longer find it — it becomes a "lost" entry. Organizations avoid this by hashing only immutable IDs, or using `LinkedHashSet` of IDs instead.

## Method 4: `getClass()` — "What am I, really?"

```java
Object obj = new ArrayList<String>();
System.out.println(obj.getClass());              // class java.util.ArrayList
System.out.println(obj.getClass().getSimpleName()); // ArrayList
```

- Returns the **runtime class**, ignoring the declared variable type.
- It's `final` — you cannot override it. Every object honestly reports its actual type.
- It's the gateway to the entire reflection API (covered in the Reflection module).

Frameworks live on this method: Spring inspects `getClass()` plus annotations to decide how to wire beans; Jackson reads it to decide which JSON shape to produce.

## Method 5: `clone()` — copying objects (and why orgs avoid it)

```java
@Override
public Customer clone() throws CloneNotSupportedException {
    return (Customer) super.clone();   // shallow-copies all fields bitwise
}
```

- Requires implementing the marker interface `Cloneable`, otherwise `super.clone()` throws.
- Produces a **shallow copy**: nested objects are shared between original and clone — mutating the clone's address mutates the original's too.

Because shallow-copy surprises cause real bugs, modern teams prefer:

1. **Copy constructors** — `new Customer(original)` (see the Copy Constructor lesson).
2. **Records** — immutable, so sharing state is harmless.
3. Serialization round-trips for deep copies when genuinely needed.

## Method 6–11: threading methods

`wait()`, `notify()`, `notifyAll()` are the low-level building blocks of inter-thread communication (covered in depth in the Concurrency module). They exist on `Object` because any object can serve as a monitor lock — every Java object carries an internal lock header.

## Real Organizational Scenarios

**Scenario 1 — Deduplicating imports.** An e-commerce platform ingests supplier catalogs where the same product appears many times. `equals()`/`hashCode()` keyed on supplier SKU lets `HashSet<Product>` collapse duplicates in one line.

**Scenario 2 — Cache keys.** A pricing service caches results in a `ConcurrentHashMap<PriceRequest, Price>`. Correct `equals`+`hashCode` on the request record is what makes cache hits possible at all.

**Scenario 3 — Test assertions.** `assertEquals(expectedOrder, actualOrder)` in tests calls `equals()`. Without an override, tests compare references and fail mysteriously even though all data matches.

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Overriding `equals(Customer)` instead of `equals(Object)` | Doesn't actually override; HashMap still broken | Parameter must be `Object`; use `@Override` |
| `equals` uses 5 fields, `hashCode` uses 2 | Duplicate entries in HashSets | Identical field sets in both |
| Mutating hash-relevant fields after adding to a Set | `contains()` returns false forever | Hash only immutable fields |
| Relying on default `toString()` in logs | Unreadable logs during incidents | Override or use records/Lombok `@ToString` |
