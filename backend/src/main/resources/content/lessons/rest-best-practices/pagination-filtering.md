---
title: Pagination, Filtering and Sorting
module: rest-best-practices
order: 3
minutes: 22
topics: ["Pageable", "Page", "offset vs cursor", "filtering", "sorting", "pagination response shape"]
summary: Unbounded list endpoints are a performance and UX bug: a GET /api/courses that returns 100,000 rows chokes the DB, the network, and the client. Pag...
docs:
  - title: "Spring Data web support"
    url: "https://docs.spring.io/spring-data/commons/reference/repositories/core-domain-events.html#core.web"
---

# Pagination, Filtering and Sorting

Unbounded list endpoints are a performance and UX bug: a `GET /api/courses` that returns 100,000 rows chokes the DB, the network, and the client. Pagination, filtering, and sorting turn that into a bounded, predictable contract.

## Pageable: Spring Data's Pagination Primitive

Spring Data's web support auto-binds `Pageable` from query parameters:

```
GET /api/courses?page=0&size=20&sort=title,asc&sort=minutes,desc
```

```java
@RestController
@RequestMapping("/api/courses")
public class CourseController {

    private final CourseRepository repository;

    @GetMapping
    public Page<CourseDto> list(Pageable pageable) {
        return repository.findAll(pageable).map(CourseDto::from);
    }
}
```

`Pageable` comes pre-parsed: `page` (0-based), `size` (default 20, max 100 by default), `sort` (repeatable, comma-separated field + direction).

## The Page Response Shape

`Page<CourseDto>` serializes with all the metadata clients need:

```json
{
  "content": [ { "id": 1, "title": "..." }, ... ],
  "pageable": { "page": 0, "size": 20, "sort": { "sorted": true, "unsorted": false } },
  "totalElements": 148,
  "totalPages": 8,
  "last": false,
  "first": true,
  "number": 0,
  "size": 20,
  "numberOfElements": 20,
  "empty": false
}
```

That's verbose. Many teams trim it to a minimal DTO:

```java
public record PageResponse<T>(List<T> items, int page, int size,
                              long totalElements, int totalPages) {

    public static <T> PageResponse<T> from(Page<T> page) {
        return new PageResponse<>(page.getContent(), page.getNumber(),
            page.getSize(), page.getTotalElements(), page.getTotalPages());
    }
}
```

```json
{ "items": [...], "page": 0, "size": 20, "totalElements": 148, "totalPages": 8 }
```

## Filtering With Query Parameters

Pass filters as named params and build the query:

```java
@GetMapping
public Page<CourseDto> list(
        @RequestParam(required = false) String title,
        @RequestParam(required = false) String level,
        @RequestParam(required = false) Integer minMinutes,
        Pageable pageable) {

    Specification<Course> spec = Specification.where(null);

    if (title != null) spec = spec.and((root, q, cb) ->
        cb.like(cb.lower(root.get("title")), "%" + title.toLowerCase() + "%"));
    if (level != null) spec = spec.and((root, q, cb) ->
        cb.equal(root.get("level"), level));
    if (minMinutes != null) spec = spec.and((root, q, cb) ->
        cb.greaterThanOrEqualTo(root.get("minutes"), minMinutes));

    return repository.findAll(spec, pageable).map(CourseDto::from);
}
```

For simple cases, Spring Data derived queries plus `Pageable`:

```java
@Repository
public interface CourseRepository extends JpaRepository<Course, Long> {

    Page<Course> findByLevelAndPublishedTrue(String level, Pageable pageable);

    Page<Course> findByTitleContainingIgnoreCase(String title, Pageable pageable);
}
```

## Offset vs. Cursor Pagination

### Offset (page/size) — the default

```
LIMIT 20 OFFSET 40
```

- ✅ Simple, supports arbitrary jumps (`page=5`)
- ❌ Slow on deep pages — `OFFSET 100000` makes the DB scan and discard 100k rows
- ❌ Unstable under inserts/deletes — new rows shift pages, items appear/disappear

