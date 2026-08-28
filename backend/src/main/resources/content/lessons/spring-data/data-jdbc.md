---
title: Spring Data JDBC — Complete Beginner's Guide
summary: The aggregate-root-first data access layer explained from scratch — plain SQL, no JPA cache, DDD-style repositories, and how it compares to JPA and plain JdbcTemplate.
order: 5
minutes: 18
topics: [spring data jdbc, jdbctemplate, aggregates, no orm, sql, crud repository]
docs:
  - https://docs.spring.io/spring-data/jdbc/reference/
  - https://docs.spring.io/spring-framework/reference/data-access/jdbc.html
---

# Spring Data JDBC — Complete Beginner's Guide

## The pitch: JPA's repository ergonomics, none of the ORM

If you've used Spring Data JPA, you know the pattern: define an entity, extend `JpaRepository`, and Spring generates the queries. Spring Data JDBC does the same thing — but without the ORM (Object-Relational Mapping) complexity.

**What is ORM?** ORM is a technique that maps Java objects to database tables. JPA (Hibernate) is the most popular ORM in Java. It automatically converts your Java objects to SQL — but this "magic" can cause surprises (hidden queries, lazy loading issues, detached entities).

**Spring Data JDBC takes a different approach:** SQL is the model. What you write is what runs. No surprise join strategies, no lazy loading, no dirty checking. It's like JPA's simpler cousin.

```java
// Spring Data JPA — lots of ORM magic happening behind the scenes
@Entity
public class Order {
    @Id @GeneratedValue
    private Long id;
    
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<OrderLine> lines;  // Lazy loading — surprise queries when you access this!
    
    @ManyToOne
    private Customer customer;  // Another surprise query when you call getCustomer()
}

// Spring Data JDBC — explicit, predictable, no magic
public class Order {
    @Id Long id;                          // Just an ID — no generation strategy
    String customer;                      // Plain field — stored in the ORDER table
    List<OrderLine> lines;                // Children — stored in ORDER_LINE table, loaded eagerly
}
```

## The aggregate-first model — explained from zero

In Domain-Driven Design (DDD), an **aggregate** is a cluster of objects treated as a single unit for data changes. Think of it like a family: the parent (aggregate root) is responsible for all the children. You can't modify a child directly — you go through the parent.

```java
// Order is the AGGREGATE ROOT — the entry point
public class Order {
    @Id Long id;                    // Line 1: The aggregate root's ID
    String customer;                // Line 2: A field on the root
    List<OrderLine> lines;          // Line 3: Children — managed by the aggregate
    
    // Line 4: You MUST go through the root to modify children
    public void addLine(String product, int quantity) {
        this.lines.add(new OrderLine(product, quantity));  // Line 5: Add through the root
    }
    
    // Line 6: Removing a child — it will be deleted from the database
    public void removeLine(String product) {
        this.lines.removeIf(line -> line.product().equals(product));  // Line 7: Remove through root
    }
}

// OrderLine is a CHILD — not an aggregate root
public record OrderLine(String product, int quantity) {}
```

**How Spring Data JDBC persists aggregates:**

When you save an Order aggregate:
1. INSERT or UPDATE the Order row
2. DELETE all existing OrderLine rows for this Order
3. INSERT all current OrderLine rows

```java
// Saving an aggregate — line by line
@Service
public class OrderService {
    private final OrderRepository orderRepo;  // Line 1: Spring Data JDBC repository
    
    public Order addProductToOrder(Long orderId, String product, int qty) {
        Order order = orderRepo.findById(orderId)  // Line 2: Load the ENTIRE aggregate
            .orElseThrow();                         // Line 3: All children loaded too
        
        order.addLine(product, qty);                // Line 4: Modify through the root
        
        return orderRepo.save(order);               // Line 5: Save — all children rewritten
        // Line 6: Spring Data JDBC: DELETE old lines, INSERT new lines
    }
}
```

**Why "delete and re-insert"?** It's simpler than figuring out which children changed, which were added, which were removed. For small aggregates (10-50 children), it's fast. For unbounded lists (millions of events), it's wrong — use a different pattern.

## No lazy loading — everything loads eagerly

```java
// JPA — lazy loading causes surprise queries (the N+1 problem)
Order order = orderRepo.findById(1L);  // 1 query: SELECT * FROM orders WHERE id = 1
List<OrderLine> lines = order.getLines();  // ANOTHER query: SELECT * FROM order_lines WHERE order_id = 1
// If you have 100 orders and access lines for each: 100 queries! (N+1 problem)

// Spring Data JDBC — all children load with the parent
Order order = orderRepo.findById(1L);  // 2 queries: one for Order, one for OrderLines
// No surprise queries — everything is loaded upfront
```

