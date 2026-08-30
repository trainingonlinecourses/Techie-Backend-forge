---
title: Redis Patterns — Caching, Rate Limiting, Queues, Distributed Locks
module: redis-deep
order: 5
minutes: 28
topics: ["cache-aside", "rate limiting", "queues", "distributed locks", "Redis patterns", "counter"]
summary: Redis's structures are ingredients; patterns are the recipes — proven arrangements of structures and commands that solve recurring production probl...
docs:
  - title: "Redis Patterns (redis.io)"
    url: "https://redis.io/docs/latest/develop/use/patterns/"
  - title: "Cache-Aside Pattern (Microsoft Learn)"
    url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside"
---

# Redis Patterns — Caching, Rate Limiting, Queues, Distributed Locks

## The Concept: Recipes for Real Problems

Redis's structures are ingredients; **patterns** are the recipes — proven arrangements of structures and commands that solve recurring production problems. Every serious Redis user reaches for the same handful: cache-aside reads, cache invalidation, rate limiting, queues, distributed locks, and atomic counters. This lesson walks through each with working code and the reasoning behind the design.

## Pattern 1: Cache-Aside (Lazy Loading)

The most common pattern in the world: serve reads from Redis, fall back to the database, and populate the cache on a miss.

```java
public class CacheAside {
    // The flow: read cache -> miss? load DB -> store with TTL -> return.
    public Product getProduct(Long id) {
        String key = "product:" + id;

        // 1. Try the cache.
        String cached = redis.get(key);
        if (cached != null) {
            return deserialize(cached);          // hit — done, fast path
        }

        // 2. Cache miss: load the authoritative source.
        Product product = database.loadProduct(id);
        if (product == null) return null;

        // 3. Populate the cache with a TTL so it can't go stale forever.
        redis.setex(key, 300, serialize(product)); // 5 minutes
        return product;
    }
}
```

**The design notes:** the TTL is the staleness bound — at worst the cache is 5 minutes old. The pattern tolerates the database being the source of truth, so a Redis outage degrades performance (every read hits the DB) but not correctness. This is why "Redis down" should never be an outage for a well-designed cache: the cache is an *optimization*, not a dependency — always handle the miss path as the correct path.

## Pattern 2: Write-Through and Invalidation

Cache-aside handles reads; *writes* need a decision. Two classic approaches:

```java
// Option A — invalidate on write: let the next read repopulate.
public void updateProduct(Long id, Product p) {
    database.save(p);
    redis.del("product:" + id);     // delete, don't update — simpler & safe
}

// Option B — write-through: update cache in the same transaction-ish flow.
public void updateProductWriteThrough(Long id, Product p) {
    database.save(p);
    redis.setex("product:" + id, 300, serialize(p));
}
```

**Invalidation (A) is usually the better default:** deleting is idempotent and avoids the "write the cache but crash before the DB" inconsistency window. The subtle bug to avoid: updating the cache *before* the DB commit can leave the cache ahead of the DB if the commit fails. Delete-after-commit sidesteps the whole class.

## Pattern 3: Rate Limiting — The Fixed Window and the Token Bucket

Rate limiting with Redis uses atomic increments. The **fixed window** is the simplest:

```java
// Allow at most 10 requests per minute per user.
public boolean allowRequest(String userId) {
    String key = "ratelimit:" + userId + ":" + currentMinute();
    long count = redis.incr(key);          // atomic!
    if (count == 1) redis.expire(key, 60); // first hit sets the TTL
    return count <= 10;
}
```

`incr` is atomic — under any concurrency, no two threads can read the same count. The first increment establishes the key and arms its 60-second expiry (setting expire only on first hit avoids resetting the window on every call).

The **sliding window / token bucket** is smoother (no cliff at minute boundaries) and is what `spring-cloud-gateway` and Redis rate-limit middleware implement server-side with Lua scripts. The principle is the same: a bounded, atomically-decremented allowance. In Spring, `Bucket4j` + Redis or the Redis-backed `RateLimiter` implementations give this out of the box.

## Pattern 4: Work Queues — Reliable Task Distribution

Lists give FIFO queues; the **blocking variant** gives reliable worker coordination:

