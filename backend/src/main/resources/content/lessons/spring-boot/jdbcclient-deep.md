---
title: JdbcClient — Modern JDBC (Spring 6.1)
summary: Fluent builder API for SQL queries, named parameters, batch operations, stored procedures, and replacing JdbcTemplate in new projects.
order: 51
minutes: 16
topics: [jdbcclient, jdbc-template, sql, named-parameters, batch-operations, transactions]
docs:
  - https://docs.spring.io/spring-framework/reference/data-access/jdbc/JdbcClient.html
  - https://www.javaguides.net/2024/05/spring-boot-jdbcclient-tutorial.html
---

# Spring JdbcClient — Modern JDBC

## What Is JdbcClient?

**JdbcClient** (introduced in Spring 6.1) is a modern replacement for `JdbcTemplate` that provides a fluent, builder-style API for database operations. It's like `RestClient` but for SQL.

Before JdbcClient, you used `JdbcTemplate`:

```java
// ❌ Old way — JdbcTemplate (verbose)
String name = jdbcTemplate.queryForObject(
    "SELECT name FROM users WHERE id = ?",
    String.class,
    userId
);

List<User> users = jdbcTemplate.query(
    "SELECT * FROM users WHERE age > ?",
    (rs, rowNum) -> new User(rs.getLong("id"), rs.getString("name")),
    18
);
```

```java
// ✅ New way — JdbcClient (clean, fluent)
String name = jdbcClient.sql("SELECT name FROM users WHERE id = ?")
    .param(userId)
    .queryForObject(String.class);

List<User> users = jdbcClient.sql("SELECT * FROM users WHERE age > ?")
    .param(18)
    .query((rs, rowNum) -> new User(rs.getLong("id"), rs.getString("name")));
```

---

## Basic Usage

### Creating JdbcClient

```java
@Configuration
public class DatabaseConfig {

    @Bean
    public JdbcClient jdbcClient(DataSource dataSource) {
        return JdbcClient.create(dataSource);
    }
}
```

### SELECT — Single Row

```java
@Repository
public class UserRepository {

    private final JdbcClient jdbcClient;

    public UserRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    // Find user by ID
    public Optional<User> findById(Long id) {
        return jdbcClient.sql("SELECT * FROM users WHERE id = :id")
            .param("id", id)
            .query((rs, rowNum) -> mapUser(rs))
            .stream()
            .findFirst();
    }

    // Find user by email
    public Optional<User> findByEmail(String email) {
        return jdbcClient.sql("SELECT * FROM users WHERE email = :email")
            .param("email", email)
            .query((rs, rowNum) -> mapUser(rs))
            .stream()
            .findFirst();
    }

    private User mapUser(ResultSet rs) throws SQLException {
        return new User(
            rs.getLong("id"),
            rs.getString("name"),
            rs.getString("email")
        );
    }
}
```

### SELECT — Multiple Rows

```java
// Find all users
public List<User> findAll() {
    return jdbcClient.sql("SELECT * FROM users ORDER BY name")
        .query((rs, rowNum) -> new User(
            rs.getLong("id"),
            rs.getString("name"),
            rs.getString("email")
        ));
}

// Find users with parameters
public List<User> findByAgeGreaterThan(int age) {
    return jdbcClient.sql("SELECT * FROM users WHERE age > :age ORDER BY name")
        .param("age", age)
        .query((rs, rowNum) -> new User(
            rs.getLong("id"),
            rs.getString("name"),
            rs.getString("email")
        ));
}

// Find with pagination
public List<User> findPage(int page, int size) {
    return jdbcClient.sql("SELECT * FROM users ORDER BY id LIMIT :limit OFFSET :offset")
        .param("limit", size)
        .param("offset", page * size)
        .query((rs, rowNum) -> new User(
            rs.getLong("id"),
            rs.getString("name"),
            rs.getString("email")
        ));
}
```

### INSERT

```java
// Insert and return generated key
public Long insert(User user) {
    return jdbcClient.sql("INSERT INTO users (name, email, age) VALUES (:name, :email, :age)")
        .param("name", user.getName())
        .param("email", user.getEmail())
        .param("age", user.getAge())
        .update();  // Returns number of rows affected

    // For generated keys:
    // .sql("INSERT INTO users ...").param(...).update(keyHolder);
}

// Insert multiple users (batch)
public int[] insertBatch(List<User> users) {
    return jdbcClient.sql("INSERT INTO users (name, email) VALUES (:name, :email)")
        .update(users, (ps, user) -> {
            ps.setString(1, user.getName());
            ps.setString(2, user.getEmail());
        });
}
```

### UPDATE and DELETE

```java
// Update user
public int updateUser(Long id, String name, String email) {
    return jdbcClient.sql("UPDATE users SET name = :name, email = :email WHERE id = :id")
        .param("id", id)
        .param("name", name)
        .param("email", email)
        .update();
}

// Delete user
public int deleteUser(Long id) {
    return jdbcClient.sql("DELETE FROM users WHERE id = :id")
        .param("id", id)
        .update();
}
```

---

## Advanced Features

### Named Parameters

