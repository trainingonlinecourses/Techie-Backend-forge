---
title: Spring Data Redis — RedisTemplate, Repositories, and Serialization
module: redis-deep
order: 2
minutes: 27
topics: ["Spring Data Redis", "RedisTemplate", "RedisRepository", "serialization", "StringRedisTemplate"]
summary: Raw Jedis/Lettuce calls work, but they leave you managing connections, serialization, and error handling. Spring Data Redis wraps the client (Lettu...
docs:
  - title: "Spring Data Redis Reference"
    url: "https://docs.spring.io/spring-data/redis/reference/"
  - title: "RedisTemplate (Spring API)"
    url: "https://docs.spring.io/spring-data/redis/docs/current/api/org/springframework/data/redis/core/RedisTemplate.html"
---

# Spring Data Redis — RedisTemplate, Repositories, and Serialization

## The Concept: The Connection Between Your Beans and Redis

Raw Jedis/Lettuce calls work, but they leave *you* managing connections, serialization, and error handling. **Spring Data Redis** wraps the client (Lettuce by default in Spring Boot) in Spring's idioms: a configured `RedisTemplate` bean with sensible defaults, annotation-driven repositories, and the same `Template` pattern as `JdbcTemplate` and `RestTemplate` — connect once, use everywhere, get consistent serialization and error translation.

**The mental model:** `RedisTemplate` is your personal Redis CLI as a Spring bean. It knows how to *connect* (via `RedisConnectionFactory`), how to *serialize* keys and values (via `RedisSerializer`s), and it translates raw Redis commands into typed Java operations: `redisTemplate.opsForValue().set(...)`, `opsForList().leftPush(...)`, `opsForHash()...`, `opsForZSet()...`. Instead of juggling byte arrays and protocol details, you work with `String`s, objects, and the familiar collection operations.

## The Setup: Auto-Configuration

Spring Boot's `spring-boot-starter-data-redis` auto-configures everything when it finds a Redis on `localhost:6379`. Configure it in `application.properties`:

```properties
spring.data.redis.host=localhost
spring.data.redis.port=6379
spring.data.redis.timeout=2s
```

The starter brings Lettuce (the modern Netty-based client), and Boot creates the `RedisConnectionFactory` and `RedisTemplate` beans automatically. One dependency + four lines of config = a working Redis integration.

## RedisTemplate in Action

```java
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import java.time.Duration;

@Service
public class SessionService {

    // StringRedisTemplate: keys AND values are Strings — the simplest,
    // most common setup (JSON values).
    private final StringRedisTemplate redis;

    public SessionService(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public void storeSession(String token, String userId, Duration ttl) {
        // opsForValue() = string operations. set with TTL:
        redis.opsForValue().set("session:" + token, userId, ttl);
    }

    public String readSession(String token) {
        return redis.opsForValue().get("session:" + token);
    }

    public void deleteSession(String token) {
        redis.delete("session:" + token);
    }

    public long activeSessions() {
        // Count keys matching a pattern (use sparingly — SCAN under the hood).
        return redis.keys("session:*").size();
    }
}
```

**Walking through it:** `StringRedisTemplate` is the specialization where keys and values are `String`s — perfect for JSON payloads, tokens, and simple counters. `opsForValue()` returns the *value operations* view — the object-oriented face of the raw `SET`/`GET` commands. The `Duration` overload of `set` is the TTL in Spring idiom. And note the pattern: the service never touches sockets or protocol — it calls typed methods, and Spring handles the rest.

## The Other Structures via opsFor*

Every Redis structure has an ops view:

```java
// Lists — queues and stacks:
redis.opsForList().rightPush("queue:jobs", "job-1");
String job = redis.opsForList().leftPop("queue:jobs");   // FIFO

// Sets — membership and algebra:
redis.opsForSet().add("tags:java", "spring", "jvm");
Boolean member = redis.opsForSet().isMember("tags:java", "spring");
Set<String> overlap = redis.opsForSet().intersect("tags:java", "tags:web");

// Hashes — object fields:
redis.opsForHash().put("product:1", "name", "Laptop");
Object price = redis.opsForHash().get("product:1", "price");

// Sorted sets — leaderboards:
redis.opsForZSet().add("leaderboard", "Ada", 92.0);
redis.opsForZSet().incrementScore("leaderboard", "Ada", 3.0);
Set<String> top2 = redis.opsForZSet().reverseRange("leaderboard", 0, 1);
```

The ops hierarchy mirrors Redis's structures exactly: `ValueOperations`, `ListOperations`, `SetOperations`, `HashOperations`, `ZSetOperations`, plus `StreamOperations` for Redis Streams. Learn the mapping once and every Redis capability is a method call away.

## Serialization: The Part That Bites

`RedisTemplate<String, Object>` (as opposed to `StringRedisTemplate`) needs to convert Java objects to bytes — and **the default serializer is the problem**. Historically, Boot's default was JdkSerializationRedisSerializer: it writes Java serialization format (binary, opaque, incompatible with anything not Java, and a security surface). The two production-grade options:

```java
@Configuration
public class RedisConfig {

    @Bean
    public RedisTemplate<String, Object> redisTemplate(
            RedisConnectionFactory factory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(factory);

        // JSON for values: human-readable, interoperable, safe.
        Jackson2JsonRedisSerializer<Object> json =
                new Jackson2JsonRedisSerializer<>(Object.class);

        // Plain strings for keys (avoids binary key prefixes in the CLI).
        template.setKeySerializer(RedisSerializer.string());
        template.setHashKeySerializer(RedisSerializer.string());
        template.setValueSerializer(json);
        template.setHashValueSerializer(json);
        template.afterPropertiesSet();
        return template;
    }
}
```

**Why this matters so much:** serialization decides whether the data you store is *interoperable*. With `StringRedisTemplate` + JSON strings, any tool (redis-cli, other languages, your own debugging) can read the values. With the JDK serializer, only Java can read them, and the bytes are garbage to humans. The modern recommendation: **store JSON strings** (via `StringRedisTemplate` or a JSON serializer) — debuggable, interoperable, and versionable. Serializer mismatches (writing with one, reading with another) produce the classic "cannot deserialize" runtime surprises.

## Redis Repositories: Optional but Powerful

Spring Data Redis can also act like a repository layer for your domain objects — `@RedisHash` + a `CrudRepository` interface, storing entities as hashes with automatic indexing:

```java
import org.springframework.data.annotation.Id;
import org.springframework.data.redis.core.RedisHash;

@RedisHash("products")               // stored under products:{id}
public record Product(
        @Id Long id,
        String name,
        double price) {}

// The repository — Spring generates the implementation:
public interface ProductRepository extends CrudRepository<Product, Long> {}
```

Then `productRepository.save(p)`, `findById`, `findAll` work like JPA repositories but against Redis hashes. This is convenient for session-like or frequently-read entities — but note: Redis repositories are *not* a relational model; they suit fast lookup by id, not complex queries. For complex querying, keep Postgres; for ultra-fast id lookup, Redis.

## The Cache Abstraction: Redis as the Cache Backend

The killer integration: Spring's **cache abstraction** (`@Cacheable`, `@CacheEvict`) with Redis as the provider:

```java
@Service
public class LessonService {

    // Cache the result keyed by id for the configured TTL.
    @Cacheable(value = "lessons", key = "#id")
    public LessonDto findById(Long id) {
        // Expensive work — DB query, content load — runs ONLY on a miss.
        return loadFromDatabase(id);
    }

    // Invalidate the cached entry when the lesson changes.
    @CacheEvict(value = "lessons", key = "#id")
    public void updateLesson(Long id, LessonDto dto) { /* save */ }
}
```

With `spring.cache.type=redis` and `spring.cache.redis.time-to-live=10m` in properties, `@Cacheable` reads Redis first and populates on miss — transparently. This is the standard way production Spring apps get sub-millisecond reads on hot data without writing a single Redis call. (The dedicated `spring-cache` module in this curriculum covers the abstraction in depth; this is its Redis backend.)

## Recap

Spring Data Redis connects your beans to Redis through configured templates: `StringRedisTemplate` for JSON-string workflows, `RedisTemplate` with explicit serializers for typed objects, `opsFor*` views mapping one-to-one onto Redis structures, and optional `@RedisHash` repositories for entity-style access. The two habits that separate clean integrations from disasters: **choose your serializers deliberately** (JSON over JDK serialization) and **use the cache abstraction** (`@Cacheable` with Redis) for the common cache-behind-database pattern. One starter, one config block, and Redis becomes a first-class citizen of your Spring application.
