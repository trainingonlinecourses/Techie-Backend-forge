---
title: "Pattern Matching for switch — Eliminating Type-Check Boilerplate"
summary: "What pattern matching for switch is, how it replaces if-else chains with instanceof, guarded patterns, and how organizations use it for cleaner dispatch logic."
order: 8
minutes: 22
topics: [pattern-matching, switch-expressions, sealed-classes, java-17-preview, java-21-preview, type-patterns, guarded-patterns]
docs:
  - https://openjdk.org/jeps/441
  - https://openjdk.org/jeps/427
---

## The Concept, From Zero

### What is Pattern Matching for switch?

Before pattern matching, checking types in Java required verbose `if-else` chains with casts:

```java
// OLD way — ugly and error-prone
static String describe(Object obj) {
    if (obj instanceof String) {
        String s = (String) obj;
        return "String of length " + s.length();
    } else if (obj instanceof Integer) {
        Integer i = (Integer) obj;
        return "Integer: " + i;
    } else if (obj instanceof double[]) {
        double[] arr = (double[]) obj;
        return "Double array of " + arr.length + " elements";
    } else {
        return "Unknown: " + obj.getClass();
    }
}
```

**The problems:**
1. You check the type, then cast — repeated boilerplate
2. Easy to forget the cast after the `instanceof` check
3. Long if-else chains are hard to read

**Pattern matching for switch fixes this** (finalized in Java 21, JEP 441):

```java
// NEW way — clean and safe
static String describe(Object obj) {
    return switch (obj) {
        case String s    -> "String of length " + s.length();
        case Integer i   -> "Integer: " + i;
        case double[] arr -> "Double array of " + arr.length + " elements";
        default          -> "Unknown: " + obj.getClass();
    };
}
```

**One line per case. No casts. No intermediate variables.** The pattern variable `s`, `i`, `arr` is automatically bound if the type matches.

### How Switch Expressions Work

Switch can now be used as an **expression** (not just a statement):

```java
// As a statement (traditional)
switch (day) {
    case MONDAY:
        System.out.println("Start of work week");
        break;
    case FRIDAY:
        System.out.println("Almost weekend!");
        break;
}

// As an expression (modern)
String message = switch (day) {
    case MONDAY    -> "Start of work week";
    case FRIDAY    -> "Almost weekend!";
    case SATURDAY, SUNDAY -> "Weekend!";
    default        -> "Midweek";
};
```

**Key differences from traditional switch:**
- Use `->` instead of `case:`
- No `break` needed — arrow cases don't fall through
- Returns a value — can assign to a variable
- Use `yield` if you need a block body with a return value

### Type Patterns — The Basics

```java
public class TypePatterns {
    static String format(Object obj) {
        return switch (obj) {
            case Integer i -> "Integer: " + i;
            case String s  -> "String: \"" + s + "\"";
            case Long l    -> "Long: " + l;
            case null      -> "null value";
            default        -> obj.toString();
        };
    }
    
    public static void main(String[] args) {
        System.out.println(format(42));        // Integer: 42
        System.out.println(format("hello"));   // String: "hello"
        System.out.println(format(3.14));      // 3.14 (default)
        System.out.println(format(null));      // null value
    }
}
```

### Guarded Patterns (When Clauses)

Sometimes you need more than just a type check. Use `when` to add conditions:

```java
public class GuardedPatterns {
    static String classify(Number num) {
        return switch (num) {
            case Integer i when i < 0    -> "Negative integer: " + i;
            case Integer i when i == 0   -> "Zero";
            case Integer i               -> "Positive integer: " + i;
            case Double d when d < 0.0   -> "Negative double: " + d;
            case Double d                -> "Positive double: " + d;
            case Long l                  -> "Long: " + l;
            default                      -> "Other number: " + num;
        };
    }
    
    public static void main(String[] args) {
        System.out.println(classify(-5));      // Negative integer: -5
        System.out.println(classify(0));       // Zero
        System.out.println(classify(3.14));    // Positive double: 3.14
        System.out.println(classify(100L));    // Long: 100
    }
}
```

### Pattern Matching with Sealed Classes

Pattern matching becomes incredibly powerful with sealed classes:

```java
// Define a sealed class hierarchy
public sealed interface Shape 
    permits Circle, Rectangle, Triangle {
}

public record Circle(double radius) implements Shape {}
public record Rectangle(double width, double height) implements Shape {}
public record Triangle(double a, double b, double c) implements Shape {}

// Pattern matching handles the entire hierarchy
public class ShapeCalculator {
    static double area(Shape shape) {
        return switch (shape) {
            case Circle c    -> Math.PI * c.radius() * c.radius();
            case Rectangle r -> r.width() * r.height();
            case Triangle t  -> {
                double s = (t.a() + t.b() + t.c()) / 2;
                yield Math.sqrt(s * (s - t.a()) * (s - t.b()) * (s - t.c()));
            }
        };
        // No default needed — the compiler knows all cases are covered!
    }
}
```

**Why this matters:** The compiler enforces exhaustiveness. If you add a new shape to the sealed hierarchy and forget to handle it, you get a compile error.

### Null Handling

Pattern matching for switch has special null handling:

