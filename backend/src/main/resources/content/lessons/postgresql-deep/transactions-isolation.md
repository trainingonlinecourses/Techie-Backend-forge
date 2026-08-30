---
title: Transactions and Isolation in Postgres
module: postgresql-deep
order: 3
minutes: 28
topics: ["MVCC", "isolation levels", "read committed", "repeatable read", "serializable", "row locking", "FOR UPDATE"]
summary: Postgres implements transactions with MVCC (MultiVersion Concurrency Control): readers never block writers, writers never block readers. This lesso...
docs:
  - title: "PostgreSQL transactions"
    url: "https://www.postgresql.org/docs/current/mvcc.html"
---

# Transactions and Isolation in Postgres

Postgres implements transactions with **MVCC** (Multi-Version Concurrency Control): readers never block writers, writers never block readers. This lesson covers how MVCC works, what each isolation level actually guarantees, and the locking primitives — with the exact behaviors your Spring `@Transactional` code will hit.

## MVCC: How Postgres Does It

Every transaction sees its own **snapshot** of the database:

```
Tx A (started 10:00) sees:  rows as of 10:00
Tx B (started 10:01) sees:  rows as of 10:01
```

- Updates create **new row versions**; old versions stay for readers
- **No read locks ever** — readers and writers coexist
- A row version is visible only if committed before the snapshot (and not deleted)

This is why Postgres has no dirty reads even at READ_COMMITTED, and why `SELECT` never blocks `UPDATE`.

## The Isolation Levels in Postgres

| Level | Dirty read | Non-repeatable | Phantom | How Postgres implements |
|-------|:---:|:---:|:---:|-------------------------|
| READ UNCOMMITTED | (not possible) | Possible | Possible | Treated as READ COMMITTED |
| READ COMMITTED | No | Possible | Possible | **New snapshot per statement** |
| REPEATABLE READ | No | No | Possible (see below) | **Snapshot per transaction** |
| SERIALIZABLE | No | No | No | Serializes with abort+retry |

```sql
-- per statement: two SELECTs may see different data
BEGIN ISOLATION LEVEL READ COMMITTED;
SELECT minutes FROM courses WHERE id = 1;   -- 25
-- (another tx updates to 30 and commits)
SELECT minutes FROM courses WHERE id = 1;   -- 30  ← different!
COMMIT;
```

```sql
-- per transaction: the snapshot is fixed
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT minutes FROM courses WHERE id = 1;   -- 25
-- (another tx updates to 30 and commits)
SELECT minutes FROM courses WHERE id = 1;   -- 25  ← SAME
COMMIT;
```

**Important Postgres fact**: REPEATABLE READ in Postgres *does* prevent phantoms for reads (the snapshot is fixed) — the classic "phantom" gap appears only in write conflicts, where concurrent inserts can produce unique-violation errors that a serial execution wouldn't.

## SERIALIZABLE: The Abort-and-Retry World

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
-- if a conflicting transaction committed in between:
-- ERROR:  could not serialize access due to concurrent update
```

Postgres doesn't lock everything — it runs transactions concurrently and **aborts the loser** with `40001` (serialization_failure). Your application must retry:

```java
// Spring + SERIALIZABLE requires retry logic
@Transactional(isolation = Isolation.SERIALIZABLE)
public void reconcile() { ... }

// around it:
for (int attempt = 0; attempt < 3; attempt++) {
    try {
        reconcile();
        return;
    } catch (CannotSerializeTransactionException e) {
        // retry — the loser of the race
    }
}
```

## Row-Level Locking: SELECT FOR UPDATE

MVCC handles *reads*; **writes to the same row still conflict**. `FOR UPDATE` locks rows so no concurrent tx can modify them until you commit:

```sql
BEGIN;
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;   -- LOCKED
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
COMMIT;                                           -- lock released
```

```java
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("select a from Account a where a.id = :id")
Optional<Account> findByIdForUpdate(Long id);
```

**The transfer-without-lost-update pattern**:

```sql
-- ❌ Race: two txs read balance=100, both write 0 → one debit lost
SELECT balance FROM accounts WHERE id = 1;      -- 100
UPDATE accounts SET balance = 0 WHERE id = 1;   -- both write 0

-- ✅ Lock first, then update — no lost update
SELECT * FROM accounts WHERE id = 1 FOR UPDATE; -- Tx B waits here
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
```

## Locking Modes Compared

| Lock | SQL | Blocks | Used for |
|------|-----|--------|----------|
| FOR UPDATE | `SELECT ... FOR UPDATE` | Other FOR UPDATE / UPDATE / DELETE | Read-then-write |
| FOR NO KEY UPDATE | `SELECT ... FOR NO KEY UPDATE` | Same, but allows key changes | Less intrusive writes |
| FOR SHARE | `SELECT ... FOR SHARE` | UPDATE/DELETE, not other FOR SHARE | "Don't change while I look" |
| FOR KEY SHARE | `SELECT ... FOR KEY SHARE` | Only key changes | FK checks |

## Deadlocks in Postgres

```sql
-- Tx A: locks row 1, then wants row 2
-- Tx B: locks row 2, then wants row 1
-- Postgres detects the cycle and ABORTS one:
-- ERROR:  deadlock detected
```

Postgres resolves deadlocks by aborting one transaction (with `40P01`) — your code should retry the loser. Prevention: consistent lock ordering (the same rule as Java's locks).

## Read Replicas and readOnly

Spring's `@Transactional(readOnly = true)`:
- Hints the driver to use a **read replica** (if configured with routing)
- Sets REPEATABLE READ semantics per statement via the snapshot
- Never sends writes — misuse fails loudly on most setups

```java
@Transactional(readOnly = true)
public List<Course> search(String q) { ... }   // routes to the replica
```

## Testing Isolation Behavior

```java
@SpringBootTest
@Testcontainers
class IsolationTest {

    @Autowired AccountRepository repository;

    @Test
    void serializableAbortsConcurrentUpdates() throws Exception {
        // two threads updating the same account with SERIALIZABLE
        // → one succeeds, the other gets CannotSerializeTransactionException
        assertThrows(CannotSerializeTransactionException.class, ...);
    }

    @Test
    void forUpdateSerializesTransfers() throws Exception {
        // two concurrent transfers with FOR UPDATE
        // → both succeed (one waits), balance consistent
        assertEquals(0, accountRepository.sumBalances());
    }
}
```

## Summary

| Concept | Postgres behavior |
|---------|-------------------|
| MVCC | Snapshot isolation — readers never block |
| READ COMMITTED | New snapshot per statement (default) |
| REPEATABLE READ | One snapshot per transaction |
| SERIALIZABLE | Aborts the loser — retry required |
| FOR UPDATE | Row lock for read-then-write |
| Deadlock | Detected + one tx aborted — retry |
| readOnly | Snapshot, replica routing hint |

Postgres's concurrency model is MVCC + row locks: reads are always consistent snapshots, writes serialize on row locks, and SERIALIZABLE enforces full serialization by aborting races. Match your isolation level to the anomaly you actually face, use FOR UPDATE for read-then-write, and build retry into SERIALIZABLE paths.
