---
title: Spring Data — The Complete Guide
summary: Spring Data's repository abstraction, JPA repositories, method name query derivation, QueryDSL, auditing, and how to build data access layers that scale from simple CRUD to complex queries. Beginner-friendly with line-by-line code.
order: 2
minutes: 22
topics: [Spring Data, repositories, CRUD, method name queries, QueryDSL, auditing, paging, sorting, projections]
docs:
  - https://spring.io/projects/spring-data-jpa
  - https://docs.spring.io/spring-data/jpa/docs/current/reference/html/
---

# Spring Data — The Complete Guide

## What is Spring Data? (From Zero)

Spring Data is a collection of modules that make database access dramatically simpler. Instead of writing SQL queries for every operation, you **define an interface** and Spring Data generates the implementation for you at runtime.

Think of it like this: instead of writing a letter to your bank every time you want to check your balance, you just ask a question and the bank's system automatically gives you the answer. Spring Data is that system — you ask "find me all orders with status PAID" and it generates the SQL.

### The Repository Hierarchy

```
Repository (marker interface)
  └── CrudRepository (basic CRUD: save, findById, findAll, delete)
       └── PagingAndSortingRepository (adds: Pageable, Sort)
            └── JpaRepository (adds: flush, @Query, batch operations)
                 └── Your Custom Repository (adds domain-specific queries)
```

---

## The Code — Line by Line

### 1. Define a Repository Interface

```java
// You write THIS — Spring Data generates the implementation at runtime:
@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {
    // JpaRepository<Order, Long> means:
    //   Order = the entity type
    //   Long = the ID type (primary key)

    // That's it — you get save(), findById(), findAll(), delete(), count() for FREE!
}
```

**Line-by-line explained:**
- `@Repository` — Marks this as a Spring-managed bean. Also translates exceptions (optional with Spring Boot).
- `extends JpaRepository<Order, Long>` — Inherits CRUD methods. The `Order` is your entity, `Long` is the primary key type.
- **At runtime**, Spring Data generates a proxy class that implements all these methods. You never write a single line of SQL for basic CRUD.

### 2. Method Name Query Derivation

Spring Data can generate queries from **method names**. It parses the method name and translates it to SQL:

```java
@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {

    // Simple property queries:
    List<Order> findByStatus(OrderStatus status);
    // → SELECT * FROM orders WHERE status = ?

    Optional<Order> findByOrderNumber(String orderNumber);
    // → SELECT * FROM orders WHERE order_number = ? LIMIT 1

    // AND conditions:
    List<Order> findByStatusAndCustomerId(OrderStatus status, Long customerId);
    // → SELECT * FROM orders WHERE status = ? AND customer_id = ?

    // OR conditions:
    List<Order> findByStatusOrPriority(OrderStatus status, Priority priority);
    // → SELECT * FROM orders WHERE status = ? OR priority = ?

    // Comparison operators:
    List<Order> findByTotalGreaterThan(BigDecimal amount);
    // → SELECT * FROM orders WHERE total > ?

    List<Order> findByCreatedDateBetween(LocalDateTime start, LocalDateTime end);
    // → SELECT * FROM orders WHERE created_date BETWEEN ? AND ?

    // Pattern matching:
    List<Order> findByCustomerNameContaining(String namePart);
    // → SELECT * FROM orders WHERE customer_name LIKE '%?%'

    List<Order> findByCustomerNameStartingWith(String prefix);
    // → SELECT * FROM orders WHERE customer_name LIKE '?%'

    // Ordering:
    List<Order> findByStatusOrderByCreatedDateDesc(OrderStatus status);
    // → SELECT * FROM orders WHERE status = ? ORDER BY created_date DESC

    // Pagination:
    Page<Order> findByStatus(OrderStatus status, Pageable pageable);
    // → SELECT * FROM orders WHERE status = ? LIMIT ? OFFSET ?

    // Counting:
    long countByStatus(OrderStatus status);
    // → SELECT COUNT(*) FROM orders WHERE status = ?

    // Existence check:
    boolean existsByOrderNumber(String orderNumber);
    // → SELECT COUNT(*) > 0 FROM orders WHERE order_number = ?

    // Delete:
    void deleteByStatus(OrderStatus status);
    // → DELETE FROM orders WHERE status = ?

    // Chained property access (nested objects):
    List<Order> findByCustomerEmail(String email);
    // → SELECT o.* FROM orders o JOIN customers c ON o.customer_id = c.id WHERE c.email = ?
}
```

**Line-by-line explained:**
- Each method name is a **query template**. Spring Data parses the keywords (`findBy`, `And`, `GreaterThan`, etc.) and generates SQL.
- `Optional<Order>` vs `List<Order>` — if the method can return 0 or 1 results, use `Optional`. If it can return multiple, use `List`.
- `Pageable pageable` — adds LIMIT/OFFSET. Call `PageRequest.of(0, 10)` for page 1, 10 items per page.

### 3. Custom @Query (JPQL)

When method names aren't enough, write your own query with `@Query`:

```java
@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {

    // JPQL (Java Persistence Query Language) — works across databases:
    @Query("SELECT o FROM Order o WHERE o.status = :status AND o.total > :minTotal")
    List<Order> findHighValueOrders(@Param("status") OrderStatus status,
                                     @Param("minTotal") BigDecimal minTotal);

    // Native SQL (database-specific):
    @Query(value = "SELECT * FROM orders WHERE total > :minTotal ORDER BY created_date DESC",
           nativeQuery = true)
    List<Order> findLargeOrders(@Param("minTotal") BigDecimal minTotal);

    // Aggregation:
    @Query("SELECT o.status, COUNT(o), SUM(o.total) FROM Order o GROUP BY o.status")
    List<Object[]> getOrderStatsByStatus();

    // Update (requires @Modifying + @Transactional):
    @Modifying
    @Transactional
    @Query("UPDATE Order o SET o.status = :newStatus WHERE o.status = :oldStatus")
    int bulkUpdateStatus(@Param("oldStatus") OrderStatus oldStatus,
                         @Param("newStatus") OrderStatus newStatus);
}
```

