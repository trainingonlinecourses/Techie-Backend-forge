---
title: equals, hashCode & toString — The Object Contracts
summary: The equals/hashCode contract, why HashSet and HashMap break when you violate it, and how records made the boilerplate obsolete.
order: 23
minutes: 20
topics: [equals, hashcode, contract, hashmap, hashset, records, identity-vs-equality]
docs:
  - https://docs.oracle.com/javase/tutorial/java/IandI/objectclass.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Object.html
---

# equals, hashCode & toString — The Object Contracts

## The concept: identity vs equality

Every object inherits three methods from `Object`:

- `equals(Object)` — defaults to **identity** (`this == obj`), i.e. "the same object instance".
- `hashCode()` — defaults to a value derived from the object's memory address.
- `toString()` — defaults to `ClassName@hexhash`, which is useless in logs.

Most domain values need **value equality**: two `Money(19.99, USD)` objects are equal if their amount and currency match, even if they are different instances. When you override `equals`, you must override `hashCode` to honor the **contract** — the one rule that, when broken, silently corrupts `HashMap`, `HashSet`, and `HashMap`-backed caches:

> **If two objects are equal, they must have the same hashCode.**

The reverse is allowed (hash collisions are normal), but the forward direction is mandatory.

## Why the contract matters in production

```java
class Customer {
    String email;
    // equals overridden, hashCode NOT overridden ← bug

    @Override public boolean equals(Object o) {
        if (!(o instanceof Customer c)) return false;
        return email.equals(c.email);
    }
}

Set<Customer> deduped = new HashSet<>();
deduped.add(new Customer("a@x.com"));
deduped.add(new Customer("a@x.com"));
System.out.println(deduped.size()); // 2, not 1 — the set never deduplicates!
```

`HashSet` finds a bucket via `hashCode()` first, then checks `equals()` within the bucket. Two equal customers land in *different* buckets because their hashCodes differ — so `equals` is never consulted and duplicates slip through. This is a **silent correctness bug**: no exception, no warning, wrong deduplication, wrong cache hits, wrong membership checks.

## The contract, stated precisely

- **Reflexive:** `x.equals(x)` is true.
- **Symmetric:** `x.equals(y)` iff `y.equals(x)`.
- **Transitive:** if `x.equals(y)` and `y.equals(z)` then `x.equals(z)`.
- **Consistent:** repeated calls give the same result (so don't base `equals` on mutable fields).
- **`equals` → `hashCode`:** equal objects have equal hashCodes.

## How we use it in an organization: a well-formed value object

```java
public record Address(String street, String city, String zip, String country) {
    // records auto-generate equals, hashCode, and toString from all components —
    // the compiler writes the contract correctly and keeps it in sync when fields change
}

// Old-style class — still everywhere in legacy code, must be hand-written carefully
public final class CustomerId {
    private final long id;
    private final long tenantId;

    public CustomerId(long id, long tenantId) { this.id = id; this.tenantId = tenantId; }

    @Override public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof CustomerId c)) return false;
        return id == c.id && tenantId == c.tenantId;
    }

    @Override public int hashCode() { return Objects.hash(id, tenantId); }

    @Override public String toString() { return "CustomerId[" + tenantId + "/" + id + "]"; }
}
```

**Why organizations push records for value types:** hand-written `equals`/`hashCode` is where subtle bugs live — forgetting a field, mixing `getClass()` and `instanceof` asymmetries, mutable fields breaking consistency. A `record` generates all three methods from the components, and any future field addition updates them automatically. Most modern Java codebases therefore use records for DTOs, keys, and value objects, and keep hand-written classes only where identity semantics are genuinely needed (entities, caches).

## Real scenarios

- **Cache keys:** an API gateway caches by `(tenantId, customerId, locale)` — a composite key object that must implement `equals`/`hashCode` correctly or the cache returns wrong data across tenants. Records make this safe by construction.
- **Set-based deduplication in batch jobs:** nightly ETL dedupes events with `HashSet<EventKey>` — same bug class as above if the key is a poorly written class.
- **JPA entities:** entities usually use **identity** equality (the `@Id`), because two detached copies of the same row are "the same" only via id. Overriding `equals` on entities by *all* fields is a classic bug — it breaks persistence-context identity semantics.
- **Logging:** a good `toString` (`CustomerId[42/7]`, `Money[USD 19.99]`) is what you see in logs and stack traces. Records give it for free; legacy classes should have it hand-written because debugging against `Customer@1a2b3c` wastes hours.

## Key takeaways

- Override `equals` and `hashCode` together, or not at all; equal objects must share a hashCode.
- Base equality on immutable fields only; prefer `instanceof` + field comparison (records do this).
- Use `Objects.equals`/`Objects.hash` to avoid null-handling bugs.
- Prefer **records** for value objects — the compiler maintains the contract.
- Entities in JPA compare by identity/id; DTOs and value objects compare by value.
