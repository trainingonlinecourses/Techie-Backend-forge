---
title: HTTP Headers — The Metadata of Every Request and Response
module: http-basics
order: 3
minutes: 24
topics: ["headers", "Content-Type", "Authorization", "Accept", "CORS", "caching headers"]
docs:
  - title: "RFC 9110 — Fields (headers)"
    url: "https://datatracker.ietf.org/doc/html/rfc9110#section-5"
---

# HTTP Headers — The Metadata of Every Request and Response

## The Concept: The Envelope, Not the Letter

Every HTTP message has a body (the content) and **headers** — the *metadata* that tells both sides how to interpret it: what format the body is in, who's sending it, how long it can be cached, what's allowed next.

Think of mailing a package: the letter is the body; the envelope's stamps, labels, and return address are the headers. The post office (and the receiver) act on the envelope *before* opening the letter — that's exactly how proxies, caches, and servers treat headers.

Headers come in three flavors:

- **Request headers** — client → server: `Authorization`, `Accept`, `Content-Type`, `User-Agent`.
- **Response headers** — server → client: `Content-Type`, `Location`, `Cache-Control`, `Set-Cookie`.
- **Entity headers** — describe the body: `Content-Length`, `Content-Encoding`.

## The Headers You'll Use Every Day

| Header | Direction | Purpose |
|---|---|---|
| `Content-Type` | Both | What the body *is* (`application/json`) |
| `Accept` | Request | What formats the client *will take* |
| `Authorization` | Request | The credentials (Bearer token, Basic) |
| `Cache-Control` | Response | How long the response may be cached |
| `Location` | Response | Where a created resource lives (with 201/3xx) |
| `Set-Cookie` | Response | Hand the client a cookie |
| `Cookie` | Request | The client's stored cookies |
| `User-Agent` | Request | Which client software |
| `Origin` / `Access-Control-Allow-*` | Both | CORS (cross-origin policy) |
| `Retry-After` | Response | When to retry (with 429/503) |

## Content-Type — The Format Agreement

The most important header: **what the body means**.

```http
Content-Type: application/json
```

The media type (`application/json`, `text/html`, `image/png`, `multipart/form-data`) tells the receiver how to parse the bytes. Sending JSON with `Content-Type: text/plain` invites misparsing; sending the wrong type breaks clients that switch on it.

The matching header `Accept` says what the client *wants back*:

```http
Accept: application/json          # "I only want JSON"
Accept: application/json;q=0.9, text/xml;q=0.5   # "JSON preferred, XML acceptable"
```

Content negotiation: the client declares preferences (`Accept`), the server picks, and answers with `Content-Type`. Spring does this automatically with `produces`/`consumes` (and `@RequestMapping(produces = "application/json")`).

## The Code Walkthrough — Headers in Spring

```java
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/courses")
public class CourseController {

    // ---- 1. Reading request headers ----
    @GetMapping("/{id}")
    public CourseDto get(@PathVariable long id,
                         @RequestHeader(value = "X-Tenant-Id", required = false) String tenantId,
                         @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth) {
        // tenantId: multi-tenant routing; auth: the bearer token
        return service.get(id);
    }

    // ---- 2. Setting response headers (with a Location on create) ----
    @PostMapping
    public ResponseEntity<CourseDto> create(@RequestBody @Valid CourseRequest req) {
        CourseDto created = service.create(req);
        return ResponseEntity
                .created(URI.create("/api/courses/" + created.id()))   // Location header
                .header("X-Course-Created-By", currentUser())
                .body(created);
    }

    // ---- 3. Declaring what the endpoint produces/consumes ----
    @GetMapping(value = "/export", produces = "application/json")
    public String export() { return "{\"format\":\"json\"}"; }
}
```

### Walking Through Each Part

**Reading headers** — `@RequestHeader` binds a header to a method parameter: `X-Tenant-Id` for multi-tenant routing, `Authorization` for the token (though in Spring Security you'd use the framework's access, not parse it yourself).

**Setting headers** — `ResponseEntity.created(uri)` sets the `Location` header *and* the 201 status in one call; `.header(...)` adds custom headers. Custom `X-` headers carry app-specific metadata (tenant, correlation id, feature flags).

**`produces`** — declares the response format; Spring sets `Content-Type` and negotiates with the client's `Accept`. (Note: this academy's frontend depends on `Content-Type: application/json` — getting it wrong breaks every client.)

## The Header Chain — Tracing One Request

```
Client                                      Server
  |  GET /api/courses/42                        |
  |  Accept: application/json                   |
  |  Authorization: Bearer eyJ...               |   <- identity
  |  User-Agent: Mozilla/5.0                    |   <- client info
  |  Cookie: session=abc123                     |   <- stored state
  |--------------------------------------------▶|
  |                                             |   authenticate (header)
  |                                             |   fetch course
  |  ◀------------------------------------------|
  |  HTTP/1.1 200 OK                            |
  |  Content-Type: application/json             |   <- body format
  |  Cache-Control: max-age=60                  |   <- caching policy
  |  { "id": 42, "title": "Spring" }            |
```

Every hop reads the envelope before the letter — proxies route on `Host`, caches key on the URL + `Accept`, auth gates on `Authorization`.

## CORS — The Cross-Origin Gate

A browser blocks a page at `https://frontend.example.com` from calling `https://api.example.com` **unless** the server explicitly allows it — that's the **same-origin policy**, and CORS is the exception mechanism:

```http
# Preflight request (OPTIONS):
Origin: https://frontend.example.com
Access-Control-Request-Method: POST

# The server's answer:
Access-Control-Allow-Origin: https://frontend.example.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Headers: Authorization, Content-Type
```

In Spring:

```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins("https://frontend.example.com")   // never "*" with credentials
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("Authorization", "Content-Type");
    }
}
```

**The common failure**: frontend at one origin calls the API at another, and the browser silently blocks the response (CORS errors in the console). The fix is *server-side*: the API must allow the frontend's origin. (This academy's Vercel frontend → Render backend is exactly a cross-origin setup — the API must allow the Vercel origin.)

## Common Beginner Pitfalls

1. **Wrong/missing `Content-Type`** — the body is JSON but the header says `text/plain`; clients misparse or reject.
2. **CORS misconfiguration** — `allowedOrigins("*")` with credentials is invalid; and the frontend origin must be exactly right.
3. **Sending `Authorization` to every origin** — browsers block cross-origin auth unless the server's CORS allows the header.
4. **Sensitive data in custom headers** — headers are visible in proxies and logs; keep secrets in the body/secure channels.
5. **No `Cache-Control`** — responses get cached (or not) by default in unpredictable ways; set the policy explicitly (next lesson).
6. **Case-insensitivity confusion** — header *names* are case-insensitive (`content-type` == `Content-Type`); header *values* usually aren't.

## Key Takeaways

- Headers are the envelope: format, identity, caching, and policy metadata around the body.
- `Content-Type` says what the body is; `Accept` says what the client wants back.
- `Authorization` carries credentials; `Set-Cookie`/`Cookie` carry stored state.
- `Location` + 201 points at the created resource.
- CORS is server-side policy: the API must allow the frontend's origin.
- Set `Cache-Control` explicitly; keep secrets out of headers.
