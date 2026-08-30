---
title: API Versioning Strategies
module: rest-best-practices
order: 4
minutes: 20
topics: ["URI versioning", "header versioning", "media type versioning", "deprecation", "migration"]
docs:
  - title: "Versioning REST APIs"
    url: "https://docs.spring.io/spring-framework/reference/web/webmvc.html#mvc-ann-requestmapping-advanced"
summary: APIs evolve, but consumers don't update at your pace. Versioning is how you change behavior without breaking the clients you already have. Four str...
---

# API Versioning Strategies

APIs evolve, but consumers don't update at your pace. Versioning is how you change behavior without breaking the clients you already have. Four strategies exist; each trades discoverability against cleanliness.

## Strategy 1: URI Path Versioning

```
/api/v1/courses
/api/v2/courses
```

The most common and most explicit choice.

```java
@RestController
@RequestMapping("/api/v1/courses")
public class CourseV1Controller { ... }

@RestController
@RequestMapping("/api/v2/courses")
public class CourseV2Controller { ... }
```

**Pros**: obvious, cacheable (different URLs = different cache keys), works in any client (curl, browsers, SDKs), easy to A/B test.
**Cons**: URLs leak versioning; every endpoint must be duplicated or aliased during migration.

**Verdict**: the pragmatic default for most teams.

## Strategy 2: Query Parameter Versioning

```
/api/courses?version=2
```

```java
@GetMapping("/api/courses")
public CourseDto list(@RequestParam(defaultValue = "1") int version) {
    return switch (version) {
        case 1 -> v1Service.list();
        case 2 -> v2Service.list();
        default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
    };
}
```

**Pros**: trivial to implement, single URL.
**Cons**: pollutes every request; caches treat all versions as one URL (version must join the cache key); easy to forget `version` in a URL and silently get v1.

**Verdict**: fine for internal tools; weak for public APIs.

## Strategy 3: Header Versioning

```
GET /api/courses
X-API-Version: 2
```

```java
@GetMapping(value = "/api/courses", headers = "X-API-Version=1")
public CourseDto listV1() { ... }

@GetMapping(value = "/api/courses", headers = "X-API-Version=2")
public CourseDto listV2() { ... }
```

**Pros**: clean URLs.
**Cons**: invisible in the address bar; harder to debug; caching must vary on the header.

**Verdict**: used by some big APIs (e.g., some Google APIs); rarely worth the hidden complexity.

## Strategy 4: Media Type Versioning

```
Accept: application/vnd.acme.courses.v2+json
```

```java
@GetMapping(value = "/api/courses",
    produces = "application/vnd.acme.courses.v2+json")
public CourseDto listV2() { ... }
```

**Pros**: the most "RESTful" — versioning rides content negotiation; single URL.
**Cons**: hidden from browsers; client libraries must set the Accept header; cache keys must include the media type.

**Verdict**: elegant but operationally heavy; choose only if you already do content negotiation everywhere.

## Comparison

| Strategy | Discoverable | Cache-friendly | Simple | Browser-friendly |
|----------|:---:|:---:|:---:|:---:|
| URI path | ✅ | ✅ | ✅ | ✅ |
| Query param | ⚠️ | ⚠️ | ✅ | ✅ |
| Header | ❌ | ⚠️ | ✅ | ⚠️ |
| Media type | ❌ | ⚠️ | ❌ | ❌ |

## Backward Compatibility Without Versioning

Often you don't need a new version at all:

- **Additive changes** — new fields, new endpoints, optional params: backward compatible, ship in the same version.
- **Stricter validation** — usually fine, but document it.
- **Default changes** — a changed default is a behavior change; bump the version or be explicit.

Version only when the change is **breaking**: removing a field, changing a type, changing semantics.

## The Migration Pattern

```java
@RestController
public class CourseMigrationController {

    @GetMapping("/api/v1/courses/{id}")
    public CourseV1Dto getV1(@PathVariable Long id) {
        // v1: { id, title }
        return CourseV1Dto.from(courseService.findById(id));
    }

    @GetMapping("/api/v2/courses/{id}")
    public CourseV2Dto getV2(@PathVariable Long id) {
        // v2: { id, title, minutes, level }  (added fields)
        return CourseV2Dto.from(courseService.findById(id));
    }
}
```

Migration lifecycle:

1. Ship v2 alongside v1.
2. Keep v1 on a **deprecation schedule** (announce removal date).
3. Return a `Deprecation` header on v1 responses.
4. Remove v1 after the grace period; log every v1 call to measure adoption.

```java
@GetMapping("/api/v1/courses/{id}")
public ResponseEntity<CourseV1Dto> getV1(@PathVariable Long id) {
    return ResponseEntity.ok()
        .header("Deprecation", "true")
        .header("Sunset", "2027-01-01T00:00:00Z")
        .body(CourseV1Dto.from(courseService.findById(id)));
}
```

## Spring's Mapping-Level Versioning

For versioning a single handler without full duplication, `RequestMapping` matching can branch on the version token:

```java
@GetMapping({"/api/v1/courses/{id}", "/api/v2/courses/{id}"})
public CourseDto get(@PathVariable Long id, HttpServletRequest request) {
    boolean v2 = request.getRequestURI().contains("/v2/");
    return v2 ? v2Service.get(id) : v1Service.get(id);
}
```

Cleaner: keep separate controllers per version (shown above) — the version lives in the mapping, not in if/else.

## Testing Versioned Endpoints

```java
@Test
void v1ReturnsLegacyShape() throws Exception {
    mockMvc.perform(get("/api/v1/courses/1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.title").exists())
        .andExpect(jsonPath("$.minutes").doesNotExist());
}

@Test
void v2AddsNewFields() throws Exception {
    mockMvc.perform(get("/api/v2/courses/1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.minutes").value(25));
}

@Test
void v1DeclaresDeprecation() throws Exception {
    mockMvc.perform(get("/api/v1/courses/1"))
        .andExpect(header().string("Deprecation", "true"));
}
```

## Summary

| Decision | Recommendation |
|----------|----------------|
| Default | URI path versioning (`/api/v2/...`) |
| Breaking change only | Don't version additive changes |
| Deprecation | `Deprecation` + `Sunset` headers on old versions |
| Migration | Run versions in parallel; measure v1 traffic; retire on schedule |
| Internal APIs | Query-param versioning is acceptable |
| Public, negotiated APIs | Media-type versioning if you already negotiate |

Versioning is a promise to your consumers: *your code keeps working while we improve ours*. The cheapest correct system is URI versioning plus a real deprecation schedule.
