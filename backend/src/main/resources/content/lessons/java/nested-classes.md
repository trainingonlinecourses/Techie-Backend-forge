---
title: Nested & Inner Classes — Static, Inner, Local and Anonymous
summary: The four kinds of nested classes, when each is used in production, the implicit-outer-reference gotcha, and lambda-vs-anonymous-class trade-offs.
order: 30
minutes: 20
topics: [nested-classes, inner-class, static-nested, anonymous-class, local-class, outer-reference, lambdas]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/nested.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/invoke/LambdaMetafactory.html
---

# Nested & Inner Classes — Static, Inner, Local and Anonymous

## The concept: classes inside classes

Java allows classes declared inside other classes — four kinds, each with different semantics:

1. **Static nested class** — `static class Nested` inside a class. No implicit reference to the outer instance; behaves like a top-level class namespaced to its parent.
2. **Inner (non-static) class** — `class Inner` — *holds an implicit reference to the enclosing instance*, so it can read the outer's fields; it must be created through an outer instance: `outer.new Inner()`.
3. **Local class** — a class declared inside a method; scoped to that method, can capture effectively-final locals.
4. **Anonymous class** — `new Interface() { ... }` — a one-off class with no name, the pre-lambda way to pass behavior.

```java
public class OrderService {
    private final BigDecimal taxRate;

    // static nested — a pure helper, no outer access needed
    public static class OrderResult {
        final Long id; final BigDecimal total;
        public OrderResult(Long id, BigDecimal total) { this.id = id; this.total = total; }
    }

    // inner class — needs the outer instance (accesses taxRate)
    public class OrderLine {
        private final BigDecimal unitPrice;
        BigDecimal taxable() { return unitPrice.multiply(taxRate); }  // outer field via hidden ref
    }

    // local class inside a method
    public OrderResult create(...) {
        class Validator { boolean ok(Order o) { return o != null; } }
        // ...
    }

    // anonymous class (pre-lambda style — see lambdas lesson for the modern form)
    Runnable cleanup = new Runnable() {
        @Override public void run() { /* release resources */ }
    };
}
```

## How we use it in an organization: the patterns

**Pattern 1 — static nested for grouped helpers.** The `Builder`, `Result`, or `Key` classes that belong to one type and need no outer state. `Map.Entry` and `Builder`-style classes are the canonical examples — static nesting is *namespacing*, not composition:

```java
public class Customer {
    public static class Address {          // belongs to Customer, needs nothing from it
        private final String street;
        public Address(String street) { this.street = street; }
    }
}
```

**Pattern 2 — inner classes for stateful adapters.** When the nested behavior needs the outer's fields — e.g., an iterator over a collection:

```java
public class OrderList {
    private final Order[] items;
    public class Iterator {                // inner — sees items
        private int pos;
        public boolean hasNext() { return pos < items.length; }
        public Order next() { return items[pos++]; }
    }
}
```

**Pattern 3 — anonymous classes are legacy behavior-passing.** Before lambdas, every `Comparator`, `Runnable`, `ActionListener` was an anonymous class. Modern code uses **lambdas** — shorter, and they compile to the same functional interface:

```java
// Anonymous (still legal, now mostly legacy)
list.sort(new Comparator<Order>() {
    public int compare(Order a, Order b) { return a.createdAt().compareTo(b.createdAt()); }
});

// Lambda — the modern form
list.sort(Comparator.comparing(Order::createdAt));
```

Rule of thumb: if the anonymous class implements a *functional interface* (one abstract method), write a lambda. Use an explicit named class when the behavior is reused or has more than a couple of statements.

## The gotchas

- **Inner classes hold a hidden outer reference.** An inner class instance keeps its outer alive — a *memory-retention* trap when you stash inner instances in a long-lived cache or listener registry. The fix: make the class `static` (and pass needed state in) so it holds no outer reference, or unregister when done.
- **Non-static inner classes can't have static members** (until `static` fields in inner classes were partially allowed in Java 16+; still, keep them stateless).
- **Anonymous/local classes capture effectively-final locals** — you can't reassign a captured variable (the same rule as lambdas).
- **`this` inside an inner class** refers to the inner instance; use `OuterClass.this.field` for the outer's members — a source of subtle bugs when names collide.

## Anonymous classes vs lambdas — the real differences

| | Anonymous class | Lambda |
|---|---|---|
| Syntax | verbose | concise |
| `this` | refers to the anonymous instance | refers to the *enclosing* instance |
| State | can declare fields/methods | none |
| Runtime | allocates a class per site | `invokedynamic` — no class per site |
| Overload resolution | picks the exact type | picks by functional interface (subtle ambiguity) |

Because a lambda's `this` is the enclosing object, a lambda can accidentally capture and retain the enclosing instance — the same retention caution applies.

## Key takeaways

- Static nested = namespaced helper; inner = needs the outer instance's state; local/anonymous = method-scoped behavior.
- Inner classes carry a hidden outer reference — a memory-retention trap in caches and listeners.
- Anonymous classes that implement functional interfaces should be lambdas.
- Lambdas capture the enclosing `this`; anonymous classes have their own `this`.
- Prefer static nesting for helpers — no hidden references, no retention surprises.
