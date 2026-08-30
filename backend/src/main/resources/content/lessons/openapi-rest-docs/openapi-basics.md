---
title: OpenAPI — Describing Your API for Machines and Humans
module: openapi-rest-docs
order: 1
minutes: 24
topics: ["OpenAPI", "Swagger", "API specification", "JSON schema", "contract-first"]
docs:
  - title: "OpenAPI Specification"
    url: "https://spec.openapis.org/oas/v3.1.0"
summary: A REST API without documentation is a guessing game: which endpoints exist? What does each expect and return? What status codes? Handwritten docs g...
---

# OpenAPI — Describing Your API for Machines and Humans

## The Concept: An API Needs Documentation That Code Can Read

A REST API without documentation is a guessing game: which endpoints exist? What does each expect and return? What status codes? Hand-written docs go stale the moment the code changes — nobody updates them.

**OpenAPI** (formerly Swagger) solves this with a **machine-readable specification**: a JSON or YAML document that describes your entire API — paths, operations, parameters, request/response schemas, auth — in a standard format. Because it's structured, tooling can consume it:

- **Swagger UI** — a browsable, clickable API explorer.
- **Code generation** — clients (and servers) generated from the spec.
- **Contract testing** — verify the API matches the spec.
- **Mock servers** — simulate the API from the spec.

The killer property: **the spec is the single source of truth**, and (with Springdoc) it's *generated from your actual code* — so it can't go stale.

## Spec-First vs Code-First

| Approach | How | Best for |
|---|---|---|
| **Code-first** (springdoc) | Annotations on controllers generate the spec | Internal APIs, fast iteration |
| **Spec-first** | Write the spec, generate code from it | Public APIs, client/server teams in parallel, contracts negotiated up front |

Spring Boot's ecosystem defaults to code-first via **springdoc-openapi** — add the dependency, and `GET /v3/api-docs` serves the spec while `/swagger-ui.html` (or `/swagger-ui/index.html`) serves the UI, both derived from your controllers.

## The Code Walkthrough

```java
// ---- 1. Add the dependency ----
// implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:2.6.0'

// ---- 2. Annotate the controller — the spec is generated from these ----
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Courses", description = "Course catalog operations")
@RestController
@RequestMapping("/api/courses")
public class CourseController {

    @Operation(summary = "List courses", description = "Returns published courses with pagination")
    @ApiResponse(responseCode = "200", description = "Courses found")
    @GetMapping
    public Page<CourseDto> list(@RequestParam(defaultValue = "0") int page) {
        return service.list(page);
    }

    @Operation(summary = "Get a course by id")
    @ApiResponse(responseCode = "200", description = "Course found")
    @ApiResponse(responseCode = "404", description = "Course not found")
    @GetMapping("/{id}")
    public CourseDto get(@PathVariable long id) {
        return service.get(id);
    }

    @Operation(summary = "Create a course")
    @ApiResponse(responseCode = "201", description = "Created")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CourseDto create(@RequestBody @Valid CourseRequest request) {
        return service.create(request);
    }
}
```

### Walking Through Each Part

**`@Tag`** — groups endpoints into logical sections in the UI. A controller per resource gets a tag; the UI renders the API by tags.

**`@Operation`** — documents a single endpoint: summary (short), description (longer). Without it, springdoc derives the description from the method name — the annotation is where you write the *human* story.

**`@ApiResponse`** — declares status codes. `404` for a not-found path matters: it tells clients how to handle absence. Document the *success* codes (200/201/204) and the *expected* error codes (400 validation, 401 auth, 404, 409 conflict).

**The DTOs** — springdoc inspects the request/response types and generates **JSON schemas** for them automatically (field names, types, required, defaults). Your DTOs *are* the documentation — another reason to keep them clean and meaningful.

## What You Get for Free

After adding the dependency and hitting your app:

```
GET /v3/api-docs          -> the raw OpenAPI JSON (the spec)
GET /swagger-ui/index.html -> the interactive UI
```

The UI lets anyone: browse every endpoint, expand request/response models, and **execute** requests (with auth configured). It's the fastest way to demo an API to a colleague, a frontend team, or a reviewer.

## Generating Clients from the Spec

The spec enables code generation. With the **OpenAPI Generator**:

```bash
openapi-generator generate \
  -i http://localhost:8080/v3/api-docs \
  -g typescript-fetch \
  -o frontend/src/api
```

This produces a typed client for the frontend — matching models, methods, and types — eliminating hand-written fetch calls and the drift between frontend expectations and backend reality. When the API changes, regenerate (and diff the result).

## Common Beginner Pitfalls

1. **Annotations-only documentation** — descriptions in `@Operation` are worth writing; the UI reads them.
2. **Exposing internal details** — DTOs with password fields appear in the spec; use dedicated response DTOs (never return entities directly).
3. **Missing error responses** — clients need to know what `404`/`400` look like; document them.
4. **No auth documented** — if your API needs a token, describe the security scheme (`@SecurityScheme`) so the UI can send it.
5. **Spec drift when hand-written** — prefer code-first generation so the spec always matches the code.
6. **Leaving the UI public in production** — `/swagger-ui` exposes your full API surface; secure it or disable it in prod (the `springdoc` properties let you toggle).

## Key Takeaways

- OpenAPI = a standard, machine-readable description of your API.
- Code-first (springdoc) generates the spec from controllers/annotations — it can't go stale.
- `@Tag`/`@Operation`/`@ApiResponse` turn a controller into documentation.
- DTO schemas are generated automatically — clean DTOs = clean docs.
- Swagger UI = browsable, executable docs; the spec feeds code generation.
- Protect the UI in production; document auth and error codes.
