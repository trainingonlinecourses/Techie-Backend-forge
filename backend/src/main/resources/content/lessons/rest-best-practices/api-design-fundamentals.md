---
title: REST API Design Fundamentals
module: rest-best-practices
order: 1
minutes: 25
topics: ["resource naming", "HTTP verbs", "status codes", "idempotency", "REST constraints"]
summary: REST is a set of architectural constraints, not a URL style guide. This lesson covers the five constraints, what they imply for Spring controllers,...
docs:
  - title: "Spring REST reference"
    url: "https://docs.spring.io/spring-framework/reference/web/webmvc.html"
---

# REST API Design Fundamentals

REST is a set of architectural constraints, not a URL style guide. This lesson covers the five constraints, what they imply for Spring controllers, and the concrete decisions that make an API predictable: nouns, verbs, status codes, and idempotency.

## The Five REST Constraints

1. **Client–Server** — UI and API evolve independently.
2. **Stateless** — every request carries all context; no server-side session state.
3. **Cacheable** — responses declare cacheability (via `Cache-Control`).
4. **Uniform Interface** — resources, representations, self-descriptive messages, HATEOAS.
5. **Layered System** — proxies, gateways, load balancers can sit between client and server.

In practice, most "REST APIs" are *HTTP APIs* that follow constraints 1–3. Constraint 4 (HATEOAS) is where most teams stop short.

## Resource Naming

Nouns, plural, lowercase, kebab-case:

```
GET    /api/courses              → list courses
POST   /api/courses              → create a course
GET    /api/courses/{id}         → fetch one
PUT    /api/courses/{id}         → full replace
PATCH  /api/courses/{id}         → partial update
DELETE /api/courses/{id}         → delete
```

### Nested Resources

Use nesting for clear ownership:

```
GET  /api/courses/{courseId}/lessons
POST /api/courses/{courseId}/lessons
```

Avoid more than one level of nesting. Beyond that, flatten with query params:

```
GET /api/lessons?courseId=42          # better than /courses/42/lessons/7/quiz
GET /api/quiz-answers?lessonId=7
```

### Anti-Patterns

| Anti-pattern | Why it hurts |
|--------------|--------------|
| Verbs in URLs (`/getCourse`, `/deleteUser`) | Verbs belong in HTTP methods |
| Mixed case (`/api/GetCourses`) | Inconsistent, case-sensitive systems |
| Singular + plural mixed | Unpredictable |
| Deep nesting (`/a/{a}/b/{b}/c/{c}/d/{d}`) | Brittle, hard to evolve |
| Extension suffixes (`/api/courses.json`) | Content negotiation handles format |

## HTTP Verbs and Semantics

| Verb | Semantics | Idempotent? | Safe? | Spring annotation |
|------|-----------|-------------|-------|-------------------|
| GET | Read | Yes | Yes | `@GetMapping` |
| POST | Create / action | No | No | `@PostMapping` |
| PUT | Full replace | Yes | No | `@PutMapping` |
| PATCH | Partial update | No (by spec) | No | `@PatchMapping` |
| DELETE | Remove | Yes | No | `@DeleteMapping` |
| HEAD | Headers only | Yes | Yes | `@RequestMapping(method = HEAD)` |
| OPTIONS | Capabilities | Yes | Yes | CORS preflight |

**Idempotency** matters because of retries: a client that times out on a `PUT` can safely retry; a client that times out on a `POST` can't know whether the resource was created. That's why payment APIs use idempotency keys (see lesson 4).

## Status Codes: Be Precise

```
2xx Success
  200 OK            — GET/PUT/PATCH success
  201 Created       — POST success, include Location header
  202 Accepted      — async job queued
  204 No Content    — DELETE success, no body

4xx Client error
  400 Bad Request   — malformed body / validation
  401 Unauthorized  — missing/invalid credentials
  403 Forbidden     — authenticated but not allowed
  404 Not Found     — resource absent
  405 Method Not Allowed
  409 Conflict      — state conflict (duplicate, version mismatch)
  422 Unprocessable Entity — valid JSON, invalid semantics
  429 Too Many Requests     — rate limited

5xx Server error
  500 Internal Server Error
  502/503/504 — gateway, unavailable, timeout
```

Spring mappings:

```java
@GetMapping("/courses/{id}")
public ResponseEntity<CourseDto> get(@PathVariable Long id) {
    return courseService.findById(id)
        .map(ResponseEntity::ok)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Course not found"));
}

@PostMapping("/courses")
public ResponseEntity<CourseDto> create(@Valid @RequestBody CourseDto dto) {
    CourseDto created = courseService.create(dto);
    URI location = URI.create("/api/courses/" + created.id());
    return ResponseEntity.created(location).body(created);
}

@DeleteMapping("/courses/{id}")
public ResponseEntity<Void> delete(@PathVariable Long id) {
    courseService.delete(id);
    return ResponseEntity.noContent().build();
}
```

## Content Negotiation

Let clients choose the representation:

```java
@GetMapping(value = "/courses/{id}", produces = {MediaType.APPLICATION_JSON_VALUE,
                                                  MediaType.APPLICATION_XML_VALUE})
public CourseDto get(@PathVariable Long id) { ... }
```

Honor `Accept` headers; use `Accept: application/json` and `Content-Type: application/json` consistently. Spring handles both automatically via `produces`/`consumes` and the `Accept` header.

## Caching Headers

Stateless + cacheable: tell intermediaries how long a response can be cached:

```java
@GetMapping("/courses/popular")
public ResponseEntity<List<CourseDto>> popular() {
    return ResponseEntity.ok()
        .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)))
        .body(courseService.popular());
}
```

`Cache-Control: max-age=300` lets CDNs and browsers serve the same payload for 5 minutes — a 10× reduction in upstream load for stable data.

## API Versioning

Three mainstream strategies (covered in depth in a later lesson):

| Strategy | Example | When |
|----------|---------|------|
| URL path | `/api/v2/courses` | Most common, explicit, cacheable |
| Query param | `/api/courses?version=2` | Simple but pollutes URLs |
| Header | `Accept: application/vnd.acme.v2+json` | Clean URLs, hidden from browsers |

## The Uniform Interface in Spring

HATEOS = return links along with data:

```java
@GetMapping("/courses/{id}")
public ResponseEntity<CourseDto> get(@PathVariable Long id) {
    CourseDto dto = courseService.findById(id).orElseThrow();
    dto.addLink(linkTo(methodOn(CourseController.class).get(id)).withSelfRel());
    dto.addLink(linkTo(methodOn(LessonController.class).list(id)).withRel("lessons"));
    return ResponseEntity.ok(dto);
}
```

(Full HATEOAS via Spring HATEOAS is covered in the APIs module — this is the principle: the server tells the client what it can do next.)

## Summary Checklist

- ✅ Plural nouns, kebab-case, no verbs in URLs
- ✅ Correct verb per operation (GET read, POST create, PUT replace, PATCH partial, DELETE remove)
- ✅ Precise status codes (201 with Location, 204 for deletes, 404/409/422 for errors)
- ✅ Idempotent semantics for retries
- ✅ Cache-Control on stable data
- ✅ `@Valid` on request bodies
- ✅ Versioning strategy decided up front

These fundamentals are the contract your API's consumers depend on. The next lessons build on them: error handling, pagination, versioning, and rate limiting.
