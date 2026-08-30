---
title: "Lombok — Kill Boilerplate, Write Less Java"
summary: "What Lombok does, @Data vs @Value vs @Builder, when to use records instead, and how organizations reduce code volume without losing type safety."
order: 2
minutes: 20
topics: [lombok, @data, @builder, @slf4j, @value, @getter, @setter, boilerplate-reduction]
docs:
  - https://projectlombok.org/
  - https://www.javaguides.net/2019/11/spring-boot-2-hibernate-5-crud-restful-api-tutorial.html
---

## The Concept, From Zero

### What is Lombok?

**Lombok = Java's code generator.** It automatically generates getters, setters, constructors, `toString()`, `equals()`, `hashCode()`, and more — from simple annotations.

Without Lombok:
```java
public class User {
    private Long id;
    private String name;
    private String email;
    
    // Getters — 20 lines
    public Long getId() { return id; }
    public String getName() { return name; }
    public String getEmail() { return email; }
    
    // Setters — 15 lines
    public void setId(Long id) { this.id = id; }
    public void setName(String name) { this.name = name; }
    public void setEmail(String email) { this.email = email; }
    
    // Constructor — 10 lines
    public User() {}
    public User(Long id, String name, String email) {
        this.id = id;
        this.name = name;
        this.email = email;
    }
    
    // toString — 10 lines
    @Override
    public String toString() {
        return "User{id=" + id + ", name='" + name + "', email='" + email + "'}";
    }
    
    // equals + hashCode — 20 lines
    @Override
    public boolean equals(Object o) { ... }
    @Override
    public int hashCode() { ... }
    
    // Total: ~75 lines of boilerplate for 3 fields!
}
```

With Lombok:
```java
@Data
public class User {
    private Long id;
    private String name;
    private String email;
    // Total: 5 lines — Lombok generates everything
}
```

### Core Lombok Annotations

**1. @Data — The Swiss Army Knife**
```java
@Data  // Generates getters, setters, toString, equals, hashCode, requiredArgsConstructor
public class User {
    private Long id;
    private String name;
    private String email;
}
```

**2. @Value — Immutable Data**
```java
@Value  // Like @Data but all fields are final, no setters, no @AllArgsConstructor
public class User {
    Long id;
    String name;
    String email;
}
```

**3. @Builder — Builder Pattern**
```java
@Builder
public class User {
    private Long id;
    private String name;
    private String email;
}

// Usage:
User user = User.builder()
    .id(1L)
    .name("Alice")
    .email("alice@example.com")
    .build();
```

**4. @Slf4j — Logger**
```java
@Slf4j  // Generates: private static final Logger log = LoggerFactory.getLogger(...)
public class UserService {
    public void doSomething() {
        log.info("Doing something");
    }
}
```

**5. @NoArgsConstructor + @AllArgsConstructor**
```java
@NoArgsConstructor  // public User() {}
@AllArgsConstructor  // public User(Long id, String name, String email) {...}
public class User {
    private Long id;
    private String name;
    private String email;
}
```

### Lombok vs Java Records

| Feature | Lombok @Data | Java Record |
|---------|-------------|-------------|
| Mutable | Yes (has setters) | No (immutable) |
| Builder | Needs @Builder | Can add manually |
| Inheritance | Works | Doesn't work well |
| IDE support | Needs plugin | Built-in |
| Spring compatibility | Works | Works (use with DTOs) |
| Boilerplate | Minimal | Zero |

**When to use Records:** DTOs, value objects, data carriers
**When to use Lombok:** Mutable entities, complex builders, legacy code

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using @Data on JPA entities | Generates problematic equals/hashCode for entities | Use @Getter @Setter @ToString only |
| Not installing Lombok plugin | IDE shows errors | Install Lombok plugin in IDE |
| Using @Data on immutable objects | Generates setters | Use @Value instead |
| Lombok in public APIs | Users need Lombok dependency | Prefer records for public APIs |

### Key Takeaways

1. **@Data** — getters, setters, toString, equals, hashCode in one annotation
2. **@Builder** — clean builder pattern without boilerplate
3. **@Slf4j** — instant logger creation
4. **Use Records for DTOs** — they're built into Java 16+
5. **Use Lombok for entities** — mutable JPA entities need setters
6. **Install the IDE plugin** — required for Lombok to work in your editor

### Real-World Organization Scenario

A team of 15 Java developers was writing 50+ entity classes. Each entity had 20+ fields, requiring ~100 lines of boilerplate per class. After adopting Lombok, each class dropped to ~25 lines. Total codebase reduction: 3,750 lines. The team now uses `@Data` for entities, `@Builder` for complex construction, and Java Records for DTOs.
