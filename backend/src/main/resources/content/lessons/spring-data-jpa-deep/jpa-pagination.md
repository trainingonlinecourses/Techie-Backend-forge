---
title: Pagination & Sorting — Pageable, Page vs Slice, and Keyset Pagination
summary: Pageable and Sort, the difference between Page and Slice, the COUNT query cost, and keyset pagination for deep pages.
order: 9
minutes: 18
topics: [pagination, pageable, page, slice, sort, keyset-pagination, offset, count-query]
docs:
  - https://docs.spring.io/spring-data/commons/reference/repositories/paging-and-sorting.html
  - https://use-the-index-luke.com/sql/partial-results/fetch-next-page
---

# Pagination & Sorting — Pageable, Page vs Slice, and Keyset Pagination

## The concept: don't load the whole table

Any list that can grow — orders, users, log rows — must be paginated: fetch a *page* of N rows instead of everything. Spring Data's `Pageable`/`Sort` turn this into a one-line repository signature, but choosing the right variant matters because the cost differs dramatically.

```java
public interface OrderRepository extends JpaRepository<Order, Long> {
    Page<Order> findByCustomerId(Long customerId, Pageable pageable);   // returns Page
    Slice<Order> findByCustomerId(Long customerId, Pageable pageable);  // returns Slice
    List<Order> findTop10ByCustomerIdOrderByCreatedAtDesc(Long customerId); // fixed-size — no paging at all
}
```

The call site:

```java
PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"))
// or with multiple keys:
PageRequest.of(0, 20, Sort.by("status").descending().and(Sort.by("createdAt").descending()))
```

## Page vs Slice — the COUNT query

- **`Page<T>`** = one slice *plus* `SELECT COUNT(*)` for the same predicate — so the client knows total pages. The COUNT is a **second query** and can be expensive on big tables (a full scan of the filtered index).
- **`Slice<T>`** = just the slice plus a `hasNext` flag (fetches one extra row to decide). **No COUNT query.** 

```text
Page:   SELECT * ... LIMIT 20 OFFSET 40  +  SELECT COUNT(*) WHERE ...      (2 queries)
Slice:  SELECT * ... LIMIT 21 OFFSET 40                                    (1 query, +1 row)
```

**Org rule:** use `Slice` (or plain `List` + `PageRequest`) when the UI only needs "next / previous" — which is most infinite-scroll and cursor UIs. Use `Page` only when the UI genuinely shows total pages (and the count query is cheap or cached). For search-heavy backends, `Page` on a huge filtered set can dominate the request cost — a classic "why is my search slow?" answer.

## Pageable from the controller

```java
@GetMapping("/api/orders")
public Page<OrderSummary> list(@RequestParam(defaultValue = "0") int page,
                               @RequestParam(defaultValue = "20") int size,
                               @RequestParam(defaultValue = "createdAt,desc") String sort,
                               Pageable pageable) {
    // Spring can also bind Pageable directly:
    //   GET /api/orders?page=0&size=20&sort=createdAt,desc&sort=status,asc
    return orderRepo.findSummariesBy(pageable);
}
```

Binding `Pageable` directly from query params (`?page=&size=&sort=`) is the Spring Data idiom; a `@PageableDefault` annotation sets safe defaults so a missing param can't blow up.

## The deep-page problem and keyset pagination

Offset pagination (`LIMIT x OFFSET y`) degrades: to fetch page 10,000, the database still scans 200,000 rows to skip them. **Keyset (seek) pagination** instead fetches rows *after a known key* — no offset, always index-range reads, O(1)-ish per page:

```java
public interface OrderRepository extends JpaRepository<Order, Long> {
    // keyset: rows strictly after (createdAt, id) — a stable, unique sort key
    @Query("select o from Order o where (o.createdAt > :cursorTime) " +
           "   or (o.createdAt = :cursorTime and o.id > :cursorId) " +
           "order by o.createdAt asc, o.id asc")
    List<Order> findAfter(@Param("cursorTime") Instant cursorTime,
                          @Param("cursorId") Long cursorId,
                          @Param("limit") int limit);
}
// page 2 = findAfter(cursorTime of last row of page 1, cursorId of last row of page 1, 20)
```

The cursor is the *last seen* (`createdAt`, `id`) pair — the composite key must be unique and stable, which `(createdAt, id)` guarantees. This is the pattern for **infinite scroll, activity feeds, and exports over large tables** — where offset pages 100+ make the database crawl. (Many teams adopt the same idea at the API level as cursor-based pagination: `?cursor=...`.)

## How we use it in an organization: the scenarios

**Scenario 1 — admin order list.** Total counts matter for "1 of 48 pages" UI → `Page` (count query acceptable at admin scale). Cap `size` (`@PageableDefault(size = 25, max = 200)`) so a client can't request 10 million rows.

**Scenario 2 — activity feed / infinite scroll.** `Slice` or keyset cursor — the count query would double every feed request for no user value.

**Scenario 3 — bulk export job.** Iterate with keyset pagination in a batch loop; each page is an index range-read and the job never re-scans skipped rows.

**Scenario 4 — search result paging.** If the UI shows total results, count once and cache; on large filtered sets, prefer `Slice` + "load more".

## Pitfalls

- **Sort by non-indexed columns** makes every page an expensive sort+scan — sort keys should match an index (or be part of one).
- **Unbounded `size`** — clamp it; a malicious `?size=100000000` is a self-inflicted DoS.
- **Sort injection** — binding `sort` from user input can reference arbitrary entity properties; whitelist allowed sort keys or rely on property-path validation (Spring validates against the entity, but unknown paths throw — map them to a default rather than 500).
- **Counting every page** — the COUNT is the hidden cost of `Page`; measure before defaulting to it.
- **Offset pagination on volatile data** — inserts/deletes between page fetches shift rows (duplicates/skips); cursors (keyset) are stable for feeds.

## Key takeaways

- `Pageable`/`Sort` give pagination with one signature; bind `Pageable` from query params.
- `Page` adds a COUNT query — use it only when total pages are shown; `Slice` for next/prev.
- Offset pagination degrades on deep pages — keyset/seek pagination by a stable `(key, id)` cursor.
- Clamp `size`, whitelist sort keys, keep sort columns indexed.
- Choose per scenario: admin lists → `Page`; feeds/exports → `Slice` or keyset.
