---
title: Constructors in Depth — How Objects Are Actually Born
summary: Default vs no-arg vs parameterized constructors, constructor chaining with this() and super(), copy constructors, and the initialization order rules that trip up even experienced developers.
order: 71
minutes: 24
topics: [constructors, constructor-chaining, this-super, copy-constructor, default-constructor, initialization-order]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/constructors.html
---

## The Concept, From Zero

A **constructor** is a special method whose only job is to put a brand-new object into a valid state. When you write `new Customer("amy@corp.com")`, the JVM:

1. Allocates memory on the heap for a new `Customer`.
2. Sets all fields to default values (`0`, `false`, `null`).
3. Runs field initializers and initializer blocks, top to bottom.
4. Runs the constructor body.

Three rules make a constructor what it is:

- It has **exactly the same name as the class**.
- It has **no return type** — not even `void`. (If you accidentally write `void Customer() {}` you've created a plain method named Customer, not a constructor!)
- You can't call it like a normal method — only `new` (or `this(...)` / `super(...)`) invokes it.

## The Three Kinds of Constructors

### 1. Default constructor (the invisible one)

```java
public class Product { }
```

If you write **no constructor at all**, the compiler silently inserts one that takes no arguments and does nothing beyond calling `super()`:

```java
public Product() {
    super();   // inserted by the compiler — call Object's constructor
}
```

The moment you declare ANY constructor yourself, this freebie disappears:

```java
public class Product {
    public Product(String name) {  // now the ONLY constructor
        this.name = name;
    }
}

// new Product();            // ❌ compile error — no no-arg constructor exists anymore
// new Product("Laptop");    // ✅ fine
```

> This is why some frameworks complain "no default constructor found" — libraries that create your objects reflectively need a way in.

### 2. No-arg constructor (explicit)

```java
public class Product {
    private String name = "unnamed";   // field initializer runs first

    public Product() {                 // explicit no-arg constructor
        // runs after field initializers; can add setup logic here
    }
}
```

Useful when a sensible default object is meaningful (an empty cart, a blank form).

### 3. Parameterized constructor

```java
public class Product {
    private final String name;      // final: must be set exactly once, in every constructor path
    private final BigDecimal price;

    public Product(String name, BigDecimal price) {  // takes required data as arguments
        if (price.signum() < 0) {                    // guard clause: reject invalid input early
            throw new IllegalArgumentException("price cannot be negative");
        }
        this.name = name;        // 'this.name' = the field; 'name' alone = the parameter
        this.price = price;
    }
}
```

Line by line:

| Line | Why |
|---|---|
| `private final String name` | final forces initialization in the constructor — the compiler enforces "no half-built objects" |
| `if (price.signum() < 0)` | fail fast: an invalid product should never exist, rather than blow up later |
| `this.name = name` | `this.` disambiguates the field from the same-named parameter |

## Constructor Chaining — `this()` and `super()`

Two keywords let one constructor delegate to another. Both must be **the very first statement** in the constructor body.

### `this(...)` — chain within the same class

```java
public class Order {
    private final List<String> items;
    private final boolean express;

    public Order(List<String> items) {
        this(items, false);              // delegate to the two-arg constructor below
    }

    public Order(List<String> items, boolean express) {
        this.items = new ArrayList<>(items); // defensive copy: caller's list changes later won't affect us
        this.express = express;
    }
}
```

Why organizations do this: validation and copying logic lives in **one place** (the "primary" constructor). The convenience constructors just fill in defaults — impossible for them to drift out of sync.

### `super(...)` — chain to the parent class

```java
class User {
    protected final String email;

    public User(String email) {
        this.email = email;             // initialize parent's part of the object
    }
}

class Admin extends User {
    public Admin(String email) {
        super(email);                   // MUST be first line: parent part must exist before child adds to it
        // admin-specific setup goes after super(...)
    }
}
```

Think of it as building a house: the foundation (`User`) has to be poured before walls (`Admin`) are added. If you don't write `super(...)` explicitly, the compiler inserts a bare `super()` — which fails to compile if the parent has no accessible no-arg constructor.

## The Copy Constructor

Java has no built-in copy mechanism (unlike C++), but the idiom is simple:

```java
public class Customer {
    private final Long id;
    private final List<String> tags;

    public Customer(Long id, List<String> tags) {
        this.id = id;
        this.tags = new ArrayList<>(tags);     // defensive copy again
    }

    public Customer(Customer other) {          // copy constructor: takes an instance of its own class
        this.id = other.id;                    // primitives/references copied directly
        this.tags = new ArrayList<>(other.tags); // nested mutable objects COPIED too → deep-ish copy
    }
}
```

Now `new Customer(existingCustomer)` gives an independent duplicate — the standard replacement for the flawed `Object.clone()` (see the Object Class lesson).

## Initialization Order — The Interview Classic

Given inheritance + field initializers + blocks, the JVM runs things in exactly this order:

```java
class Base {
    static { System.out.println("1. Base static init"); }   // once per CLASS, when class loads
    { System.out.println("2. Base instance init"); }        // every instance creation
    Base() { System.out.println("3. Base constructor"); }
}

class Child extends Base {
    static { System.out.println("4. Child static init"); }
    { System.out.println("5. Child instance init"); }
    Child() { System.out.println("6. Child constructor"); }
}

new Child();
// Output order: 1, 4, 2, 3, 5, 6
```

Memorize the pattern: **statics first (parent→child), then per-instance: parent's initializers+constructor before child's**.

## Common Organizational Scenarios

**Scenario 1 — Frameworks demand no-arg constructors.** Jackson (JSON), JPA providers, and Bean validation create objects via reflection using the no-arg constructor. DTOs without one break deserialization at runtime — which is why teams increasingly use records or add explicit no-arg constructors.

**Scenario 2 — Validation at construction.** A payments team makes `Money` throw inside the constructor when given a negative amount. Result: it is *impossible* for an invalid Money to exist anywhere in the system — bugs die at birth instead of surfacing during settlement.

**Scenario 3 — Builder pattern escape hatch.** When a class grows past ~4 constructor parameters, calls like `new ApiClient(url, key, timeout, retries, proxy, log)` become unreadable ("telescoping constructor" anti-pattern). Organizations switch to builders: `ApiClient.builder().url(u).timeout(t).build()`.

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Adding `void` to a constructor signature | Silently becomes a normal method; `new` uses the default constructor instead | Constructors never have return types |
| Calling overridable methods from constructors | Subclass override runs before subclass fields exist → NPEs | Keep constructors simple; use factory methods |
| Forgetting `super(args)` when parent lacks no-arg | Compile error in child constructor | Add explicit `super(parentArgs)` first |
| Exposing mutable collections from constructor params | Caller mutates list after construction, object state corrupts | Defensive-copy with `new ArrayList<>(param)` |
