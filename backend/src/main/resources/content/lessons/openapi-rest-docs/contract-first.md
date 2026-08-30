---
title: Contract-First Design — The API as the Agreement
module: openapi-rest-docs
order: 4
minutes: 24
topics: ["contract-first", "API design", "spec-first", "code generation", "breaking changes"]
docs:
  - title: "OpenAPI Generator"
    url: "https://openapi-generator.tech/"
summary: Most APIs are built codefirst: the backend team writes controllers, then (maybe) documentation follows. The frontend team waits, guesses, and chase...
---

# Contract-First Design — The API as the Agreement

## The Concept: Agree Before You Build

Most APIs are built **code-first**: the backend team writes controllers, then (maybe) documentation follows. The frontend team waits, guesses, and chases changes. **Contract-first** flips the order: **the API specification is written first**, agreed upon, and *then* both sides build against it — the backend implements the spec, the frontend consumes it, and the spec is the shared contract.

Think of a construction project: the architect's blueprint comes first (the contract). The electrician and the plumber both work from the same blueprint — they don't each invent their own wiring layout and hope it matches. The blueprint catches conflicts *before* walls go up, not after.

The contract-first flow:

```
1. DESIGN:  write the OpenAPI spec (paths, schemas, errors, auth)
2. REVIEW:  backend + frontend + QA review the spec (the "API review")
3. GENERATE: backend interfaces + frontend clients from the spec
4. IMPLEMENT: both sides build against the generated code
5. VERIFY:   contract tests confirm the implementation matches the spec
```

## Why It's Worth It

- **Parallel work** — frontend doesn't wait for backend; both start from the spec.
- **No drift** — both sides compile against the same types; a mismatch is a compile error, not a runtime surprise.
- **Design surfaced early** — naming, error semantics, and pagination get debated *before* code locks them in (when change is cheap).
- **Mock servers** — frontend can develop against a spec-generated mock while the backend is still being built.
- **Breaking-change control** — the spec makes breaking changes *visible*; versioning is a spec decision, not an accident.

## The Code Walkthrough

### Step 1 — The spec (the contract)

```yaml
# openapi.yaml
openapi: 3.1.0
info:
  title: Academy API
  version: 1.0.0
paths:
  /api/courses:
    get:
      operationId: listCourses
      parameters:
        - name: page
          in: query
          schema: { type: integer, default: 0 }
      responses:
        '200':
          description: Courses found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CoursePage'
        '401':
          description: Unauthenticated
components:
  schemas:
    Course:
      type: object
      required: [id, title]
      properties:
        id: { type: integer, format: int64 }
        title: { type: string }
    CoursePage:
      type: object
      required: [content, totalElements]
      properties:
        content:
          type: array
          items: { $ref: '#/components/schemas/Course' }
        totalElements: { type: integer }
```

### Step 2 — Generate both sides from the spec

```bash
# Backend: generate a Spring controller interface
openapi-generator generate \
  -i openapi.yaml -g spring \
  -o backend-api --api-package com.academy.api --model-package com.academy.dto

# Frontend: generate a TypeScript client
openapi-generator generate \
  -i openapi.yaml -g typescript-fetch \
  -o frontend-api
```

### Step 3 — Implement against the generated interface

```java
// GENERATED: the interface IS the contract
public interface CoursesApi {
    CoursePage listCourses(Integer page);
}

// YOUR code: implement it
@RestController
public class CourseController implements CoursesApi {

    @Override
    public CoursePage listCourses(Integer page) {
        return service.list(page == null ? 0 : page);
    }
}
```

### Walking Through Each Part

**The spec as source of truth** — `operationId: listCourses` becomes the method name on both sides. The schema (`CoursePage`, `Course`) becomes the type on both sides. One file, two languages, zero drift: if the backend returns a field the frontend doesn't know, neither side compiled against the other's guess.

**Generation** — OpenAPI Generator turns the spec into language-specific code: a Spring interface for the backend, a `typescript-fetch` client for the frontend. The *spec* is authored once; the code is mechanical output.

**Implementation** — the backend implements the generated interface. If the spec says `listCourses` returns `CoursePage`, the compiler enforces it. The frontend imports the generated client and calls `api.listCourses(page)` — types everywhere.

## Breaking Changes — Managed, Not Accidental

With a contract, "change the API" means "change the spec" — and that's a *visible, reviewable* act:

| Change | Type | Handling |
|---|---|---|
| Add a field to a response | Compatible | Fine — old clients ignore new fields |
| Add a new endpoint | Compatible | Fine — old clients never call it |
| Remove a field | Breaking | New spec version (v2) or field-deprecation period |
| Rename a path | Breaking | Version the path (`/v2/...`) or keep both |
| Change a response type | Breaking | Version the API |

The discipline: **compatible changes never bump the version; breaking changes always do** (URI versioning `/v1`, `/v2`, or header/content negotiation). The contract review is where "can we do this without breaking our consumers?" gets answered — before it costs a prod incident.

## Contract Tests — Does Reality Match the Spec?

```java
// Verify the running API satisfies the spec (e.g., with spring-cloud-contract
// or a spec-based schema validator):
@SpringBootTest(webEnvironment = RANDOM_PORT)
class ContractVerificationTest {

    @Autowired TestRestTemplate rest;

    @Test
    void listCoursesMatchesSpec() {
        ResponseEntity<String> resp = rest.getForEntity("/api/courses?page=0", String.class);

        assertThat(resp.getStatusCode().value()).isEqualTo(200);
        // schema-validate resp.getBody() against the CoursePage schema
        // -> if the response shape deviates from the spec, the test fails
    }
}
```

Contract tests sit between unit and end-to-end: they verify the *shape* matches the agreement without testing every behavior.

## Common Beginner Pitfalls

1. **Spec-first but nobody reviews the spec** — the whole value is the review; skip it and you've added ceremony without alignment.
2. **Hand-editing generated code** — regeneration overwrites edits. Treat generated code as build output.
3. **Over-specifying internal details** — the contract is the *public* surface; internal field names belong in implementation, not the spec.
4. **Breaking changes without versioning** — the spec makes them visible but not automatic; enforce versioning policy in review.
5. **Spec drift between branches** — the spec should live with the backend and be diffed in review; a stale spec is a lie.
6. **Generation version churn** — pin the generator version; regenerating with a new generator version can reformat everything.

## Key Takeaways

- Contract-first: write the spec first, review it, generate both sides from it.
- The spec is the single source of truth — backend and frontend compile against the same types.
- Parallel development + mock servers + compile-time drift detection.
- Breaking changes become visible, reviewable spec changes — version them deliberately.
- Contract tests verify the running API matches the agreed schema.
- Author the spec by hand once; treat generated code as build output.
