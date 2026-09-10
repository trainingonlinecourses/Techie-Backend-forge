---
title: Building REST APIs with Spring Boot — Controllers, DTOs, and Error Handling
summary: @RestController explained line by line, @GetMapping/@PostMapping/@PutMapping/@DeleteMapping, @PathVariable vs @RequestBody vs @RequestParam, ResponseEntity for status codes, DTO pattern for API responses, global exception handling with @ControllerAdvice, and CORS configuration with line-by-line walkthroughs.
order: 11
minutes: 35
topics: [rest-controller, get-mapping, post-mapping, path-variable, request-body, response-entity, dto, exception-handling, cors]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webmvc-mvc-controller.html
  - https://docs.spring.io/spring-boot/docs/current/reference/html/web.html
---

# Building REST APIs with Spring Boot — Controllers, DTOs, and Error Handling

## What is REST?

**REST** (Representational State Transfer) is an architectural style for APIs. Instead of having one endpoint that does everything (`/processRequest?type=create&entity=user&data=...`), REST uses standard HTTP methods on resources:

- `GET /users` — list all users
- `GET /users/42` — get user 42
- `POST /users` — create a new user
- `PUT /users/42` — update user 42
- `DELETE /users/42` — delete user 42

**Beginner mental model:** REST is like a well-organized filing cabinet. Each drawer is a resource (users, orders, products). You use standard actions to interact with them (open, add, modify, remove).

## @RestController — the entry point


**What this code does — step by step:**

1. `@RestController` — marks this class as a REST API controller
2. `@RequestMapping("/api/users")` — base path for ALL endpoints in this class
3. Constructor injection — Spring creates the controller and injects UserService
4. `this.userService = userService;` — stored for use in handler methods
5. `@GetMapping` — GET /api/users
6. `return userService.findAll();` — returns JSON automatically (Jackson). Spring serializes the List<UserResponse> to JSON: [{"name":"Alice","email":"alice@example.com"}, ...]
7. `@GetMapping("/{id}")` — GET /api/users/42
8. @PathVariable extracts 42 from the URL path
9. `@PostMapping` — POST /api/users
10. @RequestBody reads the JSON from the request body and converts to CreateUserRequest. @Valid triggers Bean Validation (checks @NotBlank, @Email, etc.)
11. `.status(HttpStatus.CREATED)` — HTTP 201 Created
12. `.body(created);` — the response body
13. `@PutMapping("/{id}")` — PUT /api/users/42
14. `@DeleteMapping("/{id}")` — DELETE /api/users/42
15. `return ResponseEntity.noContent().build();` — HTTP 204 No Content

