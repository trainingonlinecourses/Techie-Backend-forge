---
title: Java JDBC — Connecting to Databases, Queries, and Transactions
summary: What JDBC is and why it exists, connecting to databases, Statement vs PreparedStatement (why you always use PreparedStatement), transactions with commit/rollback, connection pooling with HikariCP, batch operations, and how Spring JDBC simplifies everything with line-by-line walkthroughs.
order: 36
minutes: 30
topics: [jdbc, connection, prepared-statement, result-set, transactions, connection-pooling, batch-operations, hikaricp]
docs:
  - https://docs.oracle.com/javase/8/docs/technotes/guides/jdbc/
  - https://docs.oracle.com/javase/8/docs/api/java/sql/package-summary.html
---

# Java JDBC — Connecting to Databases, Queries, and Transactions

## What is JDBC?

**JDBC** (Java Database Connectivity) is Java's standard API for talking to databases. It provides a uniform way to connect to any database (PostgreSQL, MySQL, Oracle) and execute SQL queries. Without JDBC, you'd need different code for each database.

**Beginner mental model:** JDBC is like a phone line between your Java program and the database. You dial the number (connect), ask a question (query), and get an answer (ResultSet). The phone company handles the details (different database drivers).

## The JDBC workflow

```
1. Load the driver class
2. Open a connection (DriverManager.getConnection)
3. Create a Statement or PreparedStatement
4. Execute the query (executeQuery for SELECT, executeUpdate for INSERT/UPDATE/DELETE)
5. Process the results (ResultSet)
6. Close everything in reverse order (ResultSet → Statement → Connection)
```

## Connecting to a database


**What this code does — step by step:**

1. Step 1: Register the driver (Java 6+ does this automatically)
2. `Class.forName("org.postgresql.Driver");` — loads the PostgreSQL JDBC driver
3. Step 2: Open a connection
4. `String url = "jdbc:postgresql://localhost:5432/mydb";` — connection URL
5. DriverManager finds the right driver for the URL and creates a connection. The connection represents a session with the database
6. `System.out.println("Connected: " + !conn.isClosed());` — true if connected

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Class.forName("org.postgresql.Driver");

        String url = "jdbc:postgresql://localhost:5432/mydb";
        String user = "postgres";
        String password = "secret";

        Connection conn = DriverManager.getConnection(url, user, password);

        System.out.println("Connected: " + !conn.isClosed());
    }
}
```

## Statement vs PreparedStatement — always use PreparedStatement


**What this code does — step by step:**

1. BAD: Statement — vulnerable to SQL injection!
2. `String userInput = "Alice'; DROP TABLE users; --";` — malicious input!
3. This executes: SELECT * FROM users WHERE name = 'Alice'; DROP TABLE users; --'. It DELETES your entire users table!
4. GOOD: PreparedStatement — parameterized queries, safe from injection
5. `pstmt.setString(1, "Alice");` — first ? = "Alice"
6. `pstmt.setInt(2, 18);` — second ? = 18
7. The database treats ? as a VALUE, not as SQL code. Even if userInput contains SQL, it's treated as a literal string

The same code, clean:

```java
Statement stmt = conn.createStatement();
String userInput = "Alice'; DROP TABLE users; --";
String sql = "SELECT * FROM users WHERE name = '" + userInput + "'";
ResultSet rs = stmt.executeQuery(sql);

