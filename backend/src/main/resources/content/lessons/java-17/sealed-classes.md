---
title: "Sealed Classes — Controlling Who Can Extend Your Code"
summary: "What sealed classes are, why they exist, how permits restrict inheritance, and how organizations use them for type-safe domain modeling."
order: 9
minutes: 22
topics: [sealed-classes, permits, final-sealed-non-sealed, java-17, exhaustiveness, domain-modeling]
docs:
  - https://openjdk.org/jeps/409
  - https://docs.oracle.com/en/java/javase/17/language/sealed-classes-and-interfaces.html
---

## The Concept, From Zero

### What is a Sealed Class?

Imagine you're building a payment system. You have a `Payment` class with three subtypes: `CreditCardPayment`, `BankTransferPayment`, and `CryptoPayment`. Right now, ANY class can extend `Payment` — even ones you don't control.

```java
// Anyone can add a new payment type
public class EvilPayment extends Payment { ... }
```

**Sealed classes fix this.** Introduced as a preview in Java 15 and finalized in Java 17 (JEP 409), a sealed class lets you explicitly list which classes can extend it:

```java
public sealed class Payment 
    permits CreditCardPayment, BankTransferPayment, CryptoPayment {
    // Only the three listed classes can extend this
}
```

**Now the compiler knows ALL possible subtypes.** This enables:
- Exhaustiveness checking in switch expressions
- Better optimization by the JVM
- Clear intent — you document your design decisions

### Why Sealed Classes Exist

Without sealed classes, there are two extremes:
1. **`public class`** — anyone can extend it (too open)
2. **`final class`** — nobody can extend it (too restrictive)

Sealed classes give you the **middle ground** — you control exactly who can extend.

### How Permits Work

The `permits` clause lists all allowed subclasses:

```java
public sealed class Shape 
    permits Circle, Rectangle, Triangle {
    
    // Common fields and methods
    public abstract double area();
}

// Each permitted class must be one of:
// 1. final — cannot be extended further
// 2. sealed — has its own permits clause
// 3. non-sealed — anyone can extend (default)

public final class Circle extends Shape {
    private final double radius;
    
    public Circle(double radius) { this.radius = radius; }
    
    @Override
    public double area() { return Math.PI * radius * radius; }
}

public final class Rectangle extends Shape {
    private final double width, height;
    
    public Rectangle(double width, double height) {
        this.width = width;
        this.height = height;
    }
    
    @Override
    public double area() { return width * height; }
}

public final class Triangle extends Shape {
    private final double base, height;
    
    public Triangle(double base, double height) {
        this.base = base;
        this.height = height;
    }
    
    @Override
    public double area() { return 0.5 * base * height; }
}
```

### The Three Modifiers for Permitted Subclasses

```java
// 1. FINAL — cannot be extended
public final class Circle extends Shape { ... }

// 2. SEALED — has its own restrictions
public sealed class Polygon extends Shape 
    permits Triangle, Rectangle, Pentagon { ... }

// 3. NON-SEALED — removes restrictions (someone else can extend)
public non-sealed class CustomShape extends Shape { ... }
```

### Exhaustive Pattern Matching

This is the **killer feature** of sealed classes. The compiler knows ALL subtypes, so you get exhaustiveness checking:

```java
public class ShapePrinter {
    static String describe(Shape shape) {
        return switch (shape) {
            case Circle c    -> "Circle with radius " + c.radius();
            case Rectangle r -> "Rectangle " + r.width() + "x" + r.height();
            case Triangle t  -> "Triangle base=" + t.base();
            // No default needed! Compiler knows these are ALL the cases
            // If you add a new shape to the sealed hierarchy,
            // this switch will fail to compile until you handle it
        };
    }
}
```

### In the Same Package or Module

By default, permitted subclasses must be in the **same package** or **same module**:

```java
// In package com.example.shapes
public sealed class Shape permits Circle, Rectangle { ... }

// Circle and Rectangle must be in:
// 1. Same package (com.example.shapes), OR
// 2. Same module (if module system is used)
```