**This is a feature, not a limitation.** You know exactly how many queries execute. No hidden performance problems.

## Repository interface — line by line

```java
// This interface gets full CRUD for free — Spring Data JDBC generates the implementation
@Repository                                           // Line 1: Marks this as a data access bean
public interface OrderRepository 
    extends CrudRepository<Order, Long> {             // Line 2: Extends the base repository
                                                      // Line 3: <Entity, ID type>
    
    // Line 4: Custom query — Spring Data JDBC generates the SQL
    List<Order> findByCustomer(String customer);       // Line 5: SELECT * FROM orders WHERE customer = ?
    
    // Line 6: More complex queries
    List<Order> findByCustomerAndStatus(               // Line 7: Multiple conditions
        String customer, OrderStatus status            // Line 8: Method name = SQL condition
    );                                                 // Line 9: SELECT * FROM orders WHERE customer = ? AND status = ?
    
    // Line 10: Custom SQL if method naming isn't enough
    @Query("SELECT * FROM orders WHERE total > :minTotal")  // Line 11: Native SQL query
    List<Order> findLargeOrders(@Param("minTotal") BigDecimal minTotal);  // Line 12: Parameter binding
}
```

**What you get for free (no implementation needed):**
- `findById(Long id)` — find by primary key
- `findAll()` — get all rows
- `save(Order entity)` — insert or update
- `deleteById(Long id)` — delete by primary key
- `count()` — count rows
- `existsById(Long id)` — check existence

## Comparison: JdbcTemplate vs Spring Data JDBC vs JPA

| Feature | JdbcTemplate | Spring Data JDBC | JPA (Hibernate) |
|---|---|---|---|
| **SQL control** | Full — you write every query | Moderate — method naming + @Query | Low — HQL/JPQL, auto-generated |
| **Object mapping** | Manual — you map ResultSet to objects | Automatic — simple mapping | Automatic — complex mapping |
| **Lazy loading** | No | No (eager by design) | Yes (causes N+1 surprises) |
| **Caching** | No | No | Yes (first-level cache) |
| **Dirty checking** | No | No | Yes (automatic change detection) |
| **Learning curve** | Low | Medium | High |
| **Best for** | Ad-hoc queries, bulk ops | DDD aggregates, simple CRUD | Complex object graphs |

## When to reach for Spring Data JDBC

- **DDD projects** where aggregates are small and consistency boundaries are real
- **SQL-first teams** that distrust ORM magic
- **Simple relational apps** (a few tables, CRUD-shaped)
- When JPA's features (caching, lazy graphs, complex inheritance) are overhead, not value

## When to stay with JPA

- Deep, complex object graphs with inheritance hierarchies
- Heavy read-model flexibility (lazy fetch strategies, DTO projections)
- A codebase already JPA-shaped — mixing stores is a bigger cost

## Real-world scenario — order management

```java
// Entity — the aggregate root
@Entity
@Table(name = "orders")
public class Order {
    @Id
    private Long id;                                    // Line 1: Primary key
    
    @Column(name = "customer_name")
    private String customer;                             // Line 2: Customer name
    
    @Version  // Line 3: Optimistic locking — prevents concurrent modification
    private Long version;                                // Line 4: Version column in DB
    
    private OrderStatus status;                          // Line 5: Enum stored as String
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;                     // Line 6: Timestamp
    
    private List<OrderLine> lines = new ArrayList<>();   // Line 7: Children — separate table
    
    // Line 8: Business method — validates and adds a line
    public void addLine(String product, int quantity, BigDecimal price) {
        if (quantity <= 0) throw new IllegalArgumentException("Quantity must be positive");
        this.lines.add(new OrderLine(product, quantity, price));
    }
}

// Repository — full CRUD + custom queries
@Repository
public interface OrderRepository extends CrudRepository<Order, Long> {
    List<Order> findByStatus(OrderStatus status);           // Line 9: Status filter
    Optional<Order> findByCustomerAndStatus(String c, OrderStatus s);  // Line 10: Multi-field
    long countByStatus(OrderStatus status);                 // Line 11: Count query
}
```

## Key takeaways

- Spring Data JDBC = repository pattern over plain SQL — no persistence context, no lazy loading
- Aggregates are the persistence unit: children load and rewrite with the parent
- Choose it for SQL-first/DDD/simple-relational projects; JPA for deep graphs
- `JdbcTemplate` remains the right tool for raw, ad-hoc SQL
- No surprises — what you write is what runs

**Official docs:** [Spring Data JDBC](https://docs.spring.io/spring-data/jdbc/reference/) · [Spring JDBC](https://docs.spring.io/spring-framework/reference/data-access/jdbc.html)
