---
title: Lombok Annotations — Eliminate Boilerplate
summary: @Data, @Getter/@Setter, @Builder, @Value, @Slf4j, @ToString, @EqualsAndHashCode, and how Lombok generates code at compile time.
order: 2
minutes: 20
topics: [lombok, @Data, @Getter, @Setter, @Builder, @Value, @Slf4j, boilerplate]
docs:
  - https://projectlombok.org/features/all
---

## The Concept, From Zero

Lombok generates getters, setters, constructors, and more at compile time via annotation processing. You write one annotation; Lombok generates 50+ lines of code.

```java
// Without Lombok
public class User {
    private String name;
    private int age;
    public User() {}
    public User(String name, int age) { this.name = name; this.age = age; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public int getAge() { return age; }
    public void setAge(int age) { this.age = age; }
    @Override public String toString() { return "User{name='" + name + "', age=" + age + "}"; }
    @Override public boolean equals(Object o) { ... }
    @Override public int hashCode() { ... }
}

// With Lombok
@Data
public class User {
    private String name;
    private int age;
}
```

---

## Core Annotations

### @Getter / @Setter

```java
@Getter
@Setter
public class User {
    private String name;
    private int age;
}

// Generates: getName(), setName(), getAge(), setAge()
```

### @Data (combines everything)

```java
@Data
public class User {
    private String name;
    private int age;
}

// Generates: getters, setters, toString, equals, hashCode, requiredArgsConstructor
```

### @Value (immutable)

```java
@Value
public class Money {
    double amount;
    String currency;
}

// Generates: getters only, final fields, all-args constructor, toString, equals, hashCode
```

### @Builder

```java
@Builder
public class User {
    private String name;
    private int age;
    private String email;
}

// Usage: User.builder().name("Alice").age(30).email("alice@example.com").build()
```

### @Slf4j

```java
@Slf4j
public class MyService {
    public void doSomething() {
        log.info("Doing something");  // log is auto-generated
    }
}

// Generates: private static final Logger log = LoggerFactory.getLogger(MyService.class);
```

---

## Line-by-Line Walkthrough

```java
import lombok.*;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class User {
    private Long id;
    private String name;
    private String email;
    private int age;
    private Role role;

    public enum Role { USER, ADMIN }
}

// Usage
public class LombokDemo {
    public static void main(String[] args) {
        // Builder pattern
        User user = User.builder()
            .name("Alice")
            .email("alice@example.com")
            .age(30)
            .role(User.Role.ADMIN)
            .build();

        // Getters/setters
        System.out.println(user.getName());  // "Alice"
        user.setAge(31);

        // toString
        System.out.println(user);
        // User(id=null, name=Alice, email=alice@example.com, age=31, role=ADMIN)

        // equals + hashCode (based on all fields)
        User same = User.builder().name("Alice").email("alice@example.com")
            .age(31).role(User.Role.ADMIN).build();
        System.out.println(user.equals(same));  // true
    }
}
```

---

## Real-World Scenarios

### Scenario 1: DTO with validation

```java
@Data
@Builder
public class CreateOrderRequest {
    @NonNull
    private String productId;
    @Positive
    private int quantity;
    private String notes;  // optional
}
```

### Scenario 2: Entity with selective mutation

```java
@Getter
@ToString
@EqualsAndHashCode(of = "id")
public class Order {
    @Setter(AccessLevel.PRIVATE)
    private Long id;

    private final String productId;
    private final int quantity;

    @Setter
    private OrderStatus status;  // only status can change after creation

    @Builder
    private Order(String productId, int quantity) {
        this.productId = productId;
        this.quantity = quantity;
        this.status = OrderStatus.PENDING;
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using @Data on JPA entities | Breaks lazy loading, wrong equals/hashCode | Use @Getter @Setter @ToString |
| @Builder without @NoArgsConstructor | Can't deserialize from JSON | Add @NoArgsConstructor |
| @ToString logging sensitive data | Passwords in logs | Use @ToString.Exclude |
| @Data on records | Records already generate everything | Don't use Lombok with records |
