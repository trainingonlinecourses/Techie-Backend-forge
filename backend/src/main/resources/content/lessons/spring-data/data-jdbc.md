---
title: Spring Data JDBC
summary: The aggregate-root-first data access layer — plain SQL, no JPA cache, DDD-style repositories, and how it compares to JPA and plain JdbcTemplate.
order: 5
minutes: 14
topics: [spring data jdbc, jdbctemplate, aggregates, no orm, sql]
docs:
  - https://docs.spring.io/spring-data/jdbc/reference/
  - https://docs.spring.io/spring-framework/reference/data-access/jdbc.html
---

# Spring Data JDBC

## The pitch: JPA's repository ergonomics, none of the ORM

Spring Data JDBC keeps the **repository pattern** (the interfaces you already know from JPA) but drops the entity manager, the first-level cache, lazy loading and dirty checking. **SQL is the model.** What you write is what runs — no surprise join strategies, no detached-entity pitfalls, no n+1 generated behind your back.

```java
public class Order {
    @Id Long id;
    String customer;
    List<OrderLine> lines;      // children are stored in their own table, managed by the aggregate
}

public interface OrderRepository extends CrudRepository<Order, Long> {
    List<Order> findByCustomer(String customer);
}
```

That's it — `OrderRepository` gets full CRUD over plain JDBC, and Spring Data JDBC manages the `ORDER` ↔ `ORDER_LINE` relationship as **one aggregate** (insert parent + children together, delete children when they vanish from the list).

## The aggregate-first model

Spring Data JDBC is built around **aggregates as persistence units**:

- Saving an aggregate rewrites it: children are **deleted and re-inserted** on change (simpler, no diffing — and fine at aggregate sizes; wrong for "append to an unbounded list" designs).
- No lazy loading: when you load an aggregate, **its children load with it** (one query for the aggregate, one per child table — by design, and *documented*, unlike JPA's surprise n+1).
- No detached entities: there's no persistence context, so an entity fetched in one method can't silently mutate in another. Changes must go through the repository — which is exactly the DDD discipline the data-overview lesson preached.

## When to reach for it

- **DDD projects** where aggregates are small and consistency boundaries are real — Spring Data JDBC *enforces* the model instead of tempting you to leak it.
- **SQL-first teams** that distrust ORM magic: the SQL is explicit, the mapping is thin, performance is predictable.
- **Simple relational apps** (a few tables, CRUD-shaped) where JPA's features (caching, lazy graphs, complex inheritance) are overhead, not value.
- When the JPA-first module's lessons (entity graphs, optimistic locking, `@Modifying` semantics) feel like complexity you don't need — JDBC removes the whole category.

## When to stay with JPA

- Deep, complex object graphs with inheritance hierarchies — JPA's mapping machinery earns its keep.
- Heavy read-model flexibility (lazy fetch strategies, DTO projections with joins) — JPA's query space is richer.
- A codebase already JPA-shaped: mixing stores per-module is a bigger cost than either choice alone.

## The JDBC family: three tiers

| Tool | Level | Use |
|---|---|---|
| `JdbcTemplate` | raw SQL, manual mapping | one-off queries, bulk ops, stored procs |
| `NamedParameterJdbcTemplate` | named params (`:id`), manual mapping | readable SQL, dynamic filters |
| Spring Data JDBC | repository + mapping | the default for new aggregate CRUD |

```java
jdbc.query("SELECT id, customer FROM orders WHERE status = :status",
    Map.of("status", status.name()),
    (rs, i) -> new Order(rs.getLong("id"), rs.getString("customer")));
```

`JdbcTemplate` stays the right tool when you want SQL and a result list with zero ceremony — Spring Data JDBC is the layer above it for domain-shaped data.

## Practical notes

- **Transactions** — same `@Transactional` as always; the repository methods participate in the caller's transaction.
- **Auditing** — `@CreatedDate`/`@LastModifiedDate` with `@EnableJdbcAuditing` (same annotations as JPA).
- **Concurrency** — `@Version` gives optimistic locking, mapped to a version column.
- **Testing** — repository tests run against the real database (Testcontainers lesson); there's no H2-compatibility layer to paper over differences.

## Key takeaways

- Spring Data JDBC = repository pattern over plain SQL — no persistence context, no lazy loading, no dirty checking.
- Aggregates are the persistence unit: children load and rewrite with the parent; changes go through the repository.
- Choose it for SQL-first/DDD/simple-relational projects; JPA for deep graphs and rich query space.
- `JdbcTemplate` remains the right tool for raw, ad-hoc SQL.

Official docs: [Spring Data JDBC](https://docs.spring.io/spring-data/jdbc/reference/) · [Spring JDBC](https://docs.spring.io/spring-framework/reference/data-access/jdbc.html)
