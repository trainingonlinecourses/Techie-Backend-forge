---
title: JPA Batch Operations — Bulk Inserts, saveAll and Flush Discipline
summary: Why saveAll isn't magically fast, JDBC batching and the hibernate.jdbc.batch_size flag, flush/clear discipline, and bulk update/delete with @Modifying.
order: 11
minutes: 19
topics: [batch, saveall, jdbc-batching, batch-size, flush, clear, modifying-query, bulk-update]
docs:
  - https://docs.spring.io/spring-data/jpa/reference/repositories/core-domain-events.html
  - https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#batch
---

# JPA Batch Operations — Bulk Inserts, saveAll and Flush Discipline

## The concept: the two batch problems

"Batch" in JPA means two different things, and conflating them is the source of most slow-batch surprises:

1. **Inserting/updating many entities** (`saveAll` a million rows) — the naive loop issues one `INSERT` per row over the network. **JDBC batching** (`hibernate.jdbc.batch_size`) groups inserts into one round-trip.
2. **Bulk changes** ("set status = 'ARCHIVED' for all orders older than X") — loading and mutating millions of entities through the persistence context is absurdly wasteful; a **bulk query** (`@Modifying` JPQL) runs one UPDATE in the database.

## Problem 1: batching inserts

```properties
# application.properties
spring.jpa.properties.hibernate.jdbc.batch_size=50
spring.jpa.properties.hibernate.order_inserts=true
spring.jpa.properties.hibernate.order_updates=true
```

```java
@Transactional
public void importBatch(List<Order> orders) {
    // With batch_size=50, Hibernate groups INSERTs into batches of 50 —
    // 1M rows ≈ 20k round-trips instead of 1M
    orderRepo.saveAll(orders);
}
```

Without the flag, `saveAll` is a **loop of single inserts** — the flag is what makes it fast. `order_inserts=true` lets Hibernate reorder and group inserts by table (important when mixed entity types are interleaved, e.g., parents + children).

**The ID-generation caveat:** batching only works when the IDs are assigned *before* the insert — `GenerationType.IDENTITY` requires the INSERT to run immediately (to get the id), **defeating batching**. The fix: use `SEQUENCE`-based ids (`GenerationType.SEQUENCE` with `allocationSize` matching, or `UUID`):

```java
@Id
@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "order_seq")
@SequenceGenerator(name = "order_seq", sequenceName = "order_seq", allocationSize = 50)
private Long id;
```

This is a classic hidden perf issue: the app "uses saveAll" but IDs are IDENTITY, so it's still one-by-one.

## Flush/clear discipline — the persistence-context growth trap

Inside one transaction, the persistence context **accumulates every managed entity**. Inserting a million orders keeps a million entities in memory by the end. The fix is periodic **flush + clear**:

```java
@Transactional
public void importLarge(List<Order> orders) {
    int i = 0;
    for (Order o : orders) {
        orderRepo.save(o);                      // managed, dirty-checked
        if (++i % 500 == 0) {
            orderRepo.flush();                  // push pending SQL to the DB now
            entityManager.clear();              // detach everything — free the context
            // Without clear, the context holds 1M entities → OOM on big imports
        }
    }
}
```

The rhythm: **flush periodically to bound the SQL lag, clear periodically to bound the memory**. Every 500-1000 rows is the common band; tune by measuring. Without this discipline, "batch import" jobs are the classic `OutOfMemoryError` in prod.

## Problem 2: bulk updates/deletes — @Modifying

For "update everything matching a predicate", never loop-and-save:

```java
public interface OrderRepository extends JpaRepository<Order, Long> {
    @Modifying
    @Query("update Order o set o.status = 'ARCHIVED' where o.updatedAt < :cutoff")
    int archiveOlderThan(@Param("cutoff") Instant cutoff);   // ONE UPDATE in the DB

    @Modifying
    @Query("delete from Order o where o.id in :ids")
    int deleteByIds(@Param("ids") Collection<Long> ids);
}
```

`@Modifying` runs a **bulk JPQL update/delete** — one statement, no entity loading. Critical consequences:

- **It bypasses the persistence context** — entities already loaded in the transaction are *not* updated; you must `clear()` after the bulk operation (or it's a stale-data bug).
- **It bypasses lifecycle callbacks** (`@PreUpdate`, auditing) — the DB rows change, the entities don't know.
- It must run in a **transaction** (or `@Transactional` on the caller); returns the affected row count.

```java
@Transactional
public void archiveOldOrders() {
    orderRepo.archiveOlderThan(Instant.now().minus(365, ChronoUnit.DAYS));
    entityManager.clear();    // detach stale managed entities — next reads see the DB truth
}
```

## How we use it in an organization: the scenarios

**Scenario 1 — nightly ETL/import.** File of a million rows: batch insert with `batch_size` + SEQUENCE ids + periodic flush/clear — the recipe above. Without all three, the job crawls or OOMs.

**Scenario 2 — archival/cleanup jobs.** "Archive orders older than a year", "delete expired sessions" — `@Modifying` bulk queries, executed off-peak, with `clear()` after.

**Scenario 3 — mass status transitions.** "Approve all pending invoices for this supplier" — one bulk update instead of a million round-trips.

**Scenario 4 — conditional deletes in tests.** Cleanup between tests: a bulk `delete from Order` (respecting FK order) is far faster than deleting through the context.

## Pitfalls

- **IDENTITY ids kill insert batching** — switch to SEQUENCE (or UUID) when batching matters.
- **No `clear()` after `@Modifying`** — the classic stale-read bug: entities loaded before the bulk update still show the old state.
- **`@Modifying` and callbacks/auditing don't mix** — auditing fields (see the auditing lesson) are *not* updated by bulk queries; stamp the values in the JPQL itself (`set o.updatedAt = :now`).
- **flush inside a read-only transaction** — flush writes; use `@Transactional(readOnly = true)` only where no writes happen.
- **Batch size tuning** — too large (e.g., 10,000) can blow up the prepared-statement cache or the DB's parameter limits; 20-100 is the common band.

## Key takeaways

- `saveAll` + `hibernate.jdbc.batch_size` = grouped INSERTs; without the flag it's a loop of singles.
- SEQUENCE/UUID ids are required for batching (IDENTITY defeats it).
- Periodic `flush()` + `entityManager.clear()` bounds memory in large imports.
- `@Modifying` bulk queries do one DB statement — always `clear()` after, and know they skip callbacks.
- Match the tool to the job: entity loop for per-row logic, bulk query for set-wide changes.
