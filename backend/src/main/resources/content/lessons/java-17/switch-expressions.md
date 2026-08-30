---
title: Switch Expressions — Modern Switch That Returns Values
summary: What switch expressions are, arrow syntax, yield keyword, exhaustive matching, how they replace if-else chains, and how organizations use them.
order: 5
minutes: 20
topics: [switch-expression, arrow-syntax, yield, java17]
docs:
  - https://docs.oracle.com/en/java/javase/17/language/switch-expressions.html
---

## The Concept, From Zero

The old `switch` statement had problems:
- Needed `break` after each case (otherwise it "falls through")
- Couldn't return a value
- Easy to forget `break` and introduce bugs

Java 14 introduced **switch expressions** — a modern, safer alternative:

```java
// OLD: switch statement (fall-through bugs, no return value)
String dayType;
switch (day) {
    case "MONDAY":
    case "TUESDAY":
    case "WEDNESDAY":
    case "THURSDAY":
    case "FRIDAY":
        dayType = "Weekday";
        break;
    case "SATURDAY":
    case "SUNDAY":
        dayType = "Weekend";
        break;
    default:
        throw new IllegalArgumentException("Invalid day: " + day);
}

// NEW: switch expression (no fall-through, returns a value)
String dayType = switch (day) {
    case "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY" -> "Weekday";
    case "SATURDAY", "SUNDAY" -> "Weekend";
};
```

---

## Arrow Syntax vs Colon Syntax

```java
// Arrow syntax (Java 14+) — no fall-through, concise
String result = switch (input) {
    case "A" -> "Alpha";
    case "B" -> "Beta";
    case "C" -> "Gamma";
    default -> "Unknown";
};

// Arrow with block and yield
int result = switch (input) {
    case "A" -> {
        System.out.println("Processing A");
        yield 1;  // yield returns a value from the block
    }
    case "B" -> {
        System.out.println("Processing B");
        yield 2;
    }
    default -> 0;
};

// Colon syntax with break (traditional, but still works)
switch (input) {
    case "A":
        result = "Alpha";
        break;
    case "B":
        result = "Beta";
        break;
    default:
        result = "Unknown";
        break;
}
```

---

## Line-by-Line Walkthrough

```java
import java.util.*;

public class SwitchExpressionsDemo {
    // Line 1: Basic switch expression
    static String getDayType(String day) {
        return switch (day) {
            case "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY" -> "Weekday";
            case "SATURDAY", "SUNDAY" -> "Weekend";
        };
        // No default needed if compiler can prove exhaustiveness (sealed types)
        // For String, compiler requires default
    }

    // Line 2: Switch expression with yield (multi-statement)
    static int processOrder(String type, double amount) {
        return switch (type) {
            case "STANDARD" -> {
                System.out.println("Standard order: $" + amount);
                yield (int) amount;  // yield returns the value
            }
            case "PREMIUM" -> {
                int discounted = (int) (amount * 0.9);
                System.out.println("Premium discount: $" + discounted);
                yield discounted;
            }
            case "BULK" -> {
                int bulkPrice = (int) (amount * 0.75);
                System.out.println("Bulk discount: $" + bulkPrice);
                yield bulkPrice;
            }
            default -> throw new IllegalArgumentException("Unknown type: " + type);
        };
    }

    // Line 3: Null-safe switch
    static String nullable(String input) {
        return switch (input) {
            case null -> "null value";
            case "A" -> "Alpha";
            case "B" -> "Beta";
            default -> "Unknown";
        };
    }

    // Line 4: Complex decision logic
    record HttpRequest(String method, String path, boolean authenticated) {}

    static String route(HttpRequest request) {
        return switch (request.method()) {
            case "GET" -> switch (request.path()) {
                case "/" -> "Home page";
                case "/api/users" -> "User list";
                case "/api/health" -> "Health check";
                default -> "Not found";
            };
            case "POST" -> switch (request.path()) {
                case "/api/users" -> request.authenticated() ? "Create user" : "Unauthorized";
                case "/api/login" -> "Login";
                default -> "Not found";
            };
            case "DELETE" -> switch (request.path()) {
                case String p when p.startsWith("/api/users/") -> "Delete user " + p.substring(11);
                default -> "Not found";
            };
            default -> "Method not allowed";
        };
    }

    public static void main(String[] args) {
        // Line 5: Using switch expressions
        for (String day : List.of("MONDAY", "SATURDAY", "WEDNESDAY")) {
            System.out.println(day + ": " + getDayType(day));
        }

        // Line 6: Using yield
        System.out.println("Standard: " + processOrder("STANDARD", 100));
        System.out.println("Premium: " + processOrder("PREMIUM", 100));
        System.out.println("Bulk: " + processOrder("BULK", 100));

        // Line 7: Null-safe
        System.out.println(nullable(null));   // "null value"
        System.out.println(nullable("A"));   // "Alpha"

        // Line 8: Complex routing
        var request = new HttpRequest("GET", "/api/users", true);
        System.out.println(route(request));  // "User list"
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Status code mapping

```java
public String statusMessage(int code) {
    return switch (code) {
        case 200 -> "OK";
        case 201 -> "Created";
        case 400 -> "Bad Request";
        case 401 -> "Unauthorized";
        case 403 -> "Forbidden";
        case 404 -> "Not Found";
        case 500 -> "Internal Server Error";
        default -> "Unknown status: " + code;
    };
}
```

### Scenario 2: State machine transitions

```java
record Transition(String from, String to, String event) {}

public String nextState(String current, String event) {
    return switch (new Transition(current, "", event)) {
        case Transition t when t.event().equals("SUBMIT") -> "PENDING";
        case Transition t when t.event().equals("APPROVE") -> "APPROVED";
        case Transition t when t.event().equals("REJECT") -> "REJECTED";
        case Transition t when t.event().equals("CANCEL") -> "CANCELLED";
        default -> current;
    };
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `break` with arrow syntax | Unnecessary and confusing | Arrow syntax doesn't fall through |
| Forgetting `yield` in block arrow | Block must yield a value | Add `yield value;` at end of block |
| Not handling all cases | Compilation error for expressions | Add `default` or ensure exhaustiveness |
| Using `->` with old fall-through semantics | Confusing | Use `:` syntax if you need fall-through |
