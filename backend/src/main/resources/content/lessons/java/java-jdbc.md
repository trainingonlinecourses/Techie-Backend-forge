---
title: JDBC: Talking to Relational Databases
summary: The JDBC contract under every persistence layer — connections, statements, ResultSet, transactions, and why JPA sits on top of it.
order: 16
minutes: 17
topics: [jdbc, datasource, resultset, preparedstatement, transactions, connection-pool]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.sql/java/sql/package-summary.html
  - https://docs.oracle.com/javase/tutorial/jdbc/basics/index.html
---

# JDBC: Talking to Relational Databases

## What JDBC actually is

JDBC (`java.sql`) is the **standard interface** between Java and relational databases. Drivers implement it (`org.postgresql:postgresql`, `com.mysql:mysql-connector-j`). JPA/Hibernate, MyBatis, Spring Data — every persistence framework eventually compiles down to JDBC calls.

## The five objects

| Object | Role |
|---|---|
| `DriverManager` / `DataSource` | Factory for connections (use `DataSource` + a pool) |
| `Connection` | A session: transactions, metadata, statements |
| `Statement` / `PreparedStatement` | A SQL command (`?` placeholders in the prepared form) |
| `ResultSet` | Cursor over returned rows |
| `SQLException` | Checked error carrying vendor error code + SQLState |

## The pattern that never changes

```java
String sql = "SELECT id, name FROM products WHERE price < ?";
try (Connection conn = dataSource.getConnection();           // 1. get
     PreparedStatement ps = conn.prepareStatement(sql);      // 2. prepare
     ResultSet rs = ps.executeQuery()) {                     // 3. execute
    while (rs.next()) {                                      // 4. iterate
        long id = rs.getLong("id");
        String name = rs.getString("name");
    }
} // try-with-resources closes rs, ps, conn — always
```

## The three rules that prevent 90% of JDBC bugs

1. **Always `PreparedStatement`, never string-concatenated SQL** — SQL injection is a direct consequence of concatenation. Parameters bind safely, and the DB can cache the plan.
2. **Always close in `try`-with-resources** — leaked connections exhaust the pool and the app hangs.
3. **Commit/rollback explicitly** — `conn.setAutoCommit(false)`, do the work, `conn.commit()` on success, `conn.rollback()` on failure. `Connection` defaults to auto-commit per statement, which breaks multi-statement atomicity.

## Transactions

```java
try (Connection conn = dataSource.getConnection()) {
    conn.setAutoCommit(false);
    try {
        // multiple statements...
        conn.commit();
    } catch (Exception e) {
        conn.rollback();
        throw e;
    }
}
```

Isolation levels (`conn.setTransactionIsolation`) — `READ_COMMITTED` for most apps, `REPEATABLE_READ`/`SERIALIZABLE` when needed. Read your database's defaults (Postgres = READ COMMITTED).

## Connection pools

You never open raw connections in production — `HikariCP` (Spring Boot's default) holds a pool:

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 10          # rule of thumb: cores*2+1 per instance
      connection-timeout: 30000
      minimum-idle: 2
```

A too-small pool queues requests; too large one wastes Postgres connections (each costs memory/server-side).

## Where this sits with JPA

```
Spring Data JPA (repositories) → Hibernate (ORM) → JDBC → driver → Postgres
```

JPA adds mapping, caching and query building — but the transaction boundary and connection pool are still the JDBC concepts above. When you see `JdbcTemplate` in Spring, it's a thin, safer wrapper over exactly this API.

## Key takeaways

- Prepared statements + try-with-resources + explicit transactions = correctness.
- Use a `DataSource` pool (Hikari) — never `DriverManager` in app code.
- JDBC is the layer beneath every ORM; understanding it explains the framework.

Official docs: [java.sql package](https://docs.oracle.com/en/java/javase/21/docs/api/java.sql/java/sql/package-summary.html) · [JDBC tutorial](https://docs.oracle.com/javase/tutorial/jdbc/basics/index.html)
