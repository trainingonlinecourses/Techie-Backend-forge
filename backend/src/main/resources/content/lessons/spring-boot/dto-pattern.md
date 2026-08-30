---
title: "DTO Pattern — Never Expose Your Entities to the Outside World"
summary: "What DTOs are, why you need them, how to map entities to DTOs and back, and how organizations use them to decouple internal models from API contracts."
order: 54
minutes: 22
topics: [dto, data-transfer-object, entity-mapping, record-dto, mapstruct, api-contract]
docs:
  - https://www.javaguides.net/2023/09/spring-boot-dto-tutorial-using-java.html
  - https://spring.io/guides/gs/producing-rest
---

## The Concept, From Zero

### What is a DTO?

**DTO = Data Transfer Object.** It's a plain Java object that carries data between layers — especially between your backend and the client (browser, mobile app, other services).

**Why not just return entities directly?**

```java
// BAD — exposing your database entity
@Entity
public class User {
    @Id private Long id;
    private String name;
    private String email;
    private String passwordHash;  // ⚠️ SECURITY RISK — exposed to client!
    private String ssn;           // ⚠️ SECURITY RISK — exposed to client!
    private boolean deleted;      // ⚠️ Internal field — should not be visible
}

// The client receives passwordHash and SSN!
@GetMapping("/api/users/{id}")
public User getUser(@PathVariable Long id) {
    return userRepository.findById(id).orElseThrow();
}
```

**DTOs fix this by giving you a separate, controlled view:**

```java
// GOOD — DTO controls what's exposed
public record UserResponse(
    Long id,
    String name,
    String email
) {
    // No passwordHash, no SSN, no deleted flag
}

@GetMapping("/api/users/{id}")
public UserResponse getUser(@PathVariable Long id) {
    User user = userRepository.findById(id).orElseThrow();
    return new UserResponse(user.getId(), user.getName(), user.getEmail());
    // Only safe fields are returned
}
```

### Why DTOs Exist

1. **Security** — Never expose passwords, SSNs, internal flags
2. **Performance** — Don't send entire entity graphs to the client
3. **API stability** — Change your database without breaking clients
4. **Separation of concerns** — Database model ≠ API model
5. **Versioning** — Different API versions can have different DTOs

### DTO Types

```java
// 1. Response DTO — sent to the client
public record UserResponse(Long id, String name, String email) {}

// 2. Request DTO — received from the client
public record CreateUserRequest(
    @NotBlank String name,
    @Email String email,
    @NotBlank @Size(min = 8) String password
) {}

// 3. Update DTO — partial updates
public record UpdateUserRequest(
    String name,      // null = don't change
    String email      // null = don't change
) {}

// 4. List DTO — paginated results
public record PagedResponse<T>(
    List<T> content,
    int page,
    int size,
    long totalElements
) {}
```

### Mapping Entities to DTOs

**Option 1: Manual mapping (simple, explicit)**
```java
@Service
public class UserService {
    public UserResponse toResponse(User entity) {
        return new UserResponse(
            entity.getId(),
            entity.getName(),
            entity.getEmail()
        );
    }
    
    public User toEntity(CreateUserRequest request) {
        User user = new User();
        user.setName(request.name());
        user.setEmail(request.email());
        user.setPasswordHash(hashPassword(request.password()));
        return user;
    }
}
```

**Option 2: MapStruct (automatic, type-safe)**
```java
@Mapper(componentModel = "spring")
public interface UserMapper {
    @Mapping(target = "id", ignore = true)  // ID is generated
    @Mapping(target = "passwordHash", ignore = true)  // Never map password
    User toEntity(CreateUserRequest request);
    
    UserResponse toResponse(User entity);
    
    List<UserResponse> toResponseList(List<User> entities);
}

// Usage:
@Service
public class UserService {
    @Autowired private UserMapper mapper;
    
    public UserResponse createUser(CreateUserRequest request) {
        User entity = mapper.toEntity(request);     // Auto-mapped
        entity = userRepository.save(entity);
        return mapper.toResponse(entity);            // Auto-mapped
    }
}
```

**Option 3: Java Records with factory methods**
```java
public record UserResponse(Long id, String name, String email) {
    // Factory method — converts entity to DTO
    public static UserResponse from(User entity) {
        return new UserResponse(
            entity.getId(),
            entity.getName(),
            entity.getEmail()
        );
    }
}

// Usage:
return UserResponse.from(userRepository.findById(id).orElseThrow());
```

