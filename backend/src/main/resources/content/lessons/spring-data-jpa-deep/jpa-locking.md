---
title: JPA Locking — Optimistic and Pessimistic Concurrency Control
summary: Lost updates, @Version optimistic locking, pessimistic locks and their isolation cost, and the scenario-driven choice of which to use.
order: 7
minutes: 20
topics: [locking, optimistic, pessimistic, version, lost-update, lockmodetype, concurrency]
docs:
  - https://docs.spring.io/spring-data/jpa/reference/jpa/entity-persistence.html#jpa.entity-persistence.locking
  - https://docs.oracle.com/javaee/7/tutorial/persistence-intro004.htm
---

# JPA Locking — Optimistic and Pessimistic Concurrency Control

## The concept: the lost-update problem

Two users read the same record, both edit it, both save — the second save **silently overwrites** the first user's change. That's a **lost update**, and it's a classic production data-integrity bug:

```text
User A reads account balance 100
User B reads account balance 100
User A adds 50  → writes 150
User B adds 30  → writes 130   ← A's change is GONE
```

JPA offers two strategies:

- **Optimistic locking** — assume conflicts are rare; detect them at write time and fail the loser. Cheap, and the default choice for most reads.
- **Pessimistic locking** — assume conflicts are likely; lock the row *while reading* so the second reader waits. Costs database locks but guarantees serialized access.

## Optimistic locking with @Version

```java
@Entity
public class Account {
    @Id @GeneratedValue private Long id;
    private BigDecimal balance;

    @Version
    private long version;        // Hibernate maintains this
}
```

**How it works:** every row carries a version number. On `UPDATE`, Hibernate includes `WHERE version = ?`; if the version changed since the entity was read, **zero rows match**, and Hibernate throws `OptimisticLockException` (often surfaced as `ObjectOptimisticLockingFailureException`). The update *fails* — the losing transaction must re-read and retry.

```text
User A: UPDATE account SET balance=150, version=2 WHERE id=7 AND version=1  → 1 row
User B: UPDATE account SET balance=130, version=2 WHERE id=7 AND version=1  → 0 rows → OptimisticLockException
```

`@Version` gives you: automatic per-update increment, conflict detection with zero database locks, and no read overhead. The cost: a failed write at the end of a long transaction means **retrying the whole business operation**.

**Org pattern — the retry:**

```java
@Transactional
public void transfer(TransferRequest r) {
    // ... business logic that reads + writes the account ...
}

// Caller retries on optimistic lock failure (a few attempts, then give up):
for (int attempt = 0; attempt < 3; attempt++) {
    try {
        return accountService.transfer(r);
    } catch (ObjectOptimisticLockingFailureException e) {
        log.warn("Retrying transfer after optimistic lock (attempt {})", attempt + 1);
    }
}
throw new ConflictException("Too many concurrent edits — please retry");
```

## Pessimistic locking — LockModeType

When optimistic retry is unacceptable (long-running workflows, high-contention records, money-critical paths), lock the row **at read time** so concurrent readers block instead of fail:

```java
@Lock(LockModeType.PESSIMISTIC_WRITE)      // SELECT ... FOR UPDATE
@Query("select a from Account a where a.id = :id")
Optional<Account> findByIdForUpdate(@Param("id") Long id);

@Transactional
public void adjustBalance(Long id, BigDecimal delta) {
    Account a = accountRepo.findByIdForUpdate(id).orElseThrow();  // row LOCKED now
    a.setBalance(a.getBalance().add(delta));                       // no one else can touch it
    // lock released at COMMIT — keep the transaction short!
}
```

`PESSIMISTIC_WRITE` issues `SELECT ... FOR UPDATE`, holding the lock until commit/rollback. `PESSIMISTIC_READ` issues `FOR SHARE`. Two variants to know:

- `LockModeType.PESSIMISTIC_FORCE_INCREMENT` — pessimistic lock *plus* version bump, combining both strategies (used when you lock one entity but must invalidate others' cached versions).
- Timeouts: `@QueryHints({@QueryHint(name = "jakarta.persistence.lock.timeout", value = "5000")})` so a blocked lock doesn't hang forever.

## Choosing the strategy — the org decision matrix

| Situation | Strategy |
|---|---|
| Normal CRUD, low contention | Optimistic (`@Version`) — no lock cost, retry on conflict |
| Counter/balance updates in high-traffic paths | Optimistic with retry, or pessimistic for short txn |
| Long-running workflow steps (draft → approve) | Optimistic — don't hold DB locks across user think-time |
| Money-critical, must-not-fail-late | Pessimistic `FOR UPDATE` in a *short* transaction |
| Read-heavy screens | Neither — reads don't need locks (repeatable read handles snapshot) |

The general rule teams teach: **optimistic by default; pessimistic only where the failure cost of an optimistic retry outweighs the lock cost** — and always keep pessimistic transactions short, because locks serialize traffic.

## Pessimistic locks in practice — the scenarios

**Scenario 1 — inventory decrement at checkout.** Two shoppers grab the last item; `SELECT ... FOR UPDATE` on the SKU row serializes the decrements, so quantity never goes negative and the second shopper sees the updated count (or a retry).

**Scenario 2 — seat selection in a booking flow.** Reading a seat *for update* while reserving prevents double-booking — the second reader waits and then finds the seat taken.

**Scenario 3 — financial reconciliation.** A job that sums and adjusts balances runs `FOR UPDATE` over the account set so concurrent deposits can't interleave mid-scan.

## Pitfalls

- **Lock scope = transaction scope.** A pessimistic lock held past commit is a deadlock/blockade. Never read-for-update outside `@Transactional`, and keep those transactions minimal.
- **Optimistic retry must be at the business-operation boundary**, not inside the transaction — re-running inside the same failed transaction doesn't re-read.
- **`@Version` on detached entities** — when you merge a detached entity, its version must match the DB or merge throws; that's correct behavior (your UI showed stale data), but clients need the 409 → refresh → retry flow.
- **Deadlocks are possible with pessimistic locks** — two transactions locking rows in opposite order. Keep a consistent lock order and a deadlock-timeout configured.
- **Locking doesn't protect against native SQL updates** that bypass Hibernate's version checks.

## Key takeaways

- Lost updates are silent; locking is the fix — optimistic (detect) or pessimistic (prevent).
- `@Version` + retry covers most cases with zero lock overhead.
- `PESSIMISTIC_WRITE` = `SELECT ... FOR UPDATE`; keep the transaction short and consistent in lock order.
- Optimistic by default; pessimistic for short, high-stakes writes; retry at the operation boundary.
- Understand lock scope (transaction) and detached-entity version semantics.
