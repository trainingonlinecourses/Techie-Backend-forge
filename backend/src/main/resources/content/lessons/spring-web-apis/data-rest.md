---
title: Spring Data REST
summary: Exposing repositories as hypermedia APIs with zero controllers — when it accelerates a prototype, and the guardrails it needs in production.
order: 7
minutes: 13
topics: [spring data rest, hypermedia, repositories, hal, prototype api]
docs:
  - https://docs.spring.io/spring-data/rest/reference/
---

# Spring Data REST

## What it does

Spring Data REST exposes your **repositories as a REST API** — no controllers, no service code, no DTOs. One dependency + repositories = full CRUD over HTTP, HATEOAS-style:

```xml
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-data-rest</artifactId>
</dependency>
```

```java
public interface OrderRepository extends JpaRepository<Order, Long> { }
```

That repository now answers:

```bash
GET    /orders                  # collection + HAL links + paging (?page=0&size=20&sort=createdAt,desc)
GET    /orders/42               # one order + links to its relations
POST   /orders                  # create (JSON body)
PATCH  /orders/42               # partial update
DELETE /orders/42
GET    /orders/search/…         # derived query methods are exposed under /search
```

Responses are **HAL**: each resource carries `_links` (self, related aggregates, paging) — the client navigates the API instead of hard-coding URLs.

## The config surface

```yaml
spring:
  data:
    rest:
      base-path: /api          # everything under /api/orders…
      default-page-size: 20
      max-page-size: 100       # cap it — the pagination lesson's discipline
      detection-strategy: annotated
```

`detection-strategy: annotated` is the production switch: only repositories marked `@RepositoryRestResource` are exposed (the default exposes every repository — the security-footgun below).

## What it's for (and what it's not)

| Great for | Wrong tool when |
|---|---|
| Admin/internal CRUD backends (fast, zero-boilerplate) | The API is a product — your shape, your validation, your errors |
| Prototypes and internal tools | Business rules live in services (invariants, workflows) |
| BFF-style quick data layers | You need DTOs, versioning, or a stable contract |

The honest take: Spring Data REST is **a prototype/admin accelerator, not a public-API generator**. It exposes your *entity shape* (including fields you'd never put in a public DTO) with repository semantics (no business logic, no service layer). Teams that ship it as the public API typically rebuild it as a proper controller+DTO API within a year.

## The security guardrails (mandatory)

1. **Expose deliberately**: `detection-strategy: annotated` + `@RepositoryRestResource(exported = false)` on internal repositories.
2. **Authorize**: the standard Spring Security filter chain applies — but with no controller methods, `@PreAuthorize` has nowhere to live. Use URL-based rules (`/api/orders/**` → authenticated + role) or repository-level security (`@PreAuthorize` on repository methods works).
3. **Watch the links**: HAL links walk your aggregate graph — `/orders/42/customer` exposes the whole object graph unless you control `@RestResource(exported = false)` on relations you don't want public.
4. **Pagination caps + validation**: `max-page-size`, and Bean Validation on entities (the validation lesson) — the annotations run on `POST`/`PATCH` automatically.
5. **Never expose repositories containing secrets** (user tables with password hashes) — `exported = false` is a security control, not a style choice.

## Patching vs. PUT

Spring Data REST follows HTTP semantics: `PATCH` applies a partial update (missing fields untouched); `PUT` replaces the whole aggregate (missing fields cleared). The PATCH-vs-PUT distinction is where "the API is convenient" hides real footguns — a client sending PUT with a partial body wipes the record. Document it, or constrain to PATCH.

## HATEOAS and the frontend

A HAL client (or the generic `_links` traversal) means the frontend doesn't hard-code URLs: it reads `_links.self`, `_links.orders.customer` from the response. That's the philosophical upside — the API is self-describing. In practice, most teams keep the frontend contract explicit (a typed client from OpenAPI) and use HAL as the admin tool's convenience layer.

## Key takeaways

- One dependency + repositories = full HAL hypermedia CRUD, zero controllers.
- Use it for admin/internal/prototype CRUD; build a real controller+DTO API for public contracts.
- Production guardrails: `detection-strategy: annotated`, `exported = false` on secrets and deep relations, URL-based auth, pagination caps.
- PATCH partial vs PUT replace — document or constrain; HAL links expose the graph unless pruned.

Official docs: [Spring Data REST](https://docs.spring.io/spring-data/rest/reference/)
