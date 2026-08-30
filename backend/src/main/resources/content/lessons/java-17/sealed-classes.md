---
title: Sealed Classes — Controlling the Class Hierarchy
summary: What sealed classes are, permits clause, why they matter for pattern matching, how they replace enums for complex hierarchies, and how organizations use them for domain modeling.
order: 2
minutes: 25
topics: [sealed-classes, permits, non-sealed, final, java17]
docs:
  - https://docs.oracle.com/en/java/javase/17/language/sealed-classes-and-interfaces.html
  - https://openjdk.org/jeps/409
---

## The Concept, From Zero

Before Java 17, if you created an interface, ANY class in ANY package could implement it. You had no control over who could extend your type hierarchy.

**Sealed classes** let you restrict which classes can implement or extend a class/interface:

```java
// Only these 3 shapes are allowed — no one else can implement Shape
public sealed interface Shape permits Circle, Rectangle, Triangle {
    double area();
}

// Each permitted class must be final, non-sealed, or sealed
public final record Circle(double radius) implements Shape {
    public double area() { return Math.PI * radius * radius; }
}

public final record Rectangle(double width, double height) implements Shape {
    public double area() { return width * height; }
}

public final record Triangle(double base, double height) implements Shape {
    public double area() { return 0.5 * base * height; }
}
```

**Why this matters for pattern matching:** The compiler KNOWS exactly which types are possible. This enables exhaustive `switch` expressions with no `default` needed:

```java
String describe(Shape shape) {
    return switch (shape) {
        case Circle c    -> "Circle with radius " + c.radius();
        case Rectangle r -> "Rectangle " + r.width() + "x" + r.height();
        case Triangle t  -> "Triangle with base " + t.base();
        // No default needed — compiler knows these are ALL the possibilities
    };
}
```

---

## The Three Modalities

```java
// SEALED — restricts who can extend
sealed interface Shape permits Circle, Rectangle, Triangle {}

// FINAL — cannot be extended further
final record Circle(double radius) implements Shape {}

// NON-SEALED — opens the hierarchy back up (anyone can extend)
non-sealed class CustomShape implements Shape {
    // ...
}
```

---

## Line-by-Line Walkthrough

```java
import java.util.*;

public class SealedClassesDemo {
    // Line 1: Define a sealed hierarchy for payment methods
    sealed interface PaymentMethod permits CreditCard, DebitCard, BankTransfer {
        boolean isInstant();
        double processingFee(double amount);
    }

    // Line 2: Each permitted class is final (cannot be extended)
    final record CreditCard(String number, String expiry) implements PaymentMethod {
        public boolean isInstant() { return true; }
        public double processingFee(double amount) { return amount * 0.029 + 0.30; }
        // 2.9% + $0.30 per transaction
    }

    final record DebitCard(String number) implements PaymentMethod {
        public boolean isInstant() { return true; }
        public double processingFee(double amount) { return amount * 0.015; }
        // 1.5% per transaction
    }

    final record BankTransfer(String routingNumber, String accountNumber) implements PaymentMethod {
        public boolean isInstant() { return false; }     // takes 1-3 business days
        public double processingFee(double amount) { return 0; }  // no fee
    }

    // Line 3: Use sealed hierarchy with exhaustive switch
    static String describePayment(PaymentMethod method) {
        return switch (method) {
            case CreditCard cc   -> "Credit Card ending " + cc.number().substring(cc.number().length() - 4);
            case DebitCard dc    -> "Debit Card ending " + dc.number().substring(dc.number().length() - 4);
            case BankTransfer bt -> "Bank Transfer to account " + bt.accountNumber();
            // No default needed — compiler knows all cases
        };
    }

    // Line 4: Combine with pattern matching
    static double calculateFee(PaymentMethod method, double amount) {
        double fee = method.processingFee(amount);

        // Additional pattern matching logic
        if (method instanceof CreditCard cc && cc.number().startsWith("4")) {
            fee += 0.50;  // Visa surcharge
        }

        return fee;
    }

    // Line 5: Sealed class with non-sealed escape hatch
    sealed interface ApiResponse permits SuccessResponse, ErrorResponse, RawResponse {}
    record SuccessResponse(int status, Object data) implements ApiResponse {}
    record ErrorResponse(int status, String message) implements ApiResponse {}
    non-sealed class RawResponse implements ApiResponse {
        // Allows third-party extensions without modifying the sealed hierarchy
        private final int status;
        private final String body;
        RawResponse(int status, String body) { this.status = status; this.body = body; }
        public int status() { return status; }
        public String body() { return body; }
    }

    public static void main(String[] args) {
        // Line 6: Working with sealed hierarchy
        PaymentMethod cc = new CreditCard("4111111111111234", "12/25");
        PaymentMethod dc = new DebitCard("5222222222222222");
        PaymentMethod bt = new BankTransfer("021000021", "123456789");

        System.out.println(describePayment(cc));   // Credit Card ending 1234
        System.out.println(describePayment(dc));   // Debit Card ending 2222
        System.out.println(describePayment(bt));   // Bank Transfer to account 123456789

        // Line 7: Polymorphism still works
        List<PaymentMethod> methods = List.of(cc, dc, bt);
        for (PaymentMethod m : methods) {
            System.out.printf("%s: fee=$%.2f, instant=%s%n",
                m.getClass().getSimpleName(),
                m.processingFee(100),
                m.isInstant());
        }
    }
}
```

---

## Real-World Scenarios

### Scenario 1: State machine for order processing

```java
sealed interface OrderState permits Draft, Submitted, Processing, Shipped, Delivered, Cancelled {}

record Draft(List<String> items) implements OrderState {}
record Submitted(String orderId, Instant submittedAt) implements OrderState {}
record Processing(String orderId, String warehouse) implements OrderState {}
record Shipped(String orderId, String trackingNumber) implements OrderState {}
record Delivered(String orderId, Instant deliveredAt) implements OrderState {}
record Cancelled(String orderId, String reason) implements OrderState {}

OrderState next(OrderState current) {
    return switch (current) {
        case Draft d       -> new Submitted("ORD-" + UUID.randomUUID(), Instant.now());
        case Submitted s   -> new Processing(s.orderId(), "Warehouse-A");
        case Processing p  -> new Shipped(p.orderId(), "TRACK-" + p.orderId());
        case Shipped sh    -> new Delivered(sh.orderId(), Instant.now());
        case Delivered _   -> throw new IllegalStateException("Already delivered");
        case Cancelled _   -> throw new IllegalStateException("Order cancelled");
    };
}
```

### Scenario 2: AST for expression evaluation

```java
sealed interface Expr permits Literal, Add, Multiply {}
record Literal(double value) implements Expr {}
record Add(Expr left, Expr right) implements Expr {}
record Multiply(Expr left, Expr right) implements Expr {}

double evaluate(Expr expr) {
    return switch (expr) {
        case Literal l -> l.value();
        case Add a     -> evaluate(a.left()) + evaluate(a.right());
        case Multiply m -> evaluate(m.left()) * evaluate(m.right());
    };
}

// Usage: (2 + 3) * 4 = 20
Expr expr = new Multiply(new Add(new Literal(2), new Literal(3)), new Literal(4));
System.out.println(evaluate(expr));  // 20.0
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Forgetting `permits` clause | Compiler error | List all permitted subclasses |
| Permitted class not in same package/module | Compilation error | Put all classes in the same package |
| Permitted class not final/non-sealed/sealed | Compilation error | Each permitted class must specify modality |
| Using `default` in exhaustive switch | Unnecessary but not wrong | Remove `default` when compiler knows all cases |
