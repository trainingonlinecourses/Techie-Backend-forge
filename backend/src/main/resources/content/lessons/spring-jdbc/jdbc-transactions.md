---
title: Transactions With JdbcTemplate
module: spring-jdbc
order: 4
minutes: 20
topics: ["@Transactional", "TransactionTemplate", "programmatic transactions", "savepoints", "connection propagation"]
docs:
  - title: "Transaction management"
    url: "https://docs.spring.io/spring-framework/reference/data-access/transaction.html"
summary: JdbcTemplate doesn't manage transactions itself — Spring's transaction infrastructure does, and the template joins whatever transaction is active. ...
---

# Transactions With JdbcTemplate

JdbcTemplate doesn't manage transactions itself — Spring's transaction infrastructure does, and the template joins whatever transaction is active. This lesson covers declarative (`@Transactional`) and programmatic (`TransactionTemplate`) transaction control with raw JDBC, including the connection-propagation details that trip people up.

## How It Works: The Same Connection

The magic of Spring + JDBC transactions:

```
@Transactional starts → TransactionSynchronizationManager
  → binds ONE Connection to the current thread
  → JdbcTemplate.getConnection() returns THAT connection
  → all queries/updates run on it
  → commit/rollback on method exit
```

Every template call inside the method uses the same transactional connection — that's what makes the whole method atomic.

## Declarative: @Transactional

```java
@Service
public class CourseService {

    private final JdbcTemplate jdbcTemplate;

    @Transactional
    public void publishCourse(Long courseId, String adminUser) {
        jdbcTemplate.update("""
            UPDATE courses SET published = true WHERE id = ?
            """, courseId);

        jdbcTemplate.update("""
            INSERT INTO audit_log (entity, entity_id, action, actor)
            VALUES ('course', ?, 'publish', ?)
            """, courseId, adminUser);

        // any exception → BOTH updates roll back
    }
}
```

If the audit insert fails, the publish update rolls back too. Atomicity across statements.

## TransactionTemplate: Programmatic Control

When a method has multiple independent transaction boundaries, or the transaction should wrap only part of the work:

```java
@Service
public class ImportService {

    private final TransactionTemplate transactionTemplate;

    public ImportService(PlatformTransactionManager txManager) {
        this.transactionTemplate = new TransactionTemplate(txManager);
    }

    public ImportResult importAll(List<Course> courses) {
        // per-batch transactions: one failure doesn't roll back the whole import
        int succeeded = 0;
        for (List<Course> batch : partition(courses, 100)) {
            try {
                transactionTemplate.executeWithoutResult(status ->
                    insertBatch(batch));
                succeeded += batch.size();
            } catch (DataAccessException e) {
                log.warn("Batch failed, continuing: {}", e.getMessage());
            }
        }
        return new ImportResult(succeeded, courses.size() - succeeded);
    }
}
```

`TransactionTemplate.execute` returns a value; `executeWithoutResult` is for void operations. Both commit on return, roll back on exception.

## Configuring the TransactionTemplate

```java
TransactionTemplate template = new TransactionTemplate(txManager);
template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
template.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
template.setTimeout(30);   // seconds
```

Per-call settings — useful when the same service needs different isolation for different operations.

## REQUIRES_NEW: A Nested Transaction

```java
@Transactional
public void processOrder(Long orderId) {
    jdbcTemplate.update("UPDATE orders SET status='PROCESSING' WHERE id=?", orderId);

    // audit must be written even if the rest rolls back
    auditService.recordAudit(orderId);   // @Transactional(propagation = REQUIRES_NEW)
}

// in AuditService:
@Transactional(propagation = Propagation.REQUIRES_NEW)
public void recordAudit(Long orderId) {
    jdbcTemplate.update("INSERT INTO audit_log ...", orderId);
}
```

`REQUIRES_NEW` suspends the outer transaction, runs the inner one on a **new connection**, commits it independently, then resumes the outer. The audit survives an outer rollback — the classic audit-trail pattern.

