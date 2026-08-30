---
title: Isolation Levels and Locking
module: spring-transactions-deep
order: 2
minutes: 28
topics: ["isolation levels", "dirty reads", "non-repeatable reads", "phantom reads", "pessimistic locking", "optimistic locking", "@Version"]
summary: Isolation controls what a transaction sees of other transactions' uncommitted changes. The four levels trade consistency against concurrency, and t...
docs:
  - title: "Isolation"
    url: "https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html"
---

# Isolation Levels and Locking

Isolation controls **what a transaction sees of other transactions' uncommitted changes**. The four levels trade consistency against concurrency, and the two locking strategies (pessimistic/optimistic) decide *how* conflicts are prevented. This lesson covers both halves with the Postgres behavior as the reference.

## The Four Anomalies

| Anomaly | Definition | Prevented by |
|---------|-----------|--------------|
| **Dirty read** | Read another tx's *uncommitted* data (later rolled back) | READ_COMMITTED |
| **Non-repeatable read** | Same row read twice, different values (another tx committed in between) | REPEATABLE_READ |
| **Phantom read** | Same query twice, different *row count* (rows added/removed in between) | SERIALIZABLE |

## The Four Isolation Levels

| Level | Dirty read | Non-repeatable | Phantom | Postgres behavior |
|-------|:---:|:---:|:---:|-------------------|
| READ_UNCOMMITTED | Possible | Possible | Possible | Same as READ_COMMITTED (PG doesn't allow dirty reads) |
| READ_COMMITTED | Prevented | Possible | Possible | **Postgres default** — snapshot per statement |
| REPEATABLE_READ | Prevented | Prevented | Possible | Snapshot per transaction |
| SERIALIZABLE | Prevented | Prevented | Prevented | Serializes conflicting tx |

```java
@Transactional(isolation = Isolation.REPEATABLE_READ)
public Balance getBalance(Long accountId) {
    // two reads of the same row return the same value — guaranteed
    ...
}
```

**Key Postgres fact**: READ_COMMITTED gives a *per-statement* snapshot, REPEATABLE_READ a *per-transaction* snapshot. The choice is about how long your view of the DB stays fixed — not about locks (PG uses MVCC, not read locks).

## The Default Is Almost Always Right

```java
// Spring default: the DB's default (READ_COMMITTED on Postgres)
@Transactional
public void updateOrder(Long id, OrderDto dto) { ... }
```

READ_COMMITTED is correct for ~95% of workloads: each statement sees a consistent snapshot, writes are protected by row locks, and concurrency stays high. **Raise isolation only when you have a demonstrated anomaly**, never preemptively.

## The SERIALIZABLE Trade

```java
@Transactional(isolation = Isolation.SERIALIZABLE)
public void reconcileBalances() { ... }
```

- Guarantees the strongest consistency (the result equals some serial order of the transactions)
- **Cost**: Postgres aborts conflicting transactions with `40001 serialization_failure` — your code must **retry**
- Use for financial reconciliation, unique-constraint races, complex invariants

```java
// SERIALIZABLE requires retry handling
public void reconcileWithRetry() {
    for (int attempt = 0; attempt < 3; attempt++) {
        try {
            reconcileBalances();
            return;
        } catch (CannotSerializeTransactionException e) {
            // serialization failure — retry
        }
    }
    throw new ReconcileFailedException();
}
```

## Pessimistic Locking: Lock Now, Read Later

Locks the row(s) at read time — no one else can modify them until commit:

```java
@Repository
public interface AccountRepository extends JpaRepository<Account, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)          // SELECT ... FOR UPDATE
    @Query("select a from Account a where a.id = :id")
    Optional<Account> findByIdForUpdate(@Param("id") Long id);
}
```

```java
@Transactional
public void transfer(Long fromId, Long toId, BigDecimal amount) {
    Account from = accountRepository.findByIdForUpdate(fromId);   // LOCKED
    Account to = accountRepository.findByIdForUpdate(toId);       // LOCKED

    from.debit(amount);     // safe: no concurrent modification possible
    to.credit(amount);
}
```

- `PESSIMISTIC_WRITE` → `SELECT ... FOR UPDATE`
- `PESSIMISTIC_READ` → `SELECT ... FOR SHARE`
- **Holds until transaction commit** — keep transactions short

**The risk**: two transactions locking rows in opposite order = deadlock (Postgres detects and aborts one with 40P01). Use the lock-ordering rule from the concurrency module.

## Optimistic Locking: @Version

No locks — just a version check at write time:

```java
@Entity
public class Course {

    @Id private Long id;

    @Version
    private long version;     // incremented on every update
}
```

```java
// Two concurrent updates:
//   Tx A reads version=1
//   Tx B reads version=1
//   Tx A updates → version=2, commits
//   Tx B updates WHERE version=1 → 0 rows → OptimisticLockException
```

```java
@Transactional
public void updateTitle(Long id, String title) {
    Course course = courseRepository.findById(id).orElseThrow();
    course.setTitle(title);                    // version bumps on flush
    // if another tx committed first → OptimisticLockException here
}
```

Handle the conflict at the boundary:

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ProblemDetail handleStale(ObjectOptimisticLockingFailureException ex) {
        return ProblemDetail.forStatusAndDetail(
            HttpStatus.CONFLICT,
            "Resource was modified by another user — refresh and retry");
    }
}
```

## Pessimistic vs. Optimistic

| | Pessimistic (FOR UPDATE) | Optimistic (@Version) |
|--|--------------------------|----------------------|
| When to check | At read time (lock held) | At write time (version check) |
| Concurrency | Lower (locks block readers) | Higher (no locks) |
| Conflict cost | Waiting + possible deadlock | Retry + 409 |
| Best for | Contended writes, short tx | Read-mostly, long workflows |
| Required | Explicit `@Lock` | Just add the field |

**Rule of thumb**: optimistic by default (add `@Version`); pessimistic only when a conflict would be too expensive to retry (e.g., inventory decrements, balance transfers).

## The Practical Checklist

| Scenario | Isolation/Lock |
|----------|----------------|
| Default | READ_COMMITTED (DB default) |
| Balance transfer | PESSIMISTIC_WRITE with lock ordering |
| Long-form editing (docs) | Optimistic @Version + 409 |
| Inventory decrement | Optimistic, or pessimistic with retry |
| Reconciliations | SERIALIZABLE + retry |
| Read-only reports | readOnly=true (snapshot) |

## Summary

| Concern | Answer |
|---------|--------|
| Default isolation | READ_COMMITTED — don't raise it preemptively |
| Prevent dirty reads | READ_COMMITTED (always in Postgres) |
| Prevent non-repeatable | REPEATABLE_READ (per-tx snapshot) |
| Prevent phantoms | SERIALIZABLE (+ retry on 40001) |
| Lock rows | `@Lock(PESSIMISTIC_WRITE)` — SELECT FOR UPDATE |
| Conflict detection | `@Version` — OptimisticLockException → 409 |
| Deadlock risk | Lock ordering, short transactions |

Isolation is a consistency/concurrency trade with a correct default: READ_COMMITTED plus `@Version` covers almost everything. Reach for FOR UPDATE and SERIALIZABLE only when the anomalies actually bite — and when you do, remember Postgres punishes conflicts with aborts, so retry handling is part of the design.