### Full CRUD with DTOs

```java
@RestController
@RequestMapping("/api/users")
public class UserController {
    
    private final UserService userService;
    
    // CREATE — accepts request DTO, returns response DTO
    @PostMapping
    public ResponseEntity<UserResponse> create(@Valid @RequestBody CreateUserRequest request) {
        UserResponse created = userService.createUser(request);
        return ResponseEntity.status(201).body(created);
    }
    
    // READ — returns response DTO
    @GetMapping("/{id}")
    public UserResponse getOne(@PathVariable Long id) {
        return userService.getUser(id);
    }
    
    // LIST — returns paged response DTO
    @GetMapping
    public PagedResponse<UserResponse> getAll(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return userService.getUsers(page, size);
    }
    
    // UPDATE — accepts update DTO, returns response DTO
    @PutMapping("/{id}")
    public UserResponse update(@PathVariable Long id, 
                               @Valid @RequestBody UpdateUserRequest request) {
        return userService.updateUser(id, request);
    }
    
    // DELETE — no DTO needed
    @DeleteMapping("/{id}")
    @ResponseStatus(204)
    public void delete(@PathVariable Long id) {
        userService.deleteUser(id);
    }
}
```

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Returning entities directly | Exposes passwords, internal fields | Always use response DTOs |
| One DTO for everything | Too much/too little data | Create separate request/response DTOs |
| Using entities as request DTOs | Accepts fields clients shouldn't set | Use separate request DTOs |
| No validation on request DTOs | Invalid data enters your system | Add `@Valid` annotations |
| Mapping in controller | Clutters controller logic | Use service layer or MapStruct |

### Line-by-Line Code Explanation

```java
public record CreateUserRequest(
    // ↑ Java Record — immutable, auto-generates constructor, getters, equals, hashCode
    // ↑ This is a REQUEST DTO — data coming FROM the client
    
    @NotBlank(message = "Name is required")
    // ↑ Validation: name cannot be null, empty, or whitespace-only
    
    String name,
    // ↑ Simple String field — the user's display name
    
    @Email(message = "Email must be valid")
    // ↑ Validation: must match email format (user@domain.com)
    
    String email,
    // ↑ Email field — validated by @Email
    
    @NotBlank(message = "Password is required")
    @Size(min = 8, max = 100, message = "Password must be 8-100 characters")
    // ↑ Two validations: required AND length 8-100
    
    String password
    // ↑ Password field — will be hashed before saving to database
    // ↑ NEVER store plain text passwords!
) {}
// ↑ Empty body — record auto-generates everything
// ↑ This DTO ONLY has fields the client should send
// ↑ No 'id', no 'createdAt', no 'deleted' — those are server-managed
```

### Organization Use Cases

**1. E-Commerce Product API**
```java
public record ProductResponse(Long id, String name, String description, 
    BigDecimal price, String imageUrl, List<String> categories) {}
// ^ Only safe, useful fields — no internal stock counts, no supplier info
```

**2. Banking Transaction API**
```java
public record TransactionRequest(
    @NotNull Long fromAccountId,
    @NotNull Long toAccountId,
    @Positive BigDecimal amount,
    String description
) {}
// ^ Client sends only what's needed — server adds timestamp, generates ID
```

**3. Social Media Post API**
```java
public record PostResponse(Long id, String content, String authorName,
    Instant createdAt, int likeCount, boolean isLikedByMe) {}
// ^ Includes computed fields (likeCount, isLikedByMe) — not in database
```

### Key Takeaways

1. **Always use DTOs** — never expose entities directly to clients
2. **Separate request and response DTOs** — they have different fields
3. **Use Java Records** — immutable, concise, auto-generated methods
4. **MapStruct for complex mappings** — automatic, type-safe mapping
5. **Add validation annotations** — `@NotBlank`, `@Email`, `@Size`
6. **Keep DTOs in a `dto` package** — organized by feature

### Real-World Organization Scenario

A fintech startup exposes a REST API for account management. Initially, they returned JPA entities directly. After a security audit found they were leaking `passwordHash` and `internalNotes` fields, they implemented DTOs. Now:
- `AccountResponse` has only public fields (balance, accountType, lastActivity)
- `AccountInternalDTO` is used between microservices (includes riskScore, complianceFlags)
- `CreateAccountRequest` validates all required fields before processing

The API contract is now independent of the database schema — they can refactor entities without breaking clients.
