---
title: Java JDBC — Connecting to Databases, Queries, and Transactions
summary: What JDBC is and why it exists, connecting to databases, Statement vs PreparedStatement (why you always use PreparedStatement), transactions with commit/rollback, connection pooling with HikariCP, batch operations, and how Spring JDBC simplifies everything with line-by-line walkthroughs.
order: 13
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

```java
// Step 1: Register the driver (Java 6+ does this automatically)
Class.forName("org.postgresql.Driver");  // loads the PostgreSQL JDBC driver

// Step 2: Open a connection
String url = "jdbc:postgresql://localhost:5432/mydb";  // connection URL
String user = "postgres";
String password = "secret";

Connection conn = DriverManager.getConnection(url, user, password);
// DriverManager finds the right driver for the URL and creates a connection
// The connection represents a session with the database

System.out.println("Connected: " + !conn.isClosed());  // true if connected
```

## Statement vs PreparedStatement — always use PreparedStatement

```java
// BAD: Statement — vulnerable to SQL injection!
Statement stmt = conn.createStatement();
String userInput = "Alice'; DROP TABLE users; --";  // malicious input!
String sql = "SELECT * FROM users WHERE name = '" + userInput + "'";
ResultSet rs = stmt.executeQuery(sql);
// This executes: SELECT * FROM users WHERE name = 'Alice'; DROP TABLE users; --'
// It DELETES your entire users table!

// GOOD: PreparedStatement — parameterized queries, safe from injection
String sql = "SELECT * FROM users WHERE name = ? AND age > ?";
PreparedStatement pstmt = conn.prepareStatement(sql);
pstmt.setString(1, "Alice");       // first ? = "Alice"
pstmt.setInt(2, 18);              // second ? = 18
ResultSet rs = pstmt.executeQuery();
// The database treats ? as a VALUE, not as SQL code
// Even if userInput contains SQL, it's treated as a literal string
```

**Line by line for PreparedStatement:**
- `prepareStatement(sql)` — compiles the SQL template with `?` placeholders.
- `setString(1, "Alice")` — sets the first `?` to the string "Alice".
- `setInt(2, 18)` — sets the second `?` to the integer 18.
- `executeQuery()` — sends the compiled SQL with parameters to the database.
- The database safely substitutes the values — no SQL injection possible.

## Reading results with ResultSet

```java
String sql = "SELECT id, name, email, age FROM users WHERE age > ?";
PreparedStatement pstmt = conn.prepareStatement(sql);
pstmt.setInt(1, 18);
ResultSet rs = pstmt.executeQuery();

// Iterate through results
while (rs.next()) {                    // rs.next() moves to the next row, returns false when done
    int id = rs.getInt("id");          // get column by name
    String name = rs.getString("name");
    String email = rs.getString("email");
    int age = rs.getInt("age");

    System.out.printf("User %d: %s (%s) age %d%n", id, name, email, age);
}

// You can also get by column index (1-based, not 0-based!)
while (rs.next()) {
    int id = rs.getInt(1);             // first column
    String name = rs.getString(2);     // second column
    String email = rs.getString(3);    // third column
    int age = rs.getInt(4);            // fourth column
}

// Don't forget to close!
rs.close();
pstmt.close();
conn.close();
```

## try-with-resources — automatic cleanup

```java
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
```

## INSERT, UPDATE, DELETE — executeUpdate

```java
// INSERT
String sql = "INSERT INTO users (name, email, age) VALUES (?, ?, ?)";
try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
    pstmt.setString(1, "Alice");
    pstmt.setString(2, "alice@example.com");
    pstmt.setInt(3, 30);

    int rowsAffected = pstmt.executeUpdate();  // returns number of rows inserted
    System.out.println("Inserted " + rowsAffected + " row(s)");  // "Inserted 1 row(s)"
}

// UPDATE
String sql = "UPDATE users SET age = ? WHERE name = ?";
try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
    pstmt.setInt(1, 31);
    pstmt.setString(2, "Alice");
    int rowsAffected = pstmt.executeUpdate();
    System.out.println("Updated " + rowsAffected + " row(s)");
}

// DELETE
String sql = "DELETE FROM users WHERE id = ?";
try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
    pstmt.setLong(1, 42L);
    int rowsAffected = pstmt.executeUpdate();
    System.out.println("Deleted " + rowsAffected + " row(s)");
}
```

## Transactions — all-or-nothing operations

A **transaction** ensures that a group of operations either ALL succeed or ALL fail. Without transactions, a bank transfer could deduct from one account but fail to add to the other.

```java
// Transaction: transfer $100 from Account A to Account B
Connection conn = DriverManager.getConnection(url, user, pass);
try {
    conn.setAutoCommit(false);  // START transaction — disable auto-commit

    // Step 1: deduct from Account A
    PreparedStatement deduct = conn.prepareStatement(
        "UPDATE accounts SET balance = balance - ? WHERE id = ? AND balance >= ?");
    deduct.setBigDecimal(1, amount);
    deduct.setLong(2, fromAccountId);
    deduct.setBigDecimal(3, amount);  // check sufficient funds
    int rows = deduct.executeUpdate();
    if (rows == 0) throw new InsufficientFundsException("Not enough funds");

    // Step 2: add to Account B
    PreparedStatement credit = conn.prepareStatement(
        "UPDATE accounts SET balance = balance + ? WHERE id = ?");
    credit.setBigDecimal(1, amount);
    credit.setLong(2, toAccountId);
    credit.executeUpdate();

    conn.commit();  // SUCCESS — both changes are permanent
    System.out.println("Transfer complete!");

} catch (Exception e) {
    conn.rollback();  // FAILURE — undo ALL changes
    System.out.println("Transfer failed — rolled back");
} finally {
    conn.setAutoCommit(true);  // restore default behavior
    conn.close();
}
```

