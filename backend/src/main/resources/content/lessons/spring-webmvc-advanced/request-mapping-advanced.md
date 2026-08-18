---
title: Request Mapping in Depth — Path Patterns, Params, Headers and Content Negotiation
summary: @RequestMapping variants, path patterns and variables, params/headers/consumes/produces conditions, and the REST endpoint design rules orgs use.
order: 6
minutes: 17
topics: [requestmapping, path-patterns, path-variables, consumes, produces, headers, params, rest-design]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-requestmapping.html
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-requestmapping-composed.html
---

# Request Mapping in Depth — Path Patterns, Params, Headers and Content Negotiation

## The concept: one annotation, many conditions

`@RequestMapping` (and its shortcuts `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, `@PatchMapping`) maps a handler to a request by matching **multiple conditions at once** — the request must satisfy *all* of them:

1. **HTTP method** — GET/POST/PUT/DELETE/PATCH.
2. **Path** — fixed (`/api/orders`) or patterned (`/api/orders/{id}`).
3. **Params** — required/forbidden query or form params.
4. **Headers** — required header presence/values.
5. **Consumes** — the request's `Content-Type` (what the body format must be).
6. **Produces** — the response's `Accept` (what format the client wants).

A handler matches only when every condition holds. This is content negotiation and routing in one annotation.

## Path patterns and variables

```java
@GetMapping("/api/orders/{orderId}")                        // one variable
public Order getOrder(@PathVariable Long orderId) { ... }

@GetMapping("/api/orders/{orderId}/items/{itemId}")         // multiple
public OrderItem getItem(@PathVariable Long orderId, @PathVariable Long itemId) { ... }

@GetMapping("/api/orders/{orderId:[0-9]+}")                 // regex-constrained variable
public Order getNumericOrder(@PathVariable Long orderId) { ... }

@GetMapping("/files/{path:.*}")                             // catch-all (matches slashes)
public Resource getFile(@PathVariable String path) { ... }
```

Rules teams enforce: `@PathVariable` names match the `{}` names; path variables are **the resource id, never the query** (`/api/orders/123`, not `/api/orders?id=123`); regex constraints reject nonsense early (a `Long` variable with a non-numeric path still 400s on binding, but the regex makes it explicit).

## Consumes / Produces — the negotiation conditions

```java
@PostMapping(path = "/api/upload", consumes = "multipart/form-data")
public UploadResult upload(@RequestParam("file") MultipartFile file) { ... }

@GetMapping(path = "/api/report", produces = {MediaType.APPLICATION_JSON_VALUE,
                                               MediaType.APPLICATION_PDF_VALUE})
public Report report() { ... }   // negotiated by the client's Accept header
```

- `consumes` rejects requests whose body isn't in the listed formats (415 Unsupported Media Type otherwise).
- `produces` picks the handler whose output format matches the client's `Accept` — two handlers on the same path can differ only by `produces` (JSON vs XML vs PDF), and Spring negotiates.

## Params and headers as routing conditions

```java
@GetMapping("/api/search")
public Result search(@RequestParam String q) { ... }

// Same path, different behavior based on a header or param — rarely needed, but available:
@GetMapping(path = "/api/orders", params = "status=shipped")
public List<Order> shippedOnly() { ... }

@GetMapping(path = "/api/orders", headers = "X-API-Version=2")
public List<Order> v2Orders() { ... }
```

Using `params`/`headers` to split handlers on the same path is a tool for versioning headers and special-casing — use sparingly; most teams find explicit paths or a single handler with a branch clearer.

## How we use it in an organization: the design rules

**Rule 1 — resource-oriented paths.** Nouns, not verbs: `/api/orders/{id}/cancel` is a *state change* that many teams model as `POST /api/orders/{id}/cancel` (action endpoint) or a sub-resource; either way the mapping expresses the resource, and the HTTP method expresses the operation.

**Rule 2 — one mapping, one job.** A controller method does one thing; the mapping conditions (path + method + consumes/produces) fully determine it. If a method has branching on "which format", split by `produces`.

**Rule 3 — versioning.** Path versioning (`/api/v2/orders`) is the common org default; header versioning exists but complicates caching and proxies. Pick one and apply it consistently.

**Rule 4 — common prefixes in one controller.** A class-level `@RequestMapping("/api/orders")` plus method-level mappings keeps related endpoints cohesive — the class prefix is joined with the method path.

## Pitfalls

- **Ambiguity = startup failure.** Two handlers matching the same request (same method + path + conditions) throw `IllegalStateException: Ambiguous mapping` at startup — the framework's way of refusing guesswork. Fix by making conditions distinct.
- **Trailing-slash differences** — `/api/orders` vs `/api/orders/` — Spring matches both by default, but proxies and caches treat them differently; pick one canonical form.
- **Path variables need `@PathVariable` names or `-parameters` compilation** — without names, binding fails to resolve.
- **Matrix variables** (`/api/orders;region=eu`) exist but confuse tooling — most orgs ban them in favor of query params.
- **Regex in paths is a URL-encoding minefield** — `[0-9]+` is safe; broad catch-alls like `{path:.*}` swallow everything below them and must be last and deliberate.

## Key takeaways

- A handler matches on method + path + params + headers + consumes + produces — all conditions together.
- `@PathVariable` names and regex constraints keep paths explicit and validated.
- `consumes`/`produces` implement content negotiation at the routing layer.
- Prefer resource-oriented, versioned paths; one mapping does one job.
- Ambiguous mappings fail at startup by design — resolve them, don't suppress them.
