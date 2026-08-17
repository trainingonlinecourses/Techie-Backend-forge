---
title: Spring HATEOAS — Hypermedia APIs
summary: Linking resources so clients navigate the API — EntityModel/CollectionModel, link builders, and the affordances that make an API self-describing.
order: 8
minutes: 13
topics: [hateoas, hypermedia, entitymodel, link builder, rest api design]
docs:
  - https://docs.spring.io/spring-hateoas/reference/
  - https://spring.io/projects/spring-hateoas
---

# Spring HATEOAS — Hypermedia APIs

## The idea: the response tells you where to go

A plain JSON API hard-codes navigation in clients ("to get the customer, call `/customers/{id}`"). **Hypermedia** (HATEOAS) puts the navigation *in the response* — every resource carries links to what you can do next, and the client follows them:

```json
{
  "id": 42, "total": 19.98, "status": "PENDING",
  "_links": {
    "self": { "href": "/orders/42" },
    "customer": { "href": "/customers/7" },
    "payment": { "href": "/orders/42/payment" },
    "cancel": { "href": "/orders/42/cancel", "method": "POST" }
  }
}
```

The links are **affordances**: what the caller may do *now* (a PENDING order has `cancel`; a SHIPPED one doesn't). The client discovers capabilities instead of knowing them.

## Building links with Spring HATEOAS

```java
@RestController
@RequestMapping("/orders")
public class OrderController {

    @GetMapping("/{id}")
    public EntityModel<OrderDto> get(@PathVariable long id) {
        OrderDto dto = orderService.find(id);

        return EntityModel.of(dto,
            linkTo(methodOn(OrderController.class).get(id)).withSelfRel(),
            linkTo(methodOn(CustomerController.class).get(dto.customerId())).withRel("customer"),
            dto.status() == PENDING
                ? linkTo(methodOn(OrderController.class).cancel(id)).withRel("cancel")
                : null);
    }
}
```

- **`EntityModel<T>`** — one resource + its links; **`CollectionModel<T>`** — a collection + pagination links.
- **`linkTo(methodOn(...))`** is the safety net: links are built from the controller's mappings, so renaming a path or a method updates every link automatically — no string URLs to rot.
- **Conditional links** (`cancel` only when PENDING) are the HATEOAS payoff: the response *is* the state machine.

## Affordances vs. hard-coded clients

```java
// "Hypermedia as the engine of application state" (HATEOAS, Fielding):
// the client asks "what may I do?" and the server answers with links.

// The honest middle ground — most teams:
// 1. Links for navigation (self, related aggregates) — followed by the client.
// 2. Links for *actions* as a contract signal — the client still knows the workflow,
//    but the server controls when it's available (conditional affordances).
```

Pure HATEOAS (clients that know *nothing* about the API shape) is elegant and rarely achieved in practice; the pragmatic value is **navigation links that can't rot** + **state-conditional actions**.

## Pagination with CollectionModel

```java
@GetMapping
public CollectionModel<OrderDto> list(Pageable pageable) {
    Page<OrderDto> page = orderService.page(pageable);

    return CollectionModel.of(page.getContent(),
        linkTo(methodOn(OrderController.class).list(pageable)).withSelfRel(),
        page.hasPrevious() ? linkTo(methodOn(OrderController.class)
            .list(pageable.previousOrFirst())).withRel("prev") : null,
        page.hasNext() ? linkTo(methodOn(OrderController.class)
            .list(pageable.next())).withRel("next") : null);
}
```

The paging links (`prev`/`next`) are the same idea as the OpenAPI pagination conventions — expressed as navigable links the client just follows.

## The production decisions

1. **Keep links out of the domain** — links belong in the web layer (controllers), never in services/entities; DTOs carry them, not entities (the DTO discipline applies to links too).
2. **Stable relation names** — `self`, `customer`, `cancel` are part of your contract; version them like any API field.
3. **Links need auth context** — an unauthenticated response shouldn't link `cancel` (that's a security affordance: don't advertise actions the caller can't perform).
4. **HATEOAS + OpenAPI** — springdoc documents `_links` schemas; keep the generated contract aligned so typed clients and hypermedia agree.

## When it's worth it

| Use HATEOAS | Skip it |
|---|---|
| Workflow-rich APIs (orders, bookings — states + actions) | Simple CRUD (the links add noise; clients hard-code anyway) |
| Clients you control but want navigation that can't rot | Internal BFFs with typed generated clients |
| Admin tools / machine clients that benefit from discovery | Hypermedia as dogma — links no one follows are decoration |

The test of good HATEOAS: **every link a client actually uses, and every action the state allows** — if the response carries a link the client never follows, it's JSON noise; if the state allows an action the response doesn't advertise, the API is lying.

## Key takeaways

- HATEOAS = navigation and capabilities *in the response*: `EntityModel` + `_links`, conditional on state.
- `linkTo(methodOn(...))` builds links from mappings — rename-proof, no string URLs.
- Paging links (`prev`/`next`), state-conditional actions (`cancel`), auth-aware affordances.
- Keep links in the web layer, give them stable names, document with OpenAPI — and only add links clients use.

Official docs: [Spring HATEOAS](https://docs.spring.io/spring-hateoas/reference/)
