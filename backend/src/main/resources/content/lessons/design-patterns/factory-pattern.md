---
title: Factory Pattern — Creating Objects Without Saying the Class Name
module: design-patterns
order: 1
minutes: 24
topics: ["factory method", "abstract factory", "encapsulation", "decoupling", "creation"]
summary: Imagine a pizza restaurant. The customer says "I want a pizza." The kitchen decides which pizza — margherita, pepperoni, or veggie — based on what'...
docs:
  - title: "Factory Method (Refactoring Guru)"
    url: "https://refactoring.guru/design-patterns/factory-method"
---

# Factory Pattern — Creating Objects Without Saying the Class Name

## The Concept: Who Should Decide Which Object to Create?

Imagine a pizza restaurant. The customer says "I want a pizza." The kitchen decides *which* pizza — margherita, pepperoni, or veggie — based on what's ordered, what's in stock, or the time of day. The customer never names a specific kitchen station; they just get a pizza.

In code, the same situation appears constantly: you need an object, but *which* concrete class it should be depends on data, configuration, or context — and you'd rather not scatter `if`/`switch` chains creating objects all over your codebase.

**The Factory pattern** centralizes object creation: instead of calling `new ConcreteClass()` at the call site, you call a **factory** — a method (or object) that decides the concrete type and returns it, usually typed as an **interface or abstract class**. The caller gets "a `Pizza`" without knowing or caring which one.

## Why It Matters — The Decoupling Argument

Without a factory:

```java
// The caller knows EVERY concrete type — and must change when types change
Pizza pizza;
if (order.contains("pepperoni")) pizza = new PepperoniPizza();
else if (order.contains("veggie")) pizza = new VeggiePizza();
else pizza = new MargheritaPizza();
```

With a factory:

```java
Pizza pizza = PizzaFactory.create(order);   // the caller knows NOTHING concrete
```

Now adding `PizzaQuattroFormaggi` changes **one** place (the factory) instead of every call site. The caller depends on the `Pizza` *interface* — a stable abstraction — not on volatile implementations. This is dependency inversion in miniature: high-level code depends on an abstraction, and the factory owns the concrete choices.

## Factory Method vs Abstract Factory

Two related patterns, commonly confused:

- **Factory Method** — a single method (often overridden in subclasses) that creates one product. "One method, one family of products."
- **Abstract Factory** — an interface for creating a *family* of related products without specifying their concrete classes. "A factory of factories — create UI button AND checkbox AND text field for a consistent look."

This lesson covers Factory Method (the everyday one); Abstract Factory is its bigger sibling used when products come in coordinated families.

## The Code Walkthrough

```java
// ---- The product: an interface the caller depends on ----
interface Pizza {
    String name();
    double price();
}

// ---- Concrete products (the caller never names these) ----
class MargheritaPizza implements Pizza {
    public String name() { return "Margherita"; }
    public double price() { return 8.0; }
}

class PepperoniPizza implements Pizza {
    public String name() { return "Pepperoni"; }
    public double price() { return 11.0; }
}

class VeggiePizza implements Pizza {
    public String name() { return "Veggie"; }
    public double price() { return 9.5; }
}

// ---- The factory: the ONLY place that knows concrete types ----
class PizzaFactory {

    public static Pizza create(String order) {
        String key = order.toLowerCase();
        if (key.contains("pepperoni")) return new PepperoniPizza();
        if (key.contains("veggie"))    return new VeggiePizza();
        return new MargheritaPizza();                    // default
    }
}

// ---- The caller: depends only on the interface ----
public class FactoryDemo {

    public static void main(String[] args) {
        Pizza p1 = PizzaFactory.create("I'd like a pepperoni, please");
        Pizza p2 = PizzaFactory.create("veggie option");
        Pizza p3 = PizzaFactory.create("whatever is classic");

        System.out.println(p1.name() + " $" + p1.price());   // Pepperoni $11.0
        System.out.println(p2.name() + " $" + p2.price());   // Veggie $9.5
        System.out.println(p3.name() + " $" + p3.price());   // Margherita $8.0
    }
}
```

### Walking Through Each Part

**The `Pizza` interface** — the contract every product honors: `name()` and `price()`. The caller's code is written against *this*, so it compiles regardless of which concrete pizza is returned.

**The concrete classes** — simple implementations. Notice the caller never mentions them: they're the factory's private knowledge.

**`PizzaFactory.create`** — the decision point. It maps a request to a concrete class. If the pizza menu grows, this method grows; call sites stay untouched. It also concentrates the "default" decision in one obvious place.

**`main`** — the caller. It asks the factory, gets a `Pizza`, and uses the interface. No `if`/`switch` here, no `new` with a concrete name. Adding a new pizza type = add a class + one line in the factory.

## When to Reach for a Factory

| Use a factory when | Don't bother when |
|---|---|
| The concrete type depends on runtime data/config | You always create the same class |
| You want call sites decoupled from implementations | The caller genuinely needs the concrete type |
| A family of products changes frequently | Creation is a one-liner with no variation |
| You're building a framework/library others extend | You're inside a small private method |

## The Factory in Real Frameworks

Factories are everywhere in Spring:

- **`ApplicationContext.getBean(Class)`** — the container is a factory: it decides the concrete bean (prototype/singleton, profile-specific) and hands you the abstraction.
- **`@Bean` factory methods** — you write a method returning an interface; Spring calls it and registers the result.
- **`ConnectionFactory` / `ObjectMapper` builders** — JDBC and Jackson expose factory-style creation.

When you see `SomethingFactory` in a codebase, the pattern is telling you: "this is the one place that knows how to make these."

## Common Beginner Pitfalls

1. **The factory as a dumping ground** — if it grows a hundred `if`s with business logic, split it (map-based dispatch, multiple factories).
2. **Returning concrete types** — the whole point is returning the abstraction; returning `PepperoniPizza` re-couples the caller.
3. **Over-engineering** — a factory for one product type with no variation adds indirection without value. Apply the pattern when the *choice* exists.
4. **Static vs instance factories** — `static create` is fine for stateless factories; when the factory needs configuration (a config object, a strategy), make it an instance bean (Spring will inject it).
5. **Confusing with the Builder** — factory picks *which type*; builder controls *how a single complex object is assembled* (next lesson).

## Key Takeaways

- Factory = centralized object creation that hides concrete types behind an interface.
- The caller depends on the abstraction; the factory owns the decisions.
- Adding a type = new class + one factory branch — call sites unchanged.
- Factory Method: one method creating one product; Abstract Factory: a family of products.
- Spring's `@Bean` methods and `getBean` are factories in disguise.
