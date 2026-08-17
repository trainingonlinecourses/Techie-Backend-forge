---
title: API Documentation — Pitfalls and Best Practices
module: openapi-rest-docs
order: 5
minutes: 23
topics: ["doc pitfalls", "DTO hygiene", "examples", "deprecation", "changelog", "naming"]
docs:
  - title: "API documentation best practices (GitHub)"
    url: "https://github.com/tiimgreen/github-cheat-sheet"
---

# API Documentation — Pitfalls and Best Practices

## The Concept: Documentation Is User Experience for Developers

Your API's documentation is the *first impression* a consumer has of your product. Bad docs cost real money: developers abandon APIs they can't figure out, ticket volume rises, and integrations stall. Good docs — even minimal ones — are a competitive advantage.

The sad truth about API docs: **they rot**. The endpoint changes, the field is renamed, the error semantics shift — and the docs describe a ghost. The whole point of the tooling in this module (springdoc, REST Docs, contract-first) is to make rot *impossible* or *visible*. This lesson covers the practices that keep documentation useful — and the pitfalls that make it worse than no docs at all.

## The Code Walkthrough — DTO Hygiene (the #1 Doc Quality Factor)

The most impactful documentation decision you make is **what your endpoints return**. If you return entities, the docs (and clients) inherit every internal detail:

```java
// BAD: the entity leaks into the docs and the wire
@Entity
public class User {
    @Id private Long id;
    private String email;
    private String passwordHash;        // <- in the OpenAPI spec!
    private String resetToken;          // <- in the spec!
    private Instant lastLoginAt;
    private List<Role> roles;           // <- nested object graph
}

@GetMapping("/users/{id}")
public User getUser(@PathVariable long id) { return repo.findById(id); }
```

Springdoc generates schemas from `User` — the password hash, the reset token, the internal timestamps are all documented and serialized. **Never return entities from controllers.**

```java
// GOOD: a purpose-built response DTO
public record UserResponse(
        long id,
        String email,
        String displayName,
        List<String> roles) {}

@GetMapping("/users/{id}")
public UserResponse getUser(@PathVariable long id) {
    User u = repo.findById(id).orElseThrow();
    return new UserResponse(u.getId(), u.getEmail(), u.getDisplayName(),
            u.getRoles().stream().map(Role::name).toList());
}
```

The spec now shows exactly the public contract: id, email, display name, roles. No internals, no surprise fields, no drift between "what we intended to expose" and "what got serialized".

## Provide Examples — The Docs Come Alive

```java
@Operation(summary = "Create a course",
        requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
                content = @Content(mediaType = "application/json",
                        examples = @ExampleObject("""
                                {
                                  "title": "Spring Transactions in Depth",
                                  "minutes": 45,
                                  "published": true
                                }
                                """))))
@PostMapping
public CourseDto create(@RequestBody @Valid CourseRequest req) { ... }
```

One realistic example request is worth a paragraph of prose. The consumer sees the *shape* of a real call and can copy-paste it. Add examples to: the request body, the success response, and at least one error response.

## Error Responses — Documented Failure

The most under-documented part of any API is *failure*. Consumers spend most of their integration time handling errors:

```java
// Document the error shape once:
public record ApiError(
        String code,        // e.g., "COURSE_NOT_FOUND"
        String message,     // human-readable
        Instant timestamp,
        Map<String, String> fieldErrors) {}   // validation details

// ...and reference it in every operation's error responses
@ApiResponse(responseCode = "400", description = "Validation failed",
        content = @Content(schema = @Schema(implementation = ApiError.class)))
```

**Rule:** every documented success code should be matched by documented error codes — 400 (validation), 401 (unauthenticated), 403 (forbidden), 404 (not found), 409 (conflict), 429 (rate limited), 5xx (server).

## Deprecation — The Honest Exit

```java
@Deprecated
@Operation(deprecated = true,
        description = "Use POST /api/v2/courses instead")
@GetMapping("/api/v1/courses")
public List<CourseDto> listV1() { ... }
```

Deprecation is documentation's way of saying "this still works, but stop using it." In the spec it marks the operation deprecated; in the UI it dims it. Combined with a clear `description` pointing at the replacement, deprecation is the polite, non-breaking path to API evolution. (See the versioning lesson in REST best practices for the full strategy.)

## The Pitfalls Checklist

1. **Entities as response types** — internals leak into the spec; use DTOs.
2. **No examples** — a schema without an example is an abstraction nobody can paste.
3. **No error documentation** — consumers can't handle what they can't anticipate.
4. **Docs that rot** — code-first generation (springdoc) or test-driven (REST Docs) prevent rot; hand-written docs rot.
5. **Naming that lies** — `deleteUser` that soft-deletes, `getUser` that returns a list: the docs inherit the naming confusion. Fix the name.
6. **Versionless docs** — multiple API versions documented as one spec confuse everyone; group/version the specs.
7. **No changelog** — consumers need to know *what changed* between versions; keep a changelog next to the spec.

## The Best-Practice Scorecard

| Practice | Why it matters |
|---|---|
| DTOs at the boundary | Spec shows only the public contract |
| Examples everywhere | Consumers can copy-paste |
| Error codes documented | Consumers can handle failure |
| Code/test-generated docs | Docs can't rot |
| Deprecation with guidance | Non-breaking evolution |
| Versioned specs + changelog | Consumers know what changed |
| Meaningful operation ids | Client code reads well |

## Common Beginner Pitfalls

1. **"The code is the documentation"** — code tells you *what*, rarely *why* or *how to use*; docs are the why/how.
2. **One giant unversioned spec** — v1 and v2 mixed; consumers can't tell what's current.
3. **Security requirements missing** — the spec doesn't say "Bearer token required"; the UI can't test the API.
4. **Copy-pasted descriptions** — `"Returns courses"` on every method adds noise, not value; write one meaningful sentence.
5. **Docs gated behind auth the readers don't have** — if the UI itself needs a token to load, nobody can read the docs. Public spec + protected operations.
6. **Ignoring the consumer's perspective** — docs written for the implementer (internal field names, DB concepts) instead of the caller.

## Key Takeaways

- Docs are developer UX — they rot, so generate them from code/tests.
- DTOs at the boundary are the #1 doc-quality factor: the spec shows only the public contract.
- Examples make docs actionable; error codes make them complete.
- Deprecation + versioned specs = honest, non-breaking evolution.
- Run the scorecard above before calling your docs done.
