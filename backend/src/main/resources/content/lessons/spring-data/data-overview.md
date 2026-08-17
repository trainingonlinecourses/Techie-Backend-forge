---
title: Spring Data — Repository Abstractions
summary: The repository pattern across databases — CrudRepository, JpaRepository, the aggregate-root model, and how Spring Data generates implementations at runtime.
order: 1
minutes: 14
topics: [spring data, repository, crudrepository, aggregates, data access]
docs:
  - https://docs.spring.io/spring-data/data-commons/reference/
  - https://docs.spring.io/spring-data/jpa/reference/
---

# Spring Data — Repository Abstractions

## The idea

Spring Data's premise: **data access is mostly the same shape no matter the store** — create, read by id, find by property, page, delete. So define the operations once, and Spring Data generates the implementation at runtime. Swap the store (JPA, MongoDB, Redis, JDBC) and your repository interface mostly stays.

## The repository hierarchy

```
Repository<T, ID>            (marker)
 └─ CrudRepository<T, ID>    save / findById / findAll / count / existsById / deleteById
     └─ PagingAndSortingRepository<T, ID>   findAll(Sort) / findAll(Pageable)
         └─ JpaRepository<T, ID>            flush / saveAndFlush / deleteAllInBatch …
```

```java
public interface OrderRepository extends JpaRepository<Order, Long> { }
// No implementation to write:
orderRepository.save(order);
Optional<Order> o = orderRepository.findById(42L);
List<Order> all = orderRepository.findAll(Sort.by("createdAt").descending());
```

Key facts about generated implementations:

- The proxy is created **at startup** — a misnamed derived query method fails the application boot, not the first request (a feature: your queries are validated early).
- `save()` semantics differ per store: on JPA it's *merge-or-persist* (an entity with a set id is **merged**); on Mongo/Redis it's a straight upsert. Don't assume `save` = insert.
- Every method is transactional by default (`@Transactional(readOnly=true)` on finders) and each repository method runs in its own transaction unless the calling service joins one.

## Aggregates, not tables

Domain-Driven Design's rule, enforced by Spring Data: **a repository belongs to an aggregate root** — the entity that owns consistency boundaries. `Order` is an aggregate (with `OrderLine`s inside it); `OrderLine` is *not* — no `OrderLineRepository`. This keeps invariants in one place:

```java
public class Order {
    private Long id;
    private List<OrderLine> lines;
    public void addLine(Product p, int qty) { lines.add(new OrderLine(p, qty)); } // invariant lives here
    public BigDecimal total() { ... }
}
```

If you find yourself writing `saveOrderLine` and `saveAddress` next to `saveOrder`, you've broken the aggregate — the update should go through `Order` itself.

## Derived queries

Method names become queries (the full catalog is in the next lesson):

```java
List<Order> findByCustomerIdAndStatus(Long customerId, OrderStatus status);
Optional<Order> findFirstByCustomerIdOrderByCreatedAtDesc(Long customerId);
long countByStatus(OrderStatus status);
boolean existsByCustomerId(Long customerId);
```

## Store-specific repositories

The same interface shape across stores:

| Store | Repository base | Entity annotation |
|---|---|---|
| JPA | `JpaRepository` | `@Entity` |
| MongoDB | `MongoRepository` | `@Document` |
| Spring Data JDBC | `CrudRepository` + `@AggregateRoot`-style mapping | plain POJO with `@Id` |
| Redis | `CrudRepository` (hash mapping) | `@RedisHash` |
| R2DBC (reactive) | `ReactiveCrudRepository` | `@Table` |

Business code that depends only on `CrudRepository`-level methods stays portable; store-specific power (paging nuances, transactions) is opt-in per store.

## The repository vs. service boundary

- **Service layer** holds transactions, business rules, and orchestrates multiple repositories.
- **Repository layer** is persistence vocabulary only — no business decisions, no `if` on status codes.
- Don't leak `Page`/`Pageable` or entity classes into controllers when you care about API stability — map to DTOs at the boundary (the capstone module models this).

## Key takeaways

- Declare the interface, get the implementation — validated at startup, transactional by default.
- One repository per **aggregate root**; keep invariants inside the aggregate.
- `save()` semantics differ per store; derived queries cover the 90% case.
- Services own transactions and rules; repositories own persistence vocabulary.

Official docs: [Spring Data Commons](https://docs.spring.io/spring-data/data-commons/reference/) · [Spring Data JPA](https://docs.spring.io/spring-data/jpa/reference/)