String sql = "SELECT * FROM users WHERE name = ? AND age > ?";
PreparedStatement pstmt = conn.prepareStatement(sql);
pstmt.setString(1, "Alice");
pstmt.setInt(2, 18);
ResultSet rs = pstmt.executeQuery();
```

**Line by line for PreparedStatement:**
- `prepareStatement(sql)` — compiles the SQL template with `?` placeholders.
- `setString(1, "Alice")` — sets the first `?` to the string "Alice".
- `setInt(2, 18)` — sets the second `?` to the integer 18.
- `executeQuery()` — sends the compiled SQL with parameters to the database.
- The database safely substitutes the values — no SQL injection possible.

## Reading results with ResultSet


**What this code does — step by step:**

1. Iterate through results
2. `while (rs.next()) {` — rs.next() moves to the next row, returns false when done
3. `int id = rs.getInt("id");` — get column by name
4. You can also get by column index (1-based, not 0-based!)
5. `int id = rs.getInt(1);` — first column
6. `String name = rs.getString(2);` — second column
7. `String email = rs.getString(3);` — third column
8. `int age = rs.getInt(4);` — fourth column
9. Don't forget to close!

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        String sql = "SELECT id, name, email, age FROM users WHERE age > ?";
        PreparedStatement pstmt = conn.prepareStatement(sql);
        pstmt.setInt(1, 18);
        ResultSet rs = pstmt.executeQuery();

        while (rs.next()) {
            int id = rs.getInt("id");
            String name = rs.getString("name");
            String email = rs.getString("email");
            int age = rs.getInt("age");

            System.out.printf("User %d: %s (%s) age %d%n", id, name, email, age);
        }

        while (rs.next()) {
            int id = rs.getInt(1);
            String name = rs.getString(2);
            String email = rs.getString(3);
            int age = rs.getInt(4);
        }

        rs.close();
        pstmt.close();
        conn.close();
    }
}
```

## try-with-resources — automatic cleanup

```java
public class Main {

    public static void main(String[] args) {
        // BAD: manual close — resource leak if exception occurs
        Connection conn = DriverManager.getConnection(url, user, pass);
        PreparedStatement pstmt = conn.prepareStatement("SELECT * FROM users");
        ResultSet rs = pstmt.executeQuery();
        // If an exception occurs here, nothing is closed!

        // GOOD: try-with-resources — auto-closes in reverse order
        try (Connection conn = DriverManager.getConnection(url, user, pass);
             PreparedStatement pstmt = conn.prepareStatement("SELECT * FROM users");
             ResultSet rs = pstmt.executeQuery()) {

            while (rs.next()) {
                System.out.println(rs.getString("name"));
            }
        }  // rs closes first, then pstmt, then conn — AUTOMATICALLY, even on exception
    }
}
```

## INSERT, UPDATE, DELETE — executeUpdate


**What this code does — step by step:**

1. INSERT
2. `int rowsAffected = pstmt.executeUpdate();` — returns number of rows inserted
3. `System.out.println("Inserted " + rowsAffected + " row(s)");` — "Inserted 1 row(s)"
4. UPDATE
5. DELETE

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        String sql = "INSERT INTO users (name, email, age) VALUES (?, ?, ?)";
        try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setString(1, "Alice");
            pstmt.setString(2, "alice@example.com");
            pstmt.setInt(3, 30);

            int rowsAffected = pstmt.executeUpdate();
            System.out.println("Inserted " + rowsAffected + " row(s)");
        }

        String sql = "UPDATE users SET age = ? WHERE name = ?";
        try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setInt(1, 31);
            pstmt.setString(2, "Alice");
            int rowsAffected = pstmt.executeUpdate();
            System.out.println("Updated " + rowsAffected + " row(s)");
        }

        String sql = "DELETE FROM users WHERE id = ?";
        try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setLong(1, 42L);
            int rowsAffected = pstmt.executeUpdate();
            System.out.println("Deleted " + rowsAffected + " row(s)");
        }
    }
}
```

## Transactions — all-or-nothing operations

A **transaction** ensures that a group of operations either ALL succeed or ALL fail. Without transactions, a bank transfer could deduct from one account but fail to add to the other.


**What this code does — step by step:**

1. Transaction: transfer $100 from Account A to Account B
2. `conn.setAutoCommit(false);` — START transaction — disable auto-commit
3. Step 1: deduct from Account A
4. `deduct.setBigDecimal(3, amount);` — check sufficient funds
5. Step 2: add to Account B
6. `conn.commit();` — SUCCESS — both changes are permanent
7. `conn.rollback();` — FAILURE — undo ALL changes
8. `conn.setAutoCommit(true);` — restore default behavior

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Connection conn = DriverManager.getConnection(url, user, pass);
        try {
            conn.setAutoCommit(false);

            PreparedStatement deduct = conn.prepareStatement(
                "UPDATE accounts SET balance = balance - ? WHERE id = ? AND balance >= ?");
            deduct.setBigDecimal(1, amount);
            deduct.setLong(2, fromAccountId);
            deduct.setBigDecimal(3, amount);
            int rows = deduct.executeUpdate();
            if (rows == 0) throw new InsufficientFundsException("Not enough funds");

            PreparedStatement credit = conn.prepareStatement(
                "UPDATE accounts SET balance = balance + ? WHERE id = ?");
            credit.setBigDecimal(1, amount);
            credit.setLong(2, toAccountId);
            credit.executeUpdate();

            conn.commit();
            System.out.println("Transfer complete!");

        } catch (Exception e) {
            conn.rollback();
            System.out.println("Transfer failed — rolled back");
        } finally {
            conn.setAutoCommit(true);
            conn.close();
        }
    }
}
```

## Connection pooling — reusing connections

Creating a database connection is expensive (TCP handshake, authentication, SSL negotiation). A **connection pool** keeps a pool of pre-opened connections and reuses them.


**What this code does — step by step:**

1. WITHOUT pooling: create a new connection for every request (SLOW!)
2. `Connection conn = DriverManager.getConnection(url, user, pass);` — 50-200ms just to connect! ... query ...
3. `conn.close();` — close the connection. Total: 200ms per request
4. WITH HikariCP pooling: reuse a pre-opened connection (FAST!)
5. `config.setMaximumPoolSize(10);` — keep up to 10 connections ready
6. `config.setMinimumIdle(2);` — keep at least 2 idle connections
7. `config.setConnectionTimeout(3000);` — wait up to 3s for a connection
8. `HikariDataSource dataSource = new HikariDataSource(config);` — creates the pool
9. Now every request gets a connection from the pool (1-5ms, not 200ms)
10. `try (Connection conn = dataSource.getConnection()) {` — borrow from pool
11. `}` — conn returns to pool (NOT closed — just returned for reuse!)

