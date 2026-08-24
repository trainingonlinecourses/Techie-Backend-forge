---
title: Record Patterns and Pattern Matching — Destructuring Data in Java
summary: How record patterns deconstruct nested data, pattern matching with switch, sealed class exhaustiveness, and the elimination of verbose instanceof chains.
order: 57
minutes: 18
topics: [records, pattern matching, sealed classes, switch expressions, destructuring, Java 21]
docs:
  - https://docs.oracle.com/javase/tutorial/java/records/
  - https://docs.oracle.com/javase/specs/jls/se21/html/jls-14.html
---

# Record Patterns and Pattern Matching — Destructuring Data in Java

## The concept: match and destructure in one step

Pattern matching lets you check the type of an object and extract its components in a single expression. Records — with their automatically-generated components — are the perfect partner: you can destructure a record directly in a `case` or `instanceof`, eliminating the boilerplate of type checks, casts, and getter calls.

## Record patterns in instanceof

```java
// BEFORE pattern matching (verbose)
if (obj instanceof Point) {
    Point p = (Point) obj;
    return p.x() + p.y();
}

// AFTER pattern matching (concise)
if (obj instanceof Point(int x, int y)) {
    return x + y;
}

// Nested destructuring
record Address(String city, String zip) {}
record User(String name, Address address) {}

if (user instanceof User(String name, Address(String city, String zip))) {
    System.out.println(name + " lives in " + city);
}
```

## Pattern matching with switch

```java
// Sealed interface + records = exhaustive pattern matching
sealed interface Shape permits Circle, Rectangle, Triangle {}
record Circle(double radius) implements Shape {}
record Rectangle(double width, double height) implements Shape {}
record Triangle(double a, double b, double c) implements Shape {}

double area(Shape shape) {
    return switch (shape) {
        case Circle(double r)          -> Math.PI * r * r;
        case Rectangle(double w, double h) -> w * h;
        case Triangle(double a, double b, double c) -> {
            double s = (a + b + c) / 2;
            yield Math.sqrt(s * (s-a) * (s-b) * (s-c));  // Heron's formula
        }
        // No default needed — sealed interface guarantees exhaustiveness
    };
}
```

**The org power:** the compiler enforces that every case is handled. Add a new record to the sealed interface, and the compiler tells you exactly which switches need updating. No missed cases at runtime.

## Guarded patterns — conditions within cases

```java
String describe(int value) {
    return switch (value) {
        case int n when n < 0  -> "negative: " + n;
        case int n when n == 0 -> "zero";
        case int n when n < 10 -> "small positive: " + n;
        case int n             -> "large: " + n;
    };
}

// With records
String categorize(Package pkg) {
    return switch (pkg) {
        case Package(String name, double weight) when weight > 10  -> "heavy: " + name;
        case Package(String name, double weight) when weight < 1   -> "light: " + name;
        case Package(String name, double weight)                   -> "standard: " + name;
    };
}
```

## Sealed classes — the exhaustiveness engine

Sealed classes restrict which classes can implement them. Combined with pattern matching, the compiler knows the full set of possibilities:

```java
// Java 17+ sealed interface
public sealed interface PaymentResult
    permits PaymentSuccess, PaymentFailure, PaymentPending {}

public record PaymentSuccess(String transactionId) implements PaymentResult {}
public record PaymentFailure(String error, String code) implements PaymentResult {}
public record PaymentPending() implements PaymentResult {}

// Switch on sealed type — compiler knows ALL possible types
String display(PaymentResult result) {
    return switch (result) {
        case PaymentSuccess(String id)  -> "✅ Paid: " + id;
        case PaymentFailure(String e, String c) -> "❌ Failed (" + c + "): " + e;
        case PaymentPending()           -> "⏳ Pending...";
    };
    // If you add a new permit, every switch that doesn't handle it fails to compile
}
```

## Nested patterns — deep destructuring

```java
record Order(String id, Customer customer, List<LineItem> items) {}
record Customer(String name, Address address) {}
record Address(String city) {}
record LineItem(String product, int quantity, Money price) {}
record Money(long cents) {}

// Deep destructuring in one pattern
void process(Order order) {
    if (order instanceof Order(
        String id,
        Customer(String name, Address(String city)),
        List<LineItem(String product, int qty, Money(long cents))> items
    )) {
        System.out.printf("Order %s by %s in %s: %d × %s = %d cents%n",
            id, name, city, qty, product, cents);
    }
}
```

## org patterns

**API response handling:**

```java
sealed interface ApiResponse<T> permits Success, Error, Loading {}
record Success<T>(T data) implements ApiResponse<T> {}
record Error<T>(String message, int status) implements ApiResponse<T> {}
record Loading<T>() implements ApiResponse<T> {}

<T> String render(ApiResponse<T> response) {
    return switch (response) {
        case Success(var data)  -> "Data: " + data;
        case Error(var msg, var code) -> "Error " + code + ": " + msg;
        case Loading()          -> "Loading...";
    };
}
```

**Configuration validation:**

```java
record ServerConfig(String host, int port, boolean ssl) {}

String validate(ServerConfig config) {
    return switch (config) {
        case ServerConfig(String h, int p, true) when p < 1024
            -> "SSL on privileged port " + p + " — requires root";
        case ServerConfig(String h, int p, _) when p < 0 || p > 65535
            -> "Invalid port: " + p;
        case ServerConfig(String h, _, _)
            when h == null || h.isBlank()
            -> "Host cannot be empty";
        case ServerConfig(_, _, _)
            -> "OK";
    };
}
```

## Key takeaways

- Record patterns (`instanceof Point(int x, int y)`) destructure records in a single step — no more manual casting and getter calls.
- Pattern matching with `switch` on sealed types is exhaustive — the compiler catches missing cases.
- Guarded patterns (`case X(var n) when n > 0`) add conditions to cases, replacing if-else chains.
- Deep nesting (`case Order(_, Customer(String name, Address(String city)), _)`) handles complex data in one expression.
- Use sealed interfaces + records + pattern matching for domain models that need exhaustive handling.
