---
title: Spring Boot Caching — Multi-Level Cache Patterns
summary: @Cacheable and @CacheEvict, Redis vs Caffeine vs Ehcache, multi-level caching, cache key design, stampede prevention, and how production systems cache data without stale reads.
order: 46
minutes: 22
topics: [caching, cacheable, cacheevict, cache-manager, redis-cache, caffeine, multi-level-cache, cache-stampede]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/html/io.html#io.caching
---

# Spring Boot Caching — Multi-Level Cache Patterns

## The concept

**Caching** stores frequently accessed data in fast storage (memory or Redis) so you avoid expensive database queries on every request. The simplest form is "check cache first, if miss, query DB and store in cache."

Spring provides a **cache abstraction** that lets you add caching to any method with annotations. The implementation (Caffeine, Redis, Ehcache) is pluggable — change the cache store without changing your code.

```java
@Cacheable("users")  // Spring intercepts calls to this method
public User getUser(String id) {
    return userRepository.findById(id).orElseThrow();  // only runs on cache miss
}
```

**How it works internally:**
1. First call with `id="user-123"` → cache miss → method executes → result stored in cache
2. Second call with `id="user-123"` → cache hit → method NOT executed → cached result returned
3. `@CacheEvict("users", key = "#id")` → removes entry from cache → next call is a miss again

## Cache store comparison

| Store | Speed | Persistence | Cluster-safe | Complexity |
|---|---|---|---|---|
| **Caffeine** (in-memory) | Nanoseconds | No (lost on restart) | No | Very low |
| **Ehcache** | Nanoseconds | Optional (disk) | No | Low |
| **Redis** | Microseconds | Yes | Yes | Medium (needs Redis server) |

**Multi-level strategy:** Use Caffeine as L1 (fast, per-JVM) and Redis as L2 (shared, persistent). On L1 miss → check L2 → query DB → write to both.

## How we use it in organizations

### Scenario 1: Product catalog caching

Cache expensive product queries with automatic eviction:

```java
@Service
public class ProductService {
    private final ProductRepository productRepo;

    @Cacheable(value = "products", key = "#productId", unless = "#result == null")
    public Product getProduct(String productId) {
        log.debug("Cache miss — querying DB for product {}", productId);
        return productRepo.findById(productId).orElse(null);
    }

    @Cacheable(value = "products-by-category", key = "#categoryId")
    public List<Product> getProductsByCategory(String categoryId) {
        return productRepo.findByCategoryId(categoryId);
    }

    @CacheEvict(value = "products", key = "#productId")
    public void updateProduct(String productId, UpdateProductRequest request) {
        Product product = productRepo.findById(productId).orElseThrow();
        product.update(request);
        productRepo.save(product);
        // Cache is evicted — next read will be a miss and re-populate
    }

    @CacheEvict(value = {"products", "products-by-category"}, allEntries = true)
    @Scheduled(fixedRate = 3600000)  // every hour
    public void refreshCache() {
        log.info("Refreshing all product caches");
    }
}
```

### Scenario 2: Multi-level cache (Caffeine + Redis)

```java
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CaffeineCacheManager caffeineCacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager("users", "products");
        manager.setCaffeine(Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(Duration.ofMinutes(5))
            .recordStats());
        return manager;
    }

    @Bean
    public RedisCacheManager redisCacheManager(RedisConnectionFactory factory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(30))
            .serializeValuesWith(
                RedisSerializationContext.SerializationPair
                    .fromSerializer(new GenericJackson2JsonRedisSerializer()));

        return RedisCacheManager.builder(factory)
            .cacheDefaults(config)
            .withCacheConfiguration("users",
                RedisCacheConfiguration.defaultCacheConfig()
                    .entryTtl(Duration.ofHours(1)))
            .build();
    }
}
```

### Scenario 3: Cache stampede prevention

When a popular cache entry expires, hundreds of concurrent requests all miss the cache and hit the DB simultaneously — this is the **cache stampede** (or thundering herd).

```java
@Service
public class ResilientCacheService {
    private final LoadingCache<String, Product> productCache;

    public ResilientCacheService() {
        productCache = Caffeine.newBuilder()
            .maximumSize(5_000)
            .expireAfterWrite(Duration.ofMinutes(10))
            .refreshAfterWrite(Duration.ofMinutes(5))  // refresh BEFORE expiry
            .build(this::loadProduct);  // async refresh on access near expiry
    }

    private Product loadProduct(String id) {
        return productRepo.findById(id)
            .orElseThrow(() -> new ProductNotFoundException(id));
    }

    public Product getProduct(String id) {
        return productCache.get(id);  // thread-safe, only one thread refreshes
    }
}
```

**`refreshAfterWrite`** is the key: when the entry is accessed after the refresh period but before expiry, Caffeine returns the old value while asynchronously loading the new one in the background. Only one thread does the refresh.

### Scenario 4: Conditional caching

Cache only specific results:

```java
@Cacheable(
    value = "search-results",
    key = "#query + ':' + #page",
    condition = "#result.size() > 0",      // only cache non-empty results
    unless = "#result.size() > 100"        // don't cache huge result sets
)
public List<SearchResult> search(String query, int page) {
    return searchEngine.search(query, page);
}
```

**`condition`** — evaluated BEFORE the method runs (decides whether to check cache)
**`unless`** — evaluated AFTER the method runs (decides whether to store result)

### Scenario 5: Cache metrics and monitoring

```java
@Bean
public MeterBinder cacheMetrics(CaffeineCacheManager cacheManager) {
    return registry -> {
        cacheManager.getCacheNames().forEach(name -> {
            CaffeineCache cache = (CaffeineCache) cacheManager.getCache(name);
            Cache<String, Object> nativeCache = cache.getNativeCache();
            CacheStats stats = nativeCache.stats();

            Gauge.builder("cache.hit.count", stats, CacheStats::hitCount)
                .tag("cache", name).register(registry);
            Gauge.builder("cache.miss.count", stats, CacheStats::missCount)
                .tag("cache", name).register(registry);
            Gauge.builder("cache.eviction.count", stats, CacheStats::evictionCount)
                .tag("cache", name).register(registry);
        });
    };
}
```

## Cache key design

Keys must be unique, deterministic, and compact:

```java
// Good — composite key for method arguments
@Cacheable(value = "orders", key = "#customerId + ':' + #status + ':' + #page")

// Good — SpEL for complex keys
@Cacheable(value = "reports", key = "#request.hashCode()")

// Bad — key that changes every call (cache never hits)
@Cacheable(value = "data", key = "T(System).currentTimeMillis()")
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Caching with default TTL and no eviction | Memory leak |
| Cache annotations on private methods | Spring proxy cannot intercept |
| Not considering cache consistency | Stale data served to users |
| No monitoring of hit/miss rates | Cannot tune cache sizing |
| Caching method with side effects | Side effects skipped on cache hit |
| Using `@Cacheable` on void methods | Cache stores null, never re-calls |
