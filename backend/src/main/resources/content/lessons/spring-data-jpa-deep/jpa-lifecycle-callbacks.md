---
title: Entity Lifecycle Callbacks — @PrePersist, @PostLoad and @EntityListeners
summary: The persist/load/update/remove lifecycle, callback annotations, entity listeners vs callbacks, and the production patterns (hashing, defaults, timestamps).
order: 10
minutes: 17
topics: [lifecycle, prepersist, postload, entitylisteners, callback, preupdate, postpersist]
docs:
  - https://docs.oracle.com/javaee/7/tutorial/persistence-intro003.htm
  - https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#events-jpa
---

# Entity Lifecycle Callbacks — @PrePersist, @PostLoad and @EntityListeners

## The concept: hooks around persistence events

JPA defines a **lifecycle**: new → managed → detached → removed. At each transition the persistence provider fires **callback events**, and you can attach methods that run at those moments. The annotations:

- `@PrePersist` — before the entity is inserted (first `persist`/`save`).
- `@PostPersist` — right after the insert.
- `@PreUpdate` — before an UPDATE (dirty-check flush).
- `@PostUpdate` — after the update.
- `@PreRemove` — before a DELETE.
- `@PostRemove` — after the delete.
- `@PostLoad` — after the entity is loaded from the database (and after every refresh/merge).

```java
@Entity
public class Customer {
    @Id @GeneratedValue private Long id;
    private String email;
    private String passwordHash;
    private String normalizedEmail;

    @PrePersist
    void onPersist() {
        // Business invariant enforced at the persistence boundary — no service can forget it
        this.normalizedEmail = email.trim().toLowerCase(Locale.ROOT);
        if (passwordHash == null) {
            throw new IllegalStateException("passwordHash must be set before persist");
        }
    }

    @PostLoad
    void onLoad() {
        // Derived, denormalized view — computed for every read, not stored
    }
}
```

Because callbacks fire inside the persistence provider, they run for **every** save path — service method, bulk save, test fixture — which is exactly why teams use them for invariants that must never be missed.

## Entity listeners — callbacks for many entities

Rather than annotating every entity, a **listener class** can be shared via `@EntityListeners`:

```java
public class AuditListener {
    @PrePersist
    void beforePersist(Object entity) {
        if (entity instanceof Auditable a) {
            a.setCreatedAt(Instant.now());   // shared timestamp logic for all entities
        }
    }
    @PreUpdate
    void beforeUpdate(Object entity) {
        if (entity instanceof Auditable a) {
            a.setUpdatedAt(Instant.now());
        }
    }
}

@MappedSuperclass
@EntityListeners(AuditListener.class)
public abstract class Auditable { /* createdAt, updatedAt, setters */ }
```

`@EntityListeners` on a `@MappedSuperclass` is inherited by every subclass — this is how Spring Data's auditing (`@CreatedDate`) works under the hood (its `AuditingEntityListener` is exactly this pattern). Listeners take the entity as a parameter; callbacks inside the entity take none.

## How we use it in an organization: the scenarios

**Scenario 1 — normalize at the boundary.** Emails, phone numbers, and slugs normalized in `@PrePersist`/`@PreUpdate` — every insert path gets clean data, and code review stops checking "did the service normalize before save?".

**Scenario 2 — hash sensitive fields before writing.** A token or secret that must never be stored raw:

```java
@PrePersist @PreUpdate
void hashSecret() {
    if (rawSecret != null && !rawSecret.equals(storedHash)) {
        storedHash = hmac(rawSecret);   // raw never touches the column
        rawSecret = null;
    }
}
```

**Scenario 3 — default/derived values at load.** `@PostLoad` computes transient fields (age from birth date, a display label) so reads always see current values without recomputing in every endpoint.

**Scenario 4 — invariant enforcement.** Refuse persistence of invalid state: `@PrePersist` throwing `IllegalStateException` makes the *database* the last line of defense — no service layer bug can insert a broken row.

## The trap: callbacks are not a service layer

The most common production mistake is **business logic inside callbacks that needs dependencies or transactions**. Callbacks run inside the persistence provider's session — they **cannot inject services or repositories** (the entity isn't a Spring bean), and they run *within* the surrounding transaction but outside your service's control. So:

- **Do** use them for per-entity invariants, normalization, derived fields, hashing.
- **Don't** use them for cross-entity work (send email, call another service, update another aggregate) — that belongs in the service layer or domain events.

Also: `@PrePersist`/`@PreUpdate` changes made to the entity are **included in the same flush** (the dirty-check picks them up); `@PostPersist`/`@PostUpdate` receive the entity *after* the SQL ran, so a database-generated value (sequence, trigger) is visible there but not in `@Pre*`.

## Pitfalls

- **`@PreUpdate` doesn't fire on a no-op flush** — if nothing changed, Hibernate may skip the UPDATE and its callback. Don't rely on `@PreUpdate` for "every update" when the row may be unchanged.
- **Detached entities** — merging a detached entity triggers the callbacks on merge; calling setters on a detached entity then merging runs the same hooks, so keep callbacks idempotent.
- **Callbacks in tests** — fixtures that save entities run callbacks too; surprising failures in tests are often a `@PrePersist` invariant. That's the feature working as intended.
- **Exceptions in callbacks abort the transaction** — an unhandled exception in `@PrePersist` rolls back the whole operation; be deliberate (throw to reject, or swallow only for truly optional side-effects).
- **Native SQL bypasses callbacks** — only Hibernate-managed entity operations fire them.

## Key takeaways

- Lifecycle callbacks hook persist/load/update/remove — per-entity via methods, cross-entity via `@EntityListeners`.
- Use them for normalization, invariants, hashing, and derived values — all save paths covered.
- They can't inject services — keep them dependency-free; domain orchestration lives in the service layer.
- Changes in `@Pre*` join the same flush; `@Post*` see database-generated values.
- Native SQL and no-op flushes bypass callbacks — know the boundaries.
