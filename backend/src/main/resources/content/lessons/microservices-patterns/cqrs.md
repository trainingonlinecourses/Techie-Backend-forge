---
title: CQRS — Command Query Responsibility Segregation
summary: Splitting the write model from the read model — when CQRS earns its complexity, projections, and the scale of the pattern from simple to full event-sourced.
order: 2
minutes: 16
topics: [cqrs, command query segregation, read model, projections, eventual consistency]
docs:
  - https://martinfowler.com/bliki/CQRS.html
  - https://microservices.io/patterns/data/cqrs.html
---

# CQRS — Command Query Responsibility Segregation

## The idea

CQRS separates the **command model** (writes: domain rules, invariants, `PlaceOrder`) from the **read model** (queries: dashboard shapes, search, projections). Not "a service with read and write methods" — *different models, often different storage*:

```
Commands (writes)                     Queries (reads)
┌─────────────────────┐              ┌──────────────────────┐
│ PlaceOrder (domain) │              │ OrderDashboardDto    │
│ invariant-rich      │              │ optimized for screen │
│ one canonical model │──events──▶   │ denormalized, fast   │
└─────────────────────┘              └──────────────────────┘
```

The read side subscribes to events emitted by the write side and builds **projections** — denormalized tables/views shaped exactly for the queries. Write once (the domain model), read many ways (the UI's shapes).

## Why: the real-world motivation

The pain CQRS addresses is real and familiar:

- The domain model is **write-optimized** (normalized, invariants, transactions); dashboards want **read-optimized** shapes (one row per screen, joins precomputed) — forcing both into one model makes both worse.
- A single model couples read performance to write complexity: "why is my dashboard query running the same code that validates orders?"
- Command throughput and query load scale differently — one model can't scale them separately.

CQRS is the answer **when reads and writes genuinely conflict** — not for CRUD with one screen. The pattern's cost: two models to maintain, eventual consistency between them, and event plumbing.

## The spectrum: from tactical to full

CQRS is a spectrum, not a binary:

| Level | What you do | Complexity |
|---|---|---|
| **Tactical (90% of real use)** | separate DTOs/repositories for reads; commands go through the domain; a *view model* built in the query path | low — this is just clean architecture |
| **Separate read storage** | read model = denormalized table (or Elasticsearch/Redis) fed by events | medium — projections + sync |
| **Event-sourced** | the write model is an event log; projections rebuild from it | high — only with event sourcing (next lesson) |

**Start at level 1.** The mistake is jumping to event-sourced CQRS because it's cool — most teams need "separate the read path and denormalize the dashboard", not a new storage architecture.

## Projections: the heart of the read model

```java
// Write side (domain model) publishes events:
// OrderPlaced(orderId, customerId, total, lines...)

// Read side — a listener builds/updates the read model:
@Component
public class OrderReadProjector {

    @EventListener
    void on(OrderPlaced e) {
        orderReadRepo.upsert(new OrderRow(e.orderId(), e.customerId(), e.total(),
            e.lines().stream().map(LineRow::from).toList()));   // one row per dashboard card
    }
}
```

- The read model is **denormalized on purpose** — the query is a single indexed lookup, not a join tree.
- **Replay**: rebuild the read model from the event history (or from the write model) — the projector is the schema of the read side.
- **Eventual consistency**: the write commits, the projection catches up — milliseconds for in-process events, seconds across services. The UI must tolerate it (optimistic display, refresh).

## The classic CQRS query

```java
// BEFORE (one model): the dashboard query walks the domain:
List<Order> orders = orderRepo.findByCustomer(customerId);      // entities, lazy, N+1-prone
return orders.stream().map(OrderDashboardDto::from).toList();   // mapping gymnastics

// AFTER (CQRS): the read model IS the DTO shape:
List<OrderRow> rows = orderReadRepo.findByCustomer(customerId); // one indexed query
return rows;                                                    // done
```

The read model is a **query shape**, not an entity graph — which is exactly the projection/query-methods discipline from the Spring Data module, applied structurally.

## When CQRS pays for itself

| Use CQRS | Don't |
|---|---|
| The dashboard/query shapes differ from the domain model | CRUD with one canonical shape (plain repository suffices) |
| Read load >> write load, scaling separately | Reads are trivially indexable off the write model |
| Multiple read consumers (web, mobile, analytics) | One client, one screen |
| Event-driven architecture already exists (outbox, Kafka) | No event infrastructure — adding CQRS means adding it |

**CQRS without events is just DTO separation** — fine, but not the pattern. CQRS with events but no read/write conflict is ceremony. The trigger is: *your read shapes are fighting your write model*.

## Key takeaways

- CQRS = separate write model (domain rules) from read model (query shapes) — often separate storage, connected by events.
- The read model is denormalized projections, rebuilt from events, eventually consistent.
- The spectrum: DTO-level separation → separate read storage → event-sourced. Start at level 1.
- Use it when read shapes genuinely conflict with the write model; it's ceremony otherwise.

Official docs: [CQRS (Fowler)](https://martinfowler.com/bliki/CQRS.html) · [CQRS (microservices.io)](https://microservices.io/patterns/data/cqrs.html)
