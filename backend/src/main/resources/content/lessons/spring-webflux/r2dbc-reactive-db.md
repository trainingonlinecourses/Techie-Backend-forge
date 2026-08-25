---
title: R2DBC — Reactive Database Access
summary: Replace JDBC with reactive database calls, ReactiveCrudRepository, backpressure-aware queries, connection pooling with R2DBC, and why R2DBC matters for WebFlux.
order: 8
minutes: 20
topics: [r2dbc, reactive-database, reactive-crud, connection-pooling, backpressure, webflux-database]
docs:
  - https://r2dbc.io/
  - https://docs.spring.io/spring-data/r2dbc/docs/current/reference/html/
---

# R2DBC — Reactive Database Access

## What Is R2DBC?

**R2DBC** (Reactive Relational Database Connectivity) is the reactive equivalent of JDBC. Just as JDBC lets you talk to databases synchronously, R2DBC lets you talk to them **without blocking threads**.

Why does this matter? In a WebFlux application, every thread is precious. If one thread blocks waiting for a database query, you lose the entire benefit of reactive programming. R2DBC ensures that database calls return **immediately** and notify you when the result is ready.

### The Problem: JDBC Blocks

```java
// JDBC blocks the thread while waiting for the database
@GetMapping("/users/{id}")
public User getUser(@PathVariable Long id) {
    // 💥 This thread is BLOCKED for 50ms while the database responds
    // In WebFlux, blocking even ONE thread can starve the entire application
    return jdbcTemplate.queryForObject(
        "SELECT * FROM users WHERE id = ?",
        userRowMapper, id
    );
}
```

### The Solution: R2DBC Returns Immediately

```java
// R2DBC returns Mono<User> immediately — no thread is blocked
@GetMapping("/users/{id}")
public Mono<User> getUser(@PathVariable Long id) {
    // ✅ Returns instantly, database query runs asynchronously
    // Thread is free to handle other requests while waiting
    return userRepository.findById(id);
}
```

---

## Setting Up R2DBC

### Dependencies

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-r2dbc</artifactId>
</dependency>
<dependency>
    <groupId>io.r2dbc</groupId>
    <artifactId>r2dbc-postgresql</artifactId>
    <scope>runtime</scope>
</dependency>
```

### Configuration

```yaml
# application.yml
spring:
  r2dbc:
    url: r2dbc:postgresql://localhost:5432/academy
    username: postgres
    password: secret
    pool:
      initial-size: 5
      max-size: 20
      max-idle-time: 30m
```

---

## Reactive Repository

### Entity

```java
@Table("users")
public class User {
    @Id
    private Long id;

    @Column("name")
    private String name;

    @Column("email")
    private String email;

    // Getters, setters, constructor
}
```

### Repository Interface

```java
public interface UserRepository extends ReactiveCrudRepository<User, Long> {

    // Spring Data R2DBC automatically implements these
    Mono<User> findByEmail(String email);

    Flux<User> findByNameContaining(String name);

    Flux<User> findByEmailAndName(String email, String name);

    // Custom query
    @Query("SELECT * FROM users WHERE created_at > :since")
    Flux<User> findRecentUsers(@Param("since") LocalDateTime since);

    // Count
    @Query("SELECT COUNT(*) FROM users WHERE active = true")
    Mono<Long> countActiveUsers();
}
```

### Using the Repository

```java
@Service
public class UserService {

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    // Find one user
    public Mono<User> findById(Long id) {
        return userRepository.findById(id)
            .switchIfEmpty(Mono.error(new UserNotFoundException(id)));
    }

    // Find all users
    public Flux<User> findAll() {
        return userRepository.findAll();
    }

    // Create user
    public Mono<User> createUser(User user) {
        return userRepository.save(user);
    }

    // Update user
    public Mono<User> updateUser(Long id, UserUpdateRequest request) {
        return userRepository.findById(id)
            .flatMap(user -> {
                user.setName(request.name());
                user.setEmail(request.email());
                return userRepository.save(user);
            })
            .switchIfEmpty(Mono.error(new UserNotFoundException(id)));
    }

    // Delete user
    public Mono<Void> deleteUser(Long id) {
        return userRepository.deleteById(id);
    }
}
```

---

## Reactive Controllers

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/{id}")
    public Mono<ResponseEntity<User>> getUser(@PathVariable Long id) {
        return userService.findById(id)
            .map(ResponseEntity::ok)
            .defaultIfEmpty(ResponseEntity.notFound().build());
    }

    @GetMapping
    public Flux<User> getAllUsers() {
        return userService.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<User> createUser(@RequestBody @Valid User user) {
        return userService.createUser(user);
    }

    @PutMapping("/{id}")
    public Mono<ResponseEntity<User>> updateUser(
            @PathVariable Long id,
            @RequestBody @Valid UserUpdateRequest request) {
        return userService.updateUser(id, request)
            .map(ResponseEntity::ok)
            .defaultIfEmpty(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public Mono<Void> deleteUser(@PathVariable Long id) {
        return userService.deleteUser(id);
    }
}
```

---

## Advanced: Combining Multiple Queries

```java
@Service
public class DashboardService {

    private final UserRepository userRepository;
    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;

    // Parallel queries — all run concurrently, no blocking
    public Mono<DashboardData> getDashboard() {
        Mono<Long> userCount = userRepository.count();
        Mono<Long> orderCount = orderRepository.count();
        Mono<List<Product>> topProducts = productRepository
            .findTop10ByOrderBySalesDesc()
            .collectList();

        // Combine all three — they execute in parallel
        return Mono.zip(userCount, orderCount, topProducts)
            .map(tuple -> new DashboardData(
                tuple.getT1(),   // userCount
                tuple.getT2(),   // orderCount
                tuple.getT3()    // topProducts
            ));
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Blocking inside reactive chain | Thread starvation, defeats purpose | Use `flatMap`, never `block()` |
| Using JDBC in WebFlux | Blocks event loop threads | Use R2DBC for all database access |
| Not handling errors in Mono/Flux | Silent failures | Use `.onErrorResume()`, `.switchIfEmpty()` |
| Ignoring backpressure | Memory overflow with large result sets | Use `.limitRate()`, `.buffer()` |
| Creating Flux in a loop | Inefficient, confusing | Use `Flux.fromIterable()` or `Flux.range()` |
| Not using connection pooling | Connection exhaustion | Configure R2DBC pool properly |

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Blocking inside reactive chain | Thread starvation, defeats purpose | Use `flatMap`, never `block()` |
| Using JDBC in WebFlux | Blocks event loop threads | Use R2DBC for all database access |
| Not handling errors in Mono/Flux | Silent failures | Use `.onErrorResume()`, `.switchIfEmpty()` |
| Ignoring backpressure | Memory overflow with large result sets | Use `.limitRate()`, `.buffer()` |
| Creating Flux in a loop | Inefficient, confusing | Use `Flux.fromIterable()` or `Flux.range()` |
| Not using connection pooling | Connection exhaustion | Configure R2DBC pool properly |