**Line-by-line explained:**
- `@Query("SELECT o FROM Order o WHERE...")` — JPQL uses entity/field names, not table/column names. It's portable across databases.
- `nativeQuery = true` — Use raw SQL (PostgreSQL-specific, MySQL-specific, etc.). Less portable but more powerful.
- `@Modifying` — Required for UPDATE/DELETE queries. Without it, Spring treats it as a read query.
- `@Transactional` — Required for write queries. The update runs inside a transaction.

### 4. Pagination and Sorting

```java
// Controller endpoint with pagination:
@GetMapping("/api/orders")
public Page<Order> getOrders(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(defaultValue = "createdDate") String sortBy,
        @RequestParam(defaultValue = "desc") String sortDir) {

    Sort sort = sortDir.equalsIgnoreCase("desc")
        ? Sort.by(sortBy).descending()
        : Sort.by(sortBy).ascending();

    Pageable pageable = PageRequest.of(page, size, sort);

    return orderRepository.findByStatus(OrderStatus.ACTIVE, pageable);
    // Returns: { content: [...], totalElements: 150, totalPages: 8, currentPage: 0 }
}
```

**Line-by-line explained:**
- `PageRequest.of(0, 20, sort)` — Page 0 (first page), 20 items per page, sorted by the specified field.
- `Page<Order>` — Contains the data + metadata (total count, total pages, current page).
- The client can request `?page=2&size=10&sortBy=total&sortDir=asc` to get page 3, 10 items, sorted by total ascending.

---

## Real-World Scenarios

### Scenario 1: E-Commerce Order Search

```java
@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {

    // Find orders by customer email (joins through customer table)
    Page<Order> findByCustomerEmail(String email, Pageable pageable);

    // Find orders in a date range with a minimum total
    @Query("SELECT o FROM Order o WHERE o.createdDate BETWEEN :start AND :end AND o.total >= :minTotal")
    Page<Order> findByDateRangeAndMinTotal(
        @Param("start") LocalDateTime start,
        @Param("end") LocalDateTime end,
        @Param("minTotal") BigDecimal minTotal,
        Pageable pageable);

    // Complex search with multiple optional filters
    @Query("SELECT o FROM Order o WHERE " +
           "(:status IS NULL OR o.status = :status) AND " +
           "(:customerId IS NULL OR o.customer.id = :customerId) AND " +
           "(:minTotal IS NULL OR o.total >= :minTotal)")
    Page<Order> search(@Param("status") OrderStatus status,
                       @Param("customerId") Long customerId,
                       @Param("minTotal") BigDecimal minTotal,
                       Pageable pageable);
}
```

### Scenario 2: Auditing (Created/Updated Timestamps)

```java
@Entity
@EntityListeners(AuditingEntityListener.class)    // Enable auditing for this entity
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @CreatedDate                           // Auto-set on creation
    private LocalDateTime createdAt;

    @LastModifiedDate                      // Auto-set on every update
    private LocalDateTime updatedAt;

    @CreatedBy                             // Auto-set to current user
    private String createdBy;

    @Version                               // Optimistic locking
    private Long version;
}
```

```java
@Configuration
@EnableJpaAuditing                           // Enable auditing globally
public class JpaConfig {
}
```

### Scenario 3: Custom Repository Implementation

```java
// When method names and @Query aren't enough:
public interface OrderRepositoryCustom {
    List<OrderSummary> findOrderSummariesByRegion(String region);
}

// Implementation:
public class OrderRepositoryImpl implements OrderRepositoryCustom {

    @PersistenceContext
    private EntityManager em;

    @Override
    public List<OrderSummary> findOrderSummariesByRegion(String region) {
        return em.createQuery(
            "SELECT new OrderSummary(c.region, COUNT(o), SUM(o.total)) " +
            "FROM Order o JOIN o.customer c " +
            "WHERE c.region = :region " +
            "GROUP BY c.region", OrderSummary.class)
            .setParameter("region", region)
            .getResultList();
    }
}

// Main repository extends both:
@Repository
public interface OrderRepository extends JpaRepository<Order, Long>, OrderRepositoryCustom {
    // Has both standard CRUD + custom methods
}
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| N+1 query problem | Loading related entities causes 1 query per entity | Use `@EntityGraph` or `JOIN FETCH` in @Query |
| No pagination on findAll | Loads ALL records into memory | Always use `Pageable` for list endpoints |
| Forgetting @Transactional on writes | No transaction boundary, data corruption risk | Add `@Transactional` or `@Modifying` |
| Method name typos | Spring Data throws exception at startup | Method names must exactly match entity field names |
| Returning entities from API | Lazy loading issues, circular references | Use DTOs/projections for API responses |

---

## Key Takeaways

- **JpaRepository gives you CRUD for free** — just extend the interface and Spring Data generates the implementation.
- **Method name queries** are powerful for simple cases — `findByStatusAndCustomerId`.
- **@Query for complex cases** — use JPQL for portability, native SQL for performance.
- **Always paginate** — never load all records. Use `Pageable` + `Page<T>`.
- **Auditing is free** — `@CreatedDate`, `@LastModifiedDate`, `@CreatedBy` with `@EnableJpaAuditing`.

Official docs: [Spring Data JPA](https://spring.io/projects/spring-data-jpa) · [Query Methods](https://docs.spring.io/spring-data/jpa/docs/current/reference/html/#repositories.query-methods)
