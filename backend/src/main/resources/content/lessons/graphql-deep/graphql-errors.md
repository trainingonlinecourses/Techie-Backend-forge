---
title: GraphQL Errors — Field-Scoped Failure
module: graphql-deep
order: 4
minutes: 24
topics: ["GraphQL errors", "error extensions", "partial results", "error classification", "exception handling"]
docs:
  - title: "GraphQL errors (graphql-java)"
    url: "https://www.graphql-java.com/documentation/execution/"
summary: REST errors are wholeresponse: a 500 or 400 kills everything. GraphQL errors are fieldscoped: one field can fail while its siblings succeed, and th...
---

# GraphQL Errors — Field-Scoped Failure

## The Concept: Partial Success Is the Design

REST errors are whole-response: a 500 or 400 kills everything. **GraphQL errors are field-scoped**: one field can fail while its siblings succeed, and the response reports both — the successful data *and* a structured error describing exactly what failed and where.

```json
{
  "data": {
    "course": { "id": 1, "title": "Spring", "lessons": null }
  },
  "errors": [
    {
      "message": "Database unavailable",
      "path": ["course", "lessons"],
      "extensions": { "code": "DATABASE_ERROR", "classification": "DataFetchingException" }
    }
  ]
}
```

The contract: `data` contains what resolved; `errors` explains what didn't, each with a **`path`** (which field, which list index) and **`extensions`** (machine-readable codes). Clients can render partial results and handle failures *per field* — not all-or-nothing.

## The Error Shape

| Field | Meaning |
|---|---|
| `message` | Human-readable description |
| `path` | Where it failed: `["course", "lessons"]` or `["courses", 2, "title"]` |
| `extensions.code` | Machine-readable error code (your contract) |
| `extensions.classification` | GraphQL-java's category (e.g., `DataFetchingException`) |
| `extensions.*` | Anything else you attach (validation details, retry hints) |

## The Code Walkthrough

```java
// ---- 1. Throw typed exceptions; let the framework map them ----
import graphql.GraphQLError;
import graphql.GraphqlErrorBuilder;
import graphql.execution.DataFetcherExceptionHandler;
import graphql.execution.DataFetcherExceptionHandlerResult;
import graphql.execution.DataFetcherExceptionHandlerParameters;
import org.springframework.stereotype.Component;

// A domain exception with a code
class CourseNotFoundException extends RuntimeException {
    CourseNotFoundException(Long id) { super("Course " + id + " not found"); }
}

// ---- 2. A global handler: domain exceptions -> structured GraphQL errors ----
@Component
public class GraphQlExceptionHandler implements DataFetcherExceptionHandler {

    @Override
    public DataFetcherExceptionHandlerResult handleException(
            DataFetcherExceptionHandlerParameters params) {

        Throwable ex = params.getException();
        GraphQLError error;

        if (ex instanceof CourseNotFoundException) {
            error = GraphqlErrorBuilder.newError()
                    .message(ex.getMessage())
                    .path(params.getPath())
                    .extensions(java.util.Map.of(
                            "code", "COURSE_NOT_FOUND",
                            "status", 404))
                    .build();
        } else if (ex instanceof jakarta.validation.ValidationException) {
            error = GraphqlErrorBuilder.newError()
                    .message("Invalid input")
                    .path(params.getPath())
                    .extensions(java.util.Map.of("code", "VALIDATION_ERROR"))
                    .build();
        } else {
            // Unknown: generic message — never leak internals
            error = GraphqlErrorBuilder.newError()
                    .message("Internal server error")
                    .path(params.getPath())
                    .extensions(java.util.Map.of("code", "INTERNAL"))
                    .build();
        }

        return DataFetcherExceptionHandlerResult.newResult(error).build();
    }
}

// ---- 3. The resolver throws the domain exception ----
@QueryMapping
public Course course(@Argument Long id) {
    return service.get(id).orElseThrow(() -> new CourseNotFoundException(id));
}
```

