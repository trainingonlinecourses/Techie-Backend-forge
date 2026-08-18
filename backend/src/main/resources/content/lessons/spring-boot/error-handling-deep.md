---
title: Error Handling Deep — BasicErrorController, Problem Details and Advice
summary: The default error flow, @RestControllerAdvice, RFC 9457 Problem Details, and the error-response conventions that make APIs predictable.
order: 17
minutes: 18
topics: [error-handling, controlleradvice, problem-details, basicerrorcontroller, exception-handler, error-response]
docs:
  - https://docs.spring.io/spring-boot/reference/web/spring-mvc.html#web.spring-mvc.error-handling
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-exceptionhandler.html
  - https://www.rfc-editor.org/rfc/rfc9457
---

# Error Handling Deep — BasicErrorController, Problem Details and Advice

## The concept: two error paths in Spring Boot

Spring Boot has **two layers** of error handling:

1. **The MVC layer** — `@ExceptionHandler` in a controller or `@RestControllerAdvice` handles exceptions thrown *inside* handler methods. This is where business errors get their 4xx + JSON body.
2. **The servlet layer** — anything that escapes MVC (a 404 for an unknown path, a 500 from a filter, a malformed request) falls through to **`BasicErrorController`**, which renders a generic JSON/HTML error response.

A well-built API controls both: the advice produces precise, typed errors for known failures, and the error controller is customized (or replaced by Problem Details) so even *fallthrough* errors are consistent.

## The @RestControllerAdvice pattern

```java
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiError> notFound(NotFoundException e) {
        return error(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> invalid(MethodArgumentNotValidException e) {
        Map<String, String> fields = e.getBindingResult().getFieldErrors().stream()
            .collect(toMap(FieldError::getField, FieldError::getDefaultMessage, (a, b) -> a));
        return ResponseEntity.badRequest().body(new ApiError("VALIDATION_ERROR", fields));
    }

    @ExceptionHandler(Exception.class)              // the safety net — never expose internals
    public ResponseEntity<ApiError> unknown(Exception e) {
        log.error("Unhandled", e);
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "Internal error");
    }

    private ResponseEntity<ApiError> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(new ApiError(status.value(), message));
    }
}
```

**Rules teams enforce:** business exceptions map to specific statuses; validation errors carry per-field messages; the catch-all `Exception` handler logs the stack trace but returns a **generic message** (never leak SQL, stack traces, or internal paths).

## RFC 9457 Problem Details — the standard error format

Spring Boot 3 supports **Problem Details** (RFC 9457) — a standard error body shape so clients can parse errors uniformly across APIs:

```properties
spring.mvc.problemdetails.enabled=true
```

With it, errors become:

```json
{
  "type": "https://example.com/problems/not-found",
  "title": "Order not found",
  "status": 404,
  "detail": "No order with id 123",
  "instance": "/api/orders/123"
}
```

- `type` — a URI identifying the error category (can link to docs).
- `title` — short human summary; `status` — HTTP code; `detail` — specifics; `instance` — the request path.

Spring maps `ResponseStatusException`, `ErrorResponseException`, and `@ResponseStatus` errors to this shape automatically. Teams either enable Problem Details (standard, less custom) or keep a bespoke `ApiError` (full control) — pick one and document it as the API contract.

## Customizing the fallthrough error controller

```java
// Option 1: replace the error attributes
@Component
public class CustomErrorAttributes extends DefaultErrorAttributes {
    @Override
    public Map<String, Object> getErrorAttributes(WebRequest request, ErrorAttributeOptions options) {
        Map<String, Object> map = super.getErrorAttributes(request, options);
        map.put("apiVersion", "v2");                 // add context
        map.remove("trace");                         // strip internals (already off by default)
        return map;
    }
}

// Option 2: register your own @ControllerAdvice for ErrorResponse
```

The default `/error` body includes `timestamp, status, error, path` — safe defaults; `server.error.include-message=never` (default in Boot 3) keeps messages out of the fallthrough body. Customize to add context, never to add stack traces.

## How we use it in an organization: the scenarios

**Scenario 1 — one error shape everywhere.** Every endpoint returns the same `{ status, error, message, path, timestamp }` (or Problem Details), produced by the advice and the error controller together — so a single frontend error handler parses everything.

**Scenario 2 — domain errors with codes.** Business failures carry stable machine-readable codes:

```java
public class OrderException extends RuntimeException {
    private final ErrorCode code;   // ORDER_NOT_FOUND, INSUFFICIENT_STOCK, ...
    // handler maps code → status + message
}
```

**Scenario 3 — validation error detail.** A `MethodArgumentNotValidException` handler that returns per-field messages — the shape the SPA form displays under each input.

**Scenario 4 — async and consumer errors.** An `@Async` method or Kafka listener that throws never reaches `@RestControllerAdvice` — those paths need their own handling (retry/DLQ for consumers; exception handler for async tasks), a common gap when teams assume the advice covers everything.

## Pitfalls

- **Leaking internals in 500s** — stack traces, SQL snippets, or full exception messages in responses. The generic-message rule is non-negotiable.
- **`@ExceptionHandler` catching `Exception` broadly** — it also catches framework exceptions (validation, conversion); order specificity carefully and log what you swallow.
- **Exceptions from filters never reach `@RestControllerAdvice`** — filter-thrown errors go to the servlet layer; handle them in the filter or a custom error dispatch.
- **Error responses that differ between paths** — the advice and the fallthrough controller must agree on the shape, or clients get two formats.
- **Problem Details requires Boot 3** — on Boot 2 you hand-roll the shape; enable the property consciously (it changes the default `/error` body).

## Key takeaways

- Two layers: `@RestControllerAdvice` for handler exceptions; `BasicErrorController` for fallthrough.
- Map business exceptions to specific statuses; return per-field validation errors; never leak internals.
- RFC 9457 Problem Details (`spring.mvc.problemdetails.enabled=true`) is the standard error shape on Boot 3.
- Customize error attributes for context without exposing `trace`.
- Async/consumer exceptions bypass the advice — handle those paths separately.
