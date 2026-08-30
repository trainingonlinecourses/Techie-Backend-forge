---
title: Pattern Matching for switch — Type-Safe, Exhaustive Switch
summary: What pattern matching for switch is, guarded patterns, null handling, sealed class exhaustiveness, and how organizations use it for cleaner code.
order: 3
minutes: 22
topics: [pattern-matching-switch, guarded-pattern, sealed-switch, java21]
docs:
  - https://docs.oracle.com/en/java/javase/21/language/pattern-matching.html
---

## The Concept, From Zero

Before Java 21, switch only worked with primitives and enums. You couldn't switch on object types. Pattern matching for switch lets you match by type AND extract variables:

```java
// OLD: if-else chain for type checking
Object obj = getSomething();
if (obj instanceof String s) {
    processString(s);
} else if (obj instanceof Integer n) {
    processInteger(n);
} else if (obj instanceof List<?> list) {
    processList(list);
}

// JAVA 21: switch expression with pattern matching
Object obj = getSomething();
switch (obj) {
    case String s   -> processString(s);
    case Integer n  -> processInteger(n);
    case List<?> l  -> processList(l);
    default         -> throw new IllegalArgumentException("Unknown: " + obj);
};
```

---

## Key Features

### Guarded patterns (when clauses)

```java
// Match a type AND a condition
String classify(Object obj) {
    return switch (obj) {
        case Integer i when i < 0  -> "negative integer";
        case Integer i when i == 0 -> "zero";
        case Integer i             -> "positive integer";
        case String s when s.isBlank() -> "blank string";
        case String s             -> "string: " + s;
        case null                 -> "null value";
        default                   -> "other";
    };
}
```

### Null handling

```java
// switch can now handle null — no more NullPointerException
switch (obj) {
    case null    -> "null";
    case String s -> "string: " + s;
    default      -> "other";
};
```

### Exhaustive matching with sealed classes

```java
sealed interface Shape permits Circle, Rectangle, Triangle {}
record Circle(double r) implements Shape {}
record Rectangle(double w, double h) implements Shape {}
record Triangle(double b, double h) implements Shape {}

// No default needed — compiler knows all cases
double area(Shape shape) {
    return switch (shape) {
        case Circle c    -> Math.PI * c.r() * c.r();
        case Rectangle r -> r.w() * r.h();
        case Triangle t  -> 0.5 * t.b() * t.h();
    };
}
```

---

## Line-by-Line Walkthrough

```java
import java.util.*;

public class PatternMatchingSwitchDemo {
    // Line 1: Basic pattern matching switch
    static String describe(Object obj) {
        return switch (obj) {
            case null              -> "null";
            case Integer i         -> "integer: " + i;
            case String s          -> "string: \"" + s + "\"";
            case int[] arr         -> "int array of length " + arr.length;
            case List<?> list      -> "list of size " + list.size();
            case Map<?, ?> map     -> "map with " + map.size() + " entries";
            default                -> obj.getClass().getSimpleName();
        };
    }

    // Line 2: Guarded patterns with when
    static String classify(int value) {
        return switch (value) {
            case int i when i < 0    -> "negative";
            case int i when i == 0   -> "zero";
            case int i               -> "positive (" + i + ")";
        };
    }

    // Line 3: Pattern matching with sealed hierarchy
    sealed interface Result permits Success, Failure, Pending {}
    record Success(Object data) implements Result {}
    record Failure(String error, int code) implements Result {}
    record Pending(String message) implements Result {}

    static String processResult(Result result) {
        return switch (result) {
            case Success s -> "OK: " + s.data();
            case Failure f when f.code() >= 500 -> "Server error: " + f.error();
            case Failure f -> "Client error: " + f.error();
            case Pending p -> "Loading: " + p.message();
        };
    }

    // Line 4: Nested pattern matching
    record Point(int x, int y) {}
    record Line(Point start, Point end) {}

    static String describeLine(Line line) {
        return switch (line) {
            case Line(Point(int x1, int y1), Point(int x2, int y2))
                when x1 == x2 -> "Vertical line at x=" + x1;
            case Line(Point(int x1, int y1), Point(int x2, int y2))
                when y1 == y2 -> "Horizontal line at y=" + y1;
            case Line(Point p1, Point p2) -> "Diagonal from " + p1 + " to " + p2;
        };
    }

    public static void main(String[] args) {
        // Line 5: Test all patterns
        System.out.println(describe(null));           // "null"
        System.out.println(describe(42));             // "integer: 42"
        System.out.println(describe("hello"));        // "string: \"hello\""
        System.out.println(describe(List.of(1, 2)));  // "list of size 2"

        // Line 6: Guarded patterns
        System.out.println(classify(-5));  // "negative"
        System.out.println(classify(0));   // "zero"
        System.out.println(classify(10));  // "positive (10)"

        // Line 7: Sealed switch
        Result r1 = new Success("data loaded");
        Result r2 = new Failure("timeout", 504);
        Result r3 = new Failure("not found", 404);
        System.out.println(processResult(r1));  // "OK: data loaded"
        System.out.println(processResult(r2));  // "Server error: timeout"
        System.out.println(processResult(r3));  // "Client error: not found"

        // Line 8: Nested patterns
        Line line1 = new Line(new Point(0, 0), new Point(0, 5));
        Line line2 = new Line(new Point(0, 0), new Point(5, 0));
        System.out.println(describeLine(line1));  // "Vertical line at x=0"
        System.out.println(describeLine(line2));  // "Horizontal line at y=0"
    }
}
```

---

## Real-World Scenarios

### Scenario 1: API error handling

```java
public ResponseEntity<?> handleServiceResult(ServiceResult result) {
    return switch (result) {
        case Success<?> s    -> ResponseEntity.ok(s.data());
        case NotFound n      -> ResponseEntity.status(404).body(Map.of("error", "Not found: " + n.id()));
        case ValidationFailure v -> ResponseEntity.badRequest().body(Map.of("errors", v.errors()));
        case Unauthorized u  -> ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        case RateLimited r   -> ResponseEntity.status(429).body(Map.of("retryAfter", r.seconds()));
    };
}
```

### Scenario 2: AST evaluation

```java
public double evaluate(Expr expr) {
    return switch (expr) {
        case Literal l    -> l.value();
        case Add a        -> evaluate(a.left()) + evaluate(a.right());
        case Multiply m   -> evaluate(m.left()) * evaluate(m.right());
        case Negate n     -> -evaluate(n.operand());
        case Divide d when evaluate(d.right()) == 0
                          -> throw new ArithmeticException("Division by zero");
        case Divide d     -> evaluate(d.left()) / evaluate(d.right());
    };
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `case` without `->` | Fall-through behavior | Use arrow syntax for pattern matching |
| Forgetting `null` handling | NullPointerException | Add `case null ->` |
| Non-exhaustive switch | Compilation error | Add `default` or ensure sealed hierarchy |
| Complex patterns in one case | Hard to read | Break into multiple cases |
| Using `when` with side effects | May not execute | Keep guards pure |
