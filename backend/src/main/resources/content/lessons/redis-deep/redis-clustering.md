---
title: Redis Clustering — Complete Beginner's Guide
summary: How Redis scales from single instance to cluster, sharding, replication, and the Spring Boot configuration for high availability.
order: 3
minutes: 18
topics: [redis cluster, sharding, replication, sentinel, high availability]
docs:
  - https://redis.io/docs/manual/scaling/
  - https://docs.spring.io/spring-data/redis/reference/redis/clustering.html
---

# Redis Clustering — Complete Beginner's Guide

## Why clustering matters

A single Redis instance handles ~100K operations/second, stores up to your server's RAM, and is a single point of failure. **Clustering** solves all three problems:

```
Single instance:                     Cluster:
┌─────────────┐                     ┌─────┐ ┌─────┐ ┌─────┐
│   Redis     │                     │Master│ │Master│ │Master│
│  (100GB)    │                     └──┬──┘ └──┬──┘ └──┬──┘
│  (100K ops) │                        │       │       │
│  (SPOF)     │                     ┌──┴──┐ ┌──┴──┐ ┌──┴──┐
└─────────────┘                     │Slave│ │Slave│ │Slave│
                                    └─────┘ └─────┘ └─────┘
                                   (300GB, 300K ops, no SPOF)
```

## Redis replication — copying data

**Replication** means one master and one or more slaves (replicas). The master handles writes; slaves handle reads and provide backup.

```
Master ←──writes──→ Client
  │
  └──replicates──→ Slave 1 (read-only copy)
  └──replicates──→ Slave 2 (read-only copy)
```

```java
// Spring Boot — configure Redis with replicas
spring:
  data:
    redis:
      host: redis-master                    # Line 1: Master node
      port: 6379
      read-from: replica                    # Line 2: Read from replicas (spread read load)
```

**How replication works:**
1. Client writes to master
2. Master saves the data
3. Master asynchronously sends the write to all slaves
4. Slaves apply the write
5. Client reads from a slave (faster, less load on master)

**Trade-off:** Replication is **asynchronous** — there's a small delay (milliseconds) between master and slave. If the master crashes before replicating, some data may be lost.

## Redis Cluster — sharding across multiple masters

**Sharding** splits data across multiple masters. Each master owns a portion of the keyspace:

```
Keys 0-5460     → Master 1
Keys 5461-10922 → Master 2
Keys 10923-16383 → Master 3
```

**How Redis Cluster distributes keys:**

```java
// Redis uses hash slots to distribute keys
// HASH_SLOT = CRC16(key) mod 16384

// Example:
// "user:1001" → hash slot 2938 → Master 1
// "user:1002" → hash slot 7182 → Master 2
// "user:1003" → hash slot 12456 → Master 3
```

**Spring Boot configuration for Redis Cluster:**

```yaml
spring:
  data:
    redis:
      cluster:
        nodes:                                    # Line 1: List all master nodes
          - redis-master-1:6379
          - redis-master-2:6379
          - redis-master-3:6379
        max-redirects: 3                          # Line 2: Retry on cluster redirections
      read-from: replica                          # Line 3: Read from replicas
```

```java
// Spring Boot auto-configures RedisTemplate for clusters
@Bean
public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory factory) {
    RedisTemplate<String, Object> template = new RedisTemplate<>();  // Line 1: Create template
    template.setConnectionFactory(factory);                          // Line 2: Set connection
    template.setKeySerializer(new StringRedisSerializer());          // Line 3: String keys
    template.setValueSerializer(new GenericJackson2JsonRedisSerializer());  // Line 4: JSON values
    return template;
}
```

## Redis Sentinel — high availability

**Sentinel** monitors Redis instances and automatically promotes a slave to master if the current master fails:

```
Sentinel 1 ──monitors──→ Master ←──replicates──→ Slave 1
Sentinel 2 ──monitors──→ Master ←──replicates──→ Slave 2
Sentinel 3 ──monitors──→ Master
              │
              └── If master fails → Sentinel promotes Slave 1 to Master
```

```yaml
spring:
  data:
    redis:
      sentinel:
        master: mymaster                         # Line 1: Master name
        nodes:                                   # Line 2: Sentinel nodes
          - sentinel-1:26379
          - sentinel-2:26379
          - sentinel-3:26379
```

## Choosing the right approach

| Approach | Use when | Trade-off |
|---|---|---|
| **Single instance** | Development, small apps | Simple but SPOF |
| **Replication** | Read-heavy, need backup | Asynchronous = possible data loss |
| **Cluster** | Large datasets, high throughput | Complex setup, some operations limited |
| **Sentinel** | Need automatic failover | Adds Sentinel nodes |

## Real-world scenario — caching for e-commerce

```java
@Service
public class ProductCacheService {
    private final RedisTemplate<String, Product> redisTemplate;  // Line 1: Redis connection
    
    // Cache product with TTL (Time To Live)
    public void cacheProduct(Product product) {
        String key = "product:" + product.getId();               // Line 1: Create cache key
        redisTemplate.opsForValue().set(                         // Line 2: Store in Redis
            key,                                                 // Line 3: Key
            product,                                             // Line 4: Value (serialized)
            Duration.ofMinutes(30)                               // Line 5: Expire after 30 minutes
        );
    }
    
    // Get product from cache
    public Product getProduct(Long id) {
        String key = "product:" + id;                            // Line 1: Create cache key
        return redisTemplate.opsForValue().get(key);             // Line 2: Get from Redis
        // Returns null if not in cache (cache miss)
    }
    
    // Cache-aside pattern
    public Product getProductWithCache(Long id) {
        Product product = getProduct(id);                        // Line 1: Check cache
        if (product == null) {                                   // Line 2: Cache miss
            product = productRepository.findById(id).orElse(null);  // Line 3: Get from DB
            if (product != null) {
                cacheProduct(product);                           // Line 4: Populate cache
            }
        }
        return product;                                          // Line 5: Return (from cache or DB)
    }
}
```

## Common mistakes

| Mistake | Why it's bad | Fix |
|---|---|---|
| Using `keys *` in production | Blocks entire Redis | Use `SCAN` instead |
| No TTL on cached data | Memory grows forever | Set TTL on all cached keys |
| Caching everything | Cache overhead > benefit | Cache only hot data |
| Ignoring cluster limitations | Some operations fail | Use hash tags for multi-key operations |

## Key takeaways

- Replication: master + slaves, async copy, read from replicas
- Cluster: sharding across masters, hash slots distribute keys
- Sentinel: monitors and auto-promotes on failure
- Spring Boot auto-configures cluster/sentinel support
- Cache-aside pattern: check cache → miss → get from DB → populate cache

**Official docs:** [Redis Scaling](https://redis.io/docs/manual/scaling/) · [Spring Data Redis Clustering](https://docs.spring.io/spring-data/redis/reference/redis/clustering.html)
