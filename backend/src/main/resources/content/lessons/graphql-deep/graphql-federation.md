---
title: GraphQL Federation — One Graph, Many Services
module: graphql-deep
order: 5
minutes: 27
topics: ["federation", "subgraphs", "supergraph", "Apollo", "@key", "distributed GraphQL"]
docs:
  - title: "Apollo Federation"
    url: "https://www.apollographql.com/docs/federation/"
summary: A monolith GraphQL API works until it doesn't: one schema, one team, one deployment — every team's fields ride in the same schema, and adding a fie...
---

# GraphQL Federation — One Graph, Many Services

## The Concept: When One Schema Becomes Too Big

A monolith GraphQL API works until it doesn't: one schema, one team, one deployment — every team's fields ride in the same schema, and adding a field means coordinating with everyone. **Federation** splits the graph across services while presenting **one unified schema** to clients.

The vocabulary:

- **Subgraph** — each service's own schema + resolvers (e.g., the `courses` service, the `users` service, the `progress` service).
- **Supergraph** — the merged, unified schema clients actually query.
- **The router/gateway** — the component that merges subgraphs, routes queries across them, and presents the supergraph.

The promise: **team autonomy with a unified API**. The `courses` team owns `Course` fields; the `progress` team extends `Course` with `completionRate`; clients see one `Course` type with both — and each field resolves in its owning service.

## The Key Mechanism — `@key` and Entity Resolution

Federation's trick is **extending types across services**:

```graphql
# ---- Subgraph A: the courses service (owns Course) ----
type Course @key(fields: "id") {
  id: ID!
  title: String!
  minutes: Int!
}

# ---- Subgraph B: the progress service (extends Course) ----
extend type Course @key(fields: "id") {
  id: ID! @external          # declared here, owned elsewhere
  completionRate: Int        # owned HERE
}
```

Both services agree: a `Course` is identified by `id` (the `@key`). The progress service *extends* `Course` with its own field. When a client asks for `completionRate`, the router sends the `id` to the progress service, which **re-fetches the entity by key** (its `__resolveReference`) and resolves the field.

Think of it as an interface the services share: "any object with an `id` can be extended by my fields." The router stitches the responses.

## The Code Walkthrough — A Subgraph in Spring

```java
// ---- 1. The schema (src/main/resources/graphql/schema.graphqls) ----
// type Course @key(fields: "id") {
//   id: ID!
//   title: String!
//   minutes: Int!
// }
// type Query { courses: [Course!]! }

// ---- 2. Entity reference resolution: the service can rebuild a Course from just its id ----
import org.springframework.graphql.data.method.annotation.SchemaMapping;
import org.springframework.stereotype.Controller;

@Controller
public class CourseReferenceResolver {

    private final CourseService service;

    public CourseReferenceResolver(CourseService service) { this.service = service; }

    // When the router asks this service to resolve a Course by id
    // (because another subgraph referenced it), fetch it:
    @SchemaMapping(typeName = "Course")
    public Course course(Long id) {
        return service.get(id).orElse(null);
    }
}
```

### Walking Through Each Part

**The subgraph schema** — declares `Course` with `@key(fields: "id")`: *"this service identifies courses by id."* The `@key` is the contract other subgraphs use to extend the type.

**`@SchemaMapping` on the entity type** — the reference resolver: given just an `id` (from the router), the service can load the full `Course`. This is how a query routed from another subgraph's fields gets its entity.

**The router's job** — merge the subgraphs into the supergraph, plan queries, fetch from each service, and stitch. The services never talk to each other directly — the router coordinates.

## The Supergraph in Action

```graphql
# Client query (against the supergraph):
{
  courses {            # -> courses subgraph
    title              # -> courses subgraph
    completionRate     # -> progress subgraph (needs the course id)
  }
}
```

The router: asks `courses` service for the courses → gets ids → asks `progress` service to resolve `completionRate` for each id → merges into one response. **The client sees one graph; the work is distributed.**

## Subgraph vs Monolith vs REST-BFF — Choosing

| | Monolith GraphQL | Federation | REST + BFF |
|---|---|---|---|
| One schema for clients | Yes | Yes | No (per-BFF) |
| Team autonomy | No (shared schema) | Yes | Yes |
| Infrastructure | None | Router to operate | BFF to operate |
| Complexity | Lowest | Medium | Medium |
| Best for | Single team, one domain | Multiple teams, many services | Polyglot, legacy |

**The honest advice:** federation pays off when you have **real team boundaries** and multiple services already. A single-service app with federation is ceremony. The migration path: monolith → (when services split) → federation.

## Federation Pitfalls

1. **`@external` misuse** — marking fields external that the service doesn't own confuses the router; the ownership contract must be exact.
2. **Key mismatches** — two subgraphs disagreeing on what identifies a `Course` breaks entity resolution (id vs slug vs uuid).
3. **Circular references across subgraphs** — A extends B, B extends A: resolvable, but the router query plans get hairy; keep the graph acyclic-ish.
4. **Federation without service boundaries** — one team, one deploy unit: monolith GraphQL is simpler.
5. **Router as a new SPOF** — the router must be highly available (it's the front door); deploy it like a gateway.
6. **Versioning in a federated graph** — the supergraph is shared; adding fields is safe, removing them requires coordination across subgraphs.

## Common Beginner Pitfalls

1. **Jumping to federation too early** — a single service doesn't need it; the complexity is real.
2. **Weak `@key` design** — the key is the cross-service identity contract; choose stable, unique identifiers.
3. **No contract tests between subgraphs** — subgraphs evolve independently; a supergraph contract test (query each field, verify shape) catches drift.
4. **Ignoring the router's query cost** — a deep query fanning across N services multiplies latency; monitor router-level performance.
5. **Ownership ambiguity** — "who owns `title`?" must have one answer; documented ownership prevents duplicate/extended conflicts.
6. **Federation tooling mismatch** — Spring GraphQL's federation support must match the router version; pin both.

## Key Takeaways

- Federation = many subgraphs (service-owned schemas) merged into one supergraph by a router.
- `@key` defines cross-service entity identity; `extend type` lets services add fields to shared types.
- Reference resolvers (`__resolveReference`/`@SchemaMapping`) let a service rebuild an entity from its key.
- Clients see one graph; teams keep autonomy over their subgraphs.
- Federation pays off with real team/service boundaries — not for single-service apps.
- Pin tooling versions, test the supergraph contract, and design `@key`s as stable identity.
