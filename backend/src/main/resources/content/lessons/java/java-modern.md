---
title: Modern Java (17+) — Sealed Classes, Pattern Matching, Text Blocks, and Records
summary: The most impactful modern Java features explained for beginners: sealed classes for type safety, pattern matching instanceof and switch, text blocks for multi-line strings, records for data carriers, switch expressions, and how organizations adopt these features incrementally with line-by-line walkthroughs.
order: 11
minutes: 30
topics: [sealed-classes, pattern-matching, text-blocks, records, switch-expressions, modern-java, java17, java21]
docs:
  - https://docs.oracle.com/en/java/javase/21/language/records.html
  - https://docs.oracle.com/en/java/javase/21/language/sealed-classes-and-interfaces.html
  - https://docs.oracle.com/en/java/javase/21/language/pattern-matching.html
---

# Modern Java (17+) — Sealed Classes, Pattern Matching, Text Blocks, and Records

## Why "Modern Java"?

Java 17 (LTS) and Java 21 (LTS) brought features that make Java more expressive, safer, and less verbose. These aren't just syntax sugar — they solve real problems that caused bugs in production code for years.

**Beginner mental model:** Modern Java features are like upgrading from a typewriter to a word processor. You're still writing, but the tools help you catch mistakes earlier, type less boilerplate, and express your intent more clearly.

## Records — immutable data carriers (Java 16+)

Records replace 50+ lines of boilerplate with a single line:

```java
// OLD WAY: Java bean — lots of boilerplate
public class UserOld {
    private final String name;          // field
    private final String email;         // field
    private final int age;              // field

    public UserOld(String name, String email, int age) {  // constructor
        this.name = name;
        this.email = email;
        this.age = age;
    }

    public String getName() { return name; }    // getter
    public String getEmail() { return email; }
    public int getAge() { return age; }

    @Override public boolean equals(Object o) {  // equals — 10+ lines
        if (this == o) return true;
        if (!(o instanceof UserOld u)) return false;
        return age == u.age && name.equals(u.name) && email.equals(u.email);
    }

    @Override public int hashCode() { return Objects.hash(name, email, age); }

    @Override public String toString() { return "UserOld{name='" + name + "', email='" + email + "', age=" + age + "}"; }
}

// NEW WAY: record — one line does ALL of the above
public record User(String name, String email, int age) {
    // You automatically get:
    // ✅ Constructor: new User("Alice", "alice@example.com", 30)
    // ✅ Getters: user.name(), user.email(), user.age() (NO 'get' prefix!)
    // ✅ equals(): compares all fields
    // ✅ hashCode(): based on all fields
    // ✅ toString(): "User[name=Alice, email=alice@example.com, age=30]"

    // Add validation in a compact constructor (no parameter list)
    public User {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Name required");
        if (email == null || !email.contains("@")) throw new IllegalArgumentException("Invalid email");
        if (age < 0 || age > 150) throw new IllegalArgumentException("Invalid age");
    }
}

// Usage:
User alice = new User("Alice", "alice@example.com", 30);
System.out.println(alice.name());           // "Alice" — no getName() needed
System.out.println(alice.toString());       // "User[name=Alice, email=alice@example.com, age=30]"
System.out.println(alice);                  // same — auto toString()

// Records are IMMUTABLE — no setters
// alice.age = 31;                          // COMPILE ERROR
```

## Sealed Classes — controlling who can implement your interface (Java 17)

```java
// Sealed classes/interfaces restrict which classes can extend/implement them
// This gives the compiler complete knowledge of all possible subtypes

public sealed interface PaymentMethod permits CreditCard, DebitCard, BankTransfer, CryptoWallet {
    // Only CreditCard, DebitCard, BankTransfer, and CryptoWallet can implement this
    // No other class in the entire codebase can implement PaymentMethod
    Money charge(Money amount);
}

public record CreditCard(String cardNumber, String cvv) implements PaymentMethod {
    public Money charge(Money amount) {
        return stripeGateway.charge(cardNumber, amount);   // delegate to Stripe
    }
}

public record DebitCard(String cardNumber) implements PaymentMethod {
    public Money charge(Money amount) {
        return bankGateway.debit(cardNumber, amount);      // delegate to bank
    }
}

public record BankTransfer(String iban, String swift) implements PaymentMethod {
    public Money charge(Money amount) {
        return bankGateway.transfer(iban, swift, amount);
    }
}

public record CryptoWallet(String address) implements PaymentMethod {
    public Money charge(Money amount) {
        return cryptoGateway.transfer(address, amount);
    }
}

// BENEFIT: exhaustive switch — compiler knows ALL possible types
public String describePayment(PaymentMethod method) {
    return switch (method) {
        case CreditCard cc    -> "Credit card ending in " + cc.cardNumber().substring(cc.cardNumber().length() - 4);
        case DebitCard dc     -> "Debit card ending in " + dc.cardNumber().substring(dc.cardNumber().length() - 4);
        case BankTransfer bt  -> "Bank transfer to " + bt.iban();
        case CryptoWallet cw  -> "Crypto wallet " + cw.address().substring(0, 10) + "...";
        // NO 'default' needed! Compiler knows these are ALL the cases
        // If you add a new payment method later, this switch COMPILES WITH AN ERROR
        // until you handle the new case — prevents silent bugs!
    };
}

// The 'permits' keyword also works with classes:
public sealed class Shape permits Circle, Rectangle, Triangle {
    // Only these three classes can extend Shape
}

public final class Circle extends Shape { ... }       // final = can't be extended further
public non-sealed class Rectangle extends Shape { ... } // non-sealed = anyone can extend Rectangle
public sealed class Triangle extends Shape permits RightTriangle { ... } // sealed = only RightTriangle
```

