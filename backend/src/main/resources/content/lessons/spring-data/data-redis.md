---
title: Spring Data Redis
summary: Redis beyond the cache — StringRedisTemplate, hash mapping with @RedisHash, pub/sub, TTLs, and the operations that belong in Redis versus the database.
order: 3
minutes: 15
topics: [redis, spring data redis, redistemplate, redis hash, ttl, pub/sub]
docs:
  - https://docs.spring.io/spring-data/redis/reference/
---

# Spring Data Redis

## What Redis is (and isn't)

Redis is an **in-memory data structure store**: strings, hashes, lists, sets, sorted sets, streams — each with atomic operations and optional TTL. It's the right tool for **hot, ephemeral, high-QPS state** (sessions, rate-limit counters, leaderboards, caches, job queues) and the wrong tool for your system of record (no relational integrity, memory-bound, data loss risk without persistence config).

## The two APIs

- **`RedisTemplate<K,V>`** — generic operations per type: `opsForValue()`, `opsForHash()`, `opsForList()`, `opsForSet()`, `opsForZSet()`, `opsForStream()`.
- **`StringRedisTemplate`** — the string-only specialization; the one you reach for first (most Redis usage is strings).

```java
stringRedisTemplate.opsForValue().set("session:" + userId, token, Duration.ofHours(2));
String token = stringRedisTemplate.opsForValue().get("session:" + userId);

redisTemplate.opsForZSet().add("leaderboard", playerId, score);        // sorted set
Long rank = redisTemplate.opsForZSet().reverseRank("leaderboard", playerId);
```

## Hash mapping: @RedisHash entities

Spring Data Redis maps entities to Redis hashes with repository support:

```java
@RedisHash("cart")
public class Cart {
    @Id String id;                    // key: cart:<id>
    String userId;
    List<CartLine> lines;             // nested objects as JSON
    @Indexed String status;           // indexable field — enables finder queries
}

public interface CartRepository extends CrudRepository<Cart, String> { }
```

- Key layout: `cart:<id>` (the hash) + `cart:<id>:idx` (index data) + `cart:<id>:phantom` (TTL support) — the repository adds metadata keys automatically.
- **TTL via `@TimeToLive`** field or `expire` on the key; phantom keys exist so finders can still see expiring entities.
- Indexed fields power derived queries — but each `@Indexed` field costs extra keys and write time; index only what you query.
- One `CartRepository` per aggregate root — exactly the DDD rule from the data-overview lesson, applied to Redis.

## TTLs: the discipline that keeps Redis healthy

```java
// Every write should ask: "when should this die?"
template.opsForValue().set("otp:" + phone, code, Duration.ofMinutes(5));
template.opsForValue().set("cache:product:" + id, json, Duration.ofHours(1));
```

- **Rate limiting** — the atomic increment-and-expire pattern (the fixed-window limiter this academy's API module implements):

```java
Long count = template.opsForValue().increment("rl:" + userId + ":" + minute);
if (count == 1) template.expire("rl:" + userId + ":" + minute, Duration.ofSeconds(60));
if (count > 100) throw new RateLimitExceededException();
```

- Unbounded keys (no TTL, no eviction policy) are how Redis OOMs in production. Set a default `maxmemory-policy` (e.g. `allkeys-lru`) as the safety net even if every key has TTL.

## Pub/Sub and streams

- **Pub/sub** — fire-and-forget broadcast: `convertAndSend("notifications", payload)`; `@RedisListener` (or `MessageListener`) consumes. No persistence, no replay — messages are lost if the subscriber is down.
- **Streams** (Redis 5+) — the log/queue primitive: `XADD`/`XREAD` with consumer groups — persisted, replayable, competing consumers. When you need reliable messaging from Redis itself, streams (not pub/sub) are the answer. (For real event-driven architecture, prefer Kafka — the curriculum's dedicated module.)

## Transactions and multi-key operations

- `SessionCallback` runs operations in a `MULTI/EXEC` block — but Redis transactions **don't roll back on error** and don't give you read-your-writes inside the block; they're "all commands queued then run", not ACID.
- Prefer **Lua scripts** or single-command atomicity (`INCR`, `SETNX`, `SADD` are already atomic) over multi-key transactions for correctness.
- **`SETNX`** (set if not exists) is the basis of distributed locks (`SET key val NX PX 30000`) — the pattern behind RedisLockRegistry in Spring Integration.

## Cache aside (the 90% use)

Spring's cache abstraction (`@Cacheable`) with Redis as the store — covered fully in the caching lesson; the short version:

```yaml
spring.cache.type: redis
spring.data.redis.host: localhost
```

```java
@Cacheable(value = "products", key = "#id", unless = "#result == null")
Product find(Long id) { ... }   // first call hits DB, rest hit Redis
```

## Key takeaways

- Redis = hot, ephemeral, high-QPS state; the DB stays the source of truth.
- `StringRedisTemplate` for strings; `@RedisHash` + repository for entity-shaped data; TTL on everything.
- Use atomic ops (`INCR`, `SETNX`) for correctness; streams over pub/sub when reliability matters.
- Redis transactions ≠ ACID — prefer single commands or Lua.

Official docs: [Spring Data Redis](https://docs.spring.io/spring-data/redis/reference/)
