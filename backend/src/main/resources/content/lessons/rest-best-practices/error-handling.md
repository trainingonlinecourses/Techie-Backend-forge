---
title: Consistent Error Handling
module: rest-best-practices
order: 2
minutes: 25
topics: ["@RestControllerAdvice", "Problem Details", "error envelope", "validation errors", "exception mapping"]
docs:
  - title: "Error handling"
    url: "https://docs.spring.io/spring-framework/reference/web/webmvc.html#mvc-ann-rest-exceptions"
summary: A good error response is a contract. Every error, from a validation failure to a null pointer, should arrive in the same shape with the same fields...
---

# Consistent Error Handling

A good error response is a **contract**. Every error, from a validation failure to a null pointer, should arrive in the same shape with the same fields — so clients can parse failures without special-casing. Spring gives you `@RestControllerAdvice` and, since Spring Boot 3 / Spring 6, the RFC 7807 **Problem Details** standard.

## The Error Envelope

Decide one shape and never deviate:

```json
{
  "type": "https://api.example.com/problems/course-not-found",
  "title": "Course not found",
  "status": 404,
  "detail": "No course exists with id 'abc'",
  "instance": "/api/courses/abc",
  "timestamp": "2026-08-18T10:00:00Z",
  "traceId": "f0a1b2c3"
}
```

## RFC 7807 Problem Details (Spring 6+)

Spring Boot 3 enables Problem Details with one property:

```yaml
spring:
  mvc:
    problemdetails:
      enabled: true
```

Then standard Spring exceptions automatically render as RFC 7807:

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "No static resource api/foo."
}
```

## Custom Problem Handler

Extend `ResponseEntityExceptionHandler` to add your domain errors:

```java
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(CourseNotFoundException.class)
    public ProblemDetail handleNotFound(CourseNotFoundException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.NOT_FOUND, ex.getMessage());
        problem.setTitle("Course not found");
        problem.setProperty("courseId", ex.getCourseId());
        problem.setProperty("timestamp", Instant.now());
        return problem;
    }

    @ExceptionHandler(DuplicateCourseCodeException.class)
    public ProblemDetail handleDuplicate(DuplicateCourseCodeException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.CONFLICT, ex.getMessage());
        problem.setTitle("Duplicate course code");
        return problem;
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail handleIllegal(IllegalArgumentException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.BAD_REQUEST, ex.getMessage());
        problem.setTitle("Invalid request");
        return problem;
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnexpected(Exception ex) {
        log.error("Unexpected error", ex);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong");
        problem.setTitle("Internal Server Error");
        return problem;
    }
}
```

## Validation Errors

`@Valid` failures throw `MethodArgumentNotValidException`. Give clients the field-level detail:

```java
@ExceptionHandler(MethodArgumentNotValidException.class)
public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
    ProblemDetail problem = ProblemDetail.forStatusAndDetail(
        HttpStatus.BAD_REQUEST, "Validation failed");
    problem.setTitle("Validation error");
    problem.setProperty("fieldErrors", ex.getBindingResult().getFieldErrors().stream()
        .map(e -> Map.of(
            "field", e.getField(),
            "message", e.getDefaultMessage(),
            "rejectedValue", String.valueOf(e.getRejectedValue())))
        .toList());
    return problem;
}
```

```json
{
  "title": "Validation error",
  "status": 400,
  "detail": "Validation failed",
  "fieldErrors": [
    { "field": "title", "message": "must not be blank", "rejectedValue": "" },
    { "field": "minutes", "message": "must be greater than 0", "rejectedValue": 0 }
  ]
}
```

## Logging vs. Leaking

- **Never** return stack traces, SQL, or internal messages to clients.
- Log full details server-side with the trace id; return a generic message to the client.

```java
@ExceptionHandler(DataIntegrityViolationException.class)
public ProblemDetail handleConstraint(DataIntegrityViolationException ex) {
    log.error("Constraint violation: {}", ex.getMessage());
    ProblemDetail problem = ProblemDetail.forStatusAndDetail(
        HttpStatus.CONFLICT, "Operation conflicts with existing data");
    problem.setTitle("Conflict");
    return problem;
}
```

## The Trace ID

Correlate client-visible errors with server logs:

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    private final Tracer tracer;

    public GlobalExceptionHandler(Tracer tracer) { this.tracer = tracer; }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnexpected(Exception ex) {
        String traceId = tracer.currentSpan() != null
            ? tracer.currentSpan().context().traceId()
            : "unknown";
        log.error("Unexpected error [traceId={}]", traceId, ex);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong");
        problem.setProperty("traceId", traceId);
        return problem;
    }
}
```

## Business Exceptions

Prefer meaningful domain exceptions over ad-hoc `IllegalStateException`s:

```java
public class CourseNotFoundException extends RuntimeException {
    private final String courseId;
    public CourseNotFoundException(String courseId) {
        super("No course exists with id '" + courseId + "'");
        this.courseId = courseId;
    }
    public String getCourseId() { return courseId; }
}
```

Throw them from the service layer; the advice maps them. Services stay decoupled from HTTP.

## Testing Error Responses

```java
@SpringBootTest
@AutoConfigureMockMvc
class ErrorHandlingTest {

    @Autowired MockMvc mockMvc;

    @Test
    void missingCourseReturnsProblemDetails() throws Exception {
        mockMvc.perform(get("/api/courses/nope"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.status").value(404))
            .andExpect(jsonPath("$.title").value("Course not found"))
            .andExpect(jsonPath("$.courseId").value("nope"));
    }

    @Test
    void invalidBodyReturnsFieldErrors() throws Exception {
        mockMvc.perform(post("/api/courses")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fieldErrors[0].field").value("title"));
    }
}
```

## Summary

| Concern | Practice |
|---------|----------|
| Shape | One envelope everywhere (RFC 7807 in Spring 6+) |
| Validation | Field-level errors, 400 |
| Not found | 404 with resource id in detail |
| Conflict | 409 with domain reason |
| Unexpected | 500, generic message, full server log + trace id |
| Leakage | Never expose internals; log them server-side |
| Tests | Assert the JSON shape, not just the status |

Consistent errors are a feature — they cut support cost, enable good client SDKs, and make your API pleasant to integrate against. Spend the 30 minutes on the advice class; it pays back on every endpoint.
