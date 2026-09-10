---
title: Pattern Matching for instanceof — Cast and Check in One Step
summary: What pattern matching for instanceof is, how it eliminates explicit casts, combining with sealed classes, and how organizations use it for cleaner type hierarchies.
order: 1
minutes: 18
topics: [pattern-matching, instanceof, java17]
docs:
  - https://docs.oracle.com/en/java/javase/17/language/pattern-matching.html
---

## The Concept, From Zero

Before Java 16, type-checking and casting required two separate steps:

// OLD WAY: check then cast
if (obj instanceof String) {
    String s = (String) obj;       // explicit cast — redundant and error-prone
    System.out.println(s.length());
}

Java 16 introduced **pattern matching for instanceof** — combine the check and cast into one:

// JAVA 16+: check and bind in one step
if (obj instanceof String s) {
    System.out.println(s.length());  // 's' is already a String
}

The variable `s` is only in scope inside the `if` block (and `else` block if it's a negative check).

---

## Basic Usage


**What this code does — step by step:**

1. Simple pattern matching
2. Negated pattern matching (Java 17+)
3. Combined with logical operators
4. Variable scoping — 's' is NOT accessible outside the if
5. s is in scope here
6. s is NOT in scope here

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        if (obj instanceof String s) {
            System.out.println("String of length " + s.length());
        }

        if (obj instanceof String s) {
            System.out.println("It's a string: " + s);
        } else {
            System.out.println("Not a string: " + obj);
        }

        if (obj instanceof String s && s.length() > 5) {
            System.out.println("Long string: " + s);
        }

        if (obj instanceof String s) {
        }
    }
}
```

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. Line 1: Process different shapes without explicit casts
2. OLD WAY: if (shape instanceof Circle) {. Circle c = (Circle) shape; return Math.PI * c.radius() * c.radius(); }
3. NEW WAY (Java 16+):
4. 'c' is already a Circle — no cast needed
5. 'r' is already a Rectangle
6. Line 2: Pattern matching with null check
7. Pattern matching — nulls are automatically rejected
8. Line 3: Combining with && (guard conditions)
9. 's' is in scope only when the instanceof check succeeds AND the length check passes
10. Line 4: Working with heterogeneous collections
11. Line 5: Null safety — pattern matching rejects nulls
12. `System.out.println(process(null));` — "null"
13. `System.out.println(process("hello"));` — "String: HELLO"

The same code, clean:

```java
import java.util.*;

public class PatternMatchingDemo {
    static double calculateArea(Object shape) {

        if (shape instanceof Circle c) {
            return Math.PI * c.radius() * c.radius();
        }

        if (shape instanceof Rectangle r) {
            return r.width() * r.height();
        }

        if (shape instanceof Triangle t) {
            return 0.5 * t.base() * t.height();
        }

        throw new IllegalArgumentException("Unknown shape: " + shape.getClass());
    }

    static String process(Object obj) {
        if (obj == null) return "null";

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

    static boolean isPalindrome(Object obj) {
        if (obj instanceof String s && s.equals(new StringBuilder(s).reverse().toString())) {
            return true;
        }
        return false;
    }

    record Circle(double radius) {}
    record Rectangle(double width, double height) {}
    record Triangle(double base, double height) {}

    public static void main(String[] args) {
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

        System.out.println(process(null));
        System.out.println(process("hello"));
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Exception handling with details

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

### Scenario 2: API response handling

public Optional<String> extractValue(Object response) {
    if (response instanceof Map<?, ?> map && map.get("data") instanceof String value) {
        return Optional.of(value);
    }
    return Optional.empty();
}

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using pattern variable outside scope | `s` not accessible after the if block | Keep usage inside the if block |
| Pattern variable with `&&` in wrong order | Guard must come AFTER the pattern | `obj instanceof String s && s.length() > 0` |
| Using `||` with pattern variables | Variable might not be assigned | Only use `&&` with pattern variables |
| Forgetting null is rejected | Pattern matching automatically handles null | No null check needed |

