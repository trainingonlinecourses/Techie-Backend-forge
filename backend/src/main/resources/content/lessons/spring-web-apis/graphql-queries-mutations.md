---
title: GraphQL — Queries, Mutations & Errors
summary: Arguments, pagination, validation, error handling with the GraphQLError contract, and the DataLoader batch pattern for nested fields.
order: 4
minutes: 15
topics: [graphql queries, mutations, graphql errors, dataloader, pagination, batching]
docs:
  - https://docs.spring.io/spring-graphql/reference/
  - https://graphql.org/learn/queries/
---

# GraphQL — Queries, Mutations & Errors

## Arguments and the input discipline

Query arguments come from the schema; complex payloads use **input types** (never graph types — input types can't have resolvers, fields are just data):

```graphql
input OrderFilter { status: OrderStatus, minAmount: BigDecimal, customerId: ID }

type Query { orders(filter: OrderFilter, page: Int = 0, size: Int = 10): OrderConnection! }
```

```java
@QueryMapping
public OrderConnection orders(@Argument OrderFilter filter,
                              @Argument int page, @Argument int size) { ... }
```

**Bean Validation works on input objects too** — validate `@Argument` payloads with `@Valid` and constraint annotations; violations become GraphQL errors automatically (the Spring Core validation lesson applies unchanged).

## Pagination: the connection pattern

GraphQL's idiomatic pagination is the **Relay connection** (edges/nodes/pageInfo) — it's what lets clients page without guessing:

```graphql
type OrderConnection { edges: [OrderEdge!]! pageInfo: PageInfo! }
type OrderEdge { node: Order! cursor: String! }
type PageInfo { hasNextPage: Boolean! hasPreviousPage: Boolean! startCursor: String endCursor: String }
```

```java
@QueryMapping
public OrderConnection orders(@Argument int first, @Argument String after) {
    Page<Order> page = orderService.page(after == null ? 0 : decode(after), first);
    return new OrderConnection(edges(page), new PageInfo(page.hasNext(), ...));
}
```

Offset vs. cursor: connections default to **cursor-based** (stable under concurrent inserts); `first`/`after` are the conventional argument names. Whatever you choose, the connection wrapper makes it explicit — GraphQL clients expect it.

## Error handling: the errors array

GraphQL responses have a fixed shape — `data` and **`errors`** are separate, and partial success is legal:

```json
{
  "data": { "order": null },
  "errors": [{ "message": "Order 42 not found", "path": ["order"], "extensions": { "code": "NOT_FOUND" } }]
}
```

Spring for GraphQL translates exceptions into the errors array:

```java
@ControllerAdvice
public class GraphQlExceptionHandler {
    @ExceptionHandler(NotFoundException.class)
    public GraphQLError handle(NotFoundException ex, DataFetchingEnvironment env) {
        return GraphQLError.newError()
            .errorType(ErrorType.NOT_FOUND)
            .message(ex.getMessage())
            .path(env.getExecutionStepInfo().getPath())
            .extensions(Map.of("code", "NOT_FOUND"))
            .build();
    }
}
```

Production discipline: **every error carries a stable machine-readable `code`** in `extensions` (clients switch on codes, not message strings), and internal exception details (stack traces, SQL text) **never** reach the errors array.

## Mutations: the write contract

- Mutations are resolved **sequentially** (GraphQL runs queries in parallel, mutations in order — that's the spec).
- Mutations should return the affected resource (`createOrder` → `Order!`), so the client gets the result in the same round trip — and the return can be validated by the same schema.
- Idempotency keys work the same as REST: an `idempotencyKey` input, stored with the result, replay-safe.

## The n+1 problem and DataLoader

Nested resolvers fire **per parent item** — a list of 50 orders, each resolving `customer`, issues 51 queries unless you batch:

```java
@Controller
public class CustomerResolver {
    private final DataLoader<Long, Customer> loader;

    @SchemaMapping
    public CompletableFuture<Customer> customer(Order order) {
        return loader.load(order.customerId());   // batched into ONE query per level
    }
}
```

DataLoader coalesces all loads in a tick into a single batch call. In Spring for GraphQL, register a `DataLoader` per batch loader — this single pattern is what separates production GraphQL from demo GraphQL.

## Security and cost control

- **Depth and complexity limits** are mandatory: a malicious query can nest `friends { friends { friends … } }` exponentially. Spring for GraphQL supports `spring.graphql.schema` config plus instrumentation to cap depth/complexity and query cost.
- **Auth per field/query** — `@PreAuthorize` on resolver methods works; so does `@SchemaMapping` security. The JWT filter chain from the security module guards `/graphql` as a whole; method security refines per resolver.

## Key takeaways

- Input types for payloads (validated with `@Valid`), connections for pagination, stable error `code`s in `extensions`.
- Mutations run sequentially and should return the affected resource.
- Batch nested-field resolution with DataLoader — the fix for the n+1 that lazy schema mapping invites.
- Enforce query depth/complexity limits and resolver-level security before going public.

Official docs: [Spring for GraphQL](https://docs.spring.io/spring-graphql/reference/) · [GraphQL queries](https://graphql.org/learn/queries/)
