---
title: DTO Pattern — Data Transfer Objects
summary: Why never return entities directly, request/response DTOs with records, MapStruct for conversion, API versioning, and security best practices.
order: 24
minutes: 18
topics: [dto-pattern, data-transfer-object, mapstruct, entity-to-dto, api-versioning, security]
docs:
  - https://www.javaguides.net/2024/05/spring-boot-rest-api-tutorial.html
  - https://www.baeldung.com/java-dto-pattern
---

# DTO Pattern — Data Transfer Objects

## What Is a DTO?

A **DTO (Data Transfer Object)** is a plain object that carries data between layers of your application. It's NOT an entity — it doesn't map to a database table. It's just a container for data.

**Why do we need DTOs?**

Imagine your database has a `User` entity with 20 fields, including `passwordHash`, `salt`, `internalNotes`, and `lastLoginIp`. You do NOT want to send all of that to the client! A DTO lets you **selectively expose** only the fields the client needs.

---

## The Problem Without DTOs

```java
// Entity — maps to the database
@Entity
public class User {
    @Id
    private Long id;
    private String name;
    private String email;
    private String passwordHash;    // ❌ Should NOT be exposed
    private String salt;             // ❌ Should NOT be exposed
    private String internalNotes;    // ❌ Should NOT be exposed
    private String lastLoginIp;      // ❌ Should NOT be exposed
    private boolean banned;          // ❌ Client shouldn't know about this
    // ... 15 more fields
}

// ❌ BAD: Returning the entity directly
@RestController
public class UserController {
    @GetMapping("/api/users/{id}")
    public User getUser(@PathVariable Long id) {
        return userRepository.findById(id);  // Exposes ALL fields including password!
    }
}
```

**The client receives:**
```json
{
    "id": 1,
    "name": "Alice",
    "email": "alice@example.com",
    "passwordHash": "$2a$10$abc123...",    // 🔓 SECURITY BREACH!
    "salt": "xyz789",                       // 🔓 SECURITY BREACH!
    "internalNotes": "Has credit issues",   // 🔓 CONFIDENTIAL!
    "lastLoginIp": "192.168.1.100"          // 🔓 PRIVACY LEAK!
}
```

---

## The Solution: DTOs

```java
// Entity — stays internal, never exposed
@Entity
public class User {
    @Id
    private Long id;
    private String name;
    private String email;
    private String passwordHash;
    private String salt;
    private String internalNotes;
    private boolean banned;
}

// DTO — what the client sees
public record UserResponse(Long id, String name, String email) {}

// Request DTO — what the client sends
public record CreateUserRequest(String name, String email, String password) {}

// ✅ GOOD: Controller uses DTOs
@RestController
public class UserController {

    @PostMapping("/api/users")
    public ResponseEntity<UserResponse> createUser(@RequestBody CreateUserRequest request) {
        User user = userService.createUser(request.name(), request.email(), request.password());
        return ResponseEntity.ok(toResponse(user));
    }

    private UserResponse toResponse(User user) {
        return new UserResponse(user.getId(), user.getName(), user.getEmail());
    }
}
```

**The client receives:**
```json
{
    "id": 1,
    "name": "Alice",
    "email": "alice@example.com"
}
```

Only the fields we chose to expose!

---

## Types of DTOs

### 1. Response DTOs (Entity → Client)

```java
// Simple response
public record UserResponse(Long id, String name, String email) {}

// Nested response
public record OrderResponse(
    Long id,
    UserResponse customer,      // Nested DTO, not User entity
    List<OrderItemResponse> items,
    BigDecimal total,
    String status
) {}

public record OrderItemResponse(
    String productName,
    int quantity,
    BigDecimal unitPrice
) {}
```

### 2. Request DTOs (Client → Entity)

```java
// Create request
public record CreateUserRequest(
    @NotBlank String name,
    @Email String email,
    @Size(min = 8) String password
) {}

// Update request — all fields optional (PATCH semantics)
public record UpdateUserRequest(
    String name,
    String email
) {}
```

### 3. Search/Filter DTOs