The same code, clean:

```java
public User findUser(long id) {
    Connection conn = DriverManager.getConnection(url, user, pass);
    conn.close();
}

HikariConfig config = new HikariConfig();
config.setJdbcUrl("jdbc:postgresql://localhost:5432/mydb");
config.setUsername("postgres");
config.setPassword("secret");
config.setMaximumPoolSize(10);
config.setMinimumIdle(2);
config.setConnectionTimeout(3000);

HikariDataSource dataSource = new HikariDataSource(config);

public User findUser(long id) {
    try (Connection conn = dataSource.getConnection()) {
        PreparedStatement pstmt = conn.prepareStatement("SELECT * FROM users WHERE id = ?");
        pstmt.setLong(1, id);
        ResultSet rs = pstmt.executeQuery();
        if (rs.next()) {
            return new User(rs.getLong("id"), rs.getString("name"), rs.getString("email"));
        }
        return null;
    }
}
```

## Batch operations — processing many rows efficiently


**What this code does — step by step:**

1. BAD: execute one INSERT at a time (1000 inserts = 1000 round trips to database!)
2. `pstmt.executeUpdate();` — sends to database immediately
3. GOOD: batch insert (1000 inserts = 1 round trip!)
4. `conn.setAutoCommit(false);` — start transaction
5. `pstmt.addBatch();` — add to batch buffer (NOT sent yet)
6. `pstmt.executeBatch();` — send ALL inserts in one go
7. `conn.commit();` — commit the transaction. 1000 inserts in ~100ms instead of ~10,000ms!

The same code, clean:

```java
for (User user : users) {
    PreparedStatement pstmt = conn.prepareStatement(
        "INSERT INTO users (name, email) VALUES (?, ?)");
    pstmt.setString(1, user.getName());
    pstmt.setString(2, user.getEmail());
    pstmt.executeUpdate();
}

String sql = "INSERT INTO users (name, email) VALUES (?, ?)";
try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
    conn.setAutoCommit(false);

    for (User user : users) {
        pstmt.setString(1, user.getName());
        pstmt.setString(2, user.getEmail());
        pstmt.addBatch();
    }

    pstmt.executeBatch();
    conn.commit();
}
```

## How we use it in organizations

### Scenario 1: Connection pool configuration for production


**What this code does — step by step:**

1. Production tuning
2. `config.setMaximumPoolSize(20);` — max 20 connections
3. `config.setMinimumIdle(5);` — keep 5 idle connections warm
4. `config.setConnectionTimeout(5000);` — 5s timeout for getting a connection
5. `config.setIdleTimeout(600000);` — close idle connections after 10 min
6. `config.setMaxLifetime(1800000);` — close connections after 30 min

The same code, clean:

```java
@Configuration
public class DatabaseConfig {

    @Bean
    public DataSource dataSource() {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(env.getProperty("spring.datasource.url"));
        config.setUsername(env.getProperty("spring.datasource.username"));
        config.setPassword(env.getProperty("spring.datasource.password"));

        config.setMaximumPoolSize(20);
        config.setMinimumIdle(5);
        config.setConnectionTimeout(5000);
        config.setIdleTimeout(600000);
        config.setMaxLifetime(1800000);
        config.addDataSourceProperty("cachePrepStmts", "true");
        config.addDataSourceProperty("prepStmtCacheSize", "250");

        return new HikariDataSource(config);
    }
}
```

### Scenario 2: Transactional service method

@Service
public class TransferService {

    @Transactional  // Spring handles begin/commit/rollback automatically!
    public void transfer(Long fromId, Long toId, BigDecimal amount) {
        Account from = accountRepository.findById(fromId)
```java
            .orElseThrow(() -> new AccountNotFoundException(fromId));
```
        Account to = accountRepository.findById(toId)
            .orElseThrow(() -> new AccountNotFoundException(toId));

        from.debit(amount);    // might throw InsufficientFundsException
        to.credit(amount);

        accountRepository.save(from);
        accountRepository.save(to);
        // If ANY exception occurs, Spring rolls back EVERYTHING
    }
}

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Using Statement instead of PreparedStatement | SQL injection vulnerability | Always use PreparedStatement with `?` |
| Not using try-with-resources | Connection/statement leaks | Always use try-with-resources |
| Setting autocommit to false and forgetting commit | All changes lost on connection close | Always commit or rollback |
| Creating a new connection per request | 50-200ms overhead per request | Use connection pooling (HikariCP) |
| Not closing ResultSets in finally | Memory leak — ResultSet holds DB cursor | Use try-with-resources |
| Executing individual inserts in a loop | N round trips to database | Use batch operations |

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/)
