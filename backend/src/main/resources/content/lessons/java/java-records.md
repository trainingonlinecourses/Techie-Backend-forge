---
title: Java Records — Immutable Data Carriers
summary: Replace verbose POJOs with one-line records, compact constructors for validation, generic records, and using records for DTOs and domain events.
order: 26
minutes: 20
topics: [java-records, immutable, dto, data-carrier, compact-constructor, pattern-matching]
docs:
  - https://docs.oracle.com/javase/specs/jls/se21/html/jls-8.html#jls-8.10
  - https://www.javaguides.net/2020/05/java-record-class-examples.html
---

# Java Records — Immutable Data Carriers

## What Are Records?

Before Java 16, if you wanted a simple class that just holds data, you had to write a LOT of boilerplate:

```java
// Old way — tons of boilerplate for a simple data class
public class Point {
    private final int x;    // 1. Private fields
    private final int y;

    public Point(int x, int y) {   // 2. Constructor
        this.x = x;
        this.y = y;
    }

    public int getX() { return x; }  // 3. Getters (one per field)
    public int getY() { return y; }

    @Override
    public boolean equals(Object o) {  // 4. equals()
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Point point = (Point) o;
        return x == point.x && y == point.y;
    }

    @Override
    public int hashCode() {  // 5. hashCode()
        return Objects.hash(x, y);
    }

    @Override
    public String toString() {  // 6. toString()
        return "Point{x=" + x + ", y=" + y + "}";
    }
}
```

**Records** eliminate ALL that boilerplate with one line:

```java
// New way — same functionality, one line!
public record Point(int x, int y) {}
```

That's it. The compiler automatically generates:
- ✅ Private final fields (`x` and `y`)
- ✅ A constructor with all fields
- ✅ Getters for every field (named after the field, NOT `getX()`)
- ✅ `equals()` and `hashCode()` based on all fields
- ✅ `toString()` that prints all fields

---

## How Records Work Under the Hood

When you write:
```java
public record Point(int x, int y) {}
```

The compiler generates something equivalent to:
```java
public final class Point {   // Note: record is implicitly final
    private final int x;     // private + final (immutable!)
    private final int y;

    // Canonical constructor
    public Point(int x, int y) {
        this.x = x;
        this.y = y;
    }

    // Accessor methods (NOT getX(), just x())
    public int x() { return x; }
    public int y() { return y; }

    // equals(), hashCode(), toString() auto-generated
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Point other)) return false;
        return this.x == other.x && this.y == other.y;
    }

    @Override
    public int hashCode() {
        return Objects.hash(x, y);
    }

    @Override
    public String toString() {
        return "Point[x=" + x + ", y=" + y + "]";
    }
}
```

---

## Using Records

```java
// Creating a record
Point p1 = new Point(3, 5);
Point p2 = new Point(3, 5);

// Accessing fields — use the method name, NOT getX()
System.out.println(p1.x());     // 3
System.out.println(p1.y());     // 5

// equals() works out of the box
System.out.println(p1.equals(p2));  // true

// toString() works out of the box
System.out.println(p1);             // Point[x=3, y=5]

// Records are immutable — you cannot change fields
// p1.x = 10;  // ❌ Compilation error — fields are private + final
// p1.setX(10); // ❌ No setter exists
```

---

## Customizing Records

### Compact Constructor (Validation)

Records have a special "compact constructor" that lets you validate **before** fields are assigned:

```java
public record EmailAddress(String localPart, String domain) {

    // Compact constructor — no parameter list, just the body
    // Fields are assigned AFTER this runs
    public EmailAddress {
        // Validate before assignment
        if (localPart == null || localPart.isBlank()) {
            throw new IllegalArgumentException("Local part cannot be blank");
        }
        if (domain == null || !domain.contains(".")) {
            throw new IllegalArgumentException("Invalid domain: " + domain);
        }
        // Normalize to lowercase
        localPart = localPart.toLowerCase();
        domain = domain.toLowerCase();
    }

    // Convenience method
    public String fullEmail() {
        return localPart + "@" + domain;
    }
}
```

