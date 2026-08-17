---
title: Flyway — Versioned Schema Migrations
summary: SQL migrations as code — versioned scripts, checksums, the schema history table and the Spring Boot wiring that runs them at startup.
order: 1
minutes: 14
topics: [flyway, migrations, schema versioning, sql, spring boot]
docs:
  - https://documentation.red-gate.com/fd/
  - https://docs.spring.io/spring-boot/reference/how-to/data-initialization.html
---

# Flyway — Versioned Schema Migrations

## The problem migrations solve

Before migration tools, schema changes were "the DBA runs this script on prod" — untracked, unordered, unrepeatable. **Flyway turns schema changes into versioned, ordered, checksummed code**: every change is a numbered SQL file, applied exactly once, with the state recorded in a table.

```
db/migration/
  V1__create_users.sql
  V2__add_orders_table.sql
  V3__add_order_status_index.sql
```

## The rules of the game

1. **File naming is the contract**: `V<version>__<description>.sql` — versions sort lexically (`V10` after `V9`, so pad: `V010`).
2. **The schema history table** (`flyway_schema_history`) records every applied version, its checksum, and when it ran.
3. **Checksums**: Flyway hashes the file content. If a *migrated* file changes on disk → `Validate failed: checksum mismatch` — the safety net that stops you from editing a migration that already ran in prod.
4. **Immutable history**: once a version has been applied anywhere, it is **never edited**. New change = new file. (The "migration hygiene" rule that keeps environments consistent.)
5. **Idempotent application**: Flyway applies each version once, in order, in a transaction (on DBs that support DDL transactions).

```sql
-- V1__create_users.sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'USER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Spring Boot wiring

```xml
<dependency>
  <groupId>org.flywaydb</groupId>
  <artifactId>flyway-core</artifactId>
</dependency>
```

That's it — Flyway runs **before Hibernate** at startup (`flyway_schema_history` first, then your schema, then JPA's `ddl-auto` finds the tables already there). Configuration:

```yaml
spring:
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true   # adopt an existing un-versioned schema as "baseline" once
```

**The JPA interaction is the classic footgun**: with `spring.jpa.hibernate.ddl-auto: update`, Hibernate also mutates the schema — two sources of truth. The production pattern: **Flyway owns the schema** (`ddl-auto: validate` — Hibernate verifies its mapping matches, never writes). This academy's own app uses `ddl-auto: update` for zero-setup; a mature production app flips to Flyway + validate.

## The migration lifecycle

```bash
mvn flyway:migrate          # apply pending migrations (also happens at app startup)
mvn flyway:info             # show applied / pending
mvn flyway:validate         # checksums + order check (fail the build on drift)
```

The key operational practices:

- **Every schema change is a code review artifact** — the PR shows the SQL diff; reviewers see `V4__...sql` exactly like a Java file.
- **Rollbacks are forward migrations** — `V5__drop_the_bad_column.sql`, not editing `V4`. (Flyway has undo scripts on Teams edition; the open-source forward-only model is fine — the next migration fixes forward.)
- **CI runs `validate`** — a team member editing an old migration fails the build, not prod.

## Common failure modes

| Failure | Meaning | Fix |
|---|---|---|
| `checksum mismatch` | a migrated file was edited | restore it; write a new migration |
| `non-empty schema without schema history` | applied to a DB with tables but no history | `baseline-on-migrate` once |
| `out of order` | applied `V3` somewhere, now adding `V2` locally | renumber — versions must stay globally ordered |
| Migration "succeeds" but data wrong | SQL semantics (not syntax) error | you need tests — see the schema-evolution lesson |

## Testing migrations

The Testcontainers discipline applies perfectly: run Flyway against a real Postgres in CI (`mvn flyway:migrate` against the container), then `flyway:validate` on every build. The schema history is the deployment truth — the test that proves "a fresh DB reaches prod's schema" is the cheapest insurance you can buy.

## Key takeaways

- Versioned, ordered, checksummed SQL — the schema as code, applied exactly once.
- `V<version>__<desc>.sql`; never edit an applied migration; roll forward.
- Spring Boot: flyway-core runs it before Hibernate; production pattern = `ddl-auto: validate`.
- `validate` in CI + Testcontainers migration tests = drift caught before prod.

Official docs: [Flyway](https://documentation.red-gate.com/fd/) · [Boot data initialization](https://docs.spring.io/spring-boot/reference/how-to/data-initialization.html)
