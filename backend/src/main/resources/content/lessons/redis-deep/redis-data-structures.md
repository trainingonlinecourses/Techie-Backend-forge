---
title: Redis Data Structures — Strings, Lists, Sets, Hashes, Sorted Sets
module: redis-deep
order: 1
minutes: 27
topics: ["Redis", "data structures", "strings", "hashes", "sorted sets", "caching"]
docs:
  - title: "Redis Data Types (redis.io)"
    url: "https://redis.io/docs/latest/develop/data-types/"
  - title: "An Introduction to Redis Data Types (redis.io)"
    url: "https://redis.io/docs/latest/develop/data-types/introduction/"
---

# Redis Data Structures — Strings, Lists, Sets, Hashes, Sorted Sets

## The Concept: An In-Memory Data Structure Server

**Redis** is an open-source, in-memory data store — but calling it a "cache" undersells it. Redis is really a **server for data structures**: you send it commands over a lightweight protocol, and it manipulates rich structures (strings, lists, sets, hashes, sorted sets, streams) *in memory*, with sub-millisecond latency. Because everything lives in RAM, it's orders of magnitude faster than a disk-backed database — which is why it sits in front of databases, powering caches, sessions, rate limiters, leaderboards, and queues.

**The mental model:** Redis is a giant, fast, shared dictionary with *typed values*. Unlike a plain key-value store where values are opaque blobs, Redis knows what each value *is* (a list? a set? a hash?) and can run efficient operations *inside* the structure server-side — `LPUSH`, `SADD`, `ZINCRBY` — without shipping data back and forth to your application. The operations live next to the data, so they're atomic and fast.

**Why in-memory matters:** a disk read is ~10,000× slower than a RAM read. Databases optimize for durability and big data; Redis optimizes for *speed* on the working set. The classic architecture: hot data lives in Redis (fast reads), the authoritative copy lives in Postgres (durable writes) — Redis as a caching layer in front of the database, exactly how Spring Boot apps wire it.

## The Five Core Structures

```java
import redis.clients.jedis.Jedis;
import java.util.*;

public class RedisStructures {
    public static void main(String[] args) {
        try (Jedis redis = new Jedis("localhost", 6379)) {
            // ---- STRINGS: the workhorse. Any binary-safe value. ----
            redis.set("user:42:name", "Ada");
            String name = redis.get("user:42:name");
            redis.incr("page:views");                 // atomic increment
            redis.setex("session:token", 3600, "abc123"); // set + expire in 1h

            // ---- LISTS: ordered sequence, push/pop both ends. ----
            redis.rpush("queue:jobs", "job-1", "job-2"); // add to tail
            redis.lpush("queue:jobs", "job-0");          // add to head
            String job = redis.lpop("queue:jobs");       // "job-0" — FIFO queue
            List<String> all = redis.lrange("queue:jobs", 0, -1); // all items

            // ---- SETS: unique members, no order. ----
            redis.sadd("tags:java", "spring", "jvm", "spring");
            redis.sadd("tags:web", "spring", "http");
            Set<String> java = redis.smembers("tags:java");   // 2 (spring deduped)
            Set<String> both = redis.sinter("tags:java", "tags:web"); // {spring}

            // ---- HASHES: field-value pairs under one key. ----
            redis.hset("product:1", "name", "Laptop");
            redis.hset("product:1", "price", "999.00");
            String price = redis.hget("product:1", "price");   // 999.00
            Map<String, String> allFields = redis.hgetAll("product:1");

            // ---- SORTED SETS: members + scores, ordered by score. ----
            redis.zadd("leaderboard", 92, "Ada");
            redis.zadd("leaderboard", 85, "Ben");
            redis.zadd("leaderboard", 97, "Zoe");
            redis.zincrby("leaderboard", 3, "Ada");   // Ada: 95
            Set<String> top = redis.zrevrange("leaderboard", 0, 1); // {Zoe, Ada}
            Long rank = redis.zrevrank("leaderboard", "Ben");       // 2
            System.out.println("Top two: " + top + ", Ben's rank: " + rank);
        }
    }
}
```

**Walking through each structure:**

- **Strings** — the universal primitive. `set`/`get` are O(1). `incr` is *atomic* — safe for counters under concurrency (no read-modify-write races). `setex` (set with expiry) is the caching bread-and-butter: cache + TTL in one atomic command.

- **Lists** — a sequence with efficient operations at both ends. `rpush`/`lpop` gives a **FIFO queue**; `lpush`/`rpop` a stack; `lpush`/`brpop` (blocking pop) is the basis of Redis queues. All end operations are O(1).

- **Sets** — unordered unique members with O(1) membership tests and powerful set algebra: `sinter` (intersection — "users in both groups"), `sunion`, `sdiff`. Perfect for tags, deduplication, and "has this been seen?"

- **Hashes** — a mini-map under one key. This is how you model *objects* in Redis: `product:1` holds all its fields in one key, readable/writable field-by-field without shipping the whole object. Ideal for session data and cached entities.

- **Sorted sets** — the star structure: each member has a numeric **score**, and members stay ordered by score. `zadd`/`zincrby` maintain order; `zrevrange` fetches the top-N (leaderboards, "most popular" lists); `zrevrank` gives an element's position; range queries by score power time-series and "top sellers" features. Every operation is O(log n) — the structure is a skiplist+hash combo.

## Key Design: The Colon Namespace

Redis has one flat key space — no tables, no schemas. The convention is the **colon-namespace**: `user:42:name`, `product:1:price`, `order:2024:count`. The "table" is the key prefix; the "row" is the middle part; the "column" is the suffix (or a hash's fields). This is Redis's "schema": you design it in the keys. The trade-off is freedom (any key shape) and the discipline is yours (keep prefixes consistent, and keep keys *queryable* — since there's no SQL, you plan access patterns *before* storing).

## TTL: The Expiry That Makes Caching Work

Every Redis key can carry a **time-to-live** — the key auto-deletes after N seconds:

```java
redis.setex("cache:user:42", 300, json);     // cache for 5 minutes
Long ttl = redis.ttl("cache:user:42");       // seconds remaining
redis.persist("cache:user:42");              // remove the expiry
```

TTLs are what keep caches from growing forever and stale data from living forever. The pattern: read Redis → if miss, load from DB, store with TTL → serve. The TTL bounds staleness: at worst, data is as old as the TTL.

## Pipelining and Atomicity: Doing More, Faster

**Pipelining** batches many commands into one round trip — the difference between 1000 network round trips and 1:

```java
Pipeline p = redis.pipelined();
for (int i = 0; i < 1000; i++) p.set("k" + i, "v" + i);
p.sync();   // all 1000 sent together
```

**MULTI/EXEC** gives *transactions*: commands buffer, then execute atomically — no other client's commands interleave. Redis single-threaded execution model means each command is already atomic; MULTI extends that to a *sequence*. (Lua scripts give even richer atomicity — the basis of the Redis rate-limiter patterns.)

## Recap

Redis is an in-memory data-structure server: typed values under string keys, manipulated by atomic commands with sub-millisecond latency. Strings (with `incr` and TTL) power counters and caches; lists build queues; sets do membership and set algebra; hashes model objects; sorted sets run leaderboards and rankings. The colon-namespace is your schema, TTLs keep caches fresh, and pipelining/transactions get throughput. Master these five structures and you can build caching, sessions, rate limiting, and queues — the pillars of every production Spring Boot app — without a single custom data structure of your own.
