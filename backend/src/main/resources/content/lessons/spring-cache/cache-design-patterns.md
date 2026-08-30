---
title: Cache Design Patterns & Anti-Patterns
module: spring-cache
order: 5
minutes: 25
topics: ["cache-aside", "read-through", "write-through", "write-behind", "stampede", "anti-patterns"]
docs:
  - title: "Cache patterns"
    url: "https://docs.spring.io/spring-framework/reference/integration/cache.html#cache-annotations-cacheable"
summary: The annotations are syntax; the patterns are the actual design. This lesson covers the four canonical caching patterns, how they map to Spring, and...
---

# Cache Design Patterns & Anti-Patterns

The annotations are syntax; the **patterns** are the actual design. This lesson covers the four canonical caching patterns, how they map to Spring, and the anti-patterns that silently corrupt production data.

## Pattern 1: Cache-Aside (Lazy Loading)

The most common pattern — and exactly what `@Cacheable` implements by default:

```
1. Read:  check cache → miss → load from DB → store in cache → return
2. Write: update DB → evict cache entry
```

```java
@Cacheable(value = "courses", key = "#id", sync = true)   // read path
public Course getCourse(String id) { ... }

@CacheEvict(value = "courses", key = "#id")               // write path
public void updateCourse(String id, CourseDto dto) { ... }
```

**Pros**: simple, only hot data gets cached, easy to reason about.
**Cons**: first read after eviction pays a full DB round-trip (miss penalty); stampede risk without `sync`.

## Pattern 2: Read-Through

The cache itself loads from the DB on a miss — the application only talks to the cache. Spring doesn't do this natively; you implement it in the service:

```java
@Service
public class CourseService {

    @Cacheable(value = "courses", key = "#id", unless = "#result == null")
    public Course getCourse(String id) {
        return courseRepository.findById(id)
            .orElseThrow(() -> new NotFoundException(id));
    }
}
```

**Pros**: callers never touch the DB path; consistent API.
**Cons**: same miss penalty; the "loader" lives in your service rather than the cache.

## Pattern 3: Write-Through

Writes go to the cache and the DB in the same transaction — `@CachePut`:

```java
@CachePut(value = "courses", key = "#course.id")
@Transactional
public Course saveCourse(Course course) {
    return courseRepository.save(course);
}
```

**Pros**: reads are always fresh.
**Cons**: doubles write latency; if the cache write fails after the DB commit, the cache goes stale silently.

## Pattern 4: Write-Behind (Write-Back)

Writes go to the cache immediately and flush to the DB asynchronously:

```java
@CachePut(value = "session-store", key = "#sessionId")
public void touchSession(String sessionId, SessionData data) {
    // cached instantly; a background flusher persists to DB
    asyncFlusher.offer(new SessionUpdate(sessionId, data));
}
```

**Pros**: very fast writes.
**Cons**: data loss window if the app dies before the flush; complex. Rarely worth it for backend caches — use for session stores, counters, or queue buffers.

## The Stampede Problem in Depth

With 100 concurrent cold misses:

- Without `sync`: 100 DB queries, 100 cache writes — the DB melts.
- With `sync = true`: 1 DB query, 99 threads wait.

But `sync` has a subtlety: the lock is **per key within the cache manager**. If two *different* keys are cold, they still each run — correct. And in a Redis-backed cluster, the lock is distributed.

**The deeper fix — probabilistic early expiration**: refresh entries *before* they expire, so a TTL expiry never coincides with a traffic spike:

```java
// Store an "expiresAt" hint inside the cached value
record CachedCourse(Course course, Instant expiresAt) {}

public Course getCourse(String id) {
    CachedCourse cached = cache.get(id);
    if (cached != null) {
        // If within 10% of expiry, trigger a background refresh (single-flight)
        if (cached.expiresAt().isBefore(Instant.now().plusSeconds(60))) {
            refreshExecutor.submit(() -> loadAndCache(id));
        }
        return cached.course();
    }
    return loadAndCache(id);
}
```

## The Anti-Patterns

### 1. Caching Everything

```java
// ❌ Cheap queries don't need caching — it adds complexity and staleness
@Cacheable("users")
public User getUser(String id) {
    return userRepository.findById(id).orElseThrow();
}
```

A primary-key lookup in Postgres takes ~1ms with a warm buffer pool. Caching it buys little and risks stale user data. **Cache expensive queries, aggregations, and external calls — not trivial reads.**

### 2. Caching the Wrong Granularity

```java
// ❌ Caching a whole page/collection invalidation nightmare
@Cacheable("course-list")
public List<Course> getCourses() { ... }
// every add/delete must evict "course-list" — easy to forget
```

**Prefer per-entity keys** (`key = "#id"`) over whole-collection keys.

### 3. No TTL

A cache with no expiration is a slowly-growing pile of stale data. Every cache needs a TTL — even if it's long.

### 4. Caching Mutable Objects

```java
@Cacheable("courses")
public Course getCourse(String id) {
    Course course = courseRepository.findById(id).orElseThrow();
    course.setViews(course.getViews() + 1);   // ❌ mutating the cached object
    return course;
}
```

If callers mutate the returned object, they mutate the cached copy. **Return immutable objects or defensive copies.**

### 5. Cache Invalidation on the Wrong Thread/Instance

```java
// ❌ invalidating only the local instance's cache
@CacheEvict("courses")
public void updateCourse(...) { ... }
```

In a cluster, eviction must reach all replicas — which is why shared Redis (or a pub/sub invalidation channel) beats per-instance caches for writes.

### 6. Ignoring Serialization Cost

Caching a 1 MB object in Redis costs 1 MB per read over the wire. **Cache what you need — DTOs, not entity graphs with lazy associations.**

## Decision Flow

```
Is the read expensive (query, external call, aggregation)?
├─ No  → don't cache
└─ Yes → Is acceptable staleness OK?
        ├─ No  → skip caching or use write-through
        └─ Yes → cache-aside with TTL + sync=true
                 Multi-node? → Redis
                 Single-node? → Caffeine
```

## Summary

| Pattern | Spring idiom | Use when |
|---------|--------------|----------|
| Cache-aside | `@Cacheable` + `@CacheEvict` | Default — most cases |
| Read-through | `@Cacheable` + DB in loader | Uniform read API |
| Write-through | `@CachePut` | Reads must be immediately fresh |
| Write-behind | `@CachePut` + async flush | Very hot writes, tolerant of loss |

Caching is a **staleness trade**, not a speed hack. Every cacheable decision should answer: *how stale can this data be, what happens when it's stale, and what does a stampede cost?* Answer those three and the annotations take care of themselves.
