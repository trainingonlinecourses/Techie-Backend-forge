---
title: Modular Monolith vs Microservices
summary: The architecture decision most teams get wrong — why a modular monolith is usually the right starting point, and the criteria that justify splitting.
order: 1
minutes: 14
topics: [modular monolith, microservices, architecture, bounded context, monolith first]
docs:
  - https://docs.spring.io/spring-modulith/reference/
  - https://martinfowler.com/bliki/MonolithFirst.html
---

# Modular Monolith vs Microservices

## The false choice

"Monolith vs microservices" is the wrong framing. The real spectrum is:

```
spaghetti monolith ──▶ modular monolith ──▶ microservices
   (one big ball)      (one deployable,      (many deployables,
                       many modules)          many teams)
```

A **modular monolith** is one deployment unit whose *internals* are separated into modules with explicit boundaries and dependencies — the same architectural thinking as microservices, without paying the distributed-systems tax. Most teams should start there.

## Why microservices fail when chosen first

Distributed systems are not "monoliths with extra steps" — they're a different category of difficulty:

| Cost of splitting | What it actually costs |
|---|---|
| Network is not a function call | latency, partial failure, retries, timeouts, idempotency |
| Distributed transactions die | saga choreography, outbox, eventual consistency — the hard patterns |
| Data is split | joins become API calls, consistency becomes a design |
| Ops multiplies | N deploys, N dashboards, N on-call surfaces, N versioned APIs |
| Testing explodes | cross-service tests need orchestration, not MockMvc |
| Teams | *before* Conway's law: 2 services do NOT make 2 teams productive |

Teams that split a monolith into 20 services in year one spend year two on distributed-transaction bugs and year three on consolidation. **MonolithFirst** (Fowler) is the empirical consensus: build the monolith, structure it well, and split only the pieces that *earn* their own service.

## When splitting is actually justified

A service earns its independence when it hits **at least two** of:

1. **Independent scaling** — the payments service needs 20 replicas; the reporting service needs 1. (Deployable-unit scaling with a monolith wastes the other 19.)
2. **Independent deployment cadence** — the risk surface and release cycles genuinely differ (a public API vs. an internal job).
3. **Team autonomy** — 30+ engineers on one codebase, merge conflicts and coordination dominate the work; the organizational boundary *is* the technical boundary (Conway's law, used deliberately).
4. **Isolation requirements** — a hard failure/conformance boundary (PCI, a third-party integration that must not take the app down).

Absent those, the modular monolith gives you 80% of the architecture with 20% of the cost — and **the modules you build inside it are exactly the seams you'd need to split later**.

## The bounded context is the unit

Whether monolithic or distributed, the analysis unit is the **bounded context** (DDD): the area of the domain where a term has one meaning and the model is consistent. `Order` in the *billing* context and `Order` in the *fulfillment* context are different models — sharing one entity class across contexts is how monoliths become spaghetti, and how microservices create coupling through a shared `Common` jar.

Each context owns: its model, its persistence, its rules, its API to the outside. **Explicit boundaries + ownership** is the whole architecture — everything else is deployment topology.

## The migration path

```
1. Identify the bounded contexts (module map).
2. Extract them into modules with a dependency rule (see the Modulith lesson).
3. Remove illegal dependencies — the tooling verifies the boundary.
4. When one module keeps demanding independence → extract to a service,
   with the module boundary as the service boundary, an event for the seam.
```

The beautiful property: **steps 1–3 are exactly the work microservices need anyway**. A well-modularized monolith splits surgically; a spaghetti monolith splits into "distributed spaghetti". Modularity first, distribution only where earned.

## Key takeaways

- The spectrum is spaghetti → modular monolith → microservices; most teams should camp at modular monolith.
- Distribution costs: latency, partial failure, consistency, ops, testing — paid before any benefit lands.
- Split when scaling, cadence, team size, or isolation demand it — two of four, at minimum.
- Bounded contexts are the unit of architecture; shared models across contexts are the root of coupling.
- A modular monolith is the best preparation for (and alternative to) microservices.

Official docs: [Spring Modulith](https://docs.spring.io/spring-modulith/reference/) · [MonolithFirst (Fowler)](https://martinfowler.com/bliki/MonolithFirst.html)
