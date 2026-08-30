---
title: "Query Methods — From Method Names to Native SQL"
summary: "Derived query methods, JPQL @Query, native SQL, @Modifying, projections, and how organizations build efficient data access layers."
order: 14
minutes: 20
topics: [query-methods, jpql, native-query, @query, projections, derived-queries, spring-data-jpa]
docs:
  - https://docs.spring.io/spring-data/jpa/reference/repositories/query-methods.html
  - https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods.html
---

## The Concept, From Zero

### What are Query Methods?

Spring Data JPA lets you write database queries **just by naming your methods**. No SQL, no JPQL — just a method name that Spring translates into a query:

```java
public interface UserRepository extends JpaRepository<User, Long> {
    
    // Spring generates: SELECT u FROM User u WHERE u.email = :email
    User findByEmail(String email);
    
    // SELECT u FROM User u WHERE u.age > :age
    List<User> findByAgeGreaterThan(int age);
    
    // SELECT u FROM User u WHERE u.name LIKE %:keyword% AND u.active = true
    List<User> findByNameContainingAndActiveTrue(String keyword);
}
```

### Derived Query Methods — Name Patterns

```java
public interface ProductRepository extends JpaRepository<Product, Long> {
    
    // Find by single field
    List<Product> findByName(String name);
    
    // Find by multiple fields
    Product findByNameAndCategory(String name, String category);
    
    // Comparison operators
    List<Product> findByPriceLessThan(double maxPrice);
    List<Product> findByPriceBetween(double min, double max);
    List<Product> findByPriceGreaterThanEqual(double minPrice);
    
    // String patterns
    List<Product> findByNameContaining(String keyword);  // LIKE %keyword%
    List_Product> findByNameStartingWith(String prefix); // LIKE prefix%
    List<Product> findByNameEndingWith(String suffix);    // LIKE %suffix
    List<Product> findByNameLike(String pattern);         // LIKE pattern
    
    // Null checks
    List<Product> findByDescriptionIsNull();
    List<Product> findByDescriptionIsNotNull();
    
    // Ordering
    List<Product> findByPriceAsc();
    List<Product> findByNameOrderByPriceDesc();
    
    // Limiting results
    Product findFirstByOrderByNameAsc();
    List<Product> findTop5ByOrderByPriceDesc();
    Page<Product> findTop10ByCategory(String category, Pageable pageable);
    
    // Existence checks
    boolean existsByEmail(String email);
    boolean existsByNameAndCategory(String name, String category);
    
    // Counting
    long countByCategory(String category);
    long countByActiveTrueAndPriceLessThan(double maxPrice);
    
    // Deleting
    void deleteByActiveFalse();
    long deleteByCategory(String category);
    
    // In clause
    List<Product> findByCategoryIdIn(List<Long> categoryIds);
    
    // Negation
    List<Product> findByNameNot(String name);
}
```

### @Query — JPQL

For complex queries, use JPQL (Java Persistence Query Language):

```java
public interface UserRepository extends JpaRepository<User, Long> {
    
    // JPQL — works with entity names and field names
    @Query("SELECT u FROM User u WHERE u.email = :email")
    User findByEmailJPQL(@Param("email") String email);
    
    // Named parameters
    @Query("SELECT u FROM User u WHERE u.age BETWEEN :min AND :max ORDER BY u.name")
    List<User> findByAgeRange(@Param("min") int min, @Param("max") int max);
    
    // Projections — select specific fields
    @Query("SELECT new com.example.dto.UserSummary(u.id, u.name, u.email) FROM User u WHERE u.active = true")
    List<UserSummary> findActiveUsersSummary();
    
    // Aggregation
    @Query("SELECT u.department, COUNT(u) FROM User u GROUP BY u.department")
    List<Object[]> countByDepartment();
    
    // Joins
    @Query("SELECT DISTINCT u FROM User u JOIN u.orders o WHERE o.total > :minTotal")
    List<User> findUsersWithLargeOrders(@Param("minTotal") BigDecimal minTotal);
    
    // Pagination
    @Query("SELECT u FROM User u WHERE u.name LIKE %:keyword%")
    Page<User> searchByName(@Param("keyword") String keyword, Pageable pageable);
    
    // Sorting
    @Query("SELECT u FROM User u WHERE u.active = true")
    List<User> findActiveUsers(Sort sort);
    
    // EXISTS subquery
    @Query("SELECT CASE WHEN COUNT(u) > 0 THEN true ELSE false END FROM User u WHERE u.email = :email")
    boolean existsByEmailQuery(@Param("email") String email);
}
```

### @Query — Native SQL

