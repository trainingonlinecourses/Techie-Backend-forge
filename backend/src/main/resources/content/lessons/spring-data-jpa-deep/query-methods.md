---
title: "Query Methods — From Method Names to Native SQL"
summary: "Derived query methods, JPQL @Query, native SQL, @Modifying, projections, and how organizations build efficient data access layers."
order: 12
minutes: 20
topics: [query-methods, jpql, native-query, @query, projections, derived-queries, spring-data-jpa]
docs:
  - https://docs.spring.io/spring-data/jpa/reference/repositories/query-methods.html
  - https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods.html
---

## The Concept, From Zero

### What are Query Methods?

Spring Data JPA lets you write database queries **just by naming your methods**. No SQL, no JPQL — just a method name that Spring translates into a query:

public interface UserRepository extends JpaRepository<User, Long> {
    
    // Spring generates: SELECT u FROM User u WHERE u.email = :email
    User findByEmail(String email);
    
    // SELECT u FROM User u WHERE u.age > :age
    List<User> findByAgeGreaterThan(int age);
    
    // SELECT u FROM User u WHERE u.name LIKE %:keyword% AND u.active = true
    List<User> findByNameContainingAndActiveTrue(String keyword);
}

### Derived Query Methods — Name Patterns


**What this code does — step by step:**

1. Find by single field
2. Find by multiple fields
3. Comparison operators
4. String patterns
5. `List<Product> findByNameContaining(String keyword);` — LIKE %keyword%
6. `List_Product> findByNameStartingWith(String prefix);` — LIKE prefix%
7. `List<Product> findByNameEndingWith(String suffix);` — LIKE %suffix
8. `List<Product> findByNameLike(String pattern);` — LIKE pattern
9. Null checks
10. Ordering
11. Limiting results
12. Existence checks
13. Counting
14. Deleting
15. In clause
16. Negation

The same code, clean:

```java
public interface ProductRepository extends JpaRepository<Product, Long> {

    List<Product> findByName(String name);

    Product findByNameAndCategory(String name, String category);

    List<Product> findByPriceLessThan(double maxPrice);
    List<Product> findByPriceBetween(double min, double max);
    List<Product> findByPriceGreaterThanEqual(double minPrice);

    List<Product> findByNameContaining(String keyword);
    List_Product> findByNameStartingWith(String prefix);
    List<Product> findByNameEndingWith(String suffix);
    List<Product> findByNameLike(String pattern);

    List<Product> findByDescriptionIsNull();
    List<Product> findByDescriptionIsNotNull();

    List<Product> findByPriceAsc();
    List<Product> findByNameOrderByPriceDesc();

    Product findFirstByOrderByNameAsc();
    List<Product> findTop5ByOrderByPriceDesc();
    Page<Product> findTop10ByCategory(String category, Pageable pageable);

    boolean existsByEmail(String email);
    boolean existsByNameAndCategory(String name, String category);

    long countByCategory(String category);
    long countByActiveTrueAndPriceLessThan(double maxPrice);

    void deleteByActiveFalse();
    long deleteByCategory(String category);

    List<Product> findByCategoryIdIn(List<Long> categoryIds);

    List<Product> findByNameNot(String name);
}
```

### @Query — JPQL

For complex queries, use JPQL (Java Persistence Query Language):


**What this code does — step by step:**

1. JPQL — works with entity names and field names
2. Named parameters
3. Projections — select specific fields
4. Aggregation
5. Joins
6. Pagination
7. Sorting
8. EXISTS subquery

The same code, clean:

