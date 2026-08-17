---
title: Liquibase — Declarative ChangeSets
summary: Database refactoring as versioned changeSets — XML/YAML/SQL changelogs, rollbacks, contexts and the differences from Flyway.
order: 2
minutes: 14
topics: [liquibase, changesets, changelog, rollbacks, database refactoring]
docs:
  - https://docs.liquibase.com/
  - https://docs.spring.io/spring-boot/reference/how-to/data-initialization.html
---

# Liquibase — Declarative ChangeSets

## The model

Liquibase manages schema evolution as a **changelog** of **changeSets** — each one a named, ordered, checksummed unit of change. The structural difference from Flyway: changeSets are *declarative* (tool-agnostic XML/YAML describing "add a column", "create an index") rather than raw SQL — Liquibase generates the dialect-specific DDL for your database.

```yaml
# db/changelog/db.changelog-master.yaml
databaseChangeLog:
  - changeSet:
      id: 1
      author: ada
      changes:
        - createTable:
            tableName: users
            columns:
              - column: { name: id, type: bigint, autoIncrement: true, constraints: { primaryKey: true } }
              - column: { name: username, type: varchar(255), constraints: { nullable: false, unique: true } }
  - changeSet:
      id: 2
      author: ada
      changes:
        - addColumn:
            tableName: users
            columns:
              - column: { name: role, type: varchar(32), defaultValue: USER, constraints: { nullable: false } }
```

Two files instead of one: the **master changelog** lists include directives; each include is a chunk of changeSets. History lives in `DATABASECHANGELOG` (id + author + checksum per changeSet).

## SQL when you need it

Declarative covers 90%; the other 10% (window functions, backfills, data transforms) belongs in raw SQL — Liquibase allows it in any format:

```xml
<changeSet id="3" author="ada">
  <sql>UPDATE users SET role = 'ADMIN' WHERE username = 'root';</sql>
  <rollback>UPDATE users SET role = 'USER' WHERE username = 'root';</rollback>
</changeSet>
```

## Rollbacks: the headline feature

Each changeSet can declare a **rollback** — either explicit SQL, or auto-generated (`rollback` tag, or Liquibase's `updateCount`/`rollbackCount` for the last N changeSets):

```bash
mvn liquibase:rollback -Dliquibase.rollbackCount=1   # undo the last changeSet
```

This is the philosophical difference from Flyway's forward-only model: Liquibase treats *rollback* as a first-class operation. In practice, most teams still prefer forward migrations for production (a bad rollback is as dangerous as a bad migration), but the rollback support is invaluable in **dev/test** where you iterate on a changelog against a scratch DB.

## Contexts, labels & preconditions

- **Contexts** gate changeSets by environment: `context: dev,test` for seed data, `context: prod` for prod-only indexes. Spring Boot maps `spring.liquibase.contexts` to the active profile.
- **Preconditions** guard execution: `preConditions: onFail: MARK_RAN` (e.g. "only add this column if it doesn't exist") — the safety valve for multi-team, long-lived changelogs.
- **`runAlways: true`** for idempotent housekeeping (e.g. refreshing a view) that must run every startup.

```yaml
spring:
  liquibase:
    enabled: true
    change-log: classpath:db/changelog/db.changelog-master.yaml
    contexts: ${spring.profiles.active:dev}
```

## Flyway vs Liquibase — the honest comparison

| | Flyway | Liquibase |
|---|---|---|
| Change format | SQL only | SQL, XML, YAML, JSON (SQL allowed) |
| Default model | forward-only | forward + rollbacks |
| Learning curve | minimal (it's SQL) | steeper (changelog schema) |
| Best for | SQL-first teams, simple-to-medium schema | teams wanting declarative, rollbacks, multi-DB tooling |
| Checksums | yes | yes |
| Spring Boot | auto-config, runs before JPA | auto-config, runs before JPA |

Both are excellent and both beat hand-run scripts by a mile. The choice is culture: **SQL-centric simplicity (Flyway) vs. declarative control (Liquibase)**. Switching later is pain — pick by team taste and stay.

## Key takeaways

- ChangeSets in a changelog (XML/YAML/JSON/SQL), recorded in `DATABASECHANGELOG` with checksums.
- Declarative changes + SQL for the rest; contexts gate by environment; preconditions guard multi-team drift.
- Rollbacks are first-class — invaluable in dev/test, use forward migrations in prod.
- Same hygiene as Flyway: never edit an applied changeSet, validate in CI, test against real Postgres.

Official docs: [Liquibase](https://docs.liquibase.com/) · [Boot data initialization](https://docs.spring.io/spring-boot/reference/how-to/data-initialization.html)
