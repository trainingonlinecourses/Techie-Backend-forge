---
title: Pattern Matching in Switch — Branching by Shape, Not Just by Value
summary: Switch pattern matching, standardised in Java 21, lets a case label match on the type or shape of the value, and lets you add a guard with a boolean condition. This is far more expressive than the old switch on primitives and strings. This lesson explains how case labels with patterns work, how guards work, how null is handled, and how to write a switch that is exhaustive and safe.
order: 1
minutes: 20
topics: [switch, pattern-matching, type-pattern, guarded-case, sealed-classes, exhaustive-switch, record-patterns, java21]
docs:
  - https://docs.oracle.com/en/java/javase/21/language/switch-expressions.html
  - https://docs.oracle.com/en/java/javase/21/language/pattern-matching.html
---

## The Concept, From Zero

The old `switch` statement/expression in Java worked on a limited set of types: primitives (`byte`, `short`, `int`, `char`, their wrapper types), `String`, and `enum`. You matched on an exact value or an enum constant. That was useful, but it left out the most common decision in object-oriented code: "what kind of thing is this?"

Before pattern matching, the standard way to branch on type was a chain of `if (x instanceof Foo) { ... } else if (x instanceof Bar) { ... }`. This works, but it is verbose and it scatters type checks and casts across the code.

Pattern matching in `switch` solves this. A `case` label can now carry a **pattern** that matches on the type (or shape) of the selector expression, and the matching value is automatically bound to a variable you can use in the case body. You can also add a **guard** — a boolean condition that further refines the match.

// Pattern matching switch: branch by type, with no explicit cast
String describe(Object obj) {
    return switch (obj) {
        case String s -> "a string of length " + s.length();
        case Integer i -> "an integer: " + i;
        case Double d -> "a double: " + d;
        case null -> "null";
        default -> "something else";
    };
}

In this example:

- The selector expression is `obj`, which is of type `Object`.
- Each `case` label has a pattern: `String s`, `Integer i`, `Double d`. These match if the value is an instance of that type, and they bind the value to a variable (`s`, `i`, `d`) of the matched type.
- The variable is already the right type in the case body — no cast needed.
- The `null` case matches a `null` value. Without it, a `null` selector would throw a `NullPointerException` at the switch (the switch does not match `null` against a type pattern — it falls through to `default` or throws, depending on whether `null` is handled).
- The `default` case catches anything not matched by the other cases.

This is cleaner than the old `if-instanceof` chain, and it expresses the intent — "branch by the kind of object" — directly.

### Type Patterns

A type pattern is the simplest kind of pattern: `Type name`. It matches if the value is an instance of `Type` (or a subtype), and it binds the value to `name` of type `Type`.

public class Main {

    public static void main(String[] args) {
        void handle(Object obj) {
            switch (obj) {
                case String s ->
                    System.out.println("a string: " + s);
                case Integer i ->
                    System.out.println("an integer: " + i);
                case List<?> list ->
                    System.out.println("a list with " + list.size() + " elements");
                default ->
                    System.out.println("something else: " + obj);
            }
        }
    }
}

A few things to notice:

- The pattern variable (`s`, `i`, `list`) is in scope only in the case body. You cannot use it after the switch.
- The type in the pattern can be any reference type, including a parameterized type like `List<?>`. The compiler uses the type to give you a correctly typed variable, but the match itself is on the runtime type of the value.
- The patterns are tried in order. The first case whose pattern matches is executed. This is important when patterns overlap — for example, a `case Object o` would match everything, so it usually comes last.

### Guarded Case Labels

A **guard** is an additional boolean condition on a case label, written with the `when` keyword. A guarded case matches only if both the pattern matches **and** the guard is true.

// A guarded case: match a non-empty string
String categorize(Object obj) {
    return switch (obj) {
        case String s when s.isEmpty() -> "empty string";
        case String s -> "non-empty string of length " + s.length();
        case Integer i when i > 0 -> "positive integer";
        case Integer i -> "non-positive integer";
        default -> "something else";
    };
}

In this example:

- `case String s when s.isEmpty()` matches a `String` that is empty. The pattern matches if the value is a `String`, and the guard is true only if the string is empty.
- `case String s` (no guard) matches any `String`. Because the guarded case is listed first, an empty string matches the first case, and a non-empty string falls through to the second.
- `case Integer i when i > 0` matches a positive integer. `case Integer i` (no guard) matches any other integer.

Guards let you refine the match without introducing an extra nested `if`. Without guards, you would write:


**What this code does — step by step:**

1. Without guards — verbose and easy to get wrong
2. empty string case
3. non-empty string case
4. positive integer case
5. non-positive integer case
6. default case