## Connection pooling — reusing connections

Creating a database connection is expensive (TCP handshake, authentication, SSL negotiation). A **connection pool** keeps a pool of pre-opened connections and reuses them.

```java
// WITHOUT pooling: create a new connection for every request (SLOW!)
public User findUser(long id) {
    Connection conn = DriverManager.getConnection(url, user, pass);  // 50-200ms just to connect!
    // ... query ...
    conn.close();  // close the connection
    // Total: 200ms per request
}

// WITH HikariCP pooling: reuse a pre-opened connection (FAST!)
HikariConfig config = new HikariConfig();
config.setJdbcUrl("jdbc:postgresql://localhost:5432/mydb");
config.setUsername("postgres");
config.setPassword("secret");
config.setMaximumPoolSize(10);       // keep up to 10 connections ready
config.setMinimumIdle(2);            // keep at least 2 idle connections
config.setConnectionTimeout(3000);   // wait up to 3s for a connection

HikariDataSource dataSource = new HikariDataSource(config);  // creates the pool

// Now every request gets a connection from the pool (1-5ms, not 200ms)
public User findUser(long id) {
    try (Connection conn = dataSource.getConnection()) {  // borrow from pool
        PreparedStatement pstmt = conn.prepareStatement("SELECT * FROM users WHERE id = ?");
        pstmt.setLong(1, id);
        ResultSet rs = pstmt.executeQuery();
        if (rs.next()) {
            return new User(rs.getLong("id"), rs.getString("name"), rs.getString("email"));
        }
        return null;
    }  // conn returns to pool (NOT closed — just returned for reuse!)
}
```

## Batch operations — processing many rows efficiently

```java
// BAD: execute one INSERT at a time (1000 inserts = 1000 round trips to database!)
for (User user : users) {
    PreparedStatement pstmt = conn.prepareStatement(
        "INSERT INTO users (name, email) VALUES (?, ?)");
    pstmt.setString(1, user.getName());
    pstmt.setString(2, user.getEmail());
    pstmt.executeUpdate();  // sends to database immediately
}

// GOOD: batch insert (1000 inserts = 1 round trip!)
String sql = "INSERT INTO users (name, email) VALUES (?, ?)";
try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
    conn.setAutoCommit(false);  // start transaction

    for (User user : users) {
        pstmt.setString(1, user.getName());
        pstmt.setString(2, user.getEmail());
        pstmt.addBatch();      // add to batch buffer (NOT sent yet)
    }

    pstmt.executeBatch();      // send ALL inserts in one go
    conn.commit();              // commit the transaction
    // 1000 inserts in ~100ms instead of ~10,000ms!
}
```

## How we use it in organizations

### Scenario 1: Connection pool configuration for production

```java
@Configuration
public class DatabaseConfig {

    @Bean
    public DataSource dataSource() {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(env.getProperty("spring.datasource.url"));
        config.setUsername(env.getProperty("spring.datasource.username"));
        config.setPassword(env.getProperty("spring.datasource.password"));

        // Production tuning
        config.setMaximumPoolSize(20);        // max 20 connections
        config.setMinimumIdle(5);             // keep 5 idle connections warm
        config.setConnectionTimeout(5000);    // 5s timeout for getting a connection
        config.setIdleTimeout(600000);        // close idle connections after 10 min
        config.setMaxLifetime(1800000);       // close connections after 30 min
        config.addDataSourceProperty("cachePrepStmts", "true");
        config.addDataSourceProperty("prepStmtCacheSize", "250");

        return new HikariDataSource(config);
    }
}
```

### Scenario 2: Transactional service method

```java
@Service
public class TransferService {

    @Transactional  // Spring handles begin/commit/rollback automatically!
    public void transfer(Long fromId, Long toId, BigDecimal amount) {
        Account from = accountRepository.findById(fromId)
            .orElseThrow(() -> new AccountNotFoundException(fromId));
        Account to = accountRepository.findById(toId)
            .orElseThrow(() -> new AccountNotFoundException(toId));

        from.debit(amount);    // might throw InsufficientFundsException
        to.credit(amount);

        accountRepository.save(from);
        accountRepository.save(to);
        // If ANY exception occurs, Spring rolls back EVERYTHING
    }
}
```

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Using Statement instead of PreparedStatement | SQL injection vulnerability | Always use PreparedStatement with `?` |
| Not using try-with-resources | Connection/statement leaks | Always use try-with-resources |
| Setting autocommit to false and forgetting commit | All changes lost on connection close | Always commit or rollback |
| Creating a new connection per request | 50-200ms overhead per request | Use connection pooling (HikariCP) |
| Not closing ResultSets in finally | Memory leak — ResultSet holds DB cursor | Use try-with-resources |
| Executing individual inserts in a loop | N round trips to database | Use batch operations |
