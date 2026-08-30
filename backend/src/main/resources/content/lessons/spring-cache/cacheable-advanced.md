---
title: @CachePut, @CacheEvict and Cache Consistency
module: spring-cache
order: 2
minutes: 20
topics: ["@CachePut", "@CacheEvict", "cache invalidation", "write-through", "consistency"]
summary: @Cacheable only reads. Writes need @CachePut (update the cache alongside the write) and @CacheEvict (invalidate). Choosing the right one — and the ...
docs:
  - title: "Cache annotation reference"
    url: "https://docs.spring.io/spring-framework/reference/integration/cache.html#cache-annotations"
---

# @CachePut, @CacheEvict and Cache Consistency

`@Cacheable` only reads. Writes need `@CachePut` (update the cache alongside the write) and `@CacheEvict` (invalidate). Choosing the right one — and the right order — is the difference between a cache that helps and a cache that serves stale data.

## @CachePut: Write-Through

`@CachePut` always executes the method, then stores the result. It never short-circuits:

```java
@Service
public class CourseService {

    @CachePut(value = "courses", key = "#course.code")
    public Course updateCourse(Course course) {
        return courseRepository.save(course);
    }
}
```

Every update writes through to the cache, so the next read of that key is fresh. But write-through has a cost: if the DB write succeeds and the cache write fails, you have stale data. If the method throws, nothing is cached — which is correct.

## @CacheEvict: Invalidation

`@CacheEvict` removes entries. Use it when the new value isn't easily derivable from the method result:

```java
@CacheEvict(value = "courses", key = "#courseId")
public void deleteCourse(String courseId) {
    courseRepository.deleteById(courseId);
}
```

### All Entries

```java
@CacheEvict(value = "courses", allEntries = true)
public void rebuildCatalog() { ... }
```

`allEntries = true` wipes the whole region. Blunt but essential for bulk operations.

### Before vs. After Invocation

```java
@CacheEvict(value = "courses", key = "#courseId", beforeInvocation = true)
public void updateCourse(String courseId, CourseDto dto) { ... }

@CacheEvict(value = "courses", key = "#courseId")   // default: AFTER
public void updateCourse(String courseId, CourseDto dto) { ... }
```

- **After** (default): if the method throws, the cache is untouched — stale data survives, but the DB wasn't changed either, so cache and DB stay consistent.
- **Before**: the cache is cleared even if the method throws. Safer for "always invalidate" scenarios but can clear entries unnecessarily.

### Conditional Eviction

```java
@CacheEvict(value = "courses", key = "#courseId", condition = "#dto.published == false")
public void unpublish(String courseId, CourseDto dto) { ... }
```

## Combining Cacheable + Evict: The Update Pattern

The classic trap: a method that writes and returns the new value, annotated `@Cacheable`, which silently **serves the stale cached value instead of the fresh write**:

```java
// ❌ WRONG: @Cacheable skips the method, so the DB is never updated
@Cacheable(value = "courses", key = "#course.id")
public Course saveCourse(Course course) { ... }
```

Correct: `@CachePut` for the write path, `@CacheEvict` for deletes:

```java
@CachePut(value = "courses", key = "#course.code")
public Course saveCourse(Course course) { ... }

@CacheEvict(value = "courses", key = "#code")
public void deleteCourse(String code) { ... }
```

## Multi-Operation Caching

`@Caching` bundles several cache operations on one method:

```java
@Caching(
    put = @CachePut(value = "courses", key = "#course.code"),
    evict = @CacheEvict(value = "course-list", allEntries = true)
)
public Course saveCourse(Course course) { ... }
```

Save the course in the detail cache **and** invalidate the list cache in one shot. Without this, the list cache would keep returning a stale catalog.

## Multi-Value Eviction

```java
@CacheEvict(cacheNames = {"courses", "course-summary"}, allEntries = true)
public void rebuildCatalog() { ... }
```

## The Consistency Problem

Caches are copies, so they can drift from the database. The consistency strategies:

| Strategy | Mechanism | Risk |
|----------|-----------|------|
| TTL only | Entries expire | Reads stale up to TTL |
| Write-through (@CachePut) | Update cache on write | Cache write can fail; extra latency |
| Invalidate-on-write (@CacheEvict) | Drop cache on write | Cache miss + recompute on next read |
| Event-driven | Listen to DB change events | More moving parts |
| Read-through with refresh | Async background refresh | Complexity |

The industry-standard default: **invalidating eviction + TTL as a safety net**. It's simple, correct under concurrency, and the next read rebuilds the entry.

## Ordering With Transactions

When the method is also `@Transactional`, the interceptor order matters. Spring applies `CacheInterceptor` **outside** `TransactionInterceptor` by default (cache is outermost). Consequence:

- The method writes, commits, then the eviction runs — good.
- But the cache is evicted **before** the transaction commits? No — with the default ordering the cache operations run after the method returns (which is after commit for `REQUIRED` propagation).

The subtle issue is the reverse: a `@CachePut` writes the cache *inside* the transaction's success path but *before* commit. If the commit later fails, the cache holds a value the DB never persisted:

```java
@CachePut(value = "courses", key = "#course.code")
@Transactional
public Course saveCourse(Course course) {
    return courseRepository.save(course);   // put runs, then commit may fail
}
```

If commit fails, the cache has an entry the DB lacks — a phantom. Mitigate with a small TTL or by moving the cache op after commit via `TransactionSynchronizationManager`:

```java
@Transactional
public Course saveCourse(Course course) {
    Course saved = courseRepository.save(course);
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                cacheManager.getCache("courses").put(course.getCode(), saved);
            }
        });
    return saved;
}
```

## Common Pitfalls

| Pitfall | Symptom |
|---------|---------|
| `@Cacheable` on a write method | DB never updated — method skipped |
| Evict key mismatch with put key | Stale entry survives eviction |
| Eviction after throwing method | Stale entry persists |
| Cache put before commit failure | Phantom entries |
| Forgetting list caches | New item invisible in listings |
| Null returns cached | Repeated misses (unless `unless` set) |

## Summary

`@CachePut` writes through; `@CacheEvict` invalidates; `@Caching` combines them. The robust default is invalidate-on-write plus TTL, with `@CachePut` reserved for hot single-entity reads where the write result is exactly what readers need. Never annotate writes with `@Cacheable`, and always think about what happens when the DB write and the cache operation disagree.