The same code, clean:

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public List<UserResponse> getAllUsers() {
        return userService.findAll();
    }

    @GetMapping("/{id}")
    public UserResponse getUser(@PathVariable Long id) {
        return userService.findById(id);
    }

    @PostMapping
    public ResponseEntity<UserResponse> createUser(@RequestBody @Valid CreateUserRequest req) {
        UserResponse created = userService.create(req);
        return ResponseEntity
            .status(HttpStatus.CREATED)
            .body(created);
    }

    @PutMapping("/{id}")
    public UserResponse updateUser(@PathVariable Long id,
                                    @RequestBody @Valid UpdateUserRequest req) {
        return userService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        userService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```

## @PathVariable vs @RequestParam vs @RequestBody


**What this code does — step by step:**

1. @PathVariable — extract from URL path
2. GET /api/users/42 → id = 42
3. @RequestParam — extract from query string
4. `@RequestParam String name,` — GET /api/users?name=Alice → name = "Alice"
5. `@RequestParam(defaultValue = "0") int page,` — optional, defaults to 0
6. `@RequestParam(defaultValue = "20") int size` — optional, defaults to 20
7. GET /api/users?name=Alice&page=0&size=10
8. @RequestBody — extract from request body (JSON)
9. POST /api/users with body {"name":"Alice","email":"alice@example.com"}. Spring converts JSON to CreateUserRequest using Jackson

The same code, clean:

```java
@GetMapping("/users/{id}")
public User getUser(@PathVariable Long id) { ... }

@GetMapping("/users")
public List<User> searchUsers(
        @RequestParam String name,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
) { ... }

@PostMapping("/users")
public User createUser(@RequestBody CreateUserRequest req) { ... }
```

## ResponseEntity — controlling the HTTP response


**What this code does — step by step:**

1. ResponseEntity lets you control status code, headers, and body
2. `return ResponseEntity.ok(user.get());` — HTTP 200 with the user
3. `return ResponseEntity.notFound().build();` — HTTP 404 with no body
4. With custom headers
5. `.status(HttpStatus.CREATED)` — HTTP 201
6. `.header("X-User-Id", created.id().toString())` — custom header
7. `.body(created);` — response body
8. Common response patterns
9. `ResponseEntity.ok(body)` — 200 OK with body
10. `ResponseEntity.status(201).body(body)` — 201 Created
11. `ResponseEntity.noContent().build()` — 204 No Content (no body)
12. `ResponseEntity.badRequest().body(error)` — 400 Bad Request
13. `ResponseEntity.notFound().build()` — 404 Not Found
14. `ResponseEntity.status(500).body(error)` — 500 Internal Server Error

The same code, clean:

```java
@GetMapping("/users/{id}")
public ResponseEntity<UserResponse> getUser(@PathVariable Long id) {
    Optional<UserResponse> user = userService.findById(id);

    if (user.isPresent()) {
        return ResponseEntity.ok(user.get());
    } else {
        return ResponseEntity.notFound().build();
    }
}

@PostMapping("/users")
public ResponseEntity<UserResponse> createUser(@RequestBody @Valid CreateUserRequest req) {
    UserResponse created = userService.create(req);
    return ResponseEntity
        .status(HttpStatus.CREATED)
        .header("X-User-Id", created.id().toString())
        .body(created);
}

ResponseEntity.ok(body)
ResponseEntity.status(201).body(body)
ResponseEntity.noContent().build()
ResponseEntity.badRequest().body(error)
ResponseEntity.notFound().build()
ResponseEntity.status(500).body(error)
```

## DTOs — never expose your entity directly


**What this code does — step by step:**

1. BAD: returning the entity directly exposes internal fields
2. `private String passwordHash;` — NEVER expose this!
3. `private String resetToken;` — NEVER expose this!
4. `private Instant lastLoginIp;` — sensitive!
5. GOOD: DTO controls exactly what the API exposes
6. Mapper — converts between entity and DTO
7. passwordHash, resetToken, lastLoginIp — NOT included!
8. `user.setPasswordHash(hashPassword(req.password()));` — hash before storing

The same code, clean:

```java
@Entity
public class User {
    private Long id;
    private String name;
    private String email;
    private String passwordHash;
    private String resetToken;
    private Instant createdAt;
    private Instant lastLoginIp;
}

public record UserResponse(
    Long id,
    String name,
    String email,
    Instant createdAt
) {}

public record CreateUserRequest(
    @NotBlank String name,
    @Email String email,
    @NotBlank @Size(min = 8) String password
) {}

public class UserMapper {
    public static UserResponse toResponse(User user) {
        return new UserResponse(
            user.getId(),
            user.getName(),
            user.getEmail(),
            user.getCreatedAt()
        );
    }

    public static User toEntity(CreateUserRequest req) {
        User user = new User();
        user.setName(req.name());
        user.setEmail(req.email());
        user.setPasswordHash(hashPassword(req.password()));
        return user;
    }
}
```

## Global exception handling with @ControllerAdvice


**What this code does — step by step:**

1. `@RestControllerAdvice` — catches exceptions from ALL @RestController classes
2. `@ExceptionHandler(UserNotFoundException.class)` — catch specific exception
3. `@ExceptionHandler(MethodArgumentNotValidException.class)` — validation errors
4. `@ExceptionHandler(Exception.class)` — catch-all for unexpected errors
5. `log.error("Unexpected error", ex);` — log the full stack trace
6. `"An unexpected error occurred",` — DON'T expose internal details

The same code, clean:

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(UserNotFoundException ex) {
        ErrorResponse error = new ErrorResponse(
            404,
            "User not found",
            ex.getMessage(),
            Instant.now()
        );
        return ResponseEntity.status(404).body(error);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        List<String> fieldErrors = ex.getBindingResult()
            .getFieldErrors()
            .stream()
            .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
            .toList();

        ErrorResponse error = new ErrorResponse(
            400,
            "Validation failed",
            String.join(", ", fieldErrors),
            Instant.now()
        );
        return ResponseEntity.badRequest().body(error);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception ex) {
        log.error("Unexpected error", ex);
        ErrorResponse error = new ErrorResponse(
            500,
            "Internal server error",
            "An unexpected error occurred",
            Instant.now()
        );
        return ResponseEntity.status(500).body(error);
    }
}
```

## CORS configuration — allowing cross-origin requests


**What this code does — step by step:**

1. `registry.addMapping("/api/**")` — apply to all /api/ endpoints
2. `.allowedOrigins("https://techie-backend-forge.vercel.app")` — only allow your frontend
3. `.allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")` — allowed HTTP methods
4. `.allowedHeaders("*")` — allow any headers
5. `.allowCredentials(true)` — allow cookies/auth
6. `.maxAge(3600);` — cache preflight response for 1 hour

The same code, clean:

```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOrigins("https://techie-backend-forge.vercel.app")
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
            .allowedHeaders("*")
            .allowCredentials(true)
            .maxAge(3600);
    }
}
```

## How we use it in organizations

### Scenario 1: Complete CRUD API for an order management system

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping
    public Page<OrderResponse> getAllOrders(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status) {
        // Paginated listing with optional status filter
        return orderService.findAll(status, PageRequest.of(page, size))
            .map(OrderMapper::toResponse);
```java
    }

    @GetMapping("/{id}")
    public OrderResponse getOrder(@PathVariable Long id) {
        return orderService.findById(id)          // throws OrderNotFoundException if not found
```
            .map(OrderMapper::toResponse)
            .orElseThrow(() -> new OrderNotFoundException(id));
    }

    @PostMapping
    public ResponseEntity<OrderResponse> createOrder(@RequestBody @Valid CreateOrderRequest req) {
        OrderResponse created = orderService.create(req);
        return ResponseEntity.status(201).body(created);
    }

    @PatchMapping("/{id}/status")
    public OrderResponse updateStatus(@PathVariable Long id,
                                       @RequestBody @Valid UpdateStatusRequest req) {
        return orderService.updateStatus(id, req.status());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)     // Spring auto-returns 204
    public void cancelOrder(@PathVariable Long id) {
        orderService.cancel(id);
    }
}

