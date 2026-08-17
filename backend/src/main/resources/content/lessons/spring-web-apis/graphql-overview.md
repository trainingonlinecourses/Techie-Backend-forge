---
title: GraphQL with Spring for GraphQL
summary: What GraphQL changes versus REST — schema-first design, the query model, and when a graph-shaped API beats REST endpoints.
order: 3
minutes: 14
topics: [graphql, spring for graphql, schema, graphql java, query model]
docs:
  - https://docs.spring.io/spring-graphql/reference/
  - https://graphql.org/learn/
---

# GraphQL with Spring for GraphQL

## What GraphQL actually changes

GraphQL is a **query language for APIs**, defined by a schema. The client asks for exactly the shape it needs in one request:

```graphql
query {
  order(id: 42) {
    id
    customer { name email }      # nested, in one round trip
    lines { product { sku } qty }
    total
  }
}
```

One endpoint (usually `POST /graphql`), no versioning (fields evolve; old queries keep working), and the response mirrors the request shape. The deal with the client is: **you ask, the server gives you precisely that graph** — no under-fetching (n REST calls) and no over-fetching (fat payloads).

## Schema-first

The contract is a **`.graphqls` schema file** — the single source of truth, like OpenAPI but as the runtime type system itself:

```graphql
type Query {
  order(id: ID!): Order
  ordersByCustomer(customerId: ID!, page: Int = 0, size: Int = 20): [Order!]!
}

type Mutation {
  createOrder(input: CreateOrderInput!): Order!
}

type Order {
  id: ID!
  customer: Customer!
  lines: [OrderLine!]!
  total: BigDecimal!
}

type Customer { id: ID!, name: String!, email: String! }
input CreateOrderInput { customerId: ID!, lines: [OrderLineInput!]! }
```

Types are **nullable by default** in GraphQL (`String` allows null; `String!` does not) — a major correctness difference from REST, where "may be null" is implicit. The schema declares what can fail, and clients handle it.

## Wiring resolvers

The schema defines *what*; resolvers define *how*. Spring for GraphQL wires schema types to controller methods:

```java
@Controller
public class OrderGraphController {

    @QueryMapping
    public Order order(@Argument Long id) { return orderService.find(id); }

    @QueryMapping
    public List<Order> ordersByCustomer(@Argument Long customerId,
                                        @Argument int page, @Argument int size) { ... }

    @MutationMapping
    public Order createOrder(@Argument CreateOrderInput input) { ... }
}
```

Nested fields get their own resolvers — the graph is lazily walked:

```java
@Controller
public class OrderLineResolvers {
    @SchemaMapping
    public Product product(OrderLine line) {
        return productService.find(line.productId());  // called only if the client asked for product
    }
}
```

This lazy per-field resolution is the source of both GraphQL's power (cheap nesting) and its risk (**n+1 per field**) — the DataLoader pattern (batch per field) is the standard fix.

## When GraphQL wins (and when it loses)

| GraphQL shines | REST wins |
|---|---|
| Client-driven shapes (mobile/web differ wildly) | Simple, cacheable, CDN-friendly GETs |
| Deep nested graphs (orders → lines → products) | File/streaming downloads, long polls |
| Versionless evolution with many consumers | Tiny CRUD where one resource = one endpoint |
| One round trip for a screen's data | Infra simplicity (HTTP caching, tools, monitoring) |

GraphQL's costs: no HTTP caching out of the box, harder observability (every query is a different shape), a real **query-cost/abuse problem** (a client can nest deeply — depth/query-complexity limits are mandatory in production), and the schema is code you now own.

## Where it fits in a backend

- GraphQL is an **API layer**, not a data layer — it sits in front of the same services/repositories.
- Best as a **BFF** (backend for frontends) or for public APIs with heterogeneous clients; worst as a rewrite of a stable, cacheable REST surface.
- Spring for GraphQL runs on the servlet stack (or WebFlux) and coexists with REST controllers in one app — adopt it incrementally, per context, not all-or-nothing.

## Key takeaways

- Schema-first: the `.graphqls` file is the contract, with explicit nullability.
- `@QueryMapping`/`@MutationMapping`/`@SchemaMapping` wire schema to Java — nested fields resolve lazily.
- One round trip, exact shapes, versionless evolution — but plan for query-depth limits and per-field batching (DataLoader).
- Use it where clients are heterogeneous and graphs are deep; keep REST where caching and simplicity dominate.

Official docs: [Spring for GraphQL](https://docs.spring.io/spring-graphql/reference/) · [GraphQL spec & learn](https://graphql.org/learn/)