### Walking Through Each Part

**Domain exceptions** — the resolvers throw *meaningful* exceptions (`CourseNotFoundException`), never raw SQL or `NullPointerException`. The error vocabulary lives in the exception types.

**The handler** — one place maps exceptions → GraphQL errors:

- The **message** (safe, human-readable).
- The **path** (where it failed).
- **`extensions.code`** — the machine-readable contract clients switch on (`COURSE_NOT_FOUND` ≠ `VALIDATION_ERROR`).
- **Unknown exceptions → generic message** — never leak stack traces or internal details to clients (log them server-side instead).

**The result** — `DataFetcherExceptionHandlerResult` tells the engine: this field failed with this error; siblings continue. The response carries partial data + the structured error.

## Error Codes as a Contract

Clients can't switch on free-text messages — they switch on **codes**:

```json
{ "extensions": { "code": "COURSE_NOT_FOUND" } }
```

Design the code vocabulary deliberately:

| Code | Meaning | Client action |
|---|---|---|
| `UNAUTHENTICATED` | No valid token | Redirect to login |
| `FORBIDDEN` | Token valid, no permission | Show "no access" |
| `NOT_FOUND` | Resource absent | Show "doesn't exist" |
| `VALIDATION_ERROR` | Bad input | Show field errors |
| `RATE_LIMITED` | Too many requests | Back off and retry |
| `INTERNAL` | Server bug | Generic error + retry |

Codes are additive and versioned like the schema: adding codes is safe; renaming breaks clients.

## Validation Errors — Field-Level Detail

GraphQL validates input *before* resolvers run (the schema's types). For deeper validation (business rules), throw with structured details:

```java
class InvalidInputException extends RuntimeException {
    private final Map<String, String> fieldErrors;
    InvalidInputException(Map<String, String> fieldErrors) {
        super("Validation failed");
        this.fieldErrors = fieldErrors;
    }
    Map<String, String> fieldErrors() { return fieldErrors; }
}

// In the handler:
error = GraphqlErrorBuilder.newError()
        .message("Validation failed")
        .path(params.getPath())
        .extensions(java.util.Map.of(
                "code", "VALIDATION_ERROR",
                "fieldErrors", ((InvalidInputException) ex).fieldErrors()))
        .build();
```

Clients map `fieldErrors` onto form fields — the GraphQL equivalent of REST's `400` + field messages.

## The Response Contract Checklist

- [ ] Every failure path produces a **code** in `extensions`.
- [ ] Messages are safe for clients (no stack traces, no SQL, no internals).
- [ ] Errors carry the **path** so clients know which field failed.
- [ ] Validation details are structured (field → message).
- [ ] Unknown exceptions are logged server-side, generic client-side.
- [ ] Partial data is still returned (GraphQL's contract) — don't swallow the whole response.

## Common Beginner Pitfalls

1. **Returning 500-style empty responses** — GraphQL's contract is partial data + field errors; a total failure is rare (schema errors, transport).
2. **Leaking internals** — exception messages with SQL/hostnames reach clients; log them, sanitize the response.
3. **Free-text error matching** — clients that parse `message` strings break when wording changes; use codes.
4. **One generic error for everything** — `VALIDATION_ERROR` for auth failures misdirects clients; a real code vocabulary matters.
5. **Unhandled exceptions crash the whole query** — the handler must catch the `DataFetcherExceptionHandler` path so siblings resolve.
6. **Forgetting `path`** — clients can't tell which field failed without it.

## Key Takeaways

- GraphQL errors are field-scoped: partial data + a structured `errors` array with `path`.
- Throw domain exceptions; map them centrally to safe messages + `extensions.code`.
- The code vocabulary is the machine-readable contract clients switch on.
- Validation details ride in `extensions.fieldErrors` for form-level display.
- Never leak internals; log them instead.
- Partial success is the design — not a bug to paper over.
