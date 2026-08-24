---
title: Spring Boot Error Handling — @ControllerAdvice, Custom Exceptions, and Error Responses
summary: How Spring Boot handles exceptions, @ControllerAdvice for global error handling, custom exception classes, validation error formatting, problem-detail responses (RFC 7807), error logging best practices, and how organizations build consistent error APIs with line-by-line walkthroughs.
order: 5
minutes: 28
topics: [error-handling, controller-advice, exception-handler, custom-exceptions, validation-errors, problem-detail, error-response]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/html/features.html#features.graceful-shutdown
  - https://docs.spring.io/spring-framework/reference/web/webmvc-mvc-controller/ann-controller-adv.html
---

# Spring Boot Error Handling — @ControllerAdvice, Custom Exceptions, and Error Responses

## What happens when an exception is thrown?

When a controller method throws an exception, Spring Boot's default error handling kicks in:

1. The exception propagates up from controller → Spring MVC.
2. Spring looks for a `@ExceptionHandler` that matches the exception type.
3. If found → uses that handler to build the response.
4. If not found → Spring's default `/error` endpoint returns a generic error page.

**Beginner mental model:** Think of `@ControllerAdvice` as a safety net below the trapeze. If the acrobat (your controller) falls (throws an exception), the safety net catches them and converts the fall into a controlled landing (a proper error response).

## Custom exceptions — meaningful error types

```java
// Base exception for all business errors
public class BusinessException extends RuntimeException {
    private final String errorCode;

    public BusinessException(String errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public String getErrorCode() { return errorCode; }
}

// Specific business exceptions
public class UserNotFoundException extends BusinessException {
    public UserNotFoundException(Long id) {
        super("USER_NOT_FOUND", "User with id " + id + " not found");
    }
}

public class DuplicateEmailException extends BusinessException {
    public DuplicateEmailException(String email) {
        super("DUPLICATE_EMAIL", "Email " + email + " is already registered");
    }
}

public class InsufficientFundsException extends BusinessException {
    private final BigDecimal attempted;
    private final BigDecimal available;

    public InsufficientFundsException(BigDecimal attempted, BigDecimal available) {
        super("INSUFFICIENT_FUNDS",
              "Attempted: " + attempted + ", Available: " + available);
        this.attempted = attempted;
        this.available = available;
    }

    public BigDecimal getAttempted() { return attempted; }
    public BigDecimal getAvailable() { return available; }
}
```

## @ControllerAdvice — global exception handling

```java
@RestControllerAdvice    // catches exceptions from ALL @RestController classes
@Slf4j                   // Lombok: creates a Logger field
public class GlobalExceptionHandler {

    // Handle business exceptions
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusiness(BusinessException ex) {
        log.warn("Business error: {} - {}", ex.getErrorCode(), ex.getMessage());

        ErrorResponse error = ErrorResponse.builder()
            .code(ex.getErrorCode())
            .message(ex.getMessage())
            .timestamp(Instant.now())
            .build();

        // Map specific exception types to HTTP status codes
        int status = switch (ex) {
            case UserNotFoundException e     -> 404;
            case DuplicateEmailException e   -> 409;  // Conflict
            case InsufficientFundsException e -> 402;  // Payment Required
            default                           -> 400;  // Bad Request
        };

        return ResponseEntity.status(status).body(error);
    }

    // Handle validation errors (@Valid failures)
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        List<FieldError> fieldErrors = ex.getBindingResult().getFieldErrors();
        Map<String, String> errors = fieldErrors.stream()
            .collect(Collectors.toMap(
                FieldError::getField,             // field name
                fe -> fe.getDefaultMessage() != null ? fe.getDefaultMessage() : "Invalid value",
                (existing, replacement) -> existing  // keep first error if duplicate fields
            ));

        ErrorResponse error = ErrorResponse.builder()
            .code("VALIDATION_ERROR")
            .message("Request validation failed")
            .details(errors)
            .timestamp(Instant.now())
            .build();

        return ResponseEntity.badRequest().body(error);
    }

    // Handle missing parameters
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ErrorResponse> handleMissingParam(MissingServletRequestParameterException ex) {
        ErrorResponse error = ErrorResponse.builder()
            .code("MISSING_PARAMETER")
            .message("Required parameter '" + ex.getParameterName() + "' is missing")
            .timestamp(Instant.now())
            .build();
        return ResponseEntity.badRequest().body(error);
    }

    // Catch-all for unexpected errors (NEVER expose internal details)
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception ex) {
        log.error("Unexpected error", ex);  // log the full stack trace for debugging
        ErrorResponse error = ErrorResponse.builder()
            .code("INTERNAL_ERROR")
            .message("An unexpected error occurred. Please try again later.")
            .timestamp(Instant.now())
            .build();
        return ResponseEntity.status(500).body(error);
    }
}
```

