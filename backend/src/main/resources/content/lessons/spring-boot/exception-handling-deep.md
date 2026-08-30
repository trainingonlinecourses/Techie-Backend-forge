---
title: "Exception Handling — Clean Error Responses That Clients Actually Understand"
summary: "@ControllerAdvice, custom exceptions, RFC 7807 Problem Details, global exception handlers, and how organizations return consistent error responses."
order: 57
minutes: 20
topics: [exception-handling, controller-advice, custom-exceptions, error-response, rfc-7807, handler-exception]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-controller-advice.html
  - https://www.javaguides.net/2019/09/spring-boot-rest-api-exception-handling.html
---

## The Concept, From Zero

### Why Exception Handling Matters

Without proper exception handling:
```java
// Client sends invalid data
@PostMapping("/users")
public User create(@RequestBody User user) {
    return userService.create(user);
    // If email is duplicate → 500 Internal Server Error with ugly stack trace
    // Client has no idea what went wrong
}
```

With proper exception handling:
```java
// Same request, but now:
// 400 Bad Request
// { "error": "DUPLICATE_EMAIL", "message": "Email already registered", "field": "email" }
// Client knows exactly what to fix
```

### @RestControllerAdvice — The Global Handler

```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    
    // Handle validation errors
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(400)
    public ErrorResponse handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fieldErrors = new HashMap<>();
        ex.getBindingResult().getFieldErrors().forEach(err -> 
            fieldErrors.put(err.getField(), err.getDefaultMessage())
        );
        return new ErrorResponse(400, "VALIDATION_ERROR", "Invalid input", fieldErrors);
    }
    
    // Handle custom business exceptions
    @ExceptionHandler(ResourceNotFoundException.class)
    @ResponseStatus(404)
    public ErrorResponse handleNotFound(ResourceNotFoundException ex) {
        return new ErrorResponse(404, "NOT_FOUND", ex.getMessage());
    }
    
    // Handle duplicate key
    @ExceptionHandler(DuplicateResourceException.class)
    @ResponseStatus(409)
    public ErrorResponse handleDuplicate(DuplicateResourceException ex) {
        return new ErrorResponse(409, "DUPLICATE", ex.getMessage());
    }
    
    // Catch-all for unexpected errors
    @ExceptionHandler(Exception.class)
    @ResponseStatus(500)
    public ErrorResponse handleGeneral(Exception ex) {
        log.error("Unexpected error", ex);
        return new ErrorResponse(500, "INTERNAL_ERROR", "Something went wrong");
    }
}
```

### Custom Exception Classes

```java
// Base application exception
public class AppException extends RuntimeException {
    private final String code;
    
    public AppException(String code, String message) {
        super(message);
        this.code = code;
    }
    
    public String getCode() { return code; }
}

// Specific exceptions
public class ResourceNotFoundException extends AppException {
    public ResourceNotFoundException(String resource, String id) {
        super("NOT_FOUND", resource + " not found: " + id);
    }
}

public class DuplicateResourceException extends AppException {
    public DuplicateResourceException(String resource, String field, String value) {
        super("DUPLICATE", resource + " with " + field + "='" + value + "' already exists");
    }
}

public class InsufficientBalanceException extends AppException {
    public InsufficientBalanceException(BigDecimal required, BigDecimal available) {
        super("INSUFFICIENT_BALANCE", 
              "Required: " + required + ", Available: " + available);
    }
}
```

### RFC 7807 Problem Details Format

The industry standard for error responses:

```java
public record ProblemDetail(
    int status,
    String type,
    String title,
    String detail,
    String instance,
    Map<String, String> errors
) {
    public static ProblemDetail of(int status, String type, String title, String detail) {
        return new ProblemDetail(status, type, title, detail, null, null);
    }
}
```

```json
{
  "status": 400,
  "type": "https://api.example.com/errors/validation",
  "title": "Validation Failed",
  "detail": "The request body contains invalid fields",
  "instance": "/api/users",
  "errors": {
    "email": "Must be a valid email address",
    "password": "Must be at least 8 characters"
  }
}
```