You can override this with `permits` in a different compilation unit (Java 17 relaxes this).

### Organization Use Cases

**1. API Response Types**
```java
public sealed interface ApiResponse<T> 
    permits SuccessResponse, ErrorResponse, LoadingResponse {
}

public record SuccessResponse<T>(T data, int statusCode) implements ApiResponse<T> {}
public record ErrorResponse<T>(String message, String errorCode) implements ApiResponse<T> {}
public record LoadingResponse<T>() implements ApiResponse<T> {}
```

**2. Domain Events**
```java
public sealed interface DomainEvent 
    permits OrderCreated, OrderShipped, OrderDelivered, OrderCancelled {
}

public record OrderCreated(String orderId, Instant timestamp) implements DomainEvent {}
public record OrderShipped(String orderId, String trackingNumber) implements DomainEvent {}
public record OrderDelivered(String orderId, Instant timestamp) implements DomainEvent {}
public record OrderCancelled(String orderId, String reason) implements DomainEvent {}
```

**3. AST for Expression Evaluation**
```java
public sealed interface Expr 
    permits Literal, Add, Multiply, Negate {
}

public record Literal(double value) implements Expr {}
public record Add(Expr left, Expr right) implements Expr {}
public record Multiply(Expr left, Expr right) implements Expr {}
public record Negate(Expr operand) implements Expr {}
```

### Line-by-Line Code Explanation

```java
public sealed class Payment
    permits CreditCardPayment, BankTransferPayment, CryptoPayment {
    // ↑ sealed = this class controls who extends it
    // ↑ permits = explicit list of allowed subclasses
    // ↑ Only these THREE classes can extend Payment
    // ↑ Any other class trying to extend Payment → compile error
    
    private final String transactionId;
    // ↑ Common field — all payment types share this
    
    protected Payment(String transactionId) {
        // ↑ protected constructor — only subclasses can call this
        // ↑ Not public — external code cannot create Payment directly
        this.transactionId = transactionId;
    }
    
    public String transactionId() { return transactionId; }
    // ↑ Public accessor — all payment types share this method
}

// Each permitted subclass MUST be one of: final, sealed, or non-sealed

public final class CreditCardPayment extends Payment {
    // ↑ final = this class cannot be extended further
    // ↑ It's a leaf in the type hierarchy
    
    private final String cardNumber;
    private final String cvv;
    
    public CreditCardPayment(String txId, String cardNumber, String cvv) {
        super(txId);  // ↑ Call parent constructor
        this.cardNumber = cardNumber;
        this.cvv = cvv;
    }
    
    // Accessor methods...
}

// Now pattern matching is exhaustive:
static String describe(Payment payment) {
    return switch (payment) {
        case CreditCardPayment cc   -> "Credit card: " + cc.cardNumber();
        case BankTransferPayment bt -> "Bank transfer: " + bt.accountNumber();
        case CryptoPayment cp       -> "Crypto: " + cp.walletAddress();
        // ↑ No default needed — compiler knows ALL cases
        // ↑ If you add a new Payment subtype, this code won't compile
        // ↑ Until you handle the new case — compile-time safety!
    };
}
```

### Key Takeaways

1. **Sealed classes control inheritance** — only permitted subclasses can extend
2. **Three modifiers** — `final` (leaf), `sealed` (restricted), `non-sealed` (open)
3. **Exhaustive pattern matching** — compiler knows all subtypes
4. **Same package by default** — or same module
5. **Document design intent** — make your type hierarchy explicit
6. **Compile-time safety** — adding a new subtype forces code updates

### Real-World Organization Scenario

A banking platform models account types as a sealed hierarchy. When they add a new account type (e.g., `SavingsAccount`), the compiler forces them to handle it in every switch expression across the codebase. No forgotten cases, no runtime surprises. The sealed hierarchy also helps the JVM optimize dispatch — it knows there are exactly 4 account types, so it can use a faster lookup table instead of virtual dispatch.