## Standard error response format

```java
// Consistent error response structure used across all endpoints
public record ErrorResponse(
    String code,                    // machine-readable error code
    String message,                 // human-readable message
    Map<String, String> details,    // field-level errors (optional)
    Instant timestamp               // when the error occurred
) {
    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private String code;
        private String message;
        private Map<String, String> details = Map.of();
        private Instant timestamp;

        public Builder code(String code) { this.code = code; return this; }
        public Builder message(String message) { this.message = message; return this; }
        public Builder details(Map<String, String> details) { this.details = details; return this; }
        public Builder timestamp(Instant timestamp) { this.timestamp = timestamp; return this; }
        public ErrorResponse build() { return new ErrorResponse(code, message, details, timestamp); }
    }
}

// Example error response (JSON):
// {
//   "code": "VALIDATION_ERROR",
//   "message": "Request validation failed",
//   "details": {
//     "email": "must be a valid email address",
//     "name": "must not be blank"
//   },
//   "timestamp": "2024-01-15T14:30:00Z"
// }
```

## How we use it in organizations

### Scenario 1: Consistent error API across microservices

```java
// Every microservice uses the same error format:
// {
//   "code": "ORDER_NOT_FOUND",
//   "message": "Order with id 12345 not found",
//   "details": {},
//   "timestamp": "2024-01-15T14:30:00Z",
//   "traceId": "abc-123-def-456"   // for distributed tracing
// }

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception ex) {
        String traceId = MDC.get("traceId");  // from ThreadLocal trace context

        log.error("[{}] Unexpected error: {}", traceId, ex.getMessage(), ex);

        ErrorResponse error = ErrorResponse.builder()
            .code("INTERNAL_ERROR")
            .message("An unexpected error occurred")
            .traceId(traceId)
            .timestamp(Instant.now())
            .build();

        return ResponseEntity.status(500).body(error);
    }
}
```

### Scenario 2: Error handling for file uploads

```java
@RestControllerAdvice
public class FileUploadExceptionHandler {

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ErrorResponse> handleMaxSize(MaxUploadSizeExceededException ex) {
        return ResponseEntity.payloadTooLarge().body(
            ErrorResponse.builder()
                .code("FILE_TOO_LARGE")
                .message("File size exceeds maximum allowed (10MB)")
                .timestamp(Instant.now())
                .build()
        );
    }

    @ExceptionHandler(InvalidFileTypeException.class)
    public ResponseEntity<ErrorResponse> handleInvalidType(InvalidFileTypeException ex) {
        return ResponseEntity.badRequest().body(
            ErrorResponse.builder()
                .code("INVALID_FILE_TYPE")
                .message("Allowed types: " + String.join(", ", ex.getAllowedTypes()))
                .timestamp(Instant.now())
                .build()
        );
    }
}
```

### Scenario 3: Error logging with context

```java
@RestControllerAdvice
@Slf4j
public class ErrorLoggingAdvice {

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleError(
            HttpServletRequest request, Exception ex) {

        // Log with request context
        log.error("Request failed: {} {} from {} - {}",
            request.getMethod(),
            request.getRequestURI(),
            request.getRemoteAddr(),
            ex.getMessage(),
            ex);  // full stack trace

        // Different log levels for different severity
        if (ex instanceof BusinessException) {
            log.warn("Business error: {}", ex.getMessage());  // expected business rule violation
        } else {
            log.error("Unexpected error: {}", ex.getMessage(), ex);  // unexpected — full trace
        }

        return ResponseEntity.status(500).body(
            ErrorResponse.builder()
                .code("INTERNAL_ERROR")
                .message("An unexpected error occurred")
                .timestamp(Instant.now())
                .build()
        );
    }
}
```

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Returning stack traces to clients | Security vulnerability — exposes internals | Log stack trace, return generic message |
| Catching Exception in controller | Duplicated error handling code | Use @ControllerAdvice |
| Not logging before returning error | Can't debug production issues | Always log before returning error response |
| Using different error formats per endpoint | Clients can't parse errors consistently | Use统一 ErrorResponse format |
| Throwing exceptions for control flow | Slow (exception creation is expensive) | Use if/else for expected cases |
| Catching all exceptions with one handler | Loses specific error information | Handle specific exceptions first |
