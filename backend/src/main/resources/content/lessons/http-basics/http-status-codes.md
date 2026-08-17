---
title: HTTP Status Codes — The Outcome, in Three Digits
module: http-basics
order: 2
minutes: 24
topics: ["status codes", "2xx 4xx 5xx", "redirects", "error semantics", "REST responses"]
docs:
  - title: "RFC 9110 — Status codes"
    url: "https://datatracker.ietf.org/doc/html/rfc9110#section-15"
---

# HTTP Status Codes — The Outcome, in Three Digits

## The Concept: The First Line of Every Response

Every HTTP response begins with a status line — three digits that tell the client *what happened* in a machine-readable way. The first digit is the **class**:

| Class | Meaning | Examples |
|---|---|---|
| `1xx` | Informational | `100 Continue`, `101 Switching Protocols` |
| `2xx` | Success | `200 OK`, `201 Created`, `204 No Content` |
| `3xx` | Redirect | `301 Moved Permanently`, `304 Not Modified` |
| `4xx` | Client error | `400 Bad Request`, `401`, `403`, `404`, `429` |
| `5xx` | Server error | `500`, `502`, `503`, `504` |

The class is the contract: clients (browsers, SDKs, load balancers) branch on the class without reading the body. Return the *wrong class* and you break that contract — a 200 for a failure makes monitoring, retries, and caches all misbehave.

## The Codes You Actually Need

### 2xx — Success

| Code | Use when | Notes |
|---|---|---|
| `200 OK` | The request succeeded, body has the result | The default |
| `201 Created` | A POST created a resource | Include a `Location` header pointing at the new resource |
| `204 No Content` | Success, nothing to return | DELETE, or an update with no response body |

### 4xx — The client's fault (retry won't help)

| Code | Meaning | Notes |
|---|---|---|
| `400 Bad Request` | Malformed request | Missing/invalid fields, bad JSON |
| `401 Unauthorized` | **Not authenticated** — no valid credentials | "Who are you?" — include `WWW-Authenticate` |
| `403 Forbidden` | **Authenticated but not allowed** | "I know you; you can't do this." |
| `404 Not Found` | Resource doesn't exist | Also used to *hide* existence (security) |
| `409 Conflict` | State conflict | e.g., creating something that already exists |
| `422 Unprocessable Entity` | Valid syntax, invalid semantics | Business-rule failures |
| `429 Too Many Requests` | Rate limited | Include `Retry-After` |

### 5xx — The server's fault (retry might help)

| Code | Meaning |
|---|---|
| `500 Internal Server Error` | An unexpected server failure |
| `502 Bad Gateway` | The upstream (proxy target) sent a bad response |
| `503 Service Unavailable` | Overloaded or in maintenance — retry *later* |
| `504 Gateway Timeout` | The upstream timed out |

## The 401 vs 403 Distinction (Most-Confused Pair)

- **401 Unauthenticated** — no token, or an invalid/expired one. The server says: "I don't know who you are; authenticate first."
- **403 Forbidden** — a *valid* identity that lacks permission. The server says: "I know who you are; you're not allowed to do this."

The practical rule: **a missing/expired token → 401; a valid token without the role → 403.** (401 implies "authenticate and retry"; 403 implies "retrying won't help".)

## The Code Walkthrough — Returning the Right Codes

```java
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/courses")
public class CourseController {

    // 200 with the resource
    @GetMapping("/{id}")
    public CourseDto get(@PathVariable long id) {
        return service.get(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Course " + id + " not found"));
    }

    // 201 with Location on create
    @PostMapping
    public ResponseEntity<CourseDto> create(@RequestBody @Valid CourseRequest req) {
        CourseDto created = service.create(req);
        return ResponseEntity
                .created(java.net.URI.create("/api/courses/" + created.id()))
                .body(created);
    }

    // 204 on delete — no body
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) { service.delete(id); }

    // 409 on conflict — creating a duplicate
    @PostMapping("/enroll/{courseId}")
    public ResponseEntity<?> enroll(@PathVariable long courseId) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(service.enroll(courseId));
        } catch (DuplicateEnrollmentException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "ALREADY_ENROLLED"));
        }
    }
}
```

### Walking Through Each Part

**`404` via `ResponseStatusException`** — the standard "not found" with a clean message. The client can branch on the class (4xx = its fault) without parsing the body.

**`201` + `Location`** — the correct "created" response: the status says "created", and the `Location` header tells the client *where* the new resource lives (`GET /api/courses/7`). The client can follow it without guessing.

**`204` on delete** — success with no body: nothing to return. A 200 with an empty body is the common sloppier alternative; 204 is the honest "done, nothing here".

**`409` on conflict** — a *state* conflict ("already enrolled") is neither 400 (the request was well-formed) nor 500 (the server is fine) — it's 409, telling the client the request clashes with the current state.

## The Error Body Contract

The status code says *what class*; the body should say *what exactly*, in a machine-readable shape:

```json
{
  "timestamp": "2026-08-18T10:00:00Z",
  "status": 409,
  "code": "ALREADY_ENROLLED",
  "message": "You are already enrolled in this course"
}
```

Stable fields: `code` (clients switch on it), `message` (humans read it), `status`, `timestamp`. Document the error contract in your OpenAPI spec (see the API docs module) — clients need it.

## Common Beginner Pitfalls

1. **200 for everything** — failures reported in the body with status 200 break every tool: monitors, caches, retries, load balancers.
2. **401 vs 403 swapped** — missing token → 401; no permission → 403.
3. **404 with "please retry" semantics** — 404 means "it's not there"; don't make clients retry it. 503/504 are the retryable codes.
4. **Empty-body 200 on delete** — use 204 for "success, no content".
5. **500 for client mistakes** — validation failures are 400/422 (client's fault), not 500 (server's fault).
6. **Leaking internals in 500 bodies** — stack traces/SQL in error responses aid attackers; log them, return a generic message.
7. **No `Retry-After` on 429** — clients can't coordinate; they'll hammer and hit the wall again.

## Key Takeaways

- The status class is the contract: 2xx success, 3xx redirect, 4xx client, 5xx server.
- 201 + `Location` for creates; 204 for no-content success; 404 for missing.
- 401 = unauthenticated; 403 = authenticated-but-forbidden.
- 409 for state conflicts; 429 + `Retry-After` for rate limits.
- Retry semantics: 4xx rarely retryable; 5xx sometimes; 503/504 yes.
- Pair codes with a stable error body (`code`, `message`) documented in the spec.