```java
// Producer — push work to the tail:
redis.rpush("queue:emails", json);

// Consumer — block up to 30s waiting for work from the head:
List<String> job = redis.blpop(30, "queue:emails");
// blpop blocks the thread until work arrives or timeout — no busy-polling.
```

`BLPOP` is the key: instead of polling (`LPOP` in a tight loop — wasteful and racy), workers *block* on the list, waking only when a producer pushes. Multiple workers `BLPOP` the same list and Redis hands each job to exactly one of them — natural load balancing without locks. For *durable* queues (survive Redis restart and consumer crash), **Redis Streams** (`XADD`/`XREADGROUP` with consumer groups and acknowledgments) is the modern upgrade — the basis of the `spring-data-redis` stream support and a legitimate lightweight alternative to Kafka for modest volumes.

## Pattern 5: Distributed Locks

A lock that works across *multiple application instances* — the distributed lock — is the classic hard problem. Redis's answer, with the right care, is **SET with NX and expiry** (the Redlock-family approach; the community-validated variant is the Redisson `RLock`):

```java
// Acquire: SET key value NX EX ttl — succeeds only if key ABSENT,
// and always expires (so a crashed holder can't hold it forever).
String token = UUID.randomUUID().toString();
boolean acquired = "OK".equals(redis.set(
        "lock:payment:" + orderId, token,
        SetArgs.setArgs().nx().ex(10)));   // 10s lease

if (acquired) {
    try {
        doCriticalWork();
    } finally {
        // Release must be SAFE: only the holder may delete — compare the
        // token with an atomic Lua script (GET + DEL as one operation).
        String script = "if redis.call('get', KEYS[1]) == ARGV[1] " +
                        "then return redis.call('del', KEYS[1]) else return 0 end";
        redis.eval(script, List.of("lock:payment:" + orderId), List.of(token));
    }
}
```

**The three hard parts, and how they're solved:** (1) *expiry* — `EX` guarantees a crashed holder releases the lock eventually; (2) *ownership* — the random token + compare-and-delete script ensures only the holder can release (never deleting someone else's lock); (3) *reentrancy and safety margins* — production code uses Redisson's `RLock`, which handles renewal (extending the lease while the work is still running). The fundamental caveat: a lock with an expiry is a *lease* — if the critical section runs longer than the lease, a second holder can acquire it. Choose lease times generously and, ideally, use Redisson's watchdog.

## Pattern 6: Atomic Counters and Leaderboards

```java
// Page views — atomic, concurrent-safe:
redis.incr("stats:page:home");

// Leaderboard — sorted set, updated atomically:
redis.zincrby("leaderboard", 1, "user:" + userId);
// Top 10 instantly:
Set<String> top = redis.zrevrange("leaderboard", 0, 9);
```

`incr` and `zincrby` are single atomic commands — no read-modify-write races under load, no lost updates. This is the pattern behind every "views", "likes", "wins" counter and ranking in production systems.

## The Anti-Patterns to Avoid

1. **Treating Redis as the source of truth for critical data.** Redis is fast and eventually consistent; the DB is the durable record. Cache-miss paths must be correct paths.
2. **No TTLs anywhere.** Keys accumulate forever; memory fills; eviction kicks in unpredictably. Every key should have a lifecycle.
3. **`KEYS *` in production.** It blocks Redis (single-threaded!) scanning the whole key space. Use `SCAN` in batches or maintain an index set.
4. **Busy-polling instead of blocking commands.** `LPOP` in a loop burns CPU and adds latency; `BLPOP`/`BRPOP` block properly.
5. **Distributed locks without expiry or ownership.** No TTL = deadlock on crash; no token check = deleting another holder's lock.

## Recap

The Redis patterns are recipes over its structures: cache-aside for reads (with TTL-bounded staleness and a correct DB fallback), delete-on-write for invalidation, atomic `INCR` with TTL for rate limiting, `BLPOP` lists (or Streams) for queues, `SET NX EX` + tokenized compare-and-delete for distributed locks, and atomic counters for rankings. Each pattern exists because a naive version fails under concurrency or crashes — the Redis commands are atomic precisely so the patterns can be. Apply them with TTLs, blocking calls, and the DB-as-truth discipline, and you have the production Redis playbook.
