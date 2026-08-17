---
title: CacheManagers Compared
module: spring-cache
order: 4
minutes: 20
topics: ["ConcurrentMapCacheManager", "CaffeineCacheManager", "CompositeCacheManager", "JCache", "choosing"]
docs:
  - title: "Cache configuration"
    url: "https://docs.spring.io/spring-framework/reference/integration/cache.html#cache-store-configuration"
---

# CacheManagers Compared

Spring's `CacheManager` is the plug point of the whole abstraction. Understand the four real options — and how to mix them — and you can pick the right store per deployment with zero code changes.

## The Four CacheManagers

| CacheManager | Backing store | Best for |
|--------------|---------------|----------|
| `ConcurrentMapCacheManager` | `ConcurrentHashMap` (default) | Dev, single node, trivial caches |
| `CaffeineCacheManager` | Caffeine (off-heap-capable) | Single-node production |
| `RedisCacheManager` | Redis (shared) | Clusters, multi-node |
| `JCacheCacheManager` | Any JSR-107 provider (Ehcache 3, Hazelcast) | Standards-driven teams |

## ConcurrentMapCacheManager

The default. Zero configuration, unlimited size, no TTL — entries live until evicted or the JVM dies.

```java
@Bean
public CacheManager cacheManager() {
    return new ConcurrentMapCacheManager("courses", "users");
}
```

- ✅ No dependencies, works everywhere
- ❌ No TTL, unbounded (memory leak risk), per-instance only

Use it only for development or trivial caches. Every production guide says the same thing: replace it before you go live.

## CaffeineCacheManager

Caffeine is the de facto in-memory cache for JVM apps — bounded, TTL-aware, with hit-rate statistics.

```java
@Bean
public CacheManager cacheManager() {
    CaffeineCacheManager manager = new CaffeineCacheManager();
    manager.setCaffeine(Caffeine.newBuilder()
        .maximumSize(50_000)
        .expireAfterAccess(Duration.ofMinutes(30))
        .expireAfterWrite(Duration.ofHours(2))
        .recordStats());
    return manager;
}
```

Or per-region via `CaffeineCache` instances:

```java
@Bean
public CacheManager cacheManager() {
    CaffeineCacheManager manager = new CaffeineCacheManager();
    manager.registerCustomCache("courses",
        Caffeine.newBuilder().maximumSize(10_000).expireAfterWrite(Duration.ofHours(1)).build());
    manager.registerCustomCache("user-sessions",
        Caffeine.newBuilder().maximumSize(1_000).expireAfterWrite(Duration.ofMinutes(5)).build());
    return manager;
}
```

### Reading Hit Rates

```java
Cache courses = cacheManager.getCache("courses");
if (courses instanceof CaffeineCache caffeineCache) {
    CacheStats stats = caffeineCache.getNativeCache().stats();
    System.out.printf("hits=%d misses=%d hitRate=%.2f%n",
        stats.hitCount(), stats.missCount(), stats.hitRate());
}
```

Expose this via an Actuator endpoint or Micrometer and you can see whether the cache actually helps.

## JCacheCacheManager (Ehcache 3)

JSR-107 is a Java standard; Ehcache 3 is the reference implementation. Configuration lives in an XML file, which some teams prefer for tuning:

```xml
<dependency>
    <groupId>org.ehcache</groupId>
    <artifactId>ehcache</artifactId>
</dependency>
```

```xml
<!-- ehcache.xml -->
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns="http://www.ehcache.org/v3"
        xmlns:jsr107="http://www.ehcache.org/v3/jsr107">
  <cache alias="courses">
    <expiry>
      <ttl unit="hours">1</ttl>
    </expiry>
    <heap unit="entries">10000</heap>
  </cache>
</config>
```

```java
@Bean
public JCacheCacheManager cacheManager(CacheManager jcache) {
    return new JCacheCacheManager(jcache);
}
```

## CompositeCacheManager: Mixing Stores

Different data, different stores — one app, both:

```java
@Bean
public CacheManager cacheManager(CacheManager caffeine, CacheManager redis) {
    CompositeCacheManager composite = new CompositeCacheManager();
    composite.setCacheManagers(List.of(redis, caffeine));  // checked in order
    composite.setFallbackToNoOpCache(true);
    return composite;
}
```

Reads check Redis first, then Caffeine. Note: composite managers are read-mostly; writes go to the first manager that has the cache.

## CacheManager as a Strategy

The entire point of the abstraction: switch stores without touching business code.

```java
// Dev profile: in-memory
@Profile("dev")
@Bean
public CacheManager devCacheManager() {
    return new CaffeineCacheManager();
}

// Prod profile: shared Redis
@Profile("prod")
@Bean
public RedisCacheManager prodCacheManager(RedisConnectionFactory factory) {
    return RedisCacheManager.create(factory);
}
```

Business code stays `@Cacheable("courses")` — the CacheManager is selected by profile at runtime.

## Programmatic Access

Sometimes you need cache access outside annotations:

```java
@Service
public class CacheAdminService {

    private final CacheManager cacheManager;

    public void clear(String cacheName) {
        Cache cache = cacheManager.getCache(cacheName);
        if (cache != null) cache.clear();
    }

    public void put(String cacheName, Object key, Object value) {
        Cache cache = cacheManager.getCache(cacheName);
        if (cache != null) cache.put(key, value);
    }

    public Optional<Object> get(String cacheName, Object key) {
        Cache cache = cacheManager.getCache(cacheName);
        return cache == null ? Optional.empty()
            : Optional.ofNullable(cache.get(key, Object.class));
    }
}
```

## Summary

| Need | CacheManager |
|------|--------------|
| Local dev / trivial | ConcurrentMapCacheManager |
| Single node, production | CaffeineCacheManager |
| Cluster / shared state | RedisCacheManager |
| Standards compliance | JCacheCacheManager (Ehcache) |
| Mixed workloads | CompositeCacheManager |

The abstraction exists so this decision is a configuration choice, not a rewrite. Pick Caffeine for single-node, Redis for scale-out, and Composite when both workloads coexist.