## Read-Only Transactions

```java
@Transactional(readOnly = true)
public List<Course> search(String q) {
    return jdbcTemplate.query("SELECT ...", courseRowMapper, q);
}
```

With JDBC, `readOnly` hints the driver (connection-level `setReadOnly`) — some drivers use it to skip locks or route to read replicas. It's a hint, not a hard guarantee, but it documents intent and can unlock read-replica routing.

## Isolation Levels

| Level | Problem it prevents | Cost |
|-------|---------------------|------|
| READ_UNCOMMITTED | Nothing (dirty reads) | Lowest |
| READ_COMMITTED | Dirty reads | Low — Postgres default |
| REPEATABLE_READ | Non-repeatable reads | Medium |
| SERIALIZABLE | Phantom reads | High — locking |

```java
@Transactional(isolation = Isolation.SERIALIZABLE)
public void reconcileBalances() { ... }
```

For a deep dive on the anomalies (dirty read, non-repeatable read, phantom), see the Postgres module lesson on isolation — the concepts are identical here.

## Savepoints: Partial Rollback

`NESTED` propagation uses savepoints — roll back part of a transaction, keep the rest:

```java
@Transactional
public void importWithPartialRollback(List<Course> courses) {
    int i = 0;
    try {
        for (Course c : courses) {
            insertCourse(c);      // @Transactional(propagation = Propagation.NESTED)
            i++;
        }
    } catch (DataAccessException e) {
        // only the failing savepoint rolls back; previous inserts persist
        log.warn("Stopped at row {}: {}", i, e.getMessage());
    }
}
```

NESTED is cheaper than REQUIRES_NEW (same connection, savepoint markers) and gives partial failure — ideal for large imports where "keep what worked, skip what failed" is the requirement.

## The Self-Invocation Trap (Again)

```java
@Service
public class CourseService {

    public void doBoth(Long id) {
        updateCourse(id);      // ❌ self-invocation — @Transactional ignored!
        audit(id);
    }

    @Transactional
    public void updateCourse(Long id) { ... }
}
```

Same proxy problem as `@Async`/`@Cacheable`. Fix with self-injection or `TransactionTemplate`:

```java
@Service
public class CourseService {

    private final CourseService self;
    private final TransactionTemplate tx;

    public CourseService(@Lazy CourseService self, PlatformTransactionManager tm) {
        this.self = self;
        this.tx = new TransactionTemplate(tm);
    }

    public void doBoth(Long id) {
        self.updateCourse(id);           // ✅ through the proxy
        // or:
        tx.executeWithoutResult(status -> jdbcTemplate.update("...", id));
    }
}
```

## Testing Transactions

```java
@DataJpaTest   // rolls back each test automatically
class TransactionTest {

    @Autowired CourseRepository repository;

    @Test
    void insertIsVisibleWithinTest() {
        repository.insert("Java", "BEGINNER", 30);
        assertEquals(1, repository.count());   // same transaction
    }
    // rolled back after the test — no cleanup needed
}
```

With `@JdbcTest` + `@Transactional`, each test runs in a rollback-only transaction: assertions see the writes, and nothing leaks to the next test.

## Summary

| Concern | Mechanism |
|---------|-----------|
| Declarative | `@Transactional` on service methods |
| Programmatic | `TransactionTemplate` / `PlatformTransactionManager` |
| Independent sub-work | `REQUIRES_NEW` (new connection) |
| Partial rollback | `NESTED` (savepoints) |
| Read paths | `readOnly = true` |
| Isolation | `@Transactional(isolation = ...)` |
| Pitfall | Self-invocation bypasses the proxy |

JdbcTemplate + Spring transactions = exact SQL with production-grade atomicity. Pick declarative transactions for whole-method boundaries, `TransactionTemplate` for fine-grained control, and remember the connection-propagation rule that makes it all work: one thread, one transactional connection, one commit point.
