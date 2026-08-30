---
title: LSP — Liskov Substitution Principle
module: solid-clean-code
order: 3
minutes: 23
topics: ["LSP", "substitutability", "inheritance", "contract", "is-a vs has-a"]
summary: The Liskov Substitution Principle (the L in SOLID) is the strictest, most precise rule about inheritance:
docs:
  - title: "Liskov substitution principle (Wikipedia)"
    url: "https://en.wikipedia.org/wiki/Liskov_substitution_principle"
---

# LSP — Liskov Substitution Principle

## The Concept: The "Is-A" Promise

The **Liskov Substitution Principle** (the *L* in SOLID) is the strictest, most precise rule about inheritance:

> If `S` is a subtype of `T`, then objects of type `T` may be replaced with objects of type `S` **without breaking the program**.

In plain terms: if your code works with a `Shape`, it must keep working when handed a `Circle`, a `Rectangle`, or any future `Shape`. The subclass must be *fully substitutable* for the parent — same behavior contract, no surprises.

This is what "is-a" inheritance is *supposed* to mean. The moment a subclass breaks the parent's contract — throws where the parent wouldn't, returns nonsense where the parent returns valid data, silently ignores what the parent guarantees — it is *not* truly a subtype, and code that works on the parent will break on the child.

## The Classic Violation — The Square/Rectangle Problem

```java
// The parent: a rectangle whose width and height are settable
class Rectangle {
    protected int width;
    protected int height;

    public void setWidth(int w)  { this.width = w; }
    public void setHeight(int h) { this.height = h; }
    public int area() { return width * height; }
}

// The "subtype": a square — but squares can't have independent width & height!
class Square extends Rectangle {
    @Override
    public void setWidth(int w) {
        this.width = w;
        this.height = w;        // force square-ness
    }

    @Override
    public void setHeight(int h) {
        this.width = h;
        this.height = h;
    }
}

public class LspDemo {

    // This method works PERFECTLY for any Rectangle... until a Square shows up.
    static void resizeAndPrint(Rectangle r) {
        r.setWidth(4);
        r.setHeight(5);
        System.out.println("Expected area 20, got " + r.area());
    }

    public static void main(String[] args) {
        resizeAndPrint(new Rectangle());   // Expected area 20, got 20   ✓
        resizeAndPrint(new Square());      // Expected area 20, got 25   ✗ BROKEN!
    }
}
```

### Why This Violates LSP

- The caller set `width = 4, height = 5` and expects `area = 20` — that's the **Rectangle contract**.
- `Square.setHeight(5)` overwrote the width to 5, producing area 25.
- The code that *worked for the parent* silently breaks for the child: **the Square is not substitutable for a Rectangle.**
- There's no error — just wrong results. That's the worst kind of LSP violation: silent behavioral divergence.

A Square is *mathematically* a rectangle, but as *mutable classes with setters*, a Square is **not** a behavioral subtype of Rectangle. The "is-a" test fails on behavior, even though it passes in geometry.

## The Better Design — Composition Over Broken Inheritance

```java
// Option A: Square as an independent class (no inheritance)
class Square {
    private int side;

    public void setSide(int s) { this.side = s; }
    public int area() { return side * side; }
}

// Option B: an immutable Shape hierarchy — works because there are no setters
interface Shape {
    int area();
}

record Rectangle(int width, int height) implements Shape {
    public int area() { return width * height; }
}

record Square(int side) implements Shape {
    public int area() { return side * side; }
}
```

With **immutable** shapes there is no "set width" to break — a `Square` is simply a `Shape` with one dimension. The whole class of violations evaporates. This is a general lesson: LSP violations are often born from *mutable state* in inheritance — the subclass can't honor the parent's mutation contract.

## LSP Violations You'll Meet in Real Code

### 1. The "throws" widening

```java
// Parent contract: load never throws checked exceptions the caller must handle
class Loader {
    Data load() { ... }
}

// Child breaks the contract — callers written for Loader now crash
class RemoteLoader extends Loader {
    @Override
    Data load() {
        if (offline) throw new IllegalStateException("network down");   // surprise!
        return ...;
    }
}
```

If callers weren't told "load may throw", any code that assumed success breaks. (Checked exceptions in the signature are a *compiled* contract; runtime throws are a *silent* one — the latter is the danger.)

### 2. The "weakened guarantee"

```java
class SortedList {
    void add(String s) { ... }    // contract: stays sorted
}

class WeirdList extends SortedList {
    @Override
    void add(String s) { list.add(s); }   // NOT sorted anymore — contract broken
}
```

### 3. The "impossible operation"

```java
class Bird {
    void fly() { ... }
}

class Penguin extends Bird {
    @Override
    void fly() { throw new UnsupportedOperationException(); }   // penguins can't fly
}
```

A `List<Bird>` containing a `Penguin` breaks any code that calls `fly()` on everything. The fix: don't put `fly()` on the base `Bird` — model capability separately (`interface Flyable { void fly(); }`).

## The Practical "Is-A" Test

Before extending a class, ask: **can every parent behavior be honored by the child, under all conditions, with the same results?** If the child must override methods to *do nothing*, *throw*, or *behave differently* — it is not a subtype; use composition or an interface instead.

Also worth remembering: **prefer interfaces over inheritance for behavior sharing.** An interface is a pure contract — no mutable state, no inherited implementation to break. Records + interfaces (the Option B above) sidestep most LSP landmines by construction.

## Common Beginner Pitfalls

1. **"Mathematically it's a subtype, so code-wise it is too"** — behavioral substitutability is what matters, not the real-world analogy.
2. **Overriding to throw** — if the child throws on a parent method, that's an LSP smell; question the hierarchy.
3. **Weakening invariants** — the child "forgets" to maintain the parent's guarantee (e.g., sortedness, non-null, immutability).
4. **`instanceof` checks before using the "base type"** — if your code must check `instanceof Square` to behave correctly, substitutability has failed.
5. **Deep hierarchies** — each level multiplies the contract surface the child must honor; prefer shallow, interface-based design.

## Key Takeaways

- LSP: subtypes must be fully substitutable for their parent — same contract, same behavior.
- The Square/Rectangle problem shows *mutable-state inheritance* breaking substitutability silently.
- Common violations: throwing where the parent wouldn't, weakening guarantees, impossible operations.
- Prefer interfaces + composition + immutable types over fragile inheritance.
- The "is-a" test is about *behavior*, not real-world analogy.