### Exception Handler Priority

```java
@RestControllerAdvice
public class ExceptionHandlers {
    
    // 1. Most specific first
    @ExceptionHandler(DuplicateEmailException.class)
    @ResponseStatus(409)
    public ProblemDetail handleDuplicateEmail(DuplicateEmailException ex) {
        return ProblemDetail.of(409, "duplicate-email", "Email taken", ex.getMessage());
    }
    
    // 2. More general
    @ExceptionHandler(AppException.class)
    @ResponseStatus(400)
    public ProblemDetail handleApp(AppException ex) {
        return ProblemDetail.of(400, ex.getCode(), "Application Error", ex.getMessage());
    }
    
    // 3. Most general last
    @ExceptionHandler(Exception.class)
    @ResponseStatus(500)
    public ProblemDetail handleGeneral(Exception ex) {
        return ProblemDetail.of(500, "internal", "Internal Error", "An unexpected error occurred");
    }
}
```

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Returning raw exceptions to client | Leaks internal details | Always wrap in error response |
| Using catch blocks in every controller | Duplicated logic | Use @RestControllerAdvice |
| Not logging server errors | Silent failures | Log 500 errors with stack trace |
| Returning 500 for client errors | Misleading status codes | Return 400/404/409 as appropriate |
| No validation on input | Garbage data enters system | Use @Valid + custom constraints |

### Line-by-Line Code Explanation

```java
@RestControllerAdvice
// ↑ Spring annotation that makes this class handle exceptions across ALL controllers
// ↑ Runs AFTER the controller method throws — before the response is sent
// ↑ "Advice" = AOP term for code that runs around other code

public class GlobalExceptionHandler {
    // ↑ Single class handles ALL exception types
    // ↑ DRY: no try-catch blocks in individual controllers
    
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    // ↑ Logger for server-side errors (not sent to client)
    
    @ExceptionHandler(MethodArgumentNotValidException.class)
    // ↑ This method runs when @Valid fails on a @RequestBody
    // ↑ Spring automatically passes the exception as a parameter
    
    @ResponseStatus(400)
    // ↑ Sets HTTP status code to 400 Bad Request
    // ↑ Client knows the error is their fault (bad input)
    
    public ErrorResponse handleValidation(MethodArgumentNotValidException ex) {
        // ↑ Method signature: exception type → return type
        // ↑ Spring calls this when MethodArgumentNotValidException is thrown
        
        Map<String, String> fieldErrors = new HashMap<>();
        ex.getBindingResult().getFieldErrors().forEach(err ->
            fieldErrors.put(err.getField(), err.getDefaultMessage())
        );
        // ↑ Extract field-level errors: {"email": "must be valid", "name": "required"}
        // ↑ getField() = field name, getDefaultMessage() = validation message
        
        return new ErrorResponse(400, "VALIDATION_ERROR", "Invalid input", fieldErrors);
        // ↑ Return structured error — client can parse and display inline
    }
}
```

### Key Takeaways

1. **@RestControllerAdvice** — global exception handler for all controllers
2. **@ExceptionHandler** — specifies which exception type to handle
3. **Custom exceptions** — business-specific errors with codes and messages
4. **RFC 7807 format** — industry standard for error responses
5. **Handler priority** — most specific exception first, catch-all last
6. **Never expose internals** — always wrap exceptions in clean responses

### Real-World Organization Scenario

A fintech API has 50+ endpoints. Instead of scattering try-catch blocks everywhere, they use one `GlobalExceptionHandler` that handles:
- Validation errors → 400 with field-level details
- Resource not found → 404 with resource type
- Duplicate transaction → 409 with conflict details
- Insufficient balance → 422 with balance info
- Server errors → 500 with correlation ID (for log tracing)

Every error response follows RFC 7807 Problem Details format. The frontend team can parse errors uniformly and display them inline next to form fields.
