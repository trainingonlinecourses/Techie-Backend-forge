---
title: JPA Projections — Fetch Only What You Need
summary: Interface projections, closed vs open projections, DTO projections with constructor expressions, and why they beat returning full entities for reads.
order: 8
minutes: 17
topics: [projections, dto, interface-projection, constructor-expression, jpql, fetch-strategy]
docs:
  - https://docs.spring.io/spring-data/jpa/reference/repositories/projections.html
  - https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods.html
---

# JPA Projections — Fetch Only What You Need

## The concept: entities are heavy; reads often need less

An `@Entity` carries relationships, lazy proxies, version fields, and auditing columns. A dashboard endpoint that needs `id`, `status`, and `createdAt` for 10,000 orders doesn't need the full entity graph — and **fetching the full graph is the #1 read-performance problem** in Spring Data apps (it's also the root of the N+1 lesson). **Projections** let you select a *subset* of fields — the database returns only those columns, and Hibernate never materializes the full entity.

```text
Full entity:   SELECT o.* FROM orders o           → full rows, lazy proxies alive
Closed proj.:  SELECT o.id, o.status FROM orders o → 3 columns, no entity at all
```

## Interface projections — the Spring Data idiom

```java
public interface OrderSummary {
    Long getId();
    String getStatus();
    Instant getCreatedAt();
}

public interface OrderRepository extends JpaRepository<Order, Long> {
    List<OrderSummary> findSummariesByStatus(String status);   // derived — selects only needed cols
}
```

The repository method returns the interface; Spring Data generates a **proxy implementation** backed by the selected values. **Closed projections** (every property comes from the entity, matching getter names) produce a tight `SELECT` of exactly those columns. That's the big win: the SQL itself changes, not just the Java type.

**Open projections** use SpEL to compute values:

```java
public interface OrderView {
    @Value("#{target.amount.multiply(target.quantity)}")
    BigDecimal getLineTotal();     // computed, not a column — Hibernate can't push this to SQL
}
```

Open projections force a full-entity load (the SpEL needs the target), so they're for *computed* views — use them deliberately, not as the default.

## DTO projections with constructor expressions — the explicit alternative

Interface proxies hide the target type; some teams prefer **plain DTOs** built by JPQL constructor expressions:

```java
public record OrderSummaryDto(Long id, String status, Instant createdAt) {}

public interface OrderRepository extends JpaRepository<Order, Long> {
    @Query("select new com.acme.orders.OrderSummaryDto(o.id, o.status, o.createdAt) " +
           "from Order o where o.status = :status")
    List<OrderSummaryDto> findSummaries(@Param("status") String status);
}
```

- **Pro:** a real record — no proxy magic, trivially serializable, unit-testable, and the query is explicit.
- **Con:** constructor signatures must match the JPQL argument order exactly (a mismatch is a runtime error), and the DTO lives as a class.

The org split is usually: **interface projections for derived queries** (no JPQL to maintain), **DTO projections for complex/custom JPQL** (explicit contract, records).

## Projections with joins and nested data

```java
public interface OrderWithCustomer {
    Long getId();
    String getStatus();
    CustomerView getCustomer();      // nested projection — one SELECT with a join

    interface CustomerView {
        String getName();
        String getEmail();
    }
}

// derived:
List<OrderWithCustomer> findTop100By();
// produces: SELECT o.id, o.status, c.name, c.email FROM orders o JOIN customers c ...
```

Nested projections compose into a single query with joins — the correct fix when you'd otherwise fetch the whole customer graph per order.

## How we use it in an organization: the scenarios

**Scenario 1 — list endpoints (the 90% case).** Every "list orders", "search products", "my tickets" endpoint returns a projection, not entities. The payload is smaller, the SQL is narrower, and lazy-loading surprises disappear (no entity → no proxy → no N+1 from serialization).

**Scenario 2 — export/report queries.** A report selecting 12 of 40 columns over millions of rows — projection keeps the result-set narrow and the query plan simple.

**Scenario 3 — API versioning of shapes.** The entity changes internally; the projection interface stays the contract — the API shape is decoupled from the persistence shape, so renaming a column doesn't break the endpoint.

**Scenario 4 — counting/aggregates that still need shape.** Derived aggregate projections (`countByStatus`) or JPQL `select new ...(o.status, count(o))` group results into typed views instead of `Object[]`.

## Pitfalls

- **Open projections kill the optimization** — every `@Value("#{target...}")` loads the whole entity. Check for accidental open projections in code review.
- **Projection getters must match entity property names** (for closed projections) — `getOrderDate()` when the entity has `orderDate` works; a mismatch silently becomes an open projection (full load) — a subtle perf regression.
- **Don't serialize projections with lazy relations** — the nested projection pattern exists precisely to avoid that; if you *do* fetch a nested entity, join it explicitly.
- **Records vs interfaces** — Spring Data supports records for projections too (constructor-based), with the same closed/open semantics; pick one style per codebase.
- **DTO projection class must be public** and its constructor public — JPQL constructor expressions need visibility.

## Key takeaways

- Projections select a subset: narrower SQL, no entity proxies, no accidental N+1.
- Closed interface projections are the default for reads; open only for computed fields.
- DTO projections (records + constructor expressions) are the explicit alternative for custom JPQL.
- Nested projections produce joined single queries for related data.
- Return projections from list/report endpoints — keep entities for writes and complex domain logic.
