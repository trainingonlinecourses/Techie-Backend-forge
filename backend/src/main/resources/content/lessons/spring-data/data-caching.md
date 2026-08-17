---
title: The Spring Cache Abstraction
summary: @Cacheable, @CacheEvict and friends — cache managers, TTLs, cache-aside with Redis, keys and the invalidation traps that cause stale data.
order: 6
minutes: 15
topics: [cache abstraction, cacheable, cacheevict, cache-aside, invalidation, redis cache]
docs:
  - https://docs.spring.io/spring-framework/reference/integration/cache.html
  - https://docs.spring.io/spring-boot/reference/io/caching.html
---

# The Spring Cache Abstraction

## What it is

A **cache** is a faster store in front of a slower one, holding copies of recently-read data. Spring's cache abstraction is annotation-driven: declare caching on a method, and the framework intercepts calls — check cache, miss → run method, store result. The store is swappable (ConcurrentHashMap, Redis, Caffeine, Hazelcast) via one `CacheManager` bean.

```java
@Service
public class ProductService {

    @Cacheable(cacheNames = "products", key = "#id")
    public Product find(Long id) {
        return productRepo.findById(id).orElseThrow();   // runs only on cache miss
    }
}
```

Second call with the same `id` → served from the cache; the method never runs.

## The annotations

| Annotation | Behavior |
|---|---|
| `@Cacheable` | check cache first; on miss, run and store the result |
| `@CachePut` | always run, always update the cache (used to refresh) |
| `@CacheEvict` | remove entries — `allEntries = true` clears the whole cache, `beforeInvocation = true` evicts even on failure |
| `@Caching` | compose several of the above |
| `@CacheConfig` | class-level defaults (`cacheNames`, `cacheManager`) |

```java
@CacheEvict(cacheNames = "products", allEntries = true)   // invalidate on write
public Product update(Product p) { ... }

@CachePut(cacheNames = "products", key = "#p.id")          // refresh on miss-prone path
public Product touch(Product p) { ... }
```

**Keys**: default = all method args (with the `SimpleKeyGenerator`); always set an explicit `key` (`#id`, `#p.id`) once methods take multiple args — or you cache the wrong granularity.

## The cache-aside pattern (the 90% design)

```
read:  cache hit → return
       cache miss → load from DB → store in cache → return
write: DB write → evict (or update) the cache entry
```

- **Write-through vs. write-behind**: cache-aside evicts on write (lazy fill on next read); write-behind updates eagerly. Evict-first is the safer default — the cache stays a pure mirror of the DB.
- **TTL** is the safety net that bounds staleness: even a missed eviction self-heals after the TTL. **Every cache needs a TTL** — a cache without one can serve stale data forever.
- **Cache the DTO, not the entity**: caching entities leaks persistence state into the cache and invites accidental writes through cached objects. Serialize the read model you return.

## The invalidation traps

1. **Evicting one key, writing many** — a product update touches product, listings, search index: evict all related caches (`@Caching`), or allEntries for the whole cache.
2. **Stale reads after update** — you `@CachePut` the entity but the DTO projection is a different cache: update *every* cache that mirrors the data.
3. **Cache stampede** — N concurrent misses for the same key all run the method. Spring handles it poorly out of the box; Redis `SETNX`-based lock or a Caffeine-style single-flight fixes it.
4. **Distributed invalidation** — eviction on one node doesn't reach others; Redis cache (shared) or a pub/sub invalidation channel is the multi-node answer.
5. **Self-invocation** — calling `this.find(id)` inside the same bean bypasses the proxy → no caching (same trap as `@Transactional`; solve with a separate bean or self-injection).

## Configuring the Redis cache

```yaml
spring:
  cache:
    type: redis
  data:
    redis:
      host: localhost
```

```java
@Bean
CacheManager cacheManager(RedisConnectionFactory cf) {
    RedisCacheManager.builder(cf)
        .cacheDefaults(RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(10))                 // global TTL
            .disableCachingNullValues())                      // don't cache nulls unless deliberate
        .withCacheConfiguration("products", RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofHours(1)))
        .build();
}
```

`null` results: by default Spring **won't cache nulls** — a repeated miss for a missing entity re-hits the DB every time. Cache the null (with `unless = "#result == null"` off) if the "doesn't exist" answer is also expensive; that's a deliberate per-cache decision.

## Measuring, not guessing

Caching without metrics is theater: track **hit ratio** per cache (Actuator exposes cache metrics with Micrometer), and re-measure after changes. A 99% hit ratio on a hot path is the win; a 20% ratio on a cold key space is memory spent for nothing.

## Key takeaways

- `@Cacheable`/`@CacheEvict` with explicit keys; evict on write (cache-aside), TTL on everything.
- Cache the read model (DTOs), not entities; give every cache a bounded TTL.
- Watch the traps: multi-cache invalidation, stampedes, self-invocation, null caching.
- Measure hit ratios; a cache you can't measure is a guess.

Official docs: [Spring Cache Abstraction](https://docs.spring.io/spring-framework/reference/integration/cache.html) · [Spring Boot Caching](https://docs.spring.io/spring-boot/reference/io/caching.html)
