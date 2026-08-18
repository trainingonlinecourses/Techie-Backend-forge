---
title: JPA Relationships & Cascade — OneToMany, ManyToMany and Ownership
summary: Owning vs inverse side, cascade types and orphanRemoval, the fetch defaults, and the relationship-design rules that prevent N+1 and delete surprises.
order: 12
minutes: 20
topics: [relationships, onetomany, manytomany, cascade, orphanremoval, owning-side, join-table, fetch-type]
docs:
  - https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#associations
  - https://docs.spring.io/spring-data/jpa/reference/jpa/entity-persistence.html
---

# JPA Relationships & Cascade — OneToMany, ManyToMany and Ownership

## The concept: associations have two sides

A relationship between two entities has an **owning side** (the side that *owns the foreign key*) and an **inverse side** (`mappedBy` — the side that just references back). The owning side decides persistence:

```java
@Entity
public class Order {
    @Id @GeneratedValue private Long id;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderItem> items = new ArrayList<>();
    // OrderItem is the OWNING side (it holds order_id); Order is the inverse (mappedBy)
}

@Entity
public class OrderItem {
    @Id @GeneratedValue private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;      // the FK lives HERE — this is the owning side
}
```

**The rule every JPA developer learns the hard way:** you must maintain **both sides** of the association in memory (add to `order.items` AND set `item.order`), because Hibernate writes the FK from the owning side's state. A helper method on the aggregate is the standard pattern:

```java
public void addItem(OrderItem item) {
    items.add(item);
    item.setOrder(this);     // keep both sides in sync — otherwise the FK is never set!
}
```

## Cascade types — what operations propagate

| Cascade | Propagates |
|---|---|
| `PERSIST` | saving the parent saves the children |
| `MERGE` | merging the parent merges the children |
| `REMOVE` | deleting the parent deletes the children |
| `ALL` | everything (common for aggregates) |
| `DETACH`, `REFRESH` | the less-used rest |

**The org rule:** cascade belongs on **aggregate ownership** — a `Order` owns its `OrderItem`s (cascade ALL + orphanRemoval). A `Customer` does **not** cascade to its `Order`s (orders are their own aggregates) — cascading there makes deleting a customer silently delete their order history, a classic data-loss incident.

**orphanRemoval = true** means: remove a child from the collection → it's deleted from the DB (it's an "orphan"). That's the behavior you want for line items and parts lists. `orphanRemoval = false` leaves the child row dangling (usually a bug or an intentional re-parenting pattern).

## Fetch types — the defaults and why they're traps

- `@ManyToOne` / `@OneToOne` default to **EAGER** — every parent load fetches the child (the root of the N+1 problem and of "why does loading 100 orders run 101 queries").
- `@OneToMany` / `@ManyToMany` default to **LAZY** — fetched on access, which triggers N+1 if you iterate.

**The org standard:** set `fetch = FetchType.LAZY` explicitly on *every* association and control eager fetching deliberately with `@EntityGraph`/`JOIN FETCH` (see the N+1 lesson). EAGER by default is a legacy trap; LAZY everywhere + explicit fetch plans is the modern discipline.

## ManyToMany — the join table

```java
@Entity
public class User {
    @Id @GeneratedValue private Long id;

    @ManyToMany
    @JoinTable(name = "user_roles",
        joinColumns = @JoinColumn(name = "user_id"),
        inverseJoinColumns = @JoinColumn(name = "role_id"))
    private Set<Role> roles = new HashSet<>();     // owns the join table
}
```

- The `@JoinTable` is owned by ONE side (here `User`); the other side uses `mappedBy = "roles"`.
- Use `Set` (not `List`) for ManyToMany — `List` + `@ManyToMany` has a known Hibernate join-table duplicate bug (Hibernate can't easily update a `List` index in the join table).
- If the relationship has **attributes** (e.g., `assigned_at`, `created_by`), it's not ManyToMany — it's an entity (`UserRoleAssignment`) with ManyToOne to both sides. The "when was this role granted" requirement turns the join table into a first-class entity.

## How we use it in an organization: the scenarios

**Scenario 1 — the order aggregate.** `Order` → `OrderItem` (OneToMany cascade ALL + orphanRemoval + both-sides sync). Loading an order loads its items; deleting an order deletes the items; a stray item without an order can't exist.

**Scenario 2 — users and roles.** ManyToMany via `user_roles`; roles are shared (not owned by any user), so no cascade — removing a role just removes the row from the join table.

**Scenario 3 — one-to-one profile.** `User` ↔ `UserProfile`: `@OneToOne` with the FK on one side; LAZY; cascade PERSIST so creating a user can create the profile in one `save`.

**Scenario 4 — the "assignments with metadata" upgrade.** A ManyToMany that grew `assignedAt` becomes an `Assignment` entity — the fix for "we need an audit trail on this link".

## Pitfalls

- **Only maintaining one side** — the FK never gets written (or gets overwritten). Use the both-sides helper method.
- **Cascading delete on shared data** — cascade REMOVE through a ManyToMany or a non-owned relationship deletes rows other aggregates still reference. Cascade only within an aggregate.
- **EAGER default + serialization** — eagerly fetching a graph, then Jackson serializes it, pulling the *whole* object graph — the classic "this endpoint loads the entire database" bug. LAZY + explicit fetch plans.
- **`equals`/`hashCode` on entities with mutable ids** — see the equals lesson; collections (Set) containing entities behave badly if equals uses mutable fields.
- **Deleting the parent without clearing the collection** — the persistence context still holds children; `orphanRemoval` + explicit `remove` handles it, but a clear-then-save pattern is safer for large graphs.

## Key takeaways

- The owning side holds the FK; the inverse side is `mappedBy`; maintain both sides in code.
- Cascade within aggregates (ALL + orphanRemoval); never cascade across aggregate boundaries.
- Set LAZY explicitly everywhere; use `@EntityGraph`/`JOIN FETCH` for deliberate eager loads.
- ManyToMany → `Set` + join table; add an entity when the link carries attributes.
- Relationship design (ownership, cascade, fetch) is the N+1 and data-loss prevention system.