### Scenario 2: API versioning with content negotiation

```java
// Version 1: /api/v1/users
@RestController
@RequestMapping("/api/v1/users")
public class UserControllerV1 {
    @GetMapping
    public List<UserResponseV1> getAll() { ... }
}

// Version 2: /api/v2/users (adds pagination, new fields)
@RestController
@RequestMapping("/api/v2/users")
public class UserControllerV2 {
    @GetMapping
    public Page<UserResponseV2> getAll(@RequestParam(defaultValue = "0") int page) { ... }
}

// Clients migrate from v1 to v2 at their own pace
```

### Scenario 3: Request/Response logging with interceptor

@Component
public class RequestLoggingInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(RequestLoggingInterceptor.class);

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                              Object handler) {
        request.setAttribute("startTime", System.currentTimeMillis());
        log.info("→ {} {} from {}",
            request.getMethod(),
            request.getRequestURI(),
```java
            request.getRemoteAddr());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                 Object handler, Exception ex) {
        long duration = System.currentTimeMillis() - (long) request.getAttribute("startTime");
```
        log.info("← {} {} → {} ({}ms)",
            request.getMethod(),
            request.getRequestURI(),
            response.getStatus(),
            duration);
    }
}

## HTTP methods — when to use which

| Method | Purpose | Idempotent | Request Body | Response Body |
|---|---|---|---|---|
| `GET` | Read a resource | ✅ Yes | ❌ No | ✅ Yes |
| `POST` | Create a resource | ❌ No | ✅ Yes | ✅ Yes |
| `PUT` | Replace a resource entirely | ✅ Yes | ✅ Yes | Optional |
| `PATCH` | Partially update a resource | ❌ No | ✅ Yes | Optional |
| `DELETE` | Remove a resource | ✅ Yes | ❌ No | Optional |

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Returning entity directly | Exposes password hashes, internal fields | Use DTOs |
| Using GET with @RequestBody | Clients can't send body in GET requests | Use @RequestParam or POST |
| Not validating @RequestBody | Invalid data reaches database | Add @Valid + Bean Validation |
| Returning 200 for creation | Violates REST conventions | Return 201 Created |
| Catching exceptions in controller | Duplicated error handling | Use @ControllerAdvice |
| No CORS configuration | Frontend can't call API from different origin | Configure CORS for frontend origin |

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [docs.spring.io/spring-boot/reference](https://docs.spring.io/spring-boot/reference/)