## Pattern Matching for instanceof (Java 16+)

```java
// OLD WAY: check type, then cast manually
Object obj = getSomething();
if (obj instanceof String) {
    String s = (String) obj;           // manual cast — error-prone
    System.out.println(s.length());
}

// NEW WAY: pattern matching — check and cast in one step
if (obj instanceof String s) {         // 's' is the cast variable — only in scope if true
    System.out.println(s.length());    // s is already a String — no cast needed
}

// In conditions — combine type check with additional tests
if (obj instanceof String s && s.length() > 5) {
    System.out.println("Long string: " + s);
}

// With records — destructure directly!
public record Point(int x, int y) {}

Object obj = new Point(3, 4);
if (obj instanceof Point(int x, int y)) {    // extract x and y directly!
    System.out.println("Point at " + x + "," + y);  // x=3, y=4
}
```

## Pattern Matching for switch (Java 21)

```java
// OLD WAY: ugly chain of instanceof checks
String describe(Object obj) {
    if (obj instanceof Integer) {
        return "Integer: " + obj;
    } else if (obj instanceof String) {
        return "String: " + obj;
    } else if (obj instanceof double[]) {
        return "Array of doubles";
    } else {
        return "Unknown: " + obj.getClass().getSimpleName();
    }
}

// NEW WAY: pattern matching switch — clean, exhaustive, type-safe
String describe(Object obj) {
    return switch (obj) {
        case Integer i    -> "Integer: " + i;                    // i is the Integer
        case String s     -> "String: " + s;                     // s is the String
        case double[] arr -> "Array of " + arr.length + " doubles";  // arr is the array
        case null         -> "Null value";                        // handles null!
        default           -> "Unknown: " + obj.getClass().getSimpleName();
    };
}

// With guards (when clauses)
String categorizeAge(Object obj) {
    return switch (obj) {
        case Integer i when i < 0   -> "Invalid";
        case Integer i when i < 13  -> "Child";
        case Integer i when i < 18  -> "Teenager";
        case Integer i              -> "Adult";
        default                     -> "Not a number";
    };
}

// Destructuring nested records
public record Street(String name, int number) {}
public record Address(Street street, String city) {}
public record User(String name, Address address) {}

String describeUser(User user) {
    return switch (user) {
        case User(String name, Address(Street(String street, int num), String city))
            -> name + " lives at " + num + " " + street + ", " + city;
        case User(String name, null)
            -> name + " has no address";
        case null -> "No user";
    };
}
```

## Text Blocks — multi-line strings (Java 15+)

```java
// OLD WAY: escape characters, concatenation — ugly
String json = "{\n" +
    "    \"name\": \"Alice\",\n" +
    "    \"age\": 30,\n" +
    "    \"email\": \"alice@example.com\"\n" +
    "}";

String sql = "SELECT u.name, u.email\n" +
    "FROM users u\n" +
    "WHERE u.active = true\n" +
    "ORDER BY u.name";

// NEW WAY: text blocks — clean, readable, no escaping
String json = """
        {
            "name": "Alice",
            "age": 30,
            "email": "alice@example.com"
        }
        """;

String sql = """
        SELECT u.name, u.email
        FROM users u
        WHERE u.active = true
        ORDER BY u.name
        """;

// HTML template — no escaping needed
String html = """
        <html>
            <body>
                <h1>Hello, %s!</h1>
                <p>Welcome to our platform.</p>
            </body>
        </html>
        """.formatted("Alice");

// Line continuation with \ (suppresses the newline)
String singleLine = """
        This is a very long \
        string that appears \
        on one line""";
// Result: "This is a very long string that appears on one line"

// Indentation is automatically stripped
String xml = """
        <root>
            <item>value</item>
        </root>
        """;
// The leading spaces (based on the closing """) are stripped automatically
```

