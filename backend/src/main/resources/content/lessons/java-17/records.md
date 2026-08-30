---
title: Records — Immutable Data Classes in One Line
summary: What records are, how they replace POJOs, canonical constructors, compact constructors, validation, and how organizations use them for DTOs, value objects, and domain models.
order: 1
minutes: 28
topics: [records, immutable-data, value-objects, dto, java17]
docs:
  - https://docs.oracle.com/en/java/javase/17/language/records.html
  - https://openjdk.org/jeps/395
---

## The Concept, From Zero

Before Java 16, creating a simple data class required dozens of lines of boilerplate:

```java
// OLD WAY: A simple Point class
public final class Point {
    private final int x;
    private final int y;

    public Point(int x, int y) { this.x = x; this.y = y; }
    public int x() { return x; }
    public int y() { return y; }

    @Override public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Point)) return false;
        Point p = (Point) o;
        return x == p.x && y == p.y;
    }

    @Override public int hashCode() { return Objects.hash(x, y); }

    @Override public String toString() { return "Point[x=" + x + ", y=" + y + "]"; }
}
```

**Records** reduce this to one line:

```java
// JAVA 16+: Same thing in one line
public record Point(int x, int y) {}
```

The compiler automatically generates:
- **Constructor** with all fields (canonical constructor)
- **Getter methods** named after fields (`x()`, `y()` — NOT `getX()`, `getY()`)
- **equals()** and **hashCode()** based on all fields
- **toString()** with field names and values

Records are **immutable** — all fields are `private final`.

---

## Anatomy of a Record

```java
public record Employee(
    String name,          // component — becomes a private final field
    String department,    // component
    double salary         // component
) {
    // This is the compact constructor — validation only
    // The compiler generates the assignment
    public Employee {
        Objects.requireNonNull(name, "Name cannot be null");
        if (salary < 0) throw new IllegalArgumentException("Salary cannot be negative");
        this.department = department.toUpperCase();  // transform!
    }

    // Custom method
    public boolean isHighEarner() {
        return salary > 100000;
    }

    // Static factory method
    public static Employee of(String name, String dept, double salary) {
        return new Employee(name, dept, salary);
    }
}
```

---

## Line-by-Line Walkthrough

```java
import java.util.*;
import java.util.stream.*;

public class RecordsDemo {
    // Line 1: Simple record
    record Coordinate(double latitude, double longitude) {}

    // Line 2: Record with validation
    record Email(String address) {
        public Email {
            Objects.requireNonNull(address);
            if (!address.contains("@")) {
                throw new IllegalArgumentException("Invalid email: " + address);
            }
            this.address = address.toLowerCase();  // normalize in compact constructor
        }
    }

    // Line 3: Record with computed components
    record Money(double amount, String currency) {
        // Compact constructor — validation + normalization
        public Money {
            if (amount < 0) throw new IllegalArgumentException("Amount cannot be negative");
            this.currency = currency.toUpperCase();  // always uppercase
        }

        // Custom factory
        public static Money of(double amount, String currency) {
            return new Money(amount, currency);
        }

        // Arithmetic (returns new record — immutable)
        public Money add(Money other) {
            if (!this.currency.equals(other.currency)) {
                throw new IllegalArgumentException("Currency mismatch");
            }
            return new Money(this.amount + other.amount, this.currency);
        }
    }

    // Line 4: Record implementing interfaces
    record Person(String name, int age) implements Comparable<Person> {
        @Override
        public int compareTo(Person other) {
            return Integer.compare(this.age, other.age);
        }
    }

    // Line 5: Nested records
    record Address(String street, String city, String zip) {}
    record User(String name, Email email, Address address) {}

    public static void main(String[] args) {
        // Line 6: Creating and using records
        var coord = new Coordinate(40.7128, -74.0060);
        System.out.println(coord.latitude());    // 40.7128
        System.out.println(coord);               // Coordinate[latitude=40.7128, longitude=-74.006]

        // Line 7: Records work with collections and streams
        var people = List.of(
            new Person("Alice", 30),
            new Person("Bob", 25),
            new Person("Carol", 35)
        );

        var sortedByName = people.stream()
            .sorted(Comparator.comparing(Person::name))
            .toList();
        // [Person[name=Alice, age=30], Person[name=Bob, age=25], Person[name=Carol, age=35]]

        // Line 8: Records as map keys (equals/hashCode auto-generated)
        var prices = new LinkedHashMap<Coordinate, Double>();
        prices.put(new Coordinate(40.7128, -74.0060), 100.0);
        double price = prices.get(new Coordinate(40.7128, -74.0060));  // works!

        // Line 9: Record in pattern matching (Java 17+)
        Object obj = new Email("ALICE@EXAMPLE.COM");
        if (obj instanceof Email email) {       // pattern matching
            System.out.println("Email: " + email.address());  // "alice@example.com"
        }

        // Line 10: Validation example
        try {
            new Email("invalid-email");
        } catch (IllegalArgumentException e) {
            System.out.println("Validation caught: " + e.getMessage());
        }
    }
}
```

---

## Real-World Scenarios

### Scenario 1: API DTOs (Data Transfer Objects)

```java
// Before Java 16: 50+ lines per DTO with Lombok or manual boilerplate
// After: 1 line each

record CreateUserRequest(String name, String email, String password) {}
record UserResponse(String id, String name, String email, Instant createdAt) {}
record ApiResponse<T>(boolean success, String message, T data) {}

// Usage
public ApiResponse<UserResponse> createUser(CreateUserRequest request) {
    var user = userService.create(request.name(), request.email(), request.password());
    return new ApiResponse<>(true, "User created", toResponse(user));
}
```

### Scenario 2: Domain value objects

```java
record Money(BigDecimal amount, Currency currency) {
    public Money {
        Objects.requireNonNull(amount);
        Objects.requireNonNull(currency);
    }

    public Money convert(Currency target, BigDecimal rate) {
        return new Money(amount.multiply(rate), target);
    }

    public static Money usd(BigDecimal amount) {
        return new Money(amount, Currency.getInstance("USD"));
    }
}

// No accidental mutation — ever
Money price = Money.usd(new BigDecimal("29.99"));
// price.amount().add(...) would need reassignment, which isn't possible
```

### Scenario 3: Event sourcing

```java
record OrderCreated(String orderId, String customerId, List<String> items, Instant timestamp) {}
record OrderShipped(String orderId, String trackingNumber, Instant timestamp) {}
record OrderCancelled(String orderId, String reason, Instant timestamp) {}

// Sealed interface for all order events (Java 17)
sealed interface OrderEvent permits OrderCreated, OrderShipped, OrderCancelled {}

// Pattern matching in switch (Java 17)
String describeEvent(OrderEvent event) {
    return switch (event) {
        case OrderCreated e  -> "New order " + e.orderId() + " with " + e.items().size() + " items";
        case OrderShipped e  -> "Order " + e.orderId() + " shipped via " + e.trackingNumber();
        case OrderCancelled e -> "Order " + e.orderId() + " cancelled: " + e.reason();
    };
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `getX()` instead of `x()` | Records use `fieldName()` not `getField()` | Use `record.field()` syntax |
| Trying to extend a record | Records are implicitly `final` | Use composition instead |
| Mutable field in record | Records are immutable by design | Use arrays/collections defensively |
| Using `this.field =` in compact constructor | Can only assign (not `this.field =` for primitives) | Use `this.field = value;` in compact constructor |
| Records with only one field | Valid but unusual | Consider if a simple class is better |
