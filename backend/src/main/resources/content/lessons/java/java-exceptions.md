---
title: Exceptions & Error Handling
summary: The exception hierarchy, checked vs unchecked, try-with-resources, and the wrapping discipline of production teams.
order: 5
minutes: 15
topics: [exceptions, try-with-resources, error-handling]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/exceptions/
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Throwable.html
---

# Exceptions & Error Handling

## The hierarchy

```
Throwable
 ├── Error            — JVM-level, do NOT catch (OutOfMemoryError, StackOverflowError)
 └── Exception
      ├── IOException              — checked: compiler forces handling
      └── RuntimeException        — unchecked: programming/business errors
           ├── NullPointerException, IllegalArgumentException, ...
```

- **Checked** (`IOException`, `SQLException`) — the compiler requires you to handle or declare them.
- **Unchecked** (`RuntimeException`) — Spring's convention: throw these from services and translate at the boundary.

## try-with-resources: closing is guaranteed

```java
public String readConfig(Path p) {
    try (BufferedReader r = Files.newBufferedReader(p)) {   // AutoCloseable
        return r.readLine();                                 // close() guaranteed
    } catch (NoSuchFileException e) {
        throw new ConfigMissingException(p, e);              // wrap + contextualize
    } catch (IOException e) {
        throw new UncheckedIOException(e);                   // suppressed exceptions attached
    }
}
```

**Never** leak resources: any `InputStream`, `Connection`, `Session` opened in a method must be closed — try-with-resources is the only safe pattern.

## Wrap, don't swallow

```java
public class ConfigMissingException extends RuntimeException {
    public ConfigMissingException(Path p, Throwable cause) {
        super("config file not found: " + p, cause);
    }
}
```

The rules production teams live by:

1. **Throw early, fail fast** — validate inputs at the boundary (`IllegalArgumentException`, `ValidationException`).
2. **Wrap with context** — a bare `SQLException` tells nobody which query failed; `new AccountQueryException("failed to load " + iban, e)` does.
3. **Never swallow** — empty `catch (Exception e) {}` is a bug; at minimum log and rethrow a typed exception.
4. **Only catch what you can handle** — catching `Exception` at the top of a request thread is the *one* legitimate place (translate to 500).

Spring's approach: services throw unchecked domain exceptions; `@RestControllerAdvice` (see spring-boot module) turns them into clean HTTP responses.

```java
@RestControllerAdvice
class GlobalExceptionHandler {
    @ExceptionHandler(NotFoundException.class)
    ResponseEntity<ApiError> notFound(NotFoundException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiError.of(404, "Not Found", ex.getMessage(), req.getRequestURI()));
    }
}
```

## finally: use it only for cleanup

```java
try {
    work();
} finally {
    // ALWAYS runs — but no business logic here, and no return statements
    release();
}
```

> **Why it matters (organizational view)** — Error handling is the difference between "the pager fires at 3am with a stack trace" and "the pager fires with a readable message, correlation id, and the failing request path." Organizations standardize on: unchecked domain exceptions, wrapping with context, try-with-resources everywhere, and a global handler so HTTP responses are uniform JSON.

## Key takeaways

- Checked vs unchecked: let the compiler help, but favor unchecked for business errors.
- try-with-resources or don't touch `AutoCloseable` resources.
- Wrap exceptions with context; log and rethrow — never swallow.
- Translate exceptions to clean HTTP responses at the boundary (one place, one shape).

**Official docs:** [Exceptions tutorial](https://docs.oracle.com/javase/tutorial/essential/exceptions/) · [Throwable API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Throwable.html)
