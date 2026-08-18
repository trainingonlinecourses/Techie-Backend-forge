---
title: Soft Delete — @SQLDelete, Filters and Deleted-At Columns
summary: Why teams soft-delete, the @SQLDelete/@SQLRestriction pattern, the deleted_at column conventions, and the query/complexity trade-offs.
order: 13
minutes: 17
topics: [soft-delete, sqldelete, sqlrestriction, deleted-at, audit, data-retention]
docs:
  - https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#database-soft-delete
---

# Soft Delete — @SQLDelete, Filters and Deleted-At Columns

## The concept: delete = mark, don't remove

**Soft delete** means a `DELETE` doesn't remove the row — it sets `deleted_at` (and optionally `deleted_by`), and queries exclude deleted rows. Why teams choose it:

- **Recoverability** — accidental deletes are reversible ("undelete" is a WHERE flip).
- **Audit/legal retention** — regulatory data must survive "deletion".
- **Referential integrity during migration** — children referencing the row keep working.
- **Analytics** — deleted data still count for historical reports.

The cost: **every query and every constraint must be soft-delete-aware** — a discipline that, done wrong, leaks deleted rows into results or breaks unique constraints.

## The classic implementation — @SQLDelete + @SQLRestriction

```java
@Entity
@SQLDelete(sql = "UPDATE orders SET deleted_at = now(), deleted_by = current_user() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")     // every SELECT adds this filter automatically
public class Order {
    @Id @GeneratedValue private Long id;

    @Column(name = "deleted_at")
    private Instant deletedAt;             // null = live, non-null = soft-deleted

    @Column(name = "deleted_by")
    private String deletedBy;
}
```

- **`@SQLDelete`** — overrides the DELETE statement: instead of removing the row, it sets the tombstone columns. (Hibernate 6.3+: `@SoftDelete` does this with less boilerplate.)
- **`@SQLRestriction`** — appends `deleted_at IS NULL` to every query on this entity, so `findAll`, derived queries, and JPQL automatically exclude deleted rows. (Hibernate 6.3+: `@SoftDelete` also applies this automatically.)

With both, the *application* just calls `orderRepo.delete(order)` and everything else "just works" — the SQL layer does the tombstoning and filtering.

## Unique constraints — the soft-delete trap

```java
@Entity
@SQLDelete(...)
@SQLRestriction("deleted_at IS NULL")
public class Customer {
    @Column(nullable = false, unique = true)
    private String email;                  // ⚠️ unique across ALL rows — deleted ones too!
}
```

Soft-deleting a customer with email `a@x.com` then creating a new one with the same email **violates the unique constraint** — the tombstoned row still holds the old email. The fix: make the unique constraint **partial** (Postgres):

```sql
CREATE UNIQUE INDEX uq_customer_email_live
    ON customers (email)
    WHERE deleted_at IS NULL;              -- uniqueness only among live rows
```

Postgres's **partial indexes** are the standard answer. (MySQL/others need a workaround — e.g., a nullable `deleted_email` column, or storing the tombstone with a deleted-key.)

## Soft delete everywhere — the completeness problem

The trap with soft delete is **forgetting a path**:

- **Queries** — a native query (`@Query(nativeQuery = true)`) does NOT get the `@SQLRestriction` filter; you must add `deleted_at IS NULL` yourself. Same for `@EntityGraph`/joins in some cases.
- **Relationships** — `order.getItems()` may load soft-deleted items unless the child also has the restriction (and the join honors it).
- **Counts and aggregates** — reports that sum "all orders" must decide whether deleted count; usually they exclude them explicitly.
- **Bulk queries** (`@Modifying`) bypass the restriction — write the filter by hand.
- **FK constraints** — a soft-deleted parent still referenced by live children blocks a *real* delete elsewhere; design the retention story deliberately.

The discipline: **test the deleted-path for every repository method** — "deleted rows don't appear in find, count, relationships, or native queries."

## How we use it in an organization: the scenarios

**Scenario 1 — GDPR-style "delete my data".** The legal requirement is often *erasure*, not tombstoning — a soft-deleted record still holding PII fails the requirement. The pattern: soft-delete for immediate effect, then a **purge job** that hard-deletes rows older than the retention window (e.g., 30 days after the delete request). Soft delete is a staging step, not the final answer for erasure.

**Scenario 2 — order history.** Customers "delete" an order from their view — the row is tombstoned but retained for finance/reconciliation. Reports query the raw table (including deleted) with a reason flag.

**Scenario 3 — account recovery.** "Sign up with this email" after a previous account was closed: soft delete + partial unique index lets the same email be reused while the history survives.

**Scenario 4 — versioned entities.** Combined with auditing, `deleted_at`/`deleted_by` gives the full "who deleted what when" trail — the audit answer without a separate log table.

## The alternatives — when NOT to soft-delete

- **Hard delete + audit log** — if the data is truly disposable but you need the *fact* of deletion, an audit row is lighter than tombstoning every table.
- **Status column instead of deletion** — "active/inactive/archived" is often the *domain* state, not a delete at all; modeling it as an enum beats a hidden tombstone.
- **Separate archive table** — move old rows to an `_archive` table at a cutoff; keeps the live table lean and the archive queryable.

Soft delete is a tool, not a default — teams weigh query complexity and retention needs per table.

## Pitfalls

- **Unique constraints break** — the classic soft-delete production bug; use partial indexes.
- **Native queries and bulk updates skip the filter** — add `deleted_at IS NULL` manually.
- **Never calling the real delete** — `@SQLDelete` rewrites the SQL, but a `@Modifying delete from Order o` is a *bulk* query that bypasses it — you've hard-deleted.
- **Deleted rows in reports** — decide the reporting policy explicitly; the hidden filter surprises analysts.
- **PII retention** — soft delete is not erasure; pair with a purge job for legal deletion.

## Key takeaways

- Soft delete = `deleted_at` tombstone + `@SQLDelete` + `@SQLRestriction` (or Hibernate 6.3+ `@SoftDelete`).
- Every path must honor the filter: derived queries get it, native/bulk queries don't — test the deleted path.
- Partial unique indexes (`WHERE deleted_at IS NULL`) fix the re-use-unique-value problem.
- Pair soft delete with a purge job for legal erasure; consider status columns and archive tables as alternatives.
- Weigh the query complexity cost per table — soft delete is a decision, not a default.