The same code, clean:

```java
if (obj instanceof String s) {
    if (s.isEmpty()) {
    } else {
    }
} else if (obj instanceof Integer i) {
    if (i > 0) {
    } else {
    }
} else {
}
```

The guarded switch is more direct and less prone to nesting errors.

### Exhaustiveness — The Compiler Checks That Every Value Is Covered

A switch expression (one that returns a value, with `->` case labels) must be **exhaustive** — every possible value of the selector expression must be covered by some case. If the compiler cannot prove that every value is covered, it is an error.

This is one of the benefits of pattern matching. If you switch on a sealed hierarchy, the compiler knows all the possible subtypes, and it can check that every subtype is covered. If you add a new subtype, the compiler tells you that the switch is no longer exhaustive — you must handle the new case.

sealed interface Shape permits Circle, Rectangle, Triangle { }

final class Circle implements Shape {
    final double radius;
    Circle(double radius) { this.radius = radius; }
}

final class Rectangle implements Shape {
    final double width, height;
    Rectangle(double w, double h) { this.width = w; this.height = h; }
}

final class Triangle implements Shape {
    final double base, height;
    Triangle(double b, double h) { this.base = b; this.height = h; }
}

double area(Shape s) {
    return switch (s) {
        case Circle c -> Math.PI * c.radius * c.radius;
        case Rectangle r -> r.width * r.height;
        case Triangle t -> 0.5 * t.base * t.height;
        // No default needed — the compiler knows Circle, Rectangle, Triangle
        // are the only permitted subtypes, so this switch is exhaustive.
    };
}

In this example:

- `Shape` is a sealed interface that permits exactly three subtypes: `Circle`, `Rectangle`, `Triangle`.
- The switch on `Shape` has a case for each permitted subtype.
- The compiler knows the switch is exhaustive — every `Shape` is one of these three.
- No `default` is needed. If you add a new subtype later (say, `Square`), the compiler will tell you the switch is no longer exhaustive and you must add a case for `Square`.

This is a powerful pattern. Sealed classes and exhaustive switches give you the safety of an enum (you know all the possible values) with the flexibility of a class hierarchy (each case can have its own fields and behaviour).

If the switch is on a non-sealed type (like `Object`), you usually need a `default` case to make the switch exhaustive, because the compiler does not know all possible subtypes of `Object`.

// Switching on Object — need a default
String describe(Object obj) {
    return switch (obj) {
        case String s -> "a string";
        case Integer i -> "an integer";
        case null -> "null";
        default -> "something else";   // needed to make the switch exhaustive
    };
}

### Null Handling in Pattern Matching Switch

A `null` selector does not match a type pattern. A `case String s` does **not** match `null`, even though `null` is technically not an instance of `String`. If the selector is `null` and there is no `case null`, the switch throws a `NullPointerException`.

This is a deliberate design choice. The old `switch` threw `NullPointerException` on a `null` selector. Pattern matching switch keeps that behaviour, but lets you handle `null` explicitly with a `case null`.

// Explicit null case — safe handling of null
String describe(Object obj) {
    return switch (obj) {
        case null -> "null";
        case String s -> "a string: " + s;
        case Integer i -> "an integer: " + i;
        default -> "something else";
    };
}

Without the `case null`, passing `null` into this switch would throw. With it, `null` is handled gracefully. This is especially useful when the selector might be `null` in normal use — for example, a method that accepts an `Object` and might be called with `null`.

### Mixing Pattern Cases and Constant Cases

A switch can mix pattern cases with constant cases (for `enum`, `String`, and primitives). The compiler checks that all cases are covered and that there are no overlaps that would make a later case unreachable.

enum Status { ACTIVE, INACTIVE, PENDING }

String summary(Object obj) {
    return switch (obj) {
        case null -> "null";
        case Status.ACTIVE -> "user is active";
        case Status.INACTIVE -> "user is inactive";
        case Status.PENDING -> "user is pending";
        case String s -> "a string: " + s;
        case Integer i -> "an integer: " + i;
        default -> "something else";
    };
}

Here the switch handles `null`, three `Status` constants, a `String` pattern, an `Integer` pattern, and a `default`. The compiler ensures the cases are well-formed.

### Record Patterns — Matching the Components of a Record

(Record patterns are a related feature, standardised in Java 21 alongside pattern matching for switch. They let a pattern match the components of a record and bind each component to a variable.)

record Point(int x, int y) {}
record Circle(Point center, double radius) {}
record Rectangle(Point topLeft, Point bottomRight) {}

