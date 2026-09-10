---
title: ConcurrentHashMap — Thread-Safe Maps
summary: Segment locking, atomic operations, compute/merge patterns, why Hashtable is dead, and production patterns for concurrent caching.
order: 4
minutes: 18
topics: [concurrent-hashmap, thread-safety, atomic-operations, compute, merge, concurrent-caching]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/ConcurrentHashMap.html
  - https://docs.oracle.com/javase/21/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html
---

# ConcurrentHashMap — Thread-Safe Maps

## What Is ConcurrentHashMap?

**ConcurrentHashMap** is a thread-safe version of `HashMap`. Multiple threads can read and write simultaneously without corrupting data or throwing `ConcurrentModificationException`.

**Think of it like**: a busy restaurant where multiple waiters can take orders simultaneously — but the kitchen (map) handles them one at a time per section, not the whole kitchen at once.

---

## Why Not HashMap in Multi-Threaded Code?


**What this code does — step by step:**

1. ❌ HashMap is NOT thread-safe
2. Thread 1: reading
3. `cache.get("key");` — 💥 May throw ConcurrentModificationException
4. Thread 2: writing simultaneously
5. `cache.put("key", 42);` — 💥 Data corruption possible
6. Even worse — compound operations are NOT atomic
7. `cache.put("key", 1);` — 💥 Race condition: two threads may both put

The same code, clean:

```java
Map<String, Integer> cache = new HashMap<>();

cache.get("key");

cache.put("key", 42);

if (!cache.containsKey("key")) {
    cache.put("key", 1);
}
```

---

## ConcurrentHashMap Basics

### Thread-Safe Operations


**What this code does — step by step:**

1. ✅ ConcurrentHashMap handles thread safety
2. Thread-safe put
3. Thread-safe get
4. Thread-safe put-if-absent (atomic!)
5. `cache.putIfAbsent("key", 100);` — Only puts if "key" doesn't exist
6. Thread-safe remove
7. Thread-safe replace
8. `cache.replace("key", 42, 100);` — Only replaces if current value is 42

The same code, clean:

```java
ConcurrentHashMap<String, Integer> cache = new ConcurrentHashMap<>();

cache.put("key", 42);

Integer value = cache.get("key");

cache.putIfAbsent("key", 100);

cache.remove("key");

cache.replace("key", 42, 100);
```

### Atomic Compound Operations


**What this code does — step by step:**

1. computeIfAbsent — atomic "get or compute"
2. computeIfPresent — atomic "get and update"
3. compute — atomic "compute and store"
4. merge — atomic "combine values"
5. `cache.merge("total", 100, Long::sum);` — Add 100 to existing total

The same code, clean:

```java
cache.computeIfAbsent("user:123", id -> loadUser(id));

cache.computeIfPresent("user:123", (id, user) -> {
    user.setLastAccess(LocalDateTime.now());
    return user;
});

cache.compute("counter", (key, value) -> {
    return value == null ? 1 : value + 1;
});

cache.merge("total", 100, Long::sum);
```

---

## Why ConcurrentHashMap Is Fast

### Segment Locking (Java 7) vs CAS (Java 8+)


**What this code does — step by step:**

1. Java 7: Segment locking — the map is divided into 16 segments. Each segment has its own lock — 16 threads can write simultaneously. But only to different segments
2. Java 8+: CAS (Compare-And-Swap) — no locking at all! Uses hardware-level atomic operations for individual cells. Much faster than segment locking

The same code, clean:

```java
```

### Reading Is Always Lock-Free


**What this code does — step by step:**

1. Reads NEVER block — even during concurrent writes
2. Thread 1: reading
3. `User user = users.get("alice");` — No lock needed, instant
4. Thread 2: writing
5. `users.put("bob", new User("Bob"));` — Only locks the specific bucket
6. Thread 1 still reads without waiting!

The same code, clean:

```java
ConcurrentHashMap<String, User> users = new ConcurrentHashMap<>();

User user = users.get("alice");

users.put("bob", new User("Bob"));
```

---

## In an Organization

### Scenario 1: Application-Level Cache