For database-specific features, use native SQL:

```java
public interface UserRepository extends JpaRepository<User, Long> {
    
    // Native SQL — works with actual table/column names
    @Query(value = "SELECT * FROM users WHERE email = :email", nativeQuery = true)
    User findByEmailNative(@Param("email") String email);
    
    // Native SQL with projection
    @Query(value = "SELECT id, name, email FROM users WHERE active = 1", nativeQuery = true)
    List<Object[]> findActiveUsersNative();
    
    // Native SQL with complex joins
    @Query(value = """
        SELECT u.*, COUNT(o.id) as order_count
        FROM users u
        LEFT JOIN orders o ON o.user_id = u.id
        GROUP BY u.id
        HAVING COUNT(o.id) > 5
        """, nativeQuery = true)
    List<Object[]> findPowerUsers();
    
    // Update with @Modifying
    @Modifying
    @Query("UPDATE User u SET u.active = false WHERE u.lastLogin < :date")
    int deactivateInactiveUsers(@Param("date") LocalDate cutoff);
    
    // Delete with @Modifying
    @Modifying
    @Query("DELETE FROM User u WHERE u.active = false AND u.createdAt < :date")
    int purgeOldInactiveUsers(@Param("date") LocalDate cutoff);
}
```

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| N+1 query problem | Too many database queries | Use @EntityGraph or JOIN FETCH |
| Missing @Transactional on @Modifying | RuntimeException | Add @Transactional to modifying queries |
| Using native SQL everywhere | Database lock-in | Prefer JPQL when possible |
| Not using projections | Fetching all columns unnecessarily | Use DTOs or interface projections |
| Wrong method name | NoSuchMethodException at startup | Verify the method name pattern |

### Line-by-Line Code Explanation

```java
public interface UserRepository extends JpaRepository<User, Long> {
    // ↑ Extends JpaRepository — provides CRUD operations automatically
    // ↑ Type parameters: <Entity type, ID type>
    // ↑ Spring Data JPA creates the implementation at runtime
    
    // DERIVED QUERY — name becomes the query
    User findByEmail(String email);
    // ↑ "findBy" = query prefix
    // ↑ "Email" = field name on User entity
    // ↑ Generated: SELECT u FROM User u WHERE u.email = :email
    // ↑ Returns single user or null
    
    // COMPLEX DERIVED QUERY
    List<User> findByNameContainingAndActiveTrueOrderByCreatedAtDesc(String keyword);
    // ↑ "find" = query prefix
    // ↑ "ByNameContaining" = WHERE name LIKE %:keyword%
    // ↑ "AndActiveTrue" = AND active = true
    // ↑ "OrderByCreatedAtDesc" = ORDER BY created_at DESC
    // ↑ Returns list of matching users
    
    // JPQL QUERY — for complex logic
    @Query("SELECT u FROM User u WHERE u.age >= :minAge AND u.name LIKE %:name%")
    Page<User> searchUsers(@Param("minAge") int minAge, @Param("name") String name, Pageable pageable);
    // ↑ @Query = custom JPQL query
    // ↑ :minAge, :name = named parameters
    // ↑ Pageable = pagination support (page number, size, sort)
    // ↑ Returns Page<User> with total count + data
    
    // NATIVE SQL — for database-specific features
    @Modifying
    @Transactional
    @Query(value = "UPDATE users SET active = false WHERE last_login < :cutoff", nativeQuery = true)
    int deactivateInactive(@Param("cutoff") LocalDate cutoff);
    // ↑ @Modifying = this is an UPDATE/DELETE, not a SELECT
    // ↑ @Transactional = required for modifying queries
    // ↑ nativeQuery = true = use raw SQL, not JPQL
    // ↑ Returns int = number of rows affected
}
```

### Key Takeaways

1. **Derived queries** — method names become SQL; use `findBy`, `And`, `Or`, `GreaterThan`
2. **@Query JPQL** — for complex joins, aggregations, subqueries
3. **@Query nativeQuery** — for database-specific features
4. **@Modifying** — required for UPDATE/DELETE queries
5. **@Transactional** — required for modifying queries
6. **Projections** — select only the fields you need
7. **Pageable** — built-in pagination support

### Real-World Organization Scenario

An e-commerce platform has 20+ repositories. They use:
- Derived queries for simple lookups (`findByEmail`, `findByStatus`)
- @Query JPQL for complex reports (joins, aggregations)
- Native SQL for PostgreSQL-specific features (JSONB queries, full-text search)
- @Modifying for batch updates (deactivate users, update statuses)

Each query is tested with `@DataJpaTest` and Testcontainers to ensure correctness across environments.