```java
// Usage
EmailAddress email = new EmailAddress("Alice", "Gmail.COM");
System.out.println(email.localPart());  // "alice" (lowercased)
System.out.println(email.domain());     // "gmail.com" (lowercased)
System.out.println(email.fullEmail());  // "alice@gmail.com"

// Validation works
new EmailAddress("", "gmail.com");  // 💥 IllegalArgumentException
new EmailAddress("alice", "invalid");  // 💥 IllegalArgumentException
```

### Additional Fields and Methods

Records can have extra fields and methods, but the extra fields must be `static`:

```java
public record Student(String name, int age, String major) {

    // Static fields are allowed
    private static final int MIN_AGE = 16;
    private static final int MAX_AGE = 100;

    // Compact constructor with validation
    public Student {
        if (age < MIN_AGE || age > MAX_AGE) {
            throw new IllegalArgumentException("Age must be between " + MIN_AGE + " and " + MAX_AGE);
        }
    }

    // Instance methods ARE allowed (they just can't have non-static fields)
    public boolean isAdult() {
        return age >= 18;
    }

    public String介绍() {
        return name + " (" + age + ", " + major + ")";
    }

    // Static factory method — very common pattern
    public static Student create(String name, int age, String major) {
        return new Student(name, age, major);
    }
}
```

```java
Student s = Student.create("Alice", 20, "CS");
System.out.println(s.isAdult());  // true
System.out.println(s介绍());    // Alice (20, CS)
```

### Records Implementing Interfaces

