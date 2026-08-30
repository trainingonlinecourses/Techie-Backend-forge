---
title: Redis as the Cache Store
module: spring-cache
order: 3
minutes: 22
topics: ["RedisCacheManager", "TTL", "serialization", "distributed cache", "Redis config"]
summary: Singleinstance apps can use Caffeine. The moment you scale out, every replica needs the same cache — that's what Redis provides: a shared, networka...
docs:
  - title: "Spring Data Redis caching"
    url: "https://docs.spring.io/spring-data/redis/reference/redis/redis-cache.html"
---

# Redis as the Cache Store

Single-instance apps can use Caffeine. The moment you scale out, every replica needs the same cache — that's what Redis provides: a shared, network-accessible cache with TTLs, eviction policies, and atomic operations.

## Setup

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

```yaml
spring:
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
      password: ${REDIS_PASSWORD:}
      timeout: 2s
```

Spring Boot auto-configures `RedisConnectionFactory` and `RedisTemplate`. Caching needs one more piece: a `RedisCacheManager`.

## The Default RedisCacheManager Is Slow

Spring Boot's default `RedisCacheManager` uses JDK serialization — verbose, slow, and requires `Serializable` on every cached type. Configure JSON with a dedicated `RedisTemplate`:

```java
@Configuration
public class RedisCacheConfig {

    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory factory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(10))
            .serializeKeysWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new GenericJackson2JsonRedisSerializer()))
            .disableCachingNullValues();

        return RedisCacheManager.builder(factory)
            .cacheDefaults(config)
            .withCacheConfiguration("course-catalog",
                RedisCacheConfiguration.defaultCacheConfig().entryTtl(Duration.ofHours(1)))
            .withCacheConfiguration("user-sessions",
                RedisCacheConfiguration.defaultCacheConfig().entryTtl(Duration.ofMinutes(5)))
            .build();
    }
}
```

`disableCachingNullValues()` is important: it stops Redis from storing empty entries (which `unless = "#result == null"` would otherwise let through and which defeat cache-aside for nulls).

## Per-Region TTL

Different data, different TTLs:

```java
.withCacheConfiguration("course-catalog",
    RedisCacheConfiguration.defaultCacheConfig().entryTtl(Duration.ofHours(24)))
.withCacheConfiguration("course-pricing",
    RedisCacheConfiguration.defaultCacheConfig().entryTtl(Duration.ofHours(6)))
.withCacheConfiguration("user-sessions",
    RedisCacheConfiguration.defaultCacheConfig().entryTtl(Duration.ofMinutes(30)))
```

Every `@Cacheable("course-catalog")` now gets 24h automatically.

## How Keys Look in Redis

RedisCacheManager prefixes keys with the cache name, colon-separated:

```
courses::c1              # cache "courses", key "c1"
courses::c1::en          # composite key from SpEL
```

You can inspect them with `redis-cli`:

```bash
redis-cli keys 'courses*'
redis-cli get 'courses::c1'
redis-cli ttl 'courses::c1'
```

## Cache Stampede With Redis

`sync = true` works across the cluster because Redis supports it natively:

```java
@Cacheable(value = "courses", key = "#id", sync = true)
public Course getCourse(String id) { ... }
```

With Redis, the lock is a distributed Redis lock, so a cold key is computed once even when 100 replicas request it simultaneously. This is one of the biggest wins of Redis over a local cache in a cluster.

## Preloading Hot Data

Avoid cold-start misses by warming the cache at startup:

```java
@Component
public class CacheWarmer implements ApplicationRunner {

    private final CourseService courseService;
    private final CourseRepository repository;

    @Override
    public void run(ApplicationArguments args) {
        repository.findTop100ByOrderByPopularityDesc()
            .forEach(c -> courseService.getCourse(c.getId()));
    }
}
```

## Redis Failure Behavior

Redis is a dependency — when it's down, every cached method throws. Decide the failure policy:

```java
@Cacheable(value = "courses", sync = true)
public Course getCourse(String id) {
    try {
        return courseRepository.findById(id).orElseThrow();
    } catch (RedisConnectionFailureException e) {
        // fail open: serve from DB, don't propagate
        log.warn("Redis down, serving from DB: {}", e.getMessage());
        return courseRepository.findById(id).orElseThrow();
    }
}
```

"Fail open" (serve from DB) is usually right for reads; "fail closed" (throw) is right when serving stale data is worse than an error.

## Local + Remote: Two-Level Cache

For very hot data, layer Caffeine in front of Redis — L1 local, L2 shared:

```java
@Bean
public CacheManager localCacheManager() {
    CaffeineCacheManager manager = new CaffeineCacheManager();
    manager.setCaffeine(Caffeine.newBuilder().maximumSize(1000).expireAfterWrite(Duration.ofSeconds(30)));
    return manager;
}
```

L1 gives sub-microsecond hits; L2 gives cluster consistency with a 30s lag. The tradeoff: invalidation is eventually consistent within the L1 TTL.

## Summary

| Decision | Recommendation |
|----------|----------------|
| Serialization | JSON (`GenericJackson2JsonRedisSerializer`), not JDK |
| TTL | Per-region, from cache config |
| Stampede | `sync = true` on hot keys |
| Redis outage | Fail open for reads |
| Scale-out | Redis is the shared store replicas agree on |
| Hot data | Optional Caffeine L1 in front of Redis |

Redis turns Spring's cache abstraction into a cluster-wide facility with TTLs, distributed locks, and predictable failure modes — the production-grade answer to "which cache should I use?"
