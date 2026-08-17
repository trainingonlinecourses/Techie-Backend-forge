---
title: The Spring Cache Abstraction
module: spring-cache
order: 1
minutes: 20
topics: ["CacheManager", "@Cacheable", "cache regions", "proxy behavior", "cache configuration"]
docs:
  - title: "Cache Abstraction"
    url: "https://docs.spring.io/spring-framework/reference/integration/cache.html"
---

# The Spring Cache Abstraction

Spring's cache abstraction decouples your code from any concrete cache — you annotate methods with `@Cacheable` and Spring handles store/retrieve through a `CacheManager`. Swap the implementation (in-memory, Redis, Caffeine) by changing one bean.

## Enabling Caching

```java
@Configuration
@EnableCaching
public class CacheConfig {
}
```

`@EnableCaching` registers a `CacheInterceptor` that wraps annotated methods in a proxy. Like `@Transactional` and `@Async`, **self-invocation bypasses the cache** — call through the proxy.

## @Cacheable: The Core Annotation

```java
@Service
public class CourseService {

    @Cacheable("courses")
    public Course getCourse(String courseId) {
        return courseRepository.findById(courseId)
            .orElseThrow(() -> new NotFoundException(courseId));
    }
}
```

Behavior:
1. Before executing, Spring computes the cache key from the arguments.
2. If the cache contains the key, the cached value is returned **without executing the method**.
3. If not, the method runs and its return value is stored.

## Key Generation

Default key = all method parameters. That's rarely what you want. Specify with SpEL:

```java
@Cacheable(value = "courses", key = "#courseId")            // single param
@Cacheable(value = "courses", key = "#dto.code")            // property of param
@Cacheable(value = "courses", key = "#root.methodName")     // method name
@Cacheable(value = "courses", key = "#courseId + '-' + #locale")
@Cacheable(value = "courses", key = "T(java.util.Objects).hash(#a, #b)")
```

Or define a custom `KeyGenerator` bean and reference it:

```java
@Bean
public KeyGenerator courseKeyGenerator() {
    return (target, method, params) -> {
        CourseDto dto = (CourseDto) params[0];
        return dto.tenantId() + "::" + dto.code();
    };
}

@Cacheable(value = "courses", keyGenerator = "courseKeyGenerator")
public Course getCourse(CourseDto dto) { ... }
```

## Conditional and Unless

```java
// Only cache when the condition holds
@Cacheable(value = "courses", condition = "#courseId.startsWith('pub-')")

// Don't cache when the unless expression is true
@Cacheable(value = "courses", unless = "#result == null")
public Course getCourse(String courseId) { ... }

// Combine: cache only non-null, only for public courses
@Cacheable(value = "courses", condition = "#courseId.startsWith('pub-')",
           unless = "#result == null")
public Course getCourse(String courseId) { ... }
```

`condition` is evaluated **before** the method call (on the arguments); `unless` is evaluated **after** (on the result). Both are SpEL.

## Cache Regions

A cache name is a **region** — a logical namespace with its own store, TTL, and eviction policy. Separate by data characteristics, not by class:

```java
@Cacheable("course-catalog")          // rarely changes, long TTL
@Cacheable("course-pricing")          // changes daily, medium TTL
@Cacheable("user-sessions")           // volatile, short TTL
```

On Redis, each region maps to a Redis key namespace; on Caffeine each region is a separate cache with its own spec.

## Multi-Value Caching

```java
@Cacheable(cacheNames = {"courses", "course-summary"})
public Course getCourse(String courseId) { ... }
```

Spring writes to both caches. On a read, it checks them **in order** and returns the first hit. Use sparingly — it doubles write cost and complicates invalidation.

## Sync: Prevent Cache Stampede

With the default settings, ten concurrent requests for the same cold key all miss and all execute the expensive method — the **cache stampede**. `sync = true` makes Spring hold a per-key lock so only one thread executes the method while the others wait for its result:

```java
@Cacheable(value = "courses", sync = true)
public Course getCourse(String courseId) { ... }
```

This is one of the highest-value flags in the annotation. Always set it on hot, expensive lookups.

## Self-Invocation Gotcha

```java
@Service
public class CourseService {

    public Course getCourseWithFallback(String id) {
        Course course = getCourse(id);   // ❌ bypasses proxy — NOT cached
        if (course == null) return defaultCourse();
        return course;
    }

    @Cacheable("courses")
    public Course getCourse(String id) { ... }
}
```

Fix with `@Lazy` self-injection or split into two beans:

```java
@Service
public class CourseService {

    private final CourseService self;

    public CourseService(@Lazy CourseService self) {
        this.self = self;
    }

    public Course getCourseWithFallback(String id) {
        Course course = self.getCourse(id);   // ✅ through the proxy
        if (course == null) return defaultCourse();
        return course;
    }
}
```

## Configuring a CacheManager

### Simple (ConcurrentHashMap — default)

```java
@Bean
public CacheManager cacheManager() {
    return new ConcurrentMapCacheManager("courses", "users");
}
```

### Caffeine (in-memory with TTL + size limits)

```xml
<dependency>
    <groupId>com.github.ben-manes.caffeine</groupId>
    <artifactId>caffeine</artifactId>
</dependency>
```

```java
@Bean
public CacheManager cacheManager() {
    CaffeineCacheManager manager = new CaffeineCacheManager();
    manager.setCaffeine(Caffeine.newBuilder()
        .maximumSize(10_000)
        .expireAfterWrite(Duration.ofMinutes(10))
        .recordStats());
    return manager;
}
```

Caffeine is the right default for single-instance apps: fast, bounded, and stats-enabled.

## Testing Cached Methods

```java
@SpringBootTest
class CourseServiceTest {

    @Autowired CourseService service;
    @Autowired CacheManager cacheManager;

    @Test
    void secondCallHitsCache() {
        Course first = service.getCourse("c1");
        Course second = service.getCourse("c1");
        assertSame(first, second);   // same instance => served from cache
    }

    @Test
    void cacheCanBeEvicted() {
        service.getCourse("c1");
        cacheManager.getCache("courses").clear();
        Course again = service.getCourse("c1");  // re-executes
        assertNotNull(again);
    }
}
```

## Summary

| Concern | Answer |
|---------|--------|
| When to cache | Expensive reads, low-write data, acceptable staleness |
| Where | Repository/service reads, not writes |
| Key | Explicit SpEL key — never rely on default |
| Stampede | `sync = true` |
| Staleness | TTL or explicit eviction |
| Pitfall | Self-invocation, null caching, unbounded caches |

The annotation is the easy part — the design (what to cache, for how long, how to invalidate) is the hard part. The next lessons cover eviction, Redis, and cache manager configuration in depth.
