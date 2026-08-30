---
title: "Records in Depth — More Than Just Data Classes"
summary: "Compact constructors, validation in records, records with inheritance, records as map keys, records with builder patterns, and how organizations use records for type-safe APIs."
order: 6
minutes: 22
topics: [records, compact-constructors, record-validation, record-patterns, record-builder, java-21]
docs:
  - https://openjdk.org/jeps/395
  - https://openjdk.org/jeps/441
---

## The Concept, From Zero

### Records Are More Than You Think

Most developers know records as simple data holders:
```java
public record Point(int x, int y) {}
```

But records have powerful features that make them essential for real-world Java:

### Compact Constructors for Validation

```java
public record Range(int min, int max) {
    // Compact constructor — validates without duplicating field names
    public Range {
        if (min > max) {
            throw new IllegalArgumentException("min must be <= max");
        }
        if (min < 0) {
            throw new IllegalArgumentException("min must be >= 0");
        }
    }
    
    // Usage:
    // Range valid = new Range(1, 10);     // OK
    // Range invalid = new Range(10, 5);   // Throws exception
}
```

### Records with Custom Methods

```java
public record Money(BigDecimal amount, Currency currency) {
    // Compact constructor with validation
    public Money {
        if (amount.scale() > currency.getDefaultFractionDigits()) {
            throw new IllegalArgumentException("Too many decimal places");
        }
    }
    
    // Custom methods — records can have behavior
    public Money add(Money other) {
        if (!this.currency.equals(other.currency)) {
            throw new IllegalArgumentException("Currency mismatch");
        }
        return new Money(this.amount.add(other.amount), this.currency);
    }
    
    public Money multiply(int factor) {
        return new Money(this.amount.multiply(BigDecimal.valueOf(factor)), this.currency);
    }
    
    // Static factory methods
    public static Money usd(BigDecimal amount) {
        return new Money(amount, Currency.getInstance("USD"));
    }
    
    // Override auto-generated methods
    @Override
    public String toString() {
        return currency.getCurrencyCode() + " " + amount;
    }
}
```

### Records as Map Keys

```java
public record Coordinate(int row, int col) {
    // Records automatically generate good equals() and hashCode()
    // Perfect for use as Map keys
}

Map<Coordinate, String> grid = new HashMap<>();
grid.put(new Coordinate(0, 0), "Origin");
grid.put(new Coordinate(1, 2), "Target");

// Lookups work correctly because records have proper equals/hashCode
String value = grid.get(new Coordinate(1, 2)); // "Target"
```

### Records with Builder Pattern

```java
// Using Lombok
@Builder
public record CreateUserRequest(
    @NotBlank String name,
    @Email String email,
    @NotBlank String password,
    String phone
) {}

// Usage:
CreateUserRequest request = CreateUserRequest.builder()
    .name("Alice")
    .email("alice@example.com")
    .password("secret123")
    .build();
```

### Records in Sealed Hierarchies

```java
// Records work perfectly with sealed classes
public sealed interface Shape 
    permits Circle, Rectangle, Triangle {
}

public record Circle(double radius) implements Shape {
    public double area() { return Math.PI * radius * radius; }
}

public record Rectangle(double width, double height) implements Shape {
    public double area() { return width * height; }
}

public record Triangle(double base, double height) implements Shape {
    public double area() { return 0.5 * base * height; }
}

// Exhaustive pattern matching
static double area(Shape shape) {
    return switch (shape) {
        case Circle c    -> c.area();
        case Rectangle r -> r.area();
        case Triangle t  -> t.area();
        // No default needed — compiler knows all cases
    };
}
```

### Records vs Classes Decision Guide

| Use Case | Use Record | Use Class |
|----------|-----------|-----------|
| DTO / API response | ✅ | ❌ |
| Value object | ✅ | ❌ |
| Configuration holder | ✅ | ❌ |
| Entity with behavior | ❌ | ✅ |
| Mutable state | ❌ | ✅ |
| Inheritance hierarchy | ❌ | ✅ |
| JPA entity | ❌ | ✅ |

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using records for JPA entities | No no-arg constructor, immutable | Use classes with @Entity |
| Making records with too many fields | Hard to use, constructor hell | Split into smaller records |
| Not validating in compact constructor | Invalid data allowed | Add validation in compact constructor |
| Expecting records to be mutable | Records are immutable by design | Use classes if you need mutability |

### Key Takeaways

1. **Compact constructors** — validate without repeating field names
2. **Custom methods** — records can have behavior, not just data
3. **Perfect Map keys** — auto-generated equals/hashCode
4. **Work with sealed classes** — exhaustive pattern matching
5. **Immutable by default** — thread-safe without synchronization
6. **Not for JPA entities** — use classes for mutable domain objects

### Real-World Organization Scenario

A fintech company uses records extensively:
- `Money(amount, currency)` — immutable value object with arithmetic methods
- `TransactionRequest(from, to, amount)` — validated at construction time
- `AccountBalance(id, amount, currency)` — returned from API, safe to cache
- `AuditLog(userId, action, timestamp, details)` — immutable event record

Every record validates in its compact constructor, making it impossible to create invalid objects. The immutable nature means they're safe to share across threads without synchronization.