```java
public class NullHandling {
    static String process(String input) {
        return switch (input) {
            case null    -> "Input was null!";
            case String s -> "Got: " + s;
        };
        // In traditional switch, null would throw NullPointerException
        // In pattern matching, null is handled explicitly
    }
}
```

### Nested Pattern Matching

You can destructure records within patterns:

```java
public record Point(int x, int y) {}
public record Line(Point start, Point end) {}

public class NestedPatterns {
    static String describeLine(Line line) {
        return switch (line) {
            case Line(Point(int x1, int y1), Point(int x2, int y2))
                when x1 == x2 -> "Vertical line at x=" + x1;
            case Line(Point(int x1, int y1), Point(int x2, int y2))
                when y1 == y2 -> "Horizontal line at y=" + y1;
            case Line(Point p1, Point p2) -> 
                "Diagonal from " + p1 + " to " + p2;
        };
    }
}
```

### Organization Use Cases

**1. API Request Routing**
```java
public class RequestRouter {
    public String route(Request request) {
        return switch (request) {
            case GetRequest g    -> handleGet(g.path());
            case PostRequest p   -> handlePost(p.body());
            case PutRequest u    -> handlePut(u.path(), u.body());
            case DeleteRequest d -> handleDelete(d.path());
            case null            -> "Error: null request";
        };
    }
}
```

**2. State Machine**
```java
public class OrderStateMachine {
    public OrderState transition(OrderState current, Event event) {
        return switch (current) {
            case Created c when event instanceof PaymentReceived -> 
                new Paid(c.orderId());
            case Paid p when event instanceof Shipped -> 
                new Shipped(p.orderId(), ((Shipped) event).trackingNumber());
            case Shipped s when event instanceof Delivered -> 
                new Delivered(s.orderId());
            case Cancelled _ -> current; // Already cancelled
            default -> current;
        };
    }
}
```

**3. Visitor Pattern Simplified**
```java
public class AstEvaluator {
    double evaluate(AstNode node) {
        return switch (node) {
            case NumberNode n -> n.value();
            case AddNode a    -> evaluate(a.left()) + evaluate(a.right());
            case MulNode m    -> evaluate(m.left()) * evaluate(m.right());
            case NegNode n    -> -evaluate(n.operand());
        };
    }
}
```

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `case:` instead of `case ->` | Traditional switch syntax — falls through | Use `->` arrow syntax for pattern matching |
| Forgetting exhaustive cases | Compiler error with sealed types | Handle all permits or add default |
| Mixing `case:` and `case ->` | Confusing — different rules apply | Stick to one style per switch |
| Not handling null | NullPointerException at runtime | Add `case null ->` explicitly |
| Using `instanceof` after `switch` | Defeats the purpose | Use patterns directly in the switch |

### Line-by-Line Code Explanation

```java
public class PatternMatchingDemo {
    // ↑ Public class for pattern matching demonstration
    
    static String describeShape(Object shape) {
        // ↑ Static method — takes any Object as input
        
        return switch (shape) {
            // ↑ Switch EXPRESSION — returns a value (not just a statement)
            // ↑ The variable 'shape' is tested against each case
            
            case Circle c when c.radius() > 10 -> "Big circle"
            // ↑ Type pattern: checks if shape is a Circle
            // ↑ Binds it to variable 'c'
            // ↑ Guarded pattern: additional condition radius > 10
            // ↑ Arrow -> means no fall-through
            
            case Circle c -> "Small circle"
            // ↑ Second Circle case — catches circles with radius <= 10
            // ↑ Order matters — more specific patterns first
            
            case Rectangle r -> "Rectangle: " + r.width() + "x" + r.height()
            // ↑ Type pattern for Rectangle
            // ↑ No guard needed — matches all Rectangles
            
            case null -> "No shape provided"
            // ↑ Special null case — handled explicitly
            // ↑ In traditional switch, null would throw NPE
            
            default -> "Unknown shape"
            // ↑ Catch-all for any other type
            // ↑ Not needed with sealed classes (compiler enforces exhaustiveness)
        };
        // ↑ The switch expression evaluates to a String
        // ↑ That String is returned from the method
    }
}
```

### Key Takeaways

1. **Pattern matching replaces if-else type checks** — no more manual casting
2. **Use `->` arrow syntax** — no fall-through, cleaner code
3. **Guarded patterns with `when`** — add conditions to type patterns
4. **Exhaustive with sealed classes** — compiler enforces all cases
5. **Null is handled explicitly** — no more NullPointerExceptions
6. **Nested patterns destructure records** — pattern match inside patterns

### Evolution Summary

| Version | Feature | JEP |
|---------|---------|-----|
| Java 14 | Switch Expressions | 361 |
| Java 17 | Pattern matching for switch (preview) | 406 |
| Java 18 | Pattern matching (2nd preview) | 420 |
| Java 19 | Pattern matching (3rd preview) | 427 |
| Java 21 | Pattern matching for switch (final) | 441 |

### Real-World Organization Scenario

A fintech company processes different transaction types. Each transaction type has different fields and validation rules. Using pattern matching for switch with sealed classes, they eliminate 40 lines of instanceof chains, making the code compile-time safe and immediately readable. Adding a new transaction type forces them to handle it in every switch — impossible to forget.
