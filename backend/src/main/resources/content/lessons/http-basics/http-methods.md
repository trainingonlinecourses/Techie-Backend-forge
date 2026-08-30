---
title: HTTP Methods — The Verbs of the Web
module: http-basics
order: 1
minutes: 25
topics: ["HTTP methods", "GET POST PUT DELETE PATCH", "idempotency", "safe methods", "HTTP semantics"]
docs:
  - title: "RFC 9110 — HTTP Semantics (methods)"
    url: "https://datatracker.ietf.org/doc/html/rfc9110#section-9"
summary: HTTP is a requestresponse protocol with a small set of methods (verbs) that say what the client wants done with the resource at the URL. The URL na...
---

# HTTP Methods — The Verbs of the Web

## The Concept: The Same URL, Different Intentions

HTTP is a *request-response* protocol with a small set of **methods** (verbs) that say *what the client wants done* with the resource at the URL. The URL names *what*; the method names *the action*.

The genius of this design: the same URL (`/api/courses/42`) means something different per method:

| Method | Meaning | Example |
|---|---|---|
| `GET` | Fetch the resource | Read course 42 |
| `POST` | Create a new resource (or trigger an action) | Create a course |
| `PUT` | Replace the resource entirely | Replace course 42 |
| `PATCH` | Partially update the resource | Change course 42's title only |
| `DELETE` | Remove the resource | Delete course 42 |
| `HEAD` | Fetch only the headers (no body) | "Is it there? What size?" |
| `OPTIONS` | Ask what's allowed | CORS preflight |

## The Two Crucial Properties

### Safe — does it change state?

A **safe** method must not change anything on the server. `GET`, `HEAD`, `OPTIONS` are safe: they're *reads*. You can cache them, retry them freely, and link them anywhere. A `GET` that mutates (e.g., deletes via query param) is a **design bug** — it breaks caching, breaks prefetching, and can cause accidental deletions (search engines, link previewers, and prefetchers all issue GETs).

### Idempotent — does repeating it change the outcome?

An **idempotent** method produces the same result whether called once or many times:

| Method | Safe? | Idempotent? | Notes |
|---|---|---|---|
| `GET` | ✅ | ✅ | Reads; repeat freely |
| `PUT` | ❌ | ✅ | `PUT /courses/42` with the same body 5 times = same final state |
| `DELETE` | ❌ | ✅ | Deleting a missing resource is fine (404, but no harm) |
| `PATCH` | ❌ | ⚠️ | Idempotent only if the patch itself is (e.g., "set title to X" yes; "increment counter" no) |
| `POST` | ❌ | ❌ | Each POST creates a new resource — the danger case |

Why idempotency matters: **retries**. If a request times out and the client retries, an idempotent method is safe to repeat; a POST may duplicate the resource (unless the server uses an idempotency key — see the REST best practices module).

## The Code Walkthrough — Methods in Spring

```java
@RestController
@RequestMapping("/api/courses")
public class CourseController {

    // GET /api/courses — read, safe, cacheable
    @GetMapping
    public List<CourseDto> list() { return service.list(); }

    // GET /api/courses/{id} — read one
    @GetMapping("/{id}")
    public CourseDto get(@PathVariable long id) { return service.get(id); }

    // POST /api/courses — create (NOT idempotent: each call makes a new course)
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)          // 201: a resource was created
    public CourseDto create(@RequestBody @Valid CourseRequest req) {
        return service.create(req);
    }

    // PUT /api/courses/{id} — full replace (idempotent)
    @PutMapping("/{id}")
    public CourseDto replace(@PathVariable long id, @RequestBody CourseRequest req) {
        return service.replace(id, req);          // the body IS the whole new course
    }

    // PATCH /api/courses/{id} — partial update
    @PatchMapping("/{id}")
    public CourseDto update(@PathVariable long id, @RequestBody Map<String, Object> changes) {
        return service.partialUpdate(id, changes);
    }

    // DELETE /api/courses/{id} — remove (idempotent: repeat is harmless)
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)        // 204: done, no body
    public void delete(@PathVariable long id) { service.delete(id); }
}
```

### Walking Through Each Part

**GET → `@GetMapping`** — the read path. No state change, cacheable, repeatable. This is where 90% of traffic should live.

**POST → `@PostMapping` + 201** — creates. Each call makes *a new* course (new id). This is the non-idempotent method — the one you must not blindly retry.

**PUT → `@PutMapping`** — full replacement. The request body *is* the complete new state of the resource. Sending the same PUT 3 times → the resource ends up identical. This is why PUT is idempotent: the final state doesn't depend on how many times it ran.

**PATCH → `@PatchMapping`** — partial change. The body describes only the changes ("set title to X"). Idempotent if the changes are absolute ("title = X" — repeat-safe) but not if they're relative ("increment views").

**DELETE → `@DeleteMapping` + 204** — removal. Deleting an already-deleted resource returns 404 but causes no harm — hence idempotent.

## Method Selection — The Decision Table

| Intent | Method |
|---|---|
| Read data | `GET` |
| Create something new | `POST` |
| Replace a whole resource | `PUT` |
| Change part of a resource | `PATCH` |
| Remove a resource | `DELETE` |
| Trigger an action (send email, run job) | `POST` |
| Ask for metadata only | `HEAD` |
| Ask what's allowed | `OPTIONS` |

The classic beginner question: "should I use POST or PUT to update?" — Update-*replace* → PUT; update-*partial* → PATCH; and if you're *creating* → POST.

## Common Beginner Pitfalls

1. **GET with side effects** — deleting via `GET /delete?id=5` breaks caching/prefetching and can cause accidental deletions. Never.
2. **POST for everything** — "it just works" — but you lose idempotency, caching, and semantics; choose the verb for the intent.
3. **Retrying POSTs blindly** — duplicate resources. Add idempotency keys if retries are possible.
4. **PUT with a partial body** — PUT means "replace"; sending a partial body wipes the missing fields. PATCH is the partial verb.
5. **Wrong status codes** — creating returns 201, deleting returns 204, not 200 with a body for everything (next lesson).
6. **Confusing safe and idempotent** — DELETE is idempotent but NOT safe (it changes state). A method can be one without the other.

## Key Takeaways

- Methods are the verbs: GET (read), POST (create), PUT (replace), PATCH (partial), DELETE (remove).
- Safe = no state change (GET, HEAD, OPTIONS) — cacheable, retryable, linkable.
- Idempotent = repeat-safe (GET, PUT, DELETE; PATCH conditionally) — retryable.
- POST is neither — the danger case for retries (use idempotency keys).
- Choose the verb for the intent; the framework annotations map one-to-one.
- Never put side effects in GET; never send partial bodies to PUT.