### Cursor (keyset) — for large, append-heavy data

```
GET /api/events?limit=20&cursor=eyJpZCI6MTAwMH0=
```

```java
// Keyset: WHERE id > :lastSeen ORDER BY id LIMIT 20
public List<Event> pageAfter(Long lastId, int limit) {
    return jdbc.query("""
        SELECT * FROM events
        WHERE id > ?
        ORDER BY id
        LIMIT ?""", eventRowMapper, lastId, limit);
}
```

- ✅ Constant-time on any page depth (index seek)
- ✅ Stable under concurrent inserts
- ❌ No random access to "page 5" — only next/prev
- ❌ Sorting must be on an indexed, unique column

**Choose cursor for feeds/timelines/audit logs; offset for admin tables and small datasets.**

## Defaults and Guards

```yaml
spring:
  data:
    web:
      pageable:
        default-page-size: 20
        max-page-size: 100
        one-indexed-parameters: false
```

A `max-page-size` guard is essential — otherwise `?size=1000000` lets a client request the whole table.

## Sorting Safely

Never let raw client input reach `ORDER BY` unsanitized. Whitelist sortable fields:

```java
public Page<CourseDto> list(Pageable pageable) {
    Pageable safe = PageableUtil.sanitize(pageable, Set.of("title", "minutes", "createdAt"));
    return repository.findAll(safe).map(CourseDto::from);
}
```

```java
public final class PageableUtil {
    private static final Set<String> BLOCKED = Set.of(
        ";", "--", "drop", "select", "union", "\\", "'", "\"", "`");

    public static Pageable sanitize(Pageable pageable, Set<String> allowed) {
        if (!pageable.getSort().isSorted()) return pageable;
        Sort safe = pageable.getSort().stream()
            .filter(order -> allowed.contains(order.getProperty()))
            .map(order -> new Sort.Order(order.getDirection(), order.getProperty()))
            .collect(Collectors.collectingAndThen(Collectors.toList(),
                orders -> orders.isEmpty() ? Sort.unsorted() : Sort.by(orders)));
        return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), safe);
    }
}
```

Note: Spring Data's `Pageable` binding already rejects SQL metacharacters in sort properties (it validates against the entity's properties) — the whitelist is defense-in-depth and keeps the contract explicit.

## Search vs. Filter

- **Filter** = structured, cheap, indexed fields → query params above.
- **Search** = fuzzy, ranked, across many fields → dedicated search (Postgres full-text, Elasticsearch). Don't bolt `LIKE '%x%'` onto every column.

```java
@GetMapping("/api/courses/search")
public Page<CourseDto> search(@RequestParam String q, Pageable pageable) {
    // delegates to a search index, not ILIKE on everything
    return searchService.search(q, pageable).map(CourseDto::from);
}
```

## Testing Pagination

```java
@SpringBootTest
@AutoConfigureMockMvc
class CourseControllerPaginationTest {

    @Autowired MockMvc mockMvc;

    @Test
    void respectsPageAndSize() throws Exception {
        mockMvc.perform(get("/api/courses").param("page", "1").param("size", "5"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.page").value(1))
            .andExpect(jsonPath("$.size").value(5))
            .andExpect(jsonPath("$.items.length()").value(5));
    }

    @Test
    void rejectsOversizedPages() throws Exception {
        mockMvc.perform(get("/api/courses").param("size", "100000"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.size").value(100));   // clamped by max-page-size
    }
}
```

## Summary

| Concern | Practice |
|---------|----------|
| Pagination | `Pageable` auto-bound, 0-based, with `max-page-size` |
| Response | Minimal `PageResponse` DTO — don't leak the whole `Page` |
| Filtering | Named query params → Specifications or derived queries |
| Large feeds | Cursor pagination on indexed unique keys |
| Sorting | Whitelist fields; let Spring validate properties |
| Search | Dedicated search, not `LIKE` everywhere |
| Stability | Cursor for live data; offset for admin tables |

Pagination isn't just about the endpoint — it's about protecting your database and giving clients a predictable paging contract they can build UI on.
