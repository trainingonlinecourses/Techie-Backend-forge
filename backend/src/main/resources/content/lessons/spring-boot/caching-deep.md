---
title: Spring Caching In Depth — @Cacheable, Eviction, and Cache Providers
summary: Cache abstraction, @Cacheable vs @CacheEvict vs @CachePut, cache key generation, conditional caching, Caffeine/Redis/EhCache providers, and how organizations prevent stale data in cached systems.
order: 27
minutes: 20
topics: [spring-cache, cacheable, cacheevict, cacheput, cache-key, caffeine, redis-cache, conditional-cache, cache-eviction]
docs:
  - https://docs.spring.io/spring-framework/reference/integration/cache.html
  - https://docs.spring.io/spring-boot/docs/current/reference/html/io.html#io.cache
---

# Spring Caching In Depth — @Cacheable, Eviction, and Cache Providers

## The concept

Spring's cache abstraction adds caching to any method with annotations. It does not provide a cache implementation — it delegates to providers like Caffeine (in-process), Redis (distributed), or EhCache.

```java
@Cacheable("products")
public Product findById(String id) {
    return repository.findById(id).orElseThrow();
}
```

The first call queries the database. The result is stored in the "products" cache. The second call with the same `id` returns the cached value without touching the database.

## Cache annotations

| Annotation | Purpose |
|---|---|
| `@Cacheable` | Cache the result; return cached value if present |
| `@CachePut` | Always execute; update cache with result |
| `@CacheEvict` | Remove entry from cache |
| `@Caching` | Combine multiple cache operations |

```java
@Service
public class ProductService {

    // Cache result; skip cache if product is out of stock
    @Cacheable(value = "products", condition = "#result.inStock == true")
    public Product findById(String id) {
        return repository.findById(id).orElseThrow();
    }

    // Always execute; update cache
    @CachePut(value = "products", key = "#product.id")
    public Product update(Product product) {
        return repository.save(product);
    }

    // Evict on delete
    @CacheEvict(value = "products", key = "#id")
    public void delete(String id) {
        repository.deleteById(id);
    }

    // Evict entire cache
    @CacheEvict(value = "products", allEntries = true)
    @Scheduled(fixedRate = 3600000)  // every hour
    public void evictAll() {
        // cache is cleared; next access repopulates
    }
}
```

## Cache key generation

By default, Spring generates the key from all method parameters using a `SimpleKeyGenerator`. For custom keys:

```java
@Cacheable(value = "products", key = "#id")
public Product findById(String id) { ... }

@Cacheable(value = "orders", key = "#customerId + ':' + #status")
public List<Order> findByCustomerAndStatus(String customerId, String status) { ... }

@Cacheable(value = "reports", key = "T(java.util.Objects).hash(#req)")
public Report generate(ReportRequest req) { ... }
```

## Conditional caching

```java
// Only cache if the result is not null
@Cacheable(value = "users", unless = "#result == null")
public User findById(String id) { ... }

// Only cache for admin users
@Cacheable(value = "admin-data", condition = "#role == 'ADMIN'")
public AdminData getAdminData(String role) { ... }
```

## Cache providers

### Caffeine (in-process, fastest)

```yaml
spring:
  cache:
    type: caffeine
    caffeine:
      spec: maximumSize=500,expireAfterWrite=10m
```

```java
@Bean
public CaffeineCacheManager cacheManager() {
    CaffeineCacheManager manager = new CaffeineCacheManager();
    manager.setCaffeine(Caffeine.newBuilder()
        .maximumSize(1000)
        .expireAfterWrite(Duration.ofMinutes(10))
        .recordStats());  // enable hit/miss statistics
    return manager;
}
```

### Redis (distributed, shared across instances)

```yaml
spring:
  cache:
    type: redis
    redis:
      time-to-live: 600000  # 10 minutes in ms
      cache-null-values: false
```

```java
@Bean
public RedisCacheManager cacheManager(RedisConnectionFactory factory) {
    RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
        .entryTtl(Duration.ofMinutes(10))
        .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(new GenericJackson2JsonRedisSerializer()));

    return RedisCacheManager.builder(factory)
        .cacheDefaults(config)
        .withCacheConfiguration("products",
            RedisCacheConfiguration.defaultCacheConfig().entryTtl(Duration.ofMinutes(30)))
        .build();
}
```

## How we use it in organizations

### Scenario 1: product catalog with time-based eviction

```java
@Service
public class ProductCatalogService {

    @Cacheable(value = "catalog", key = "#categoryId", unless = "#result.isEmpty()")
    public List<Product> getCategoryProducts(String categoryId) {
        return productRepository.findByCategoryId(categoryId);
    }

    // Evict when a product is updated
    @CacheEvict(value = "catalog", key = "#product.categoryId")
    public Product updateProduct(Product product) {
        return productRepository.save(product);
    }
}
```

### Scenario 2: user session cache

```java
@Service
public class UserSessionService {

    @Cacheable(value = "sessions", key = "#token")
    public Session validateToken(String token) {
        return sessionRepository.findByToken(token).orElse(null);
    }

    @CacheEvict(value = "sessions", key = "#token")
    public void invalidateToken(String token) {
        sessionRepository.deleteByToken(token);
    }
}
```

### Scenario 3: multi-level cache (L1 Caffeine + L2 Redis)

```java
@Configuration
public class MultiLevelCacheConfig {

    @Bean
    public CacheManager cacheManager(RedisConnectionFactory redis) {
        // L1: Caffeine (fast, per-instance)
        CaffeineCacheManager l1 = new CaffeineCacheManager();
        l1.setCaffeine(Caffeine.newBuilder().maximumSize(500).expireAfterWrite(Duration.ofMinutes(5)));

        // L2: Redis (shared across instances)
        RedisCacheManager l2 = RedisCacheManager.builder(redis).build();

        // Compose: check L1 first, then L2, then database
        return new CompositeCacheManager(l1, l2);
    }
}
```

## Cache pitfalls

| Pitfall | Impact |
|---|---|
| Caching null results | Cache poisoning — subsequent lookups hit cache instead of DB |
| No eviction strategy | Memory leak — cache grows unbounded |
| Inconsistent keys | Same data cached under different keys |
| Caching across transactions | Cached stale data from uncommitted reads |
| Caching in security contexts | Cached authorized data may leak across users |

## Common mistakes

| Mistake | Consequence |
|---|---|
| `@Cacheable` on private method | Spring AOP cannot intercept it |
| No `@CacheEvict` on writes | Stale data served forever |
| Using `@Cacheable` without `key` | All calls with different params share one cache entry |
| Caching in cluster without distributed cache | Each node has its own cache — inconsistent |
| `allEntries = true` without reason | Evicts everything on every call — defeats caching |