@Service
public class UserCache {

    private final ConcurrentHashMap<String, User> cache = new ConcurrentHashMap<>();
    private final UserRepository userRepository;

    // Thread-safe "get or load"
    public User getUser(String userId) {
        return cache.computeIfAbsent(userId, id -> {
            log.info("Cache miss for user {} — loading from database", id);
            return userRepository.findById(id)
                .orElseThrow(() -> new UserNotFoundException(id));
        });
    }

    // Thread-safe bulk load
    public void preloadUsers(List<String> userIds) {
        userIds.parallelStream().forEach(this::getUser);
    }

    // Thread-safe invalidation
    public void invalidate(String userId) {
        cache.remove(userId);
    }

    // Thread-safe cache stats
    public int size() {
        return cache.size();
    }
}

### Scenario 2: Rate Limiter

@Component
public class RateLimiter {

    private final ConcurrentHashMap<String, AtomicInteger> requestCounts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Long> windowStart = new ConcurrentHashMap<>();

    private static final int MAX_REQUESTS = 100;
    private static final long WINDOW_MS = 60_000;  // 1 minute

    public boolean isAllowed(String clientId) {
        long now = System.currentTimeMillis();

        // Initialize window if needed (atomic)
        windowStart.computeIfAbsent(clientId, k -> now);

        // Reset window if expired
        if (now - windowStart.get(clientId) > WINDOW_MS) {
            windowStart.put(clientId, now);
            requestCounts.put(clientId, new AtomicInteger(0));
        }

        // Increment counter atomically
        AtomicInteger count = requestCounts.computeIfAbsent(clientId,
            k -> new AtomicInteger(0));

        int current = count.incrementAndGet();
        return current <= MAX_REQUESTS;
    }
}

### Scenario 3: Connection Pool Tracker

@Component
public class ConnectionPool {

    private final ConcurrentHashMap<String, Connection> activeConnections = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Long> connectionTimestamps = new ConcurrentHashMap<>();

    public Connection acquire(String poolId) {
        // Get or create connection
        return activeConnections.computeIfAbsent(poolId, id -> {
            log.info("Creating new connection for pool: {}", id);
            Connection conn = createConnection(id);
            connectionTimestamps.put(id, System.currentTimeMillis());
            return conn;
        });
    }

    public void release(String poolId) {
        Connection conn = activeConnections.remove(poolId);
        connectionTimestamps.remove(poolId);
        if (conn != null) {
            conn.close();
            log.info("Released connection for pool: {}", poolId);
        }
    }

    public void cleanupStale(long maxAgeMs) {
        long now = System.currentTimeMillis();
        connectionTimestamps.forEach((poolId, timestamp) -> {
            if (now - timestamp > maxAgeMs) {
                release(poolId);
                log.warn("Cleaned stale connection for pool: {}", poolId);
            }
        });
    }
}

---

## ConcurrentHashMap vs Other Thread-Safe Maps

| Map | Performance | Use When |
|-----|-------------|----------|
| `ConcurrentHashMap` | Excellent (CAS-based) | General-purpose concurrent map |
| `Collections.synchronizedMap` | Poor (single lock) | Simple cases, low contention |
| `Hashtable` | Poor (single lock) | Never — legacy only |
| `CopyOnWriteMap` | Good for reads, bad for writes | Read-heavy, write-rare |

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `get()` then `put()` separately | Race condition — compound operation not atomic | Use `computeIfAbsent()`, `merge()`, `putIfAbsent()` |
| Assuming iteration is atomic | Map may change during iteration | Use `forEach()` with atomic operations |
| Not handling null values | `ConcurrentHashMap` doesn't allow null keys/values | Use `Optional` or sentinel values |
| Using `synchronizedMap` instead | Single lock bottleneck | Use `ConcurrentHashMap` for better performance |
| Modifying values directly | Not thread-safe — only the map operations are atomic | Always use `compute()`, `merge()`, or `replace()` |
| Not considering memory overhead | ConcurrentHashMap uses more memory | For single-writer scenarios, consider `Collections.synchronizedMap` |

