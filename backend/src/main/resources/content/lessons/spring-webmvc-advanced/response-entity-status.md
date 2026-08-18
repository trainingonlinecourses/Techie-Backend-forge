---
title: ResponseEntity & HTTP Status Codes — Speaking HTTP Correctly
summary: ResponseEntity bodies/status/headers, the status code decision table, ETag/Last-Modified, and the error-body conventions production APIs follow.
order: 9
minutes: 18
topics: [responseentity, status-codes, http-status, etag, last-modified, headers, error-body]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/responseentity.html
  - https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
---

# ResponseEntity & HTTP Status Codes — Speaking HTTP Correctly

## The concept: the response is more than a body

A controller that returns an object gets `200 OK` and a JSON body from Spring's default. `ResponseEntity<T>` gives you the **whole HTTP response**: status, headers, and body — the tool for when "200 + JSON" isn't the right answer.

```java
@GetMapping("/api/orders/{id}")
public ResponseEntity<Order> getOrder(@PathVariable Long id) {
    return orderService.findById(id)
        .map(o -> ResponseEntity.ok(o))                       // 200 + body
        .orElse(ResponseEntity.notFound().build());           // 404, no body
}
```

`ResponseEntity` has builders for every common case: `ok()`, `created(uri)`, `accepted()`, `noContent()`, `badRequest()`, `notFound()`, `status(HttpStatus.X)`. The static `ResponseEntity` is for simple responses; `ResponseEntity.BodyBuilder` chains headers: `.header(...)`, `.contentType(...)`, `.cacheControl(...)`, `.location(uri)`.

## The status code decision table

Getting status codes right is a core API quality issue — teams maintain a table like this in their API guidelines:

| Situation | Code |
|---|---|
| Read succeeded | 200 OK |
| Create succeeded | 201 Created (+ `Location` header) |
| Request accepted for async processing | 202 Accepted |
| Update succeeded, nothing to return | 204 No Content |
| Client sent malformed/invalid input | 400 Bad Request |
| No auth / bad credentials | 401 Unauthorized |
| Authenticated but not allowed | 403 Forbidden |
| Resource doesn't exist | 404 Not Found |
| Method not allowed on this path | 405 Method Not Allowed |
| Conflict (duplicate, version clash) | 409 Conflict |
| Precondition failed (ETag mismatch) | 412 Precondition Failed |
| Payload too large | 413 Payload Too Large |
| Server bug | 500 Internal Server Error |
| Dependency down / timeout | 502/503/504 gateway variants |

**The 401 vs 403 distinction** is the most common review point: 401 = "identify yourself (or your credentials are wrong)"; 403 = "I know who you are, you're not allowed". Returning 403 for unauthenticated requests breaks clients that react to 401 by prompting for credentials.

## How we use it in an organization: the scenarios

**Scenario 1 — REST API error body convention.** Every error is the same shape, so clients parse one format:

```java
public record ApiError(Instant timestamp, int status, String error, String message, String path) {}

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(NotFoundException e, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(
            new ApiError(Instant.now(), 404, "Not Found", e.getMessage(), req.getRequestURI()));
    }
    // + handlers for validation errors (400 with field messages), conflict (409), etc.
}
```

**Scenario 2 — 201 with Location on create:**

```java
@PostMapping("/api/orders")
public ResponseEntity<Order> create(@Valid @RequestBody OrderRequest r, UriComponentsBuilder ucb) {
    Order created = orderService.create(r);
    URI location = ucb.path("/api/orders/{id}").buildAndExpand(created.getId()).toUri();
    return ResponseEntity.created(location).body(created);   // 201 + Location
}
```

`UriComponentsBuilder` builds the Location from the current request's base URL — the client can immediately GET the new resource.

**Scenario 3 — conditional reads with ETag/Last-Modified (cache-friendly APIs).**

```java
@GetMapping("/api/profile")
public ResponseEntity<Profile> profile() {
    Profile p = profileService.current();
    return ResponseEntity.ok()
        .eTag("\"" + p.version() + "\"")            // version → ETag
        .lastModified(p.updatedAt().toEpochMilli())
        .body(p);
}
```

The client sends `If-None-Match: "v3"`; the server compares and can answer **304 Not Modified** with no body — saving bandwidth on every unchanged read. A `WebRequest` argument automates this:

```java
public ResponseEntity<Profile> profile(WebRequest request) {
    if (request.checkNotModified(profileService.currentVersion())) {
        return null;   // framework sends 304
    }
    ...
}
```

**Scenario 4 — async/202 pattern.** A long job: accept the request with 202 + a job id in the body; a separate endpoint reports progress; the client polls or receives a webhook.

## Pitfalls

- **Returning `null` bodies with wrong status** — `ResponseEntity.status(500).body(null)` serializes `null`; prefer `build()` and correct status semantics.
- **Exceptions thrown inside a handler that returns `ResponseEntity`** still go to `@ControllerAdvice` — mixing return-value status with exception status confuses teams; standardize: business flow sets status via ResponseEntity, *unexpected* failures via the advice.
- **ETag/Last-Modified only work if the client opts in** — without `If-None-Match`/`If-Modified-Since`, the server just returns 200; the pattern is a *negotiation*.
- **Status + body mismatch** — "201 with an error body", "204 with a body" — 204 must have no body; clients ignore or choke.
- **Never return raw exceptions to clients** — stack traces and internal messages leak internals; the error-body convention is the shield.

## Key takeaways

- `ResponseEntity<T>` = full control of status, headers, and body — use it at API boundaries.
- Learn the status table; especially 401 vs 403, 400 vs 422/409, and 201+Location.
- Standardize an error body via `@ControllerAdvice` so every failure is parseable.
- ETag/Last-Modified + `WebRequest.checkNotModified` enable cheap 304 responses.
- Business statuses live in the handler; unexpected errors in the advice.
