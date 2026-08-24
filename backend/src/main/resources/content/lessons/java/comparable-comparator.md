---
title: Comparable & Comparator — Ordering Done Right
summary: The natural-ordering contract, Comparator's fluent API, null-safe and multi-key sorting, and the ordering patterns for entities, DTOs and reports.
order: 36
minutes: 19
topics: [comparable, comparator, sorting, ordering, natural-order, comparing, thencomparing]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Comparable.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Comparator.html
---

# Comparable & Comparator — Ordering Done Right

## The concept: two ways to define "in order"

- **`Comparable<T>`** — the type's **natural ordering**: "how does one `Order` compare to another, by default?" Implemented on the class itself; used by `TreeSet`, `TreeMap`, `Collections.sort`, `Arrays.sort` automatically.
- **`Comparator<T>`** — an **external ordering**: "sort by amount desc, then by date asc" — a separate object you pass to the sort. Any number of comparators per type; the tool for every *specific* ordering need.

```java
public record Order(Long id, String status, BigDecimal amount, Instant createdAt)
        implements Comparable<Order> {
    @Override
    public int compareTo(Order o) {
        return createdAt.compareTo(o.createdAt);   // natural order: by creation time
    }
}

// External comparators — sort the same list different ways
orders.sort(Comparator.comparing(Order::amount));                          // asc
orders.sort(Comparator.comparing(Order::amount).reversed());               // desc
orders.sort(Comparator.comparing(Order::status)
                      .thenComparing(Order::createdAt));                   // multi-key
```

## The contract (and its silent consequences)

`compareTo` must be: **consistent with `equals`** (equal objects → compareTo 0) and transitive, and it must return a negative/zero/positive int. Violating consistency breaks `TreeSet`/`TreeMap` silently — duplicates appear, lookups fail, "it worked as a List but not as a TreeSet" is the symptom. Rules:

- Never compare by a **mutable** field (ordering changes while in a TreeSet).
- Use `compare` on primitives (`Long.compare`, `Integer.compare`, `BigDecimal.compareTo`) — never `a - b` (integer overflow!).
- With `Comparator.comparing`, the framework builds the comparator for you — the contract risk shrinks to "which field do I compare".

## How we use it in an organization: the scenarios

**Scenario 1 — multi-key, null-safe sorting.** The most-used comparator pattern — API responses sorted by priority, then recency, with nulls handled:

```java
Comparator<Order> byImportance = Comparator
    .comparing(Order::status, Comparator.nullsFirst(String::compareTo))  // null statuses first
    .thenComparing(Order::createdAt, Comparator.reverseOrder())          // newest first
    .thenComparing(Order::id);                                           // stable tiebreak
orders.sort(byImportance);
```

`Comparator.nullsFirst`/`nullsLast` handle null fields — the classic "sorting with nulls throws NPE" fix. The **tiebreak** (`thenComparing(id)`) is the org rule for *deterministic* ordering: two rows with the same sort key must not flip between pages/requests.

**Scenario 2 — sort by enum rank, not name.** Enums sort by declaration order with a natural comparator, but `Comparator.comparing(Order::status, Comparator.comparingInt(Status::rank))` sorts by an explicit rank field when the desired order isn't declaration order.

**Scenario 3 — sorting across DTOs/lambdas.** For ephemeral sort keys, `Comparator.comparing` with a key extractor beats implementing `Comparable` on every DTO:

```java
return customers.stream()
    .sorted(Comparator.comparing(Customer::name, String.CASE_INSENSITIVE_ORDER)
                      .thenComparing(Customer::id))
    .toList();
```

**Scenario 4 — pagination stability.** "Sort by createdAt desc" on a busy table: two rows created in the same millisecond flip order across pages. The fix — append a unique tiebreak (`thenComparing(Order::id)`): the pattern that makes cursor/offset pagination deterministic (see the pagination lesson).

## Comparable vs Comparator — the decision

| | `Comparable` | `Comparator` |
|---|---|---|
| Where | on the class | separate object/lambda |
| Orderings | one (natural) | many |
| Used by | TreeSet/TreeMap/sort() defaults | explicit sort calls, streams |
| Domain types | value objects, natural keys | any specific sorting need |

**Org rule:** implement `Comparable` only for a type with an obvious natural order (version numbers, timestamps, ids); use `Comparator`s for everything else — especially when the "natural" order changes between screens/reports. Don't implement `Comparable` on JPA entities by mutable business fields — the persistence context and identity semantics fight it (see the equals lesson).

## Pitfalls

- **`a - b` in compareTo** — overflows for large ints (`Integer.MAX_VALUE - (-1)` wraps negative); always use `Integer.compare`/`Long.compare`/`BigDecimal.compareTo`.
- **Comparators that throw on null** — a null field NPEs the sort; `nullsFirst`/`nullsLast` handle it deliberately.
- **Inconsistent with equals** — TreeSet/TreeMap break silently; keep `compareTo == 0` aligned with `equals`.
- **Sorting by mutable fields** — the tree's invariants corrupt; sort keys must be effectively final.
- **Forgetting the tiebreak** — nondeterministic ordering across pages; always append a unique key.

## Key takeaways

- `Comparable` = natural ordering on the class; `Comparator` = external, reusable orderings.
- `Comparator.comparing(...).thenComparing(...)` composes multi-key sorts; chain `reversed()`, `nullsFirst/Last`.
- Use `Integer.compare`/`Long.compare`/`compareTo` on BigDecimals — never subtraction.
- Keep compareTo consistent with equals and free of mutable fields.
- Append a unique tiebreak for deterministic pagination and stable reports.
