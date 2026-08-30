---
title: Switch Expressions and Pattern Guards
module: java-advanced-language
order: 2
minutes: 18
topics: ["switch expressions", "arrow syntax", "yield", "guards", "null handling"]
docs:
  - title: "Switch expressions"
    url: "https://docs.oracle.com/en/java/javase/21/language/switch-expressions.html"
summary: The switch you learned in Java 8 — colon statements, fallthrough, mutable accumulators — has been replaced by a modern expression form that returns...
---

# Switch Expressions and Pattern Guards

The `switch` you learned in Java 8 — colon statements, fall-through, mutable accumulators — has been replaced by a modern expression form that returns values, never falls through, and pattern-matches. This lesson covers arrow syntax, `yield`, guards, and null handling.

## The Old vs. The New

```java
// OLD: statement switch — fall-through, break, no value
String name;
switch (level) {
    case "BEGINNER":
        name = "Beginner";
        break;
    case "ADVANCED":
        name = "Advanced";
        break;
    default:
        name = "Unknown";
}

// NEW: expression switch — value-returning, no fall-through
String name = switch (level) {
    case "BEGINNER" -> "Beginner";
    case "ADVANCED" -> "Advanced";
    default        -> "Unknown";
};
```

The arrow form has no fall-through — each arm is independent. The whole switch *is* a value.

## The Three Syntaxes

```java
// 1. Arrow, single expression
String r1 = switch (x) { case 1 -> "one"; default -> "many"; };

// 2. Arrow, block body with yield
String r2 = switch (x) {
    case 1 -> {
        int doubled = x * 2;
        yield "one doubled is " + doubled;    // yield exits the block with a value
    }
    default -> "many";
};

// 3. Colon + yield (rare)
String r3 = switch (x) {
    case 1: yield "one";
    default: yield "many";
};
```

`yield` is how a block body returns a value — think of it as `return` for switch arms.

## Null Handling

Traditional switch threw NPE on null. The modern switch allows `case null`:

```java
String describe(String s) {
    return switch (s) {
        case null  -> "null";
        case ""    -> "empty";
        case "a", "b", "c" -> "early letter";
        default    -> "other: " + s;
    };
}
```

`case null` must come before other patterns (null doesn't match `default` by default). Multiple comma-separated labels group arms.

## Pattern Switching on Types

```java
public String size(Object o) {
    return switch (o) {
        case null          -> "null";
        case String s      -> "string of length " + s.length();
        case Integer i     -> "int " + i;
        case Long l        -> "long " + l;
        case Number n      -> "number " + n;
        case int[] arr     -> "array of " + arr.length;
        default            -> o.getClass().getSimpleName();
    };
}
```

More specific patterns win: `Integer` before `Number`, `Number` before `default`.

## Guards: When Patterns Need Conditions

```java
public String classify(Number n) {
    return switch (n) {
        case Integer i when i < 0 -> "negative int";
        case Integer i when i == 0 -> "zero";
        case Integer i -> "positive int";
        case Long l when l > 1_000_000_000L -> "big long";
        case Long l -> "long";
        default -> "other number";
    };
}
```

`when` adds a boolean guard to a pattern; the pattern matches only if the guard holds. Arms are evaluated top-down, first match wins.

## Exhaustiveness

With sealed hierarchies, the compiler enforces coverage:

```java
public sealed interface Shape permits Circle, Square, Triangle {}
public record Circle(double r) implements Shape {}
public record Square(double s) implements Shape {}
public record Triangle(double b, double h) implements Shape {}

public double area(Shape shape) {
    return switch (shape) {
        case Circle c  -> Math.PI * c.r() * c.r();
        case Square s  -> s.s() * s.s();
        case Triangle t -> 0.5 * t.b() * t.h();
        // no default needed — the compiler knows these are all Shapes
    };
}
```

Add `Rectangle` to `permits` → this switch stops compiling until you handle it. Exhaustiveness turns "forgot a case" from a runtime bug into a compile error.

## switch Over Enums

```java
public enum Status { NEW, PROCESSING, PAID, CANCELLED }

public String label(Status status) {
    return switch (status) {
        case NEW, PROCESSING -> "in progress";
        case PAID            -> "done";
        case CANCELLED       -> "void";
    };
}
```

Enums are exhaustive without `default` — the compiler enumerates the constants.

## Practical: Mapping With Side Effects

```java
public void process(Command cmd) {
    switch (cmd) {
        case StartCommand sc -> {
            log.info("Starting {}", sc.jobId());
            startJob(sc);
        }
        case StopCommand st  -> {
            log.info("Stopping {}", st.jobId());
            stopJob(st);
        }
        case RestartCommand rc -> restart(rc.jobId());
    }
}
```

Statement switches (void) work with arrow syntax too — blocks for multi-step arms.

## Testing

```java
@Test
void classifyHandlesAllCases() {
    assertEquals("negative int", classifier.classify(-5));
    assertEquals("zero", classifier.classify(0));
    assertEquals("positive int", classifier.classify(42));
    assertEquals("big long", classifier.classify(2_000_000_000L));
    assertEquals("null", classifier.classify(null));
}
```

## Summary

| Feature | Syntax |
|---------|--------|
| Value-returning | `switch (x) { case A -> v; }` |
| Block bodies | `case A -> { ... yield v; }` |
| Null | `case null -> ...` |
| Type patterns | `case String s -> ...` |
| Guards | `case Integer i when i > 0 -> ...` |
| Groups | `case A, B, C -> ...` |
| Exhaustiveness | Sealed types / enums — compile-checked |

The modern switch is a full pattern-matching expression: exhaustive, null-safe, value-returning, and guard-capable. It replaces the if/else-if chains and old switch statements that cluttered domain code — and it's the natural companion to the records and sealed classes from the previous lesson.