```java
public interface UserRepository extends JpaRepository<User, Long> {

    @Query("SELECT u FROM User u WHERE u.email = :email")
    User findByEmailJPQL(@Param("email") String email);

    @Query("SELECT u FROM User u WHERE u.age BETWEEN :min AND :max ORDER BY u.name")
    List<User> findByAgeRange(@Param("min") int min, @Param("max") int max);

    @Query("SELECT new com.example.dto.UserSummary(u.id, u.name, u.email) FROM User u WHERE u.active = true")
    List<UserSummary> findActiveUsersSummary();

    @Query("SELECT u.department, COUNT(u) FROM User u GROUP BY u.department")
    List<Object[]> countByDepartment();

    @Query("SELECT DISTINCT u FROM User u JOIN u.orders o WHERE o.total > :minTotal")
    List<User> findUsersWithLargeOrders(@Param("minTotal") BigDecimal minTotal);

    @Query("SELECT u FROM User u WHERE u.name LIKE %:keyword%")
    Page<User> searchByName(@Param("keyword") String keyword, Pageable pageable);

    @Query("SELECT u FROM User u WHERE u.active = true")
    List<User> findActiveUsers(Sort sort);

    @Query("SELECT CASE WHEN COUNT(u) > 0 THEN true ELSE false END FROM User u WHERE u.email = :email")
    boolean existsByEmailQuery(@Param("email") String email);
}
```

### @Query — Native SQL

For database-specific features, use native SQL:


**What this code does — step by step:**

1. Native SQL — works with actual table/column names
2. Native SQL with projection
3. Native SQL with complex joins
4. Update with @Modifying
5. Delete with @Modifying

The same code, clean:

```java
public interface UserRepository extends JpaRepository<User, Long> {

    @Query(value = "SELECT * FROM users WHERE email = :email", nativeQuery = true)
    User findByEmailNative(@Param("email") String email);

    @Query(value = "SELECT id, name, email FROM users WHERE active = 1", nativeQuery = true)
    List<Object[]> findActiveUsersNative();

    @Query(value = """
        SELECT u.*, COUNT(o.id) as order_count
        FROM users u
        LEFT JOIN orders o ON o.user_id = u.id
        GROUP BY u.id
        HAVING COUNT(o.id) > 5
        """, nativeQuery = true)
    List<Object[]> findPowerUsers();

    @Modifying
    @Query("UPDATE User u SET u.active = false WHERE u.lastLogin < :date")
    int deactivateInactiveUsers(@Param("date") LocalDate cutoff);

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


**What this code does — step by step:**

1. ↑ Extends JpaRepository — provides CRUD operations automatically. ↑ Type parameters: <Entity type, ID type>. ↑ Spring Data JPA creates the implementation at runtime
2. DERIVED QUERY — name becomes the query
3. ↑ "findBy" = query prefix. ↑ "Email" = field name on User entity. ↑ Generated: SELECT u FROM User u WHERE u.email = :email. ↑ Returns single user or null
4. COMPLEX DERIVED QUERY
5. ↑ "find" = query prefix. ↑ "ByNameContaining" = WHERE name LIKE %:keyword%. ↑ "AndActiveTrue" = AND active = true. ↑ "OrderByCreatedAtDesc" = ORDER BY created_at DESC. ↑ Returns list of matching users
6. JPQL QUERY — for complex logic
7. ↑ @Query = custom JPQL query. ↑ :minAge, :name = named parameters. ↑ Pageable = pagination support (page number, size, sort). ↑ Returns Page<User> with total count + data
8. NATIVE SQL — for database-specific features
9. ↑ @Modifying = this is an UPDATE/DELETE, not a SELECT. ↑ @Transactional = required for modifying queries. ↑ nativeQuery = true = use raw SQL, not JPQL. ↑ Returns int = number of rows affected

The same code, clean:

```java
public interface UserRepository extends JpaRepository<User, Long> {

    User findByEmail(String email);

    List<User> findByNameContainingAndActiveTrueOrderByCreatedAtDesc(String keyword);

    @Query("SELECT u FROM User u WHERE u.age >= :minAge AND u.name LIKE %:name%")
    Page<User> searchUsers(@Param("minAge") int minAge, @Param("name") String name, Pageable pageable);

    @Modifying
    @Transactional
    @Query(value = "UPDATE users SET active = false WHERE last_login < :cutoff", nativeQuery = true)
    int deactivateInactive(@Param("cutoff") LocalDate cutoff);
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