## Switch Expressions (Java 14+)

```java
// OLD WAY: switch statement with break (fall-through bugs)
String dayType;
switch (day) {
    case "MONDAY":
    case "TUESDAY":
    case "WEDNESDAY":
    case "THURSDAY":
    case "FRIDAY":
        dayType = "Weekday";
        break;                          // forget this? Bug!
    case "SATURDAY":
    case "SUNDAY":
        dayType = "Weekend";
        break;
    default:
        dayType = "Unknown";
        break;
}

// NEW WAY: switch expression — no break, no fall-through, returns a value
String dayType = switch (day) {
    case "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY" -> "Weekday";
    case "SATURDAY", "SUNDAY" -> "Weekend";
    default -> "Unknown";
};

// With complex logic, use yield to return a value
int numLetters = switch (day) {
    case "MONDAY" -> {
        log.info("Starting the week!");     // can have statements in the block
        yield 6;                             // yield returns the value
    }
    case "TUESDAY" -> 7;
    case "WEDNESDAY" -> 9;
    default -> throw new IllegalArgumentException("Unknown: " + day);
};
```

## How we use it in organizations

### Scenario 1: Type-safe API response with sealed hierarchy

```java
// Sealed response — compiler knows ALL possible outcomes
public sealed interface ApiResponse<T> permits Success, Error, Loading {
    record Success<T>(T data, int statusCode) implements ApiResponse<T> {}
    record Error<T>(String message, int statusCode, List<String> details) implements ApiResponse<T> {}
    record Loading<T>() implements ApiResponse<T> {}
}

// Exhaustive handling — no silent bugs when new response types are added
public <T> ResponseEntity<?> toHttpEntity(ApiResponse<T> response) {
    return switch (response) {
        case Success<T> s  -> ResponseEntity.ok(s.data());
        case Error<T> e    -> ResponseEntity.status(e.statusCode())
                                       .body(Map.of("error", e.message(), "details", e.details()));
        case Loading<T>    -> ResponseEntity.status(202).body("Loading...");
    };
}
```

### Scenario 2: Pattern matching for configuration parsing

```java
public record ConfigEntry(String key, Object value) {

    public String toString() {
        return switch (this) {
            case ConfigEntry(String k, String v)   -> k + " = \"" + v + "\"";
            case ConfigEntry(String k, Integer v)   -> k + " = " + v;
            case ConfigEntry(String k, Boolean v)   -> k + " = " + (v ? "true" : "false");
            case ConfigEntry(String k, List<?> v)   -> k + " = [" + String.join(", ", v.stream().map(Object::toString).toList()) + "]";
            case ConfigEntry(String k, null)         -> k + " = null";
            default -> k + " = " + value;
        };
    }
}
```

### Scenario 3: Text blocks for SQL and JSON templates

```java
@Repository
public class UserRepository {

    private static final String FIND_ACTIVE_USERS = """
            SELECT u.id, u.name, u.email, u.created_at
            FROM users u
            WHERE u.active = true
              AND u.created_at > :since
            ORDER BY u.name ASC
            LIMIT :limit
            """;

    private static final String UPDATE_USER = """
            UPDATE users
            SET name = :name,
                email = :email,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
            """;

    @Query(value = FIND_ACTIVE_USERS, nativeQuery = true)
    List<UserProjection> findActiveUsers(@Param("since") Instant since,
                                          @Param("limit") int limit);
}
```

## When to adopt each feature

| Feature | Java Version | Safe to adopt? | Notes |
|---|---|---|---|
| Records | 16+ | ✅ Yes | Great for DTOs, value objects, data carriers |
| Sealed classes | 17+ | ✅ Yes | Use for type hierarchies with finite subtypes |
| Pattern matching instanceof | 16+ | ✅ Yes | Replace every `instanceof` + cast |
| Pattern matching switch | 21+ | ⚠️ If on 21 | Replace if/else chains and old switch |
| Text blocks | 15+ | ✅ Yes | Use for SQL, JSON, HTML templates |
| Switch expressions | 14+ | ✅ Yes | Replace every old-style switch |

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Using records for mutable entities | Can't change fields after creation | Use regular classes for entities |
| Forgetting sealed classes need `permits` | Compiler error | List all permitted subtypes |
| Using text blocks for short strings | Unnecessary overhead | Use regular strings for short content |
| Not using `yield` in switch expression blocks | Compile error | Always `yield` a value from `{}` blocks |
| Sealing with `non-sealed` when not needed | Opens hierarchy unexpectedly | Use `final` unless you need extensibility |
