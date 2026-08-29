---
title: Building REST APIs with Spring Boot — Controllers, DTOs, and Error Handling
summary: @RestController explained line by line, @GetMapping/@PostMapping/@PutMapping/@DeleteMapping, @PathVariable vs @RequestBody vs @RequestParam, ResponseEntity for status codes, DTO pattern for API responses, global exception handling with @ControllerAdvice, and CORS configuration with line-by-line walkthroughs.
order: 3
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

```java
@RestController                        // marks this class as a REST API controller
@RequestMapping("/api/users")          // base path for ALL endpoints in this class
public class UserController {

    private final UserService userService;

    // Constructor injection — Spring creates the controller and injects UserService
    public UserController(UserService userService) {
        this.userService = userService;    // stored for use in handler methods
    }

    @GetMapping                          // GET /api/users
    public List<UserResponse> getAllUsers() {
        return userService.findAll();     // returns JSON automatically (Jackson)
        // Spring serializes the List<UserResponse> to JSON:
        // [{"name":"Alice","email":"alice@example.com"}, ...]
    }

    @GetMapping("/{id}")                 // GET /api/users/42
    public UserResponse getUser(@PathVariable Long id) {
        // @PathVariable extracts 42 from the URL path
        return userService.findById(id);
    }

    @PostMapping                         // POST /api/users
    public ResponseEntity<UserResponse> createUser(@RequestBody @Valid CreateUserRequest req) {
        // @RequestBody reads the JSON from the request body and converts to CreateUserRequest
        // @Valid triggers Bean Validation (checks @NotBlank, @Email, etc.)
        UserResponse created = userService.create(req);
        return ResponseEntity
            .status(HttpStatus.CREATED)   // HTTP 201 Created
            .body(created);               // the response body
    }

    @PutMapping("/{id}")                 // PUT /api/users/42
    public UserResponse updateUser(@PathVariable Long id,
                                    @RequestBody @Valid UpdateUserRequest req) {
        return userService.update(id, req);
    }

    @DeleteMapping("/{id}")              // DELETE /api/users/42
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        userService.delete(id);
        return ResponseEntity.noContent().build();  // HTTP 204 No Content
    }
}
```

## @PathVariable vs @RequestParam vs @RequestBody

```java
// @PathVariable — extract from URL path
@GetMapping("/users/{id}")
public User getUser(@PathVariable Long id) { ... }
// GET /api/users/42 → id = 42

// @RequestParam — extract from query string
@GetMapping("/users")
public List<User> searchUsers(
        @RequestParam String name,           // GET /api/users?name=Alice → name = "Alice"
        @RequestParam(defaultValue = "0") int page,  // optional, defaults to 0
        @RequestParam(defaultValue = "20") int size   // optional, defaults to 20
) { ... }
// GET /api/users?name=Alice&page=0&size=10

// @RequestBody — extract from request body (JSON)
@PostMapping("/users")
public User createUser(@RequestBody CreateUserRequest req) { ... }
// POST /api/users with body {"name":"Alice","email":"alice@example.com"}
// Spring converts JSON to CreateUserRequest using Jackson
```

## ResponseEntity — controlling the HTTP response

```java
// ResponseEntity lets you control status code, headers, and body
@GetMapping("/users/{id}")
public ResponseEntity<UserResponse> getUser(@PathVariable Long id) {
    Optional<UserResponse> user = userService.findById(id);

    if (user.isPresent()) {
        return ResponseEntity.ok(user.get());        // HTTP 200 with the user
    } else {
        return ResponseEntity.notFound().build();     // HTTP 404 with no body
    }
}

// With custom headers
@PostMapping("/users")
public ResponseEntity<UserResponse> createUser(@RequestBody @Valid CreateUserRequest req) {
    UserResponse created = userService.create(req);
    return ResponseEntity
        .status(HttpStatus.CREATED)                    // HTTP 201
        .header("X-User-Id", created.id().toString())  // custom header
        .body(created);                                // response body
}

// Common response patterns
ResponseEntity.ok(body)                    // 200 OK with body
ResponseEntity.status(201).body(body)      // 201 Created
ResponseEntity.noContent().build()         // 204 No Content (no body)
ResponseEntity.badRequest().body(error)    // 400 Bad Request
ResponseEntity.notFound().build()          // 404 Not Found
ResponseEntity.status(500).body(error)     // 500 Internal Server Error
```

## DTOs — never expose your entity directly

```java
// BAD: returning the entity directly exposes internal fields
@Entity
public class User {
    private Long id;
    private String name;
    private String email;
    private String passwordHash;     // NEVER expose this!
    private String resetToken;       // NEVER expose this!
    private Instant createdAt;
    private Instant lastLoginIp;     // sensitive!
}

// GOOD: DTO controls exactly what the API exposes
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

// Mapper — converts between entity and DTO
public class UserMapper {
    public static UserResponse toResponse(User user) {
        return new UserResponse(
            user.getId(),
            user.getName(),
            user.getEmail(),
            user.getCreatedAt()
            // passwordHash, resetToken, lastLoginIp — NOT included!
        );
    }

    public static User toEntity(CreateUserRequest req) {
        User user = new User();
        user.setName(req.name());
        user.setEmail(req.email());
        user.setPasswordHash(hashPassword(req.password()));  // hash before storing
        return user;
    }
}
```

## Global exception handling with @ControllerAdvice

```java
@RestControllerAdvice    // catches exceptions from ALL @RestController classes
public class GlobalExceptionHandler {

    @ExceptionHandler(UserNotFoundException.class)  // catch specific exception
    public ResponseEntity<ErrorResponse> handleNotFound(UserNotFoundException ex) {
        ErrorResponse error = new ErrorResponse(
            404,
            "User not found",
            ex.getMessage(),
            Instant.now()
        );
        return ResponseEntity.status(404).body(error);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)  // validation errors
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

    @ExceptionHandler(Exception.class)  // catch-all for unexpected errors
    public ResponseEntity<ErrorResponse> handleGeneric(Exception ex) {
        log.error("Unexpected error", ex);  // log the full stack trace
        ErrorResponse error = new ErrorResponse(
            500,
            "Internal server error",
            "An unexpected error occurred",  // DON'T expose internal details
            Instant.now()
        );
        return ResponseEntity.status(500).body(error);
    }
}
```

## CORS configuration — allowing cross-origin requests

```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")           // apply to all /api/ endpoints
            .allowedOrigins("https://techie-backend-forge.vercel.app")  // only allow your frontend
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")  // allowed HTTP methods
            .allowedHeaders("*")                 // allow any headers
            .allowCredentials(true)              // allow cookies/auth
            .maxAge(3600);                       // cache preflight response for 1 hour
    }
}
```

## How we use it in organizations

### Scenario 1: Complete CRUD API for an order management system

```java
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
    }

    @GetMapping("/{id}")
    public OrderResponse getOrder(@PathVariable Long id) {
        return orderService.findById(id)          // throws OrderNotFoundException if not found
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
```

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

```java
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
            request.getRemoteAddr());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                 Object handler, Exception ex) {
        long duration = System.currentTimeMillis() - (long) request.getAttribute("startTime");
        log.info("← {} {} → {} ({}ms)",
            request.getMethod(),
            request.getRequestURI(),
            response.getStatus(),
            duration);
    }
}
```

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