Records can implement interfaces (but cannot extend classes — they're implicitly `final`):

```java
public interface Printable {
    String format();
}

public record Product(String id, String name, double price) implements Printable {

    // Implement the interface method
    @Override
    public String format() {
        return String.format("[%s] %s - $%.2f", id, name, price);
    }

    // Record with validation
    public Product {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("Product ID cannot be blank");
        }
        if (price < 0) {
            throw new IllegalArgumentException("Price cannot be negative");
        }
    }
}
```

```java
Product p = new Product("P001", "Laptop", 999.99);
System.out.println(p.format());  // [P001] Laptop - $999.99
```

### Generic Records

```java
// Records can be generic
public record Pair<A, B>(A first, B second) {
    public <C> Pair<A, C> mapSecond(Function<B, C> mapper) {
        return new Pair<>(first, mapper.apply(second));
    }
}

// Usage
Pair<String, Integer> nameAge = new Pair<>("Alice", 25);
Pair<String, String> nameAgeStr = nameAge.mapSecond(Object::toString);
System.out.println(nameAgeStr.first());   // "Alice"
System.out.println(nameAgeStr.second());  // "25"
```

---

## Records vs Lombok

If you've used Lombok, you know `@Data`, `@Value`, and `@AllArgsConstructor`. Records do the same thing but are part of the language:

```java
// Lombok way
@Data
@AllArgsConstructor
public class Point {
    private final int x;
    private final int y;
}

// Java Record way — no library needed
public record Point(int x, int y) {}
```

| Feature | Records | Lombok |
|---------|---------|--------|
| Language support | ✅ Built into Java | ❌ Requires annotation processor |
| Immutability | ✅ Always immutable | Configurable |
| Extends classes | ❌ No (implicitly final) | ✅ Yes |
| Custom fields | Only `static` fields | ✅ Any fields |
| Boilerplate | Zero | Near zero |

---

## In an Organization

### Scenario 1: API DTOs (Data Transfer Objects)

```java
// Instead of verbose DTOs, use records for API request/response objects

// Request DTO
public record CreateUserRequest(
    String username,
    String email,
    String password,
    String role
) {
    public CreateUserRequest {
        // Validation in compact constructor
        if (username == null || username.length() < 3) {
            throw new IllegalArgumentException("Username must be at least 3 characters");
        }
        if (email == null || !email.contains("@")) {
            throw new IllegalArgumentException("Invalid email");
        }
        if (password == null || password.length() < 8) {
            throw new IllegalArgumentException("Password must be at least 8 characters");
        }
    }
}

// Response DTO
public record UserResponse(
    Long id,
    String username,
    String email,
    String role,
    LocalDateTime createdAt
) {}

// Error DTO
public record ApiError(
    String message,
    String path,
    int status,
    LocalDateTime timestamp
) {
    public ApiError {
        timestamp = LocalDateTime.now();  // Auto-set timestamp
    }
}
```

```java
// Controller using records
@RestController
@RequestMapping("/api/users")
public class UserController {

    @PostMapping
    public ResponseEntity<UserResponse> create(@RequestBody CreateUserRequest request) {
        // request.username(), request.email(), etc. — clean and simple
        User user = userService.create(
            request.username(),
            request.email(),
            request.password(),
            request.role()
        );
        return ResponseEntity.ok(new UserResponse(
            user.getId(),
            user.getUsername(),
            user.getEmail(),
            user.getRole(),
            user.getCreatedAt()
        ));
    }
}
```

### Scenario 2: Configuration Objects

```java
// Database configuration as a record
public record DatabaseConfig(
    String host,
    int port,
    String database,
    String username,
    String password,
    int maxConnections,
    Duration timeout
) {
    public DatabaseConfig {
        // Defaults via compact constructor
        if (port <= 0) port = 5432;
        if (maxConnections <= 0) maxConnections = 10;
        if (timeout == null) timeout = Duration.ofSeconds(30);
    }

    public String url() {
        return "jdbc:postgresql://" + host + ":" + port + "/" + database;
    }
}
```

### Scenario 3: Domain Events

```java
// Events as records — immutable, self-documenting
public record UserRegistered(
    String userId,
    String email,
    LocalDateTime occurredAt
) {
    public UserRegistered {
        occurredAt = LocalDateTime.now();
    }
}

public record OrderPlaced(
    String orderId,
    String userId,
    List<String> productIds,
    BigDecimal totalAmount,
    LocalDateTime occurredAt
) {
    public OrderPlaced {
        occurredAt = LocalDateTime.now();
    }

    public boolean isHighValue() {
        return totalAmount.compareTo(BigDecimal.valueOf(1000)) > 0;
    }
}
```

```java
// Publishing events
@Service
public class UserService {
    private final ApplicationEventPublisher publisher;

    @Transactional
    public void registerUser(String email, String password) {
        User user = createAndSaveUser(email, password);

        // Publish domain event as a record
        publisher.publishEvent(new UserRegistered(user.getId(), email, LocalDateTime.now()));
    }
}
```

### Scenario 4: Value Objects (DDD)

```java
// Value objects that represent domain concepts
public record Money(BigDecimal amount, Currency currency) {
    public Money {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("Amount must be non-negative");
        }
        if (currency == null) {
            throw new IllegalArgumentException("Currency cannot be null");
        }
    }

    public Money add(Money other) {
        if (!this.currency.equals(other.currency)) {
            throw new IllegalArgumentException("Cannot add different currencies");
        }
        return new Money(this.amount.add(other.amount), this.currency);
    }

    public static Money usd(BigDecimal amount) {
        return new Money(amount, Currency.getInstance("USD"));
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Trying to extend a record | `record Foo extends Bar {}` won't compile — records are implicitly `final` | Implement interfaces instead |
| Adding non-static fields | `record Foo(int x) { int y; }` won't compile | Use `static` fields or use a regular class |
| Using `getX()` | Records use `x()` not `getX()` | Use the field name as the getter method |
| Mutating record fields in a collection | Fields are `final` — cannot be changed | Create a new record instance instead |
| Using records for mutable entities | Records are immutable by design | Use regular classes for JPA entities |
| Forgetting compact constructor validation | Invalid data gets through | Always validate in the compact constructor |
