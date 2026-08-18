---
title: JPA Auditing — CreatedAt, UpdatedAt and Who Changed What
summary: Automatic timestamp and user auditing with @CreatedDate/@LastModifiedDate, AuditorAware, and the audit-trail scenarios every backend needs.
order: 6
minutes: 17
topics: [auditing, createddate, lastmodifieddate, auditoraware, createdby, lastmodifiedby, audit-trail]
docs:
  - https://docs.spring.io/spring-data/jpa/reference/auditing.html
  - https://docs.spring.io/spring-data/jpa/reference/jpa/auditing.html
---

# JPA Auditing — CreatedAt, UpdatedAt and Who Changed What

## The concept: metadata the framework fills in

Almost every table needs "when was this row created, when last changed, and by whom". Hand-writing `setCreatedAt(new Date())` in every service method is repetitive and — worse — *forgettable*: one missed assignment means null timestamps and a broken audit trail. **Spring Data auditing** fills these fields automatically through the persistence lifecycle:

- `@CreatedDate` — set once, on persist.
- `@LastModifiedDate` — set on persist and on every update.
- `@CreatedBy` / `@LastModifiedBy` — the current user, from an `AuditorAware<T>` bean.
- `@Version` — technically locking, but often grouped with auditing; see the locking lesson.

Enable it with one annotation:

```java
@Configuration
@EnableJpaAuditing
public class JpaConfig { }
```

## The mapped superclass — one base for all entities

```java
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)   // the hook that fills the fields
public abstract class Auditable {
    @CreatedDate
    @Column(name = "created_at", updatable = false, nullable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @CreatedBy
    @Column(name = "created_by", updatable = false)
    private String createdBy;

    @LastModifiedBy
    @Column(name = "modified_by")
    private String modifiedBy;

    // getters (and protected setters — the framework needs setters, callers shouldn't set these)
}

@Entity
public class Order extends Auditable {
    @Id @GeneratedValue private Long id;
    private String status;
    // ...
}
```

`@EntityListeners(AuditingEntityListener.class)` is the wiring — it's the `BeanPostProcessor`-style hook that observes persist/update events. Every entity extending `Auditable` gets the four columns automatically, consistently named and typed.

## AuditorAware — where "by whom" comes from

```java
@Component
public class SecurityAuditorAware implements AuditorAware<String> {
    @Override
    public Optional<String> getCurrentAuditor() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return Optional.of("system");
        return Optional.ofNullable(auth.getName());
    }
}
```

The auditor comes from the **current security context** — the logged-in user (or `"system"`/`"anonymous"` for background jobs and unauthenticated paths). Because it's resolved at write time, the same entity set works for user-driven changes *and* batch jobs, and the trail distinguishes them.

## How we use it in an organization: the scenarios

**Scenario 1 — the compliance baseline.** Regulated domains (payments, healthcare) require "who changed what and when" for every record. Four columns on every table via the base class gives auditors the trail without bespoke code per entity.

**Scenario 2 — data-ownership and support tooling.** `createdBy` answers "which customer support agent created this case?"; `modifiedBy` answers "who touched this account before the incident?" — the first two queries in any support investigation.

**Scenario 3 — synchronization and "last changed" feeds.** `updatedAt` is the natural cursor for change feeds (poll rows where `updated_at > lastSync`), and for conditional write checks (optimistic-lite: "only overwrite if unchanged since I read it").

**Scenario 4 — batch jobs need the same trail.** A nightly ETL that updates thousands of rows should stamp `modifiedBy=system` — the `AuditorAware` returning `"system"` when there's no security context makes that automatic.

## The deeper mechanism: entity listeners

`AuditingEntityListener` is a JPA **entity listener** — methods invoked by Hibernate at lifecycle points (`@PrePersist`, `@PreUpdate`). That's why auditing works even when you bypass your service layer: a `saveAll()` in a bulk job, a native `update`, a second persistence unit — the listener still fires because it hooks the *persistence provider*, not your code. Understanding that explains both the reliability and the boundaries (native SQL that bypasses Hibernate's entity lifecycle does *not* trigger the listener).

## Pitfalls

- **Forgetting `@EnableJpaAuditing`** — the annotations silently do nothing and you get nulls. The classic "I added @CreatedDate but it's null" bug.
- **`updatable = false` on `createdAt`** — without it, a careless update can rewrite creation time. The column definition must match (SQL `DEFAULT`/`NOT NULL` too, for native writers).
- **The auditor must handle absence** — background threads, unauthenticated requests, and tests have no `SecurityContext`; return a sensible default so the field isn't null where the schema says `NOT NULL`.
- **Timestamp type** — `Instant` (UTC) is the modern choice; `LocalDateTime` without explicit zone stores server-local time and breaks across regions. Pick one and standardize.
- **Auditing isn't a full audit log** — four columns record the *latest* state and writer. A real audit log (every change, old + new values) needs event sourcing or an audit table — see the event-driven and outbox lessons.

## Key takeaways

- Spring Data auditing auto-fills created/updated timestamps and user via entity listeners.
- One `@MappedSuperclass` + `AuditingEntityListener` gives every entity a consistent trail.
- `AuditorAware` resolves the current user from the security context, defaulting for system jobs.
- It works through the persistence layer (even bulk saves) — but not through native SQL.
- Enable it explicitly, freeze `createdAt`/`createdBy`, use UTC `Instant`, and handle the no-user case.
