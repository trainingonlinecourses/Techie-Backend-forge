---
title: Schema Evolution Patterns
summary: The expansion-contraction pattern, online migrations without downtime, and the habits that keep a production schema change boring.
order: 3
minutes: 13
topics: [schema evolution, expand contract, online migration, zero downtime, data backfill]
docs:
  - https://martinfowler.com/bliki/ParallelChange.html
  - https://microservices.io/patterns/data/expand-contract.html
---

# Schema Evolution Patterns

## The four-phase lifecycle of every schema change

A production schema change touches running code — the safe way is **expansion-contraction** (also called *parallel change*), spread over releases:

```
Phase 1  EXPAND   — add the new column/table; old code ignores it.
Phase 2  MIGRATE  — backfill data into the new structure (scripted, verified).
Phase 3  SWITCH   — deploy new code that reads/writes the new structure.
Phase 4  CONTRACT — remove the old column/table in a later release.
```

```sql
-- V4__expand.sql  (release N)
ALTER TABLE users ADD COLUMN email_normalized VARCHAR(255);
CREATE INDEX idx_users_email_norm ON users(email_normalized);

-- V5__backfill.sql (release N, after deploy — a data migration, not a DDL)
UPDATE users SET email_normalized = lower(email) WHERE email_normalized IS NULL;

-- V6__contract.sql (release N+2, once nothing reads the old column)
ALTER TABLE users DROP COLUMN email;
```

Each phase is a **separate deploy**. The mistake that breaks prod: doing all four in one release — the new code and the new schema land together, and the rollback has no safe state to go back to.

## Renames, not renames

Rename a column in three steps (add new → dual-write → drop old), never one `ALTER TABLE ... RENAME`. Same for renaming a table, changing a type, or moving data between tables: **the schema and the code drift in lockstep**, one release at a time. The rename in one shot works only if you accept downtime and a hard cutover — which is a product decision, not a DB decision.

## Backfills: the forgotten half

DDL is easy; **data is the work**. A backfill of 50M rows has real rules:

1. **Chunk it** — `UPDATE ... WHERE id > :last AND ... LIMIT 1000` in a loop (or a batch job — the Spring Batch module), not one giant transaction.
2. **Make it re-runnable (idempotent)** — guard with `WHERE new_col IS NULL`; re-running must be safe.
3. **Verify, don't assume** — `SELECT count(*) WHERE new_col IS NULL` after each batch; a "100% backfilled" claim without a count is a guess.
4. **Run it as a migration, in the deploy** — the seed/migration runner (Flyway/Liquibase) executes it once, after the DDL, and the app deploys *after* it completes.

## Column defaults and NOT NULL

`ALTER TABLE ... ADD COLUMN x INT NOT NULL` fails on a table with rows (no default). The safe order:

```sql
ADD COLUMN x INT;                       -- nullable first
UPDATE ... SET x = ...;                 -- backfill
ALTER COLUMN x SET NOT NULL;            -- then tighten, once verified
```

**Adding a `DEFAULT` locks the table on big tables** in Postgres (until PG11's fast-default for constants). Prefer: add nullable → backfill → set default/NOT NULL. Hibernate `ddl-auto: update` does none of this thinking — another reason Flyway owns the schema (the Flyway lesson).

## Indexes and query plans

- Index changes are **additive** (safe): `CREATE INDEX CONCURRENTLY` in Postgres avoids the write lock — but note it can't run inside a transaction (Flyway runs migrations in transactions; use a `--` transaction annotation or run it out-of-band).
- Dropping an index is **contract** — only after the query plan stops using it (check `EXPLAIN` after the code switch).
- Changing a column type invalidates indexes and can rewrite the table — expansion-contraction applies double.

## The habits that make it boring

1. **One change per migration** — reviewable, revertible, bisectable.
2. **Migrations are peer-reviewed like code** — the SQL diff is a review artifact.
3. **Test on prod-shaped data** — the Testcontainers migration test (Flyway lesson) runs the whole changelog against a fresh Postgres in CI; a scratch DB with 3 rows won't catch a 50M-row backfill bug.
4. **A migration that "can't fail" is a migration you haven't run on prod data yet** — staging should be a rehearsed prod.
5. **Data migrations and DDL in the same file is a trap** — the DDL is fast, the backfill is slow; separate them so the deploy sequence can interleave them with code.

## Key takeaways

- Expand → backfill → switch → contract — each a separate release; the schema and code drift in lockstep.
- Renames and type changes are expansions, never one-shot renames.
- Backfills: chunked, idempotent, verified, and run before the new code deploys.
- Add nullable → backfill → then tighten NOT NULL/default; index changes are additive.
- One change per migration, peer-reviewed, tested against prod-shaped data.

Official docs: [Parallel Change (Fowler)](https://martinfowler.com/bliki/ParallelChange.html) · [Expand-Contract (microservices.io)](https://microservices.io/patterns/data/expand-contract.html)
