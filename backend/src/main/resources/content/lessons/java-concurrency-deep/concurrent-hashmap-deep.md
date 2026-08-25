---
title: ConcurrentHashMap — Thread-Safe Maps
summary: Segment locking, atomic operations, compute/merge patterns, why Hashtable is dead, and production patterns for concurrent caching.
order: 6
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

```java
// ❌ HashMap is NOT thread-safe
Map<String, Integer> cache = new HashMap<>();

// Thread 1: reading
cache.get("key");  // 💥 May throw ConcurrentModificationException

// Thread 2: writing simultaneously
cache.put("key", 42);  // 💥 Data corruption possible

// Even worse — compound operations are NOT atomic
if (!cache.containsKey("key")) {
    cache.put("key", 1);  // 💥 Race condition: two threads may both put
}
```

---

## ConcurrentHashMap Basics

### Thread-Safe Operations

```java
// ✅ ConcurrentHashMap handles thread safety
ConcurrentHashMap<String, Integer> cache = new ConcurrentHashMap<>();

// Thread-safe put
cache.put("key", 42);

// Thread-safe get
Integer value = cache.get("key");

// Thread-safe put-if-absent (atomic!)
cache.putIfAbsent("key", 100);  // Only puts if "key" doesn't exist

// Thread-safe remove
cache.remove("key");

// Thread-safe replace
cache.replace("key", 42, 100);  // Only replaces if current value is 42
```

### Atomic Compound Operations

```java
// computeIfAbsent — atomic "get or compute"
cache.computeIfAbsent("user:123", id -> loadUser(id));

// computeIfPresent — atomic "get and update"
cache.computeIfPresent("user:123", (id, user) -> {
    user.setLastAccess(LocalDateTime.now());
    return user;
});

// compute — atomic "compute and store"
cache.compute("counter", (key, value) -> {
    return value == null ? 1 : value + 1;
});

// merge — atomic "combine values"
cache.merge("total", 100, Long::sum);  // Add 100 to existing total
```

---

## Why ConcurrentHashMap Is Fast

### Segment Locking (Java 7) vs CAS (Java 8+)

```java
// Java 7: Segment locking — the map is divided into 16 segments
// Each segment has its own lock — 16 threads can write simultaneously
// But only to different segments

// Java 8+: CAS (Compare-And-Swap) — no locking at all!
// Uses hardware-level atomic operations for individual cells
// Much faster than segment locking
```

### Reading Is Always Lock-Free

```java
// Reads NEVER block — even during concurrent writes
ConcurrentHashMap<String, User> users = new ConcurrentHashMap<>();

// Thread 1: reading
User user = users.get("alice");  // No lock needed, instant

// Thread 2: writing
users.put("bob", new User("Bob"));  // Only locks the specific bucket

// Thread 1 still reads without waiting!
```

---

## In an Organization

### Scenario 1: Application-Level Cache

```java
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
```

### Scenario 2: Rate Limiter

```java
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
```

### Scenario 3: Connection Pool Tracker

```java
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
```

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
