---
title: this and super — Talking to the Current Object and Its Parent
summary: this is a reference to the current object; super reaches the parent class's version of a field, method, or constructor. Nearly every Java bug around inheritance comes from misreading which one is in play. This lesson builds both from first principles with runnable examples.
order: 6
minutes: 20
topics: [this, super, constructors, inheritance, shadowing, oop]
docs:
  - https://docs.oracle.com/javase/tutorial/java/IandI/super.html
capstone: false
---

## The Concept, From Zero

When a method runs, it always runs *for some object*. `this` is the keyword that refers to that object — the one the method was called on. `super` is not quite an object reference; it's a way to say "use the **parent class's** version of this member, not mine." Both exist because names can be ambiguous: a field can share a name with a parameter, and a method can be overridden by a subclass.

### The three jobs of `this`

**Job 1: disambiguate a shadowed field.** The most common constructor pattern in Java:

```java
public class Account {
    private String owner;
    private int balance;

    public Account(String owner, int balance) {
        this.owner = owner;        // this.owner = the FIELD; owner = the PARAMETER
        this.balance = balance;
    }
}
```

<!-- why -->
**What this code shows:**

- Defines `Account`.

Without `this.`, `owner = owner` assigns the parameter to itself and the field stays `null`. The rule: when a parameter or local variable shares a name with a field, the *inner* name wins (it "shadows" the field), and only `this.` reaches the field.

**Job 2: pass the current object along.** Methods often need to hand *themselves* to something else — registering with a listener list, adding themselves to a builder:

```java
public class Player {
    private final Game game;

    public Player(Game game) {
        this.game = game;
        game.register(this);       // "me" — the object being constructed
    }
}
```

<!-- why -->
**What this code shows:**

- Defines `Player`.

**Job 3: constructor chaining.** One constructor delegating to another of the *same* class:

```java
public class Account {
    private String owner;
    private int balance;

    public Account() {
        this("unknown", 0);        // calls the two-arg constructor below
    }

    public Account(String owner, int balance) {
        this.owner = owner;
        this.balance = balance;
    }
}
```

<!-- why -->
**What this code shows:**

- Defines `Account`.

`this(...)` must be the **first statement** in the constructor — you delegate before doing any of your own work, so initialization happens in exactly one place.

### The three jobs of `super`

When a subclass overrides a method or shadows a field, the parent's version doesn't disappear — it's still there, and `super` is how you reach it.

**Job 1: call the overridden method's original.** The `override + extend` pattern, the backbone of frameworks:

```java
public class AuditedAccount extends Account {
    @Override
    public void withdraw(int amount) {
        log("withdraw " + amount + " starting");   // add behavior...
        super.withdraw(amount);                     // ...then let the parent do its job
    }
}
```

<!-- why -->
**What this code shows:**

- Defines `AuditedAccount` with methods `withdraw()`.
- Uses inheritance.

Skip `super.` and you've *replaced* the parent logic instead of *adding* to it — silently losing validation, balance updates, whatever the parent did.

**Job 2: fields.** If a subclass declares a field with the same name as the parent's, you get *two* fields, and `super.fieldName` reads the parent's copy. (Shadowed fields are a design smell — but you must recognize them in the wild.)

**Job 3: the parent constructor.** Every constructor begins ( invisibly, if you don't write it) with a call to the parent constructor:

```java
public class AuditedAccount extends Account {
    private final String auditId;

    public AuditedAccount(String owner, int balance) {
        super(owner, balance);      // MUST be first: parent initializes before child
        this.auditId = "AUD-" + System.nanoTime();
    }
}
```

<!-- why -->
**What this code shows:**

- Defines `AuditedAccount`.
- Uses inheritance.

If you omit `super(...)`, the compiler inserts `super()` — the parent's *no-arg* constructor. If the parent has no no-arg constructor (like our `Account`, which only defined a two-arg one), the code **doesn't compile** until you call a valid parent constructor explicitly. This is the classic "implicit super constructor is undefined" error, and now you know exactly what it means: the parent must be initialized before the child can run.

### How it plays together at runtime

A method call like `account.withdraw(50)` is **dynamic dispatch**: the JVM looks at the *actual* object's class (`AuditedAccount`), finds `withdraw` there, and runs it — even if the variable's declared type is the parent `Account`. `super.withdraw(...)` is the exception: it deliberately skips the override and jumps one level up. And note `this` works fine in `static` contexts' *absence*: a `static` method belongs to the class, not an object, so `this` doesn't exist there — that's why `main` can't read instance fields directly.

## Common Mistakes

- **`owner = owner` in a constructor** — assigns the parameter to itself; the field stays null/0. The compiler often warns; the fix is `this.owner = owner`.
- **Forgetting `super(...)` when the parent lacks a no-arg constructor** — compile error. The fix is an explicit parent-constructor call as the first statement.
- **Calling an overridden method from a constructor** — the subclass override runs *before* the subclass constructor body, seeing uninitialized subclass fields. Keep constructors simple.
- **Over-using `super.method()` chains** — deep `super` chains couple every level to every other. Prefer composition (a delegate field) when the "is-a" isn't real.
- **`this` leaking from constructors** — passing `this` to another thread or framework callback inside a constructor exposes a half-built object. Register listeners after construction when possible.

## Quick Checklist

- [ ] I can explain why `this.owner = owner` is needed in a constructor.
- [ ] I can write two constructors where one delegates to the other with `this(...)`.
- [ ] I can predict the "implicit super constructor is undefined" error and fix it.
- [ ] I can implement an override that *adds* to parent behavior using `super.method()`.

## References

- [Oracle — Using the Keyword super](https://docs.oracle.com/javase/tutorial/java/IandI/super.html)
- [dev.java — Inheritance](https://dev.java/learn/oop/inheritance/)
- [GeeksforGeeks — this reference in Java](https://www.geeksforgeeks.org/this-reference-in-java/)
- [W3Schools — Java Inheritance](https://www.w3schools.com/java/java_inheritance.asp)
- [Learn Java Online — Interactive exercises](https://www.learnjavaonline.org/)
