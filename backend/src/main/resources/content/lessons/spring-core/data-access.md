---
title: Data Access & Transactions
summary: The transaction abstraction, @Transactional semantics, propagation and isolation — and the pitfalls that break them.
order: 8
minutes: 20
topics: [transactions, jdbc, jdbctemplate, isolation, propagation]
docs:
  - https://docs.spring.io/spring-framework/reference/data-access.html
  - https://docs.spring.io/spring-framework/reference/data-access/transaction.html
---

# Data Access & Transactions

## The transaction abstraction

Spring's `PlatformTransactionManager` decouples your code from the underlying transaction system (JDBC, JPA/Hibernate, JTA). You annotate; the manager begins, commits or rolls back.

```java
@Transactional
public void transfer(String fromIban, String toIban, Money amount) {
    Account from = accounts.findByIban(fromIban);
    Account to   = accounts.findByIban(toIban);
    from.debit(amount);
    to.credit(amount);
    // one commit at method exit — or full rollback if anything throws
}
```

## How @Transactional really behaves

1. A proxy wraps the method (AOP — see spring-aop lesson).
2. On entry: begin a transaction, bind the connection to the **thread**.
3. On success: commit. On any `RuntimeException`: roll back.
4. **Checked exceptions do NOT roll back** by default — configure `rollbackFor`:

```java
@Transactional(rollbackFor = {TransferException.class})   // roll back on checked too
public void transfer(...) throws TransferException { ... }
```

## Propagation & isolation

```java
@Transactional(propagation = Propagation.REQUIRES_NEW)   // suspend outer tx, start new one
@Transactional(isolation = Isolation.REPEATABLE_READ)    // per-transaction read behavior
@Transactional(readOnly = true)                          // hint: no writes, fewer locks
```

| Propagation | Meaning |
|---|---|
| `REQUIRED` (default) | Join existing tx or create one |
| `REQUIRES_NEW` | Always a new tx, suspend the outer |
| `MANDATORY` | Must run inside an existing tx |
| `NESTED` | Savepoint within the outer tx |

| Isolation | Problem it prevents |
|---|---|
| `READ_COMMITTED` (default in most DBs) | Dirty reads |
| `REPEATABLE_READ` | Non-repeatable reads |
| `SERIALIZABLE` | Phantom reads (slowest) |

## JdbcTemplate: SQL-first access

When you don't need an ORM, `JdbcTemplate` is explicit and fast:

```java
@Repository
public class JdbcAccountRepository {
    private final JdbcTemplate jdbc;

    public Account findByIban(String iban) {
        return jdbc.queryForObject(
            "SELECT iban, balance_cents, currency FROM accounts WHERE iban = ?",
            (rs, i) -> new Account(rs.getString("iban"), rs.getLong("balance_cents")),
            iban);
    }

    public void updateBalance(String iban, long cents) {
        jdbc.update("UPDATE accounts SET balance_cents = ? WHERE iban = ?", cents, iban);
    }
}
```

## The pitfalls that break transactions

```java
// 1. Self-invocation — proxy bypassed, NO transaction
@Service
class Service {
    @Transactional public void a() { this.b(); }        // b() not transactional!
    @Transactional public void b() { ... }
}

// 2. Private method — not proxied
@Transactional private void hidden() { ... }

// 3. Thread hop — connection is bound to the calling thread
@Transactional public void a() {
    executor.submit(() -> otherRepo.update(...));       // different thread, no tx!
}
```

Exception translation: `@Repository` beans get persistence exceptions translated to Spring's `DataAccessException` hierarchy (no Hibernate/SQLException leaking into services).

> **Why it matters (organizational view)** — "My data got half-written" is almost always a transaction boundary problem. The org rules: transactions at the *service* method level (not controllers, not private helpers), `readOnly=true` on reads, `rollbackFor` on checked exceptions, and no async/thread hops inside a transaction. For money-like invariants, prefer row locks (`SELECT ... FOR UPDATE` or optimistic locking via `@Version`) over application locks.

## Key takeaways

- `@Transactional` = proxy + thread-bound connection; commit/rollback at method exit.
- Runtime exceptions roll back; checked need `rollbackFor`.
- `REQUIRED` joins, `REQUIRES_NEW` isolates; pick isolation per invariant.
- JdbcTemplate for SQL-first; repositories translate exceptions.

**Official docs:** [Data access](https://docs.spring.io/spring-framework/reference/data-access.html) · [Transaction management](https://docs.spring.io/spring-framework/reference/data-access/transaction.html)