```java
// Named parameters make SQL more readable
public List<Order> findOrdersByUserAndStatus(String userId, String status) {
    return jdbcClient.sql("""
        SELECT * FROM orders
        WHERE user_id = :userId
          AND status = :status
        ORDER BY created_at DESC
        """)
        .param("userId", userId)
        .param("status", status)
        .query((rs, rowNum) -> new Order(
            rs.getLong("id"),
            rs.getString("user_id"),
            rs.getBigDecimal("total"),
            rs.getString("status")
        ));
}
```

### Batch Operations

```java
// Batch insert — much faster than individual inserts
public void insertAll(List<User> users) {
    jdbcClient.sql("INSERT INTO users (name, email) VALUES (:name, :email)")
        .update(users, (ps, user) -> {
            ps.setString(1, user.getName());
            ps.setString(2, user.getEmail());
        });
}

// Batch update
public void updateStatus(List<Long> ids, String status) {
    jdbcClient.sql("UPDATE users SET status = :status WHERE id = :id")
        .update(ids, (ps, id) -> {
            ps.setString(1, status);
            ps.setLong(2, id);
        });
}
```

### Stored Procedures

```java
// Call a stored procedure
public String callGetUserStatus(Long userId) {
    return jdbcClient.sql("CALL get_user_status(?)")
        .param(userId)
        .queryForObject(String.class);
}
```

### Transaction Management

```java
@Service
public class TransferService {

    private final JdbcClient jdbcClient;

    @Transactional
    public void transferMoney(Long fromId, Long toId, BigDecimal amount) {
        // Debit sender
        jdbcClient.sql("UPDATE accounts SET balance = balance - :amount WHERE id = :id")
            .param("amount", amount)
            .param("id", fromId)
            .update();

        // Credit receiver
        jdbcClient.sql("UPDATE accounts SET balance = balance + :amount WHERE id = :id")
            .param("amount", amount)
            .param("id", toId)
            .update();

        // If either fails, both are rolled back
    }
}
```

---

## JdbcClient vs JdbcTemplate

| Feature | JdbcTemplate | JdbcClient |
|---------|-------------|------------|
| API Style | Template method | Fluent builder |
| Readability | Verbose | Clean |
| Parameter binding | `?` placeholders | Named `:param` |
| Spring Version | 1.x+ | 6.1+ |
| Recommended | Legacy code | New projects |

---

## In an Organization

### Scenario 1: Reporting Query

```java
@Repository
public class ReportRepository {

    private final JdbcClient jdbcClient;

    public List<SalesReport> getDailySales(LocalDate date) {
        return jdbcClient.sql("""
            SELECT
                p.category,
                COUNT(o.id) as order_count,
                SUM(o.total) as total_revenue
            FROM orders o
            JOIN products p ON o.product_id = p.id
            WHERE DATE(o.created_at) = :date
            GROUP BY p.category
            ORDER BY total_revenue DESC
            """)
            .param("date", date)
            .query((rs, rowNum) -> new SalesReport(
                rs.getString("category"),
                rs.getInt("order_count"),
                rs.getBigDecimal("total_revenue")
            ));
    }
}
```

### Scenario 2: Audit Log

```java
@Repository
public class AuditRepository {

    private final JdbcClient jdbcClient;

    public void logAction(String userId, String action, String details) {
        jdbcClient.sql("""
            INSERT INTO audit_log (user_id, action, details, created_at)
            VALUES (:userId, :action, :details, CURRENT_TIMESTAMP)
            """)
            .param("userId", userId)
            .param("action", action)
            .param("details", details)
            .update();
    }

    public List<AuditEntry> getRecentActivity(int limit) {
        return jdbcClient.sql("""
            SELECT * FROM audit_log
            ORDER BY created_at DESC
            LIMIT :limit
            """)
            .param("limit", limit)
            .query((rs, rowNum) -> new AuditEntry(
                rs.getLong("id"),
                rs.getString("user_id"),
                rs.getString("action"),
                rs.getString("details"),
                rs.getTimestamp("created_at").toLocalDateTime()
            ));
    }
}
```

### Scenario 3: Dynamic Query Building

```java
@Repository
public class SearchRepository {

    private final JdbcClient jdbcClient;

    public List<User> searchUsers(String name, String email, Integer age) {
        StringBuilder sql = new StringBuilder("SELECT * FROM users WHERE 1=1");
        List<Object> params = new ArrayList<>();

        if (name != null) {
            sql.append(" AND name ILIKE :name");
            params.add("%" + name + "%");
        }
        if (email != null) {
            sql.append(" AND email ILIKE :email");
            params.add("%" + email + "%");
        }
        if (age != null) {
            sql.append(" AND age = :age");
            params.add(age);
        }

        sql.append(" ORDER BY name");

        var query = jdbcClient.sql(sql.toString());
        for (int i = 0; i < params.size(); i++) {
            query = query.param("param" + i, params.get(i));
        }

        return query.query((rs, rowNum) -> new User(
            rs.getLong("id"),
            rs.getString("name"),
            rs.getString("email")
        ));
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| SQL injection via string concatenation | Security vulnerability | Always use named parameters `:param` |
| Not closing resources | Memory leaks | JdbcClient handles this automatically |
| Creating JdbcClient per request | Wasteful | Create as a Spring bean, inject it |
| Not using `@Transactional` | Partial updates on failure | Annotate methods that need atomicity |
| Ignoring return values of `update()` | Can't verify success | Check the returned row count |
| Using `queryForObject` for optional data | Throws EmptyResultDataAccessException | Use `query().stream().findFirst()` |