String summarize(Object obj) {
    return switch (obj) {
        case Point(int x, int y) -> "point at (" + x + ", " + y + ")";
        case Circle(Point center, double r) ->
            "circle at " + center + " radius " + r;
        case Rectangle(Point tl, Point br) ->
            "rectangle from " + tl + " to " + br;
        default -> "something else";
    };
}

In this example:

- A `Point` record has two components: `int x` and `int y`.
- The pattern `Point(int x, int y)` matches a `Point` and binds its `x` and `y` components to the variables `x` and `y`.
- A `Circle` pattern matches a `Circle` and binds its `center` (a `Point`) and `radius`.
- A `Rectangle` pattern binds its two `Point` components.

Record patterns can be nested. You can match a `Circle` and, inside that, match the `Point` and bind its components:

String deep(Object obj) {
    return switch (obj) {
        case Circle(Point(int cx, int cy), double r) ->
            "circle at (" + cx + ", " + cy + ") radius " + r;
        default -> "something else";
    };
}

Here the pattern `Circle(Point(int cx, int cy), double r)` matches a `Circle`, matches its `center` with a nested `Point` pattern, and binds the point's `x` and `y` to `cx` and `cy`, and the circle's `radius` to `r`. This is a deep structural match — the shape of the data is matched directly.

Record patterns are a natural companion to pattern matching in switch. They let you match on the structure of a record, not just its type, and bind the components you care about.

### A Code Example — A Shape Area Calculator with Pattern Matching

This example uses a sealed hierarchy, pattern matching switch, guarded cases, and a record pattern to calculate areas and describe shapes.


**What this code does — step by step:**

1. A sealed hierarchy — the compiler knows all the subtypes
2. Pattern matching switch — exhaustive over the sealed hierarchy
3. No default needed — the sealed hierarchy is exhaustive
4. A switch with guards — classify a number
5. Nested record pattern — extract the center of a circle

The same code, clean:

```java
sealed interface Shape permits Circle, Rectangle, Square, Triangle {
    double area();
}

record Circle(double radius) implements Shape {
    @Override public double area() { return Math.PI * radius * radius; }
}

record Rectangle(double width, double height) implements Shape {
    @Override public double area() { return width * height; }
}

record Square(double side) implements Shape {
    @Override public double area() { return side * side; }
}

record Triangle(double base, double height) implements Shape {
    @Override public double area() { return 0.5 * base * height; }
}

public class ShapeDemo {

    static String describe(Shape s) {
        return switch (s) {
            case Circle(double r) ->
                "circle with radius " + r + ", area " + s.area();
            case Rectangle(double w, double h) ->
                "rectangle " + w + "x" + h + ", area " + s.area();
            case Square(double side) ->
                "square with side " + side + ", area " + s.area();
            case Triangle(double b, double h) ->
                "triangle base " + b + " height " + h + ", area " + s.area();
        };
    }

    static String classifyNumber(Object obj) {
        return switch (obj) {
            case null -> "null";
            case Integer i when i > 0 -> "positive integer";
            case Integer i when i == 0 -> "zero";
            case Integer i -> "negative integer";
            case Double d when d > 0 -> "positive double";
            case Double d -> "non-positive double";
            case String s when s.matches("-?\\d+") ->
                "a numeric string: " + s;
            case String s -> "a string: " + s;
            default -> "something else: " + obj;
        };
    }

    static String circleCenter(Object obj) {
        return switch (obj) {
            case Circle(Point(int x, int y), double r) ->
                "circle at (" + x + ", " + y + ") radius " + r;
            default -> "not a circle";
        };
    }

    record Point(int x, int y) {}

    public static void main(String[] args) {
        Shape c = new Circle(5.0);
        Shape r = new Rectangle(4.0, 6.0);
        Shape sq = new Square(3.0);
        Shape t = new Triangle(3.0, 4.0);

        System.out.println(describe(c));
        System.out.println(describe(r));
        System.out.println(describe(sq));
        System.out.println(describe(t));

        System.out.println("\n--- classifyNumber ---");
        System.out.println(classifyNumber(5));
        System.out.println(classifyNumber(0));
        System.out.println(classifyNumber(-3));
        System.out.println(classifyNumber(2.5));
        System.out.println(classifyNumber("123"));
        System.out.println(classifyNumber("hello"));
        System.out.println(classifyNumber(null));

        System.out.println("\n--- circleCenter ---");
        System.out.println(circleCenter(new Circle(new Point(1, 2), 5.0)));
        System.out.println(circleCenter(new Rectangle(1.0, 2.0)));
    }
}
```

Line by line:

- **`sealed interface Shape permits Circle, Rectangle, Square, Triangle`** — a sealed interface. The compiler knows the only permitted subtypes.
- **`record Circle(double radius) implements Shape`** — a record implementing the sealed interface. Records are concise data carriers.
- **`describe(Shape s)`** — a switch on `Shape` with a case for each permitted subtype. No `default` is needed because the sealed hierarchy is exhaustive.
- **`case Circle(double r)`** — a record pattern that matches a `Circle` and binds its `radius` to `r`.
- **`classifyNumber(Object obj)`** — a switch on `Object` with guarded cases. The guards (`when i > 0`, `when i == 0`, `when s.matches(...)`) refine the match.
- **`circleCenter(Object obj)`** — a switch with a nested record pattern. It matches a `Circle`, matches its `center` with a nested `Point` pattern, and binds the point's `x` and `y`.
- **`main`** — demonstrates the switches with various inputs.

This example shows the power of pattern matching switch: the `describe` method is exhaustive and clean because of the sealed hierarchy, the `classifyNumber` method uses guards to refine cases without nested `if`s, and the `circleCenter` method uses a nested record pattern to extract the components of a point inside a circle.

## Where This Shows Up in an Organization

In a backend team, pattern matching switch shows up wherever you branch on the type or shape of data.

- **Result types and error handling** — if you model a result as a sealed hierarchy (e.g., `Result`, `Success`, `Failure`, `Pending`), a pattern matching switch is the cleanest way to handle each case.
- **Event handling** — if you have a sealed hierarchy of events (`UserEvent`, `OrderEvent`, `SystemEvent`), a switch on the event type with patterns for each subtype is clearer than a chain of `instanceof` checks.
- **AST and data structure traversal** — if you have a sealed hierarchy of syntax tree nodes or data structures (records, sealed classes), pattern matching with record patterns lets you match the structure directly and extract the components you need.
- **Message handling** — if you have a sealed hierarchy of messages or commands, a pattern matching switch is the natural dispatcher.

The sealed hierarchy + exhaustive switch pattern is especially valuable. It gives you the safety of knowing all the possible types at compile time, and the compiler tells you when you add a new type and forget to handle it. This is a big improvement over a chain of `instanceof` checks, where adding a new type silently leaves it unhandled until a test or a runtime path exercises it.

## Common Mistakes

| Mistake | Why it happens | Fix |
|---|---|
| Forgetting the `case null` when switching on a type that might be null | The switch throws on null by default | Add an explicit `case null` if null is a valid input |
| Adding a new subtype to a sealed hierarchy and forgetting to update the switch | The switch was exhaustive before, but the new subtype is not covered | The compiler catches this — it reports the switch is no longer exhaustive. Add a case for the new subtype. |
| Ordering cases incorrectly so a more general case comes before a more specific one | Pattern matching tries cases in order; an earlier general pattern can shadow a later specific one | Put more specific cases first, or use guards to refine the match |
| Using a pattern variable outside the case body | The pattern variable is in scope only in its case | Use the variable only in the case body; if you need the value after, assign it to a local variable |
| Writing a switch that is not exhaustive on a non-sealed type | The compiler requires every switch expression to be exhaustive | Add a `default` case |
| Confusing a pattern match with a cast | A type pattern does involve a cast-like binding, but it is safe and checked by the compiler | Use the pattern variable directly; it is already the right type |
| Using record patterns without understanding that they match the structure | A record pattern matches the record's components by position and type | Make sure the pattern matches the record's components in order |

## For the Practice Lab

In the lab, you will see a starter with a chain of `instanceof` checks that classify and handle different types of objects, and a switch that is not exhaustive and throws at runtime when a new type is passed. Replace the `instanceof` chain with a pattern matching switch, add a sealed hierarchy for the types, and make the switch exhaustive so the compiler enforces that all cases are handled. Then add a guarded case to refine one of the type cases, and add a record pattern to extract the components of a record inside another record. Finally, pass `null` to the switch with and without a `case null` to see the difference.

## Summary

Pattern matching in switch, standardised in Java 21, lets a `case` label match on the type or shape of the selector value. A type pattern (`Type name`) matches an instance of that type and binds the value to a variable of that type, with no explicit cast. A guard (`when` condition) refines the match with a boolean condition. A switch expression must be exhaustive — every value must be covered — and the compiler enforces this. For sealed hierarchies, the compiler knows all the permitted subtypes and checks exhaustiveness automatically; if you add a new subtype, the compiler tells you. `null` does not match a type pattern — you must handle it explicitly with `case null`, or the switch throws. Record patterns let you match the components of a record and bind them to variables, and they can be nested for deep structural matching. The result is cleaner, safer code for branching on type and structure, especially when combined with sealed classes and records.

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/en/java/javase/21/language/)