```java
public record UserSearchRequest(
    String name,
    String email,
    String role,
    Integer page,
    Integer size
) {
    // Defaults
    public UserSearchRequest {
        if (page == null) page = 0;
        if (size == null) size = 20;
    }
}
```

---

## Conversion: Entity ↔ DTO

### Manual Conversion (Small Projects)

```java
public class UserMapper {

    // Entity → Response DTO
    public static UserResponse toResponse(User user) {
        return new UserResponse(user.getId(), user.getName(), user.getEmail());
    }

    // Request DTO → Entity
    public static User toEntity(CreateUserRequest request) {
        User user = new User();
        user.setName(request.name());
        user.setEmail(request.email());
        return user;
    }
}
```

### MapStruct (Production — Best Practice)

```java
@Mapper(componentModel = "spring")
public interface UserMapper {

    UserResponse toResponse(User user);

    @Mapping(target = "id", ignore = true)  // ID generated by DB
    @Mapping(target = "createdAt", ignore = true)
    User toEntity(CreateUserRequest request);

    List<UserResponse> toResponseList(List<User> users);
}
```

```java
// Usage — Spring injects the implementation automatically
@RestController
public class UserController {

    private final UserMapper userMapper;

    public UserController(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    @GetMapping("/api/users/{id}")
    public UserResponse getUser(@PathVariable Long id) {
        User user = userService.findById(id);
        return userMapper.toResponse(user);  // Clean conversion
    }

    @GetMapping("/api/users")
    public List<UserResponse> getAllUsers() {
        List<User> users = userService.findAll();
        return userMapper.toResponseList(users);  // Batch conversion
    }
}
```

---

## DTOs with Records (Java 16+)

Records are perfect for DTOs — they're immutable, have built-in `equals()`, `hashCode()`, `toString()`, and require zero boilerplate:

```java
// Request DTOs as records
public record CreateUserRequest(
    @NotBlank String name,
    @Email String email,
    @Size(min = 8) String password
) {}

// Response DTOs as records
public record UserResponse(
    Long id,
    String name,
    String email,
    LocalDateTime createdAt
) {}

// Paged response
public record PageResponse<T>(
    List<T> content,
    int page,
    int size,
    long totalElements,
    int totalPages
) {}
```

---

## In an Organization

### Scenario 1: API Versioning with DTOs

```java
// V1 DTO — simple
public record UserResponseV1(Long id, String name) {}

// V2 DTO — adds email
public record UserResponseV2(Long id, String name, String email) {}

// V3 DTO — adds profile picture
public record UserResponseV3(Long id, String name, String email, String avatarUrl) {}

// Controller supports multiple versions
@RestController
@RequestMapping("/api/v1/users")
public class UserControllerV1 {
    @GetMapping("/{id}")
    public UserResponseV1 getUser(@PathVariable Long id) {
        User user = userService.findById(id);
        return new UserResponseV1(user.getId(), user.getName());
    }
}
```

### Scenario 2: Search Results with Metadata

```java
public record ProductSearchResult(
    List<ProductSummary> products,
    int totalResults,
    int currentPage,
    int totalPages,
    List<String> facets       // Available filter options
) {}

public record ProductSummary(
    Long id,
    String name,
    BigDecimal price,
    String imageUrl,
    double rating
) {}
```

### Scenario 3: Audit Trail DTOs

```java
public record AuditEntry(
    Long id,
    String entityType,
    Long entityId,
    String action,
    String performedBy,
    Map<String, Object> changes,  // Before/after values
    LocalDateTime timestamp
) {}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Returning entities directly | Exposes internal fields, security risk | Always use DTOs for API responses |
| One DTO for everything | Too many fields, hard to maintain | Create separate DTOs for different use cases |
| DTOs with business logic | Violation of Single Responsibility | Keep DTOs as pure data carriers |
| Not validating request DTOs | Invalid data enters your system | Use `@Valid` + Bean Validation annotations |
| Manual mapping in every controller | Repetitive, error-prone | Use MapStruct or a mapping library |
| DTOs with circular references | JSON serialization infinite loop | Use `@JsonIgnore` or flatten the structure |
