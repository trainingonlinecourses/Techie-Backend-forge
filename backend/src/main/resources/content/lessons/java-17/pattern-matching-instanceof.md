---
title: Pattern Matching for instanceof — Cast and Check in One Step
summary: What pattern matching for instanceof is, how it eliminates explicit casts, combining with sealed classes, and how organizations use it for cleaner type hierarchies.
order: 3
minutes: 18
topics: [pattern-matching, instanceof, java17]
docs:
  - https://docs.oracle.com/en/java/javase/17/language/pattern-matching.html
---

## The Concept, From Zero

Before Java 16, type-checking and casting required two separate steps:

```java
// OLD WAY: check then cast
if (obj instanceof String) {
    String s = (String) obj;       // explicit cast — redundant and error-prone
    System.out.println(s.length());
}
```

Java 16 introduced **pattern matching for instanceof** — combine the check and cast into one:

```java
// JAVA 16+: check and bind in one step
if (obj instanceof String s) {
    System.out.println(s.length());  // 's' is already a String
}
```

The variable `s` is only in scope inside the `if` block (and `else` block if it's a negative check).

---

## Basic Usage

```java
// Simple pattern matching
if (obj instanceof String s) {
    System.out.println("String of length " + s.length());
}

// Negated pattern matching (Java 17+)
if (obj instanceof String s) {
    System.out.println("It's a string: " + s);
} else {
    System.out.println("Not a string: " + obj);
}

// Combined with logical operators
if (obj instanceof String s && s.length() > 5) {
    System.out.println("Long string: " + s);
}

// Variable scoping — 's' is NOT accessible outside the if
if (obj instanceof String s) {
    // s is in scope here
}
// s is NOT in scope here
```

---

## Line-by-Line Walkthrough

```java
import java.util.*;

public class PatternMatchingDemo {
    // Line 1: Process different shapes without explicit casts
    static double calculateArea(Object shape) {
        // OLD WAY:
        // if (shape instanceof Circle) {
        //     Circle c = (Circle) shape;
        //     return Math.PI * c.radius() * c.radius();
        // }

        // NEW WAY (Java 16+):
        if (shape instanceof Circle c) {
            return Math.PI * c.radius() * c.radius();
            // 'c' is already a Circle — no cast needed
        }

        if (shape instanceof Rectangle r) {
            return r.width() * r.height();
            // 'r' is already a Rectangle
        }

        if (shape instanceof Triangle t) {
            return 0.5 * t.base() * t.height();
        }

        throw new IllegalArgumentException("Unknown shape: " + shape.getClass());
    }

    // Line 2: Pattern matching with null check
    static String process(Object obj) {
        if (obj == null) return "null";

        // Pattern matching — nulls are automatically rejected
        if (obj instanceof String s) {
            return "String: " + s.toUpperCase();
        }
        if (obj instanceof Integer n) {
            return "Integer: " + (n * 2);
        }
        if (obj instanceof List<?> list) {
            return "List of size " + list.size();
        }

        return "Unknown: " + obj.getClass().getSimpleName();
    }

    // Line 3: Combining with && (guard conditions)
    static boolean isPalindrome(Object obj) {
        // 's' is in scope only when the instanceof check succeeds AND the length check passes
        if (obj instanceof String s && s.equals(new StringBuilder(s).reverse().toString())) {
            return true;
        }
        return false;
    }

    record Circle(double radius) {}
    record Rectangle(double width, double height) {}
    record Triangle(double base, double height) {}

    public static void main(String[] args) {
        // Line 4: Working with heterogeneous collections
        List<Object> items = List.of(
            "Hello",
            42,
            new Circle(5.0),
            new Rectangle(3.0, 4.0),
            List.of(1, 2, 3)
        );

        for (Object item : items) {
            if (item instanceof String s) {
                System.out.println("String: " + s.toUpperCase());
            } else if (item instanceof Integer n) {
                System.out.println("Doubled: " + (n * 2));
            } else if (item instanceof Circle c) {
                System.out.printf("Circle area: %.2f%n", calculateArea(c));
            } else if (item instanceof Rectangle r) {
                System.out.printf("Rectangle area: %.2f%n", calculateArea(r));
            } else if (item instanceof List<?> list) {
                System.out.println("List size: " + list.size());
            }
        }

        // Line 5: Null safety — pattern matching rejects nulls
        System.out.println(process(null));     // "null"
        System.out.println(process("hello"));  // "String: HELLO"
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Exception handling with details

```java
public void handleException(Exception e) {
    if (e instanceof NullPointerException npe) {
        log.error("NPE at: " + npe.getStackTrace()[0]);
    } else if (e instanceof IllegalArgumentException iae) {
        log.error("Bad argument: " + iae.getMessage());
    } else if (e instanceof java.io.IOException ioe) {
        log.error("IO error: " + ioe.getMessage());
        retryOperation();
    }
}
```

### Scenario 2: API response handling

```java
public Optional<String> extractValue(Object response) {
    if (response instanceof Map<?, ?> map && map.get("data") instanceof String value) {
        return Optional.of(value);
    }
    return Optional.empty();
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using pattern variable outside scope | `s` not accessible after the if block | Keep usage inside the if block |
| Pattern variable with `&&` in wrong order | Guard must come AFTER the pattern | `obj instanceof String s && s.length() > 0` |
| Using `||` with pattern variables | Variable might not be assigned | Only use `&&` with pattern variables |
| Forgetting null is rejected | Pattern matching automatically handles null | No null check needed |
