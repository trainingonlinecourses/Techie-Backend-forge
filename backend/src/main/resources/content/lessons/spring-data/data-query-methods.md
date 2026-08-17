---
title: Query Methods — Derived, @Query, Projections & Paging
summary: The full query toolkit — derived queries, JPQL with @Query, native SQL, projections, pagination and sorting, and the performance traps.
order: 2
minutes: 16
topics: [derived queries, jpql, native queries, projections, pagination, sorting]
docs:
  - https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods.html
  - https://docs.spring.io/spring-data/data-commons/reference/repositories/query-methods-details.html
---

# Query Methods — Derived, @Query, Projections & Paging

## 1. Derived queries: naming IS the query

The method name is parsed into a query at startup:

```java
List<Order> findByCustomerIdAndStatusOrderByCreatedAtDesc(Long customerId, OrderStatus status);
List<Order> findByAmountGreaterThan(BigDecimal min);
Optional<Order> findFirstByCustomerIdOrderByCreatedAtDesc(Long customerId);
Page<Order> findByCustomerId(Long customerId, Pageable pageable);   // paging variant
```

Vocabulary: property paths (`findByCustomer_Email`), keywords (`And`, `Or`, `Between`, `LessThan`, `In`, `IsNull`, `Like`, `StartingWith`, `IgnoreCase`), limits (`First`, `Top3`), and `Distinct`. The generated query is **validated at boot** — a typo in the property name fails startup, which is exactly what you want.

Trap: **n+1 by default** — `findAll()` on an `Order` with `List<OrderLine>` issues one query per order for the lines. Derived queries join **only** when you ask: `findAllWithLinesBy...` via `@EntityGraph` (below), or `@Query` with a join fetch.

## 2. @Query: JPQL when naming isn't enough

```java
public interface OrderRepository extends JpaRepository<Order, Long> {

    @Query("select o from Order o where o.amount > :min and o.status = :status")
    List<Order> overAmount(@Param("min") BigDecimal min, @Param("status") OrderStatus status);

    // Update/delete are @Modifying — they bypass the persistence context!
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Order o set o.status = :status where o.createdAt < :cutoff")
    int markStale(@Param("status") OrderStatus status, @Param("cutoff") Instant cutoff);

    // Eager-load the lines in ONE query (kills the n+1):
    @EntityGraph(attributePaths = "lines")
    @Query("select o from Order o where o.id = :id")
    Optional<Order> findWithLines(@Param("id") Long id);
}
```

JPQL operates on **entities and their fields** (not tables/columns), supports joins and subqueries, and is validated at startup like derived queries. `@Modifying` queries must run **inside a transaction** and, because they execute directly against the DB, you typically `clearAutomatically` so the persistence context doesn't serve stale entities afterward.

## 3. Native SQL: the escape hatch

```java
@Query(value = "SELECT * FROM orders WHERE status = :s FOR UPDATE SKIP LOCKED", nativeQuery = true)
List<Order> claimBatch(@Param("s") String status);
```

Use native queries for store-specific power (locking, window functions, dialect features). The cost: **no startup validation** (errors surface at runtime), no portability, and the result maps to objects — verify the column list matches your mapping. Reserve them for what JPQL genuinely can't express.

## 4. Projections: query only what you need

Don't drag 40-column entities for a dropdown. Projections limit the SELECT:

```java
// Interface projection — Spring Data fills it from matching properties:
public interface OrderSummary {
    Long getId();
    String getCustomer();
    BigDecimal getAmount();
}

List<OrderSummary> findSummariesByStatus(OrderStatus status);

// Class projection — a DTO with a matching constructor:
@Query("select new com.app.dto.OrderStats(o.customer, count(o)) from Order o group by o.customer")
List<OrderStats> statsPerCustomer();
```

Projections turn a full-entity query into a narrow one — less data over the wire, less mapping. (The same idea as DTOs at the REST boundary; the capstone applies it end to end.)

## 5. Paging and sorting

```java
Page<Order> page = repo.findByCustomerId(customerId,
    PageRequest.of(0, 20, Sort.by("createdAt").descending()));
page.getTotalElements();  page.getTotalPages();  page.getContent();

// From a controller, accept Pageable directly (Spring resolves ?page=0&size=20&sort=createdAt,desc):
Page<Order> list(Pageable pageable) { return repo.findAll(pageable); }
```

- `Page` = content + total count (an extra COUNT query — use `Slice` when you only need hasNext).
- `Sort.by("createdAt")` — field name, not column. Unsanitized sort strings from clients can reference any mapped field; whitelist sortable columns in real APIs.
- Paging + sorting on **unindexed columns** is a full scan disguised as pagination — verify the execution plan.

## 6. The traps that bite in production

1. **n+1** — lazy collections fetched per row; fix with `@EntityGraph` or join fetch, and prove it with `spring.jpa.show-sql` or a query-count assertion.
2. **Paging on a big table** — deep offsets (`page=100000`) scan everything; use keyset/seek pagination (`WHERE id > :last ORDER BY id LIMIT n`) for real scale.
3. **`@Modifying` without `@Transactional`** — throws; forgetting `clearAutomatically` leaves stale first-level cache.
4. **Fetching entities you only need as DTOs** — profile and project.
5. **COUNT queries per page** — use `Slice` when the total is irrelevant.

## Key takeaways

- Derived queries = boot-validated, zero-SQL for the 90% case; `@Query` JPQL for joins and updates; native only for store-specific power.
- Kill n+1 with `@EntityGraph`/join fetch; narrow the SELECT with projections.
- `Pageable`/`Sort` from controllers with whitelisted sort fields; keyset paging at scale.
- `@Modifying` queries: transactional, `clearAutomatically`, expect DB-direct semantics.

Official docs: [Query Methods](https://docs.spring.io/spring-data/data-commons/reference/repositories/query-methods-details.html) · [JPA Query Methods](https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods.html)
