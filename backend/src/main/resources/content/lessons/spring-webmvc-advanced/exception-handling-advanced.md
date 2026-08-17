---
title: Advanced Exception Handling in Spring MVC
module: spring-webmvc-advanced
order: 1
minutes: 22
topics: ["HandlerExceptionResolver", "@ExceptionHandler chains", "response status", "error page", "async exceptions"]
docs:
  - title: "Spring MVC exceptions"
    url: "https://docs.spring.io/spring-framework/reference/web/webmvc.html#mvc-ann-exceptionhandler"
---

# Advanced Exception Handling in Spring MVC

`@RestControllerAdvice` covers 90% of error handling. The remaining 10% — resolver chains, per-controller handlers, mapped exceptions, and error pages — is where production-grade APIs earn their consistency. This lesson goes beyond the basics.

## The Exception Resolution Chain

When a controller throws, Spring MVC walks the `HandlerExceptionResolver` chain in order:

1. **`ExceptionHandlerExceptionResolver`** — finds `@ExceptionHandler` methods (advice + controller).
2. **`ResponseStatusExceptionResolver`** — honors `@ResponseStatus` on exceptions.
3. **`DefaultHandlerExceptionResolver`** — maps standard Spring MVC exceptions (404, 400, 405...) to status codes.

If none handle it, the container's error page (or Spring Boot's `/error`) takes over.

## @ExceptionHandler Scope

Advice = global. Controller-local = overrides.

```java
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    // controller-local handler wins for this controller
    @ExceptionHandler(OrderNotFoundException.class)
    public ProblemDetail handleOrderNotFound(OrderNotFoundException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND,
            "Order " + ex.getOrderId() + " not found");
    }
}
```

Spring picks the **most specific** handler: a controller-local `@ExceptionHandler` beats a global advice handler for the same exception type.

## Multiple Handlers, One Method

`@ExceptionHandler` accepts multiple types — great for shared logic:

```java
@ExceptionHandler({OrderNotFoundException.class, CustomerNotFoundException.class})
public ProblemDetail handleNotFound(RuntimeException ex) {
    return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
}
```

## @ResponseStatus on Exceptions

The annotation-based shortcut — the exception *is* the response:

```java
@ResponseStatus(HttpStatus.NOT_FOUND)
public class OrderNotFoundException extends RuntimeException {
    public OrderNotFoundException(String orderId) {
        super("Order " + orderId + " not found");
    }
}
```

No advice needed for the common case. But once you want a consistent body (Problem Details, trace ids), the advice wins.

## Method Arguments in Handlers

Handlers can take richer arguments than just the exception:

```java
@ExceptionHandler(MethodArgumentNotValidException.class)
public ProblemDetail handleValidation(MethodArgumentNotValidException ex,
                                     HttpServletRequest request) {
    ProblemDetail problem = ProblemDetail.forStatusAndDetail(
        HttpStatus.BAD_REQUEST, "Validation failed");
    problem.setProperty("path", request.getRequestURI());
    problem.setProperty("fieldErrors", ex.getBindingResult().getFieldErrors()
        .stream().map(fe -> Map.of(
            "field", fe.getField(),
            "message", fe.getDefaultMessage()))
        .toList());
    return problem;
}
```

Available: `HttpServletRequest/Response`, `WebRequest`, `HandlerMethod`, plus the exception itself.

## Matching By Cause

Spring can match handlers by the **cause chain** of a wrapped exception. When a `DataIntegrityViolationException` wraps a `ConstraintViolationException`, the most specific cause handler fires:

```java
@ExceptionHandler(ConstraintViolationException.class)
public ProblemDetail handleConstraint(ConstraintViolationException ex) {
    // fires even when the exception is wrapped in another
}
```

## Async Exceptions

For `@Async` / reactive code, exceptions don't surface through the controller path. Handle them where they run:

```java
@Configuration
public class AsyncConfig implements AsyncConfigurer {

    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        return (ex, method, params) ->
            log.error("Async method {} threw", method.getName(), ex);
    }
}
```

## The Error Page and /error

Spring Boot's `BasicErrorController` serves `/error` — the final safety net for unmapped errors (including container-level 404s and 500s). Customize it:

```java
@Controller
public class CustomErrorController implements ErrorController {

    @RequestMapping("/error")
    public ResponseEntity<Map<String, Object>> error(HttpServletRequest request) {
        Integer status = (Integer) request.getAttribute(
            RequestDispatcher.ERROR_STATUS_CODE);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", status != null ? status : 500);
        body.put("error", HttpStatus.resolve(status) != null
            ? HttpStatus.resolve(status).getReasonPhrase() : "Error");
        body.put("timestamp", Instant.now().toString());
        return ResponseEntity.status(status != null ? status : 500).body(body);
    }
}
```

Also configure error handling for invalid requests:

```yaml
server:
  error:
    include-message: never          # don't leak internals
    include-stacktrace: never
    whitelabel:
      enabled: false                # render your error page, not the default
```

## Global Fallback: Catch-All Ordering

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    // 1. Most specific first
    @ExceptionHandler(OrderNotFoundException.class) ...
    @ExceptionHandler(MethodArgumentNotValidException.class) ...

    // 2. Domain-level
    @ExceptionHandler(DomainException.class) ...

    // 3. Catch-all LAST
    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return ProblemDetail.forStatusAndDetail(
            HttpStatus.INTERNAL_SERVER_ERROR, "Unexpected error");
    }
}
```

Order matters at *runtime*: Spring picks the closest match in the hierarchy, so the catch-all only fires for truly unknown exceptions.

## Testing Exception Paths

```java
@SpringBootTest
@AutoConfigureMockMvc
class ExceptionHandlingTest {

    @Autowired MockMvc mockMvc;

    @Test
    void unmappedEndpointReturnsStructuredError() throws Exception {
        mockMvc.perform(get("/api/nonexistent"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void domainExceptionMapsToProblemDetails() throws Exception {
        mockMvc.perform(get("/api/orders/nope"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.detail").value(containsString("not found")));
    }

    @Test
    void internalErrorsDoNotLeakDetails() throws Exception {
        mockMvc.perform(get("/api/orders/boom"))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.message").doesNotExist());
    }
}
```

## Summary

| Concern | Mechanism |
|---------|-----------|
| Global mapping | `@RestControllerAdvice` + `@ExceptionHandler` |
| Per-controller override | Controller-local handlers (more specific wins) |
| Simple mapping | `@ResponseStatus` on the exception |
| Standard MVC errors | DefaultHandlerExceptionResolver |
| Unmapped everything | Custom `/error` controller |
| Async failures | `AsyncUncaughtExceptionHandler` |
| Leakage | `server.error.include-*: never`, log server-side |

The chain is predictable: advice → controller handlers → status resolvers → defaults → error page. Know the order, keep the catch-all last, and every error in your API — expected or not — leaves the same well-formed envelope.
