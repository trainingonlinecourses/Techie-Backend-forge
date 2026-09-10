---
title: "Spring Caching — Speed Up Your App Without Changing Code"
summary: "How @Cacheable works, cache eviction strategies, multi-tier caching with Caffeine + Redis, and how organizations use caching to handle millions of requests."
order: 5
minutes: 22
topics: [caching, @cacheable, @cacheevict, cache-manager, caffeine, redis-cache, cache-strategy]
docs:
  - https://docs.spring.io/spring-framework/reference/integration/cache.html
  - https://docs.spring.io/spring-boot/docs/current/reference/htmlio/features.html#features.caching
---

## The Concept, From Zero

### What is Caching?

**Caching = storing frequently accessed data in fast storage (memory) instead of fetching it repeatedly from slow storage (database).**

Without caching:
```
User requests product list → SQL query → Database (50ms) → Return
User requests product list → SQL query → Database (50ms) → Return  (same query!)
User requests product list → SQL query → Database (50ms) → Return  (same query again!)
```

With caching:
```
User requests product list → SQL query → Database (50ms) → Cache it → Return
User requests product list → Cache hit (0.1ms) → Return  (no database!)
User requests product list → Cache hit (0.1ms) → Return  (no database!)
```

**The first request is slow. Every subsequent request is instant.**

### How Spring Caching Works

Spring has a built-in caching abstraction. You add annotations to your methods, and Spring handles the rest:


**What this code does — step by step:**

1. This method only runs the FIRST time it's called. Subsequent calls return the cached result
2. `slowDatabaseQuery();` — Only runs once
3. Clears the cache when a product is deleted
4. Next getAllProducts() call will re-fetch from database
5. Updates the cache with the new value
6. Cache is updated WITHOUT calling the method again

The same code, clean:

```java
@Service
public class ProductService {

    @Cacheable("products")
    public List<Product> getAllProducts() {
        slowDatabaseQuery();
        return productRepository.findAll();
    }

    @CacheEvict("products")
    public void deleteProduct(Long id) {
        productRepository.deleteById(id);
    }

    @CachePut("products")
    public Product updateProduct(Long id, ProductUpdateRequest request) {
        Product updated = productRepository.save(update(id, request));
        return updated;
    }
}
```

### Cache Annotations Reference

| Annotation | What It Does |
|------------|--------------|
| `@Cacheable` | Returns cached value if available, otherwise runs method and caches result |
| `@CacheEvict` | Removes entries from the cache |
| `@CachePut` | Always runs the method, then updates the cache with the result |
| `@Caching` | Groups multiple cache operations |
| `@CacheConfig` | Shared cache configuration for a class |

### Cacheable Deep Dive


**What this code does — step by step:**

1. Simple caching
2. Cache with key
3. Cache with condition (only cache if condition is true)
4. Cache with unless (don't cache if result matches)
5. Cache with sync (prevent cache stampede)
6. sync=true ensures only one thread populates the cache. Other threads wait for the first thread's result

The same code, clean:

```java
@Service
public class ProductService {

    @Cacheable("products")
    public List<Product> getAllProducts() {
        return productRepository.findAll();
    }

    @Cacheable(value = "products", key = "#id")
    public Product getProductById(Long id) {
        return productRepository.findById(id).orElseThrow();
    }

    @Cacheable(value = "products", condition = "#id > 0")
    public Product getProductByIdSafe(Long id) {
        return productRepository.findById(id).orElseThrow();
    }

    @Cacheable(value = "products", unless = "#result == null")
    public Product findProductByCode(String code) {
        return productRepository.findByCode(code).orElse(null);
    }

    @Cacheable(value = "products", sync = true)
    public Product getPopularProduct() {
        return productRepository.findMostPopular().orElseThrow();
    }
}
```

### Cache Eviction Strategies


**What this code does — step by step:**

1. Evict specific key
2. Evict ALL entries in the cache
3. After bulk import, clear entire cache
4. Evict before method runs (beforeInvocation = true)
5. Cache is cleared BEFORE this runs. Ensures fresh data even if this method fails

The same code, clean:

```java
@Service
public class ProductService {

    @CacheEvict(value = "products", key = "#id")
    public void deleteProduct(Long id) {
        productRepository.deleteById(id);
    }

    @CacheEvict(value = "products", allEntries = true)
    public void refreshAllProducts() {
        productRepository.bulkImport();
    }

    @CacheEvict(value = "products", beforeInvocation = true)
    public void massiveUpdate() {
    }
}
```

### Multi-Tier Caching

Real applications use multiple cache layers:


**What this code does — step by step:**

1. Layer 1: In-memory (Caffeine) — nanoseconds
2. `.maximumSize(10_000)` — Max 10,000 entries
3. `.expireAfterWrite(Duration.ofMinutes(5))` — Auto-expire after 5 min
4. `.recordStats()` — Enable statistics
5. Layer 2: Distributed (Redis) — milliseconds

The same code, clean:

```java
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CaffeineCacheManager caffeineCacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager();
        manager.setCaffeine(Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(Duration.ofMinutes(5))
            .recordStats()
        );
        return manager;
    }

    @Bean
    public RedisCacheManager redisCacheManager(RedisConnectionFactory factory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(10))
            .serializeValuesWith(
                RedisSerializationContext.SerializationPair
                    .fromSerializer(new GenericJackson2JsonRedisSerializer())
            );

        return RedisCacheManager.builder(factory)
            .cacheDefaults(config)
            .withCacheConfiguration("products",
                RedisCacheConfiguration.defaultCacheConfig().entryTtl(Duration.ofHours(1)))
            .build();
    }
}
```

**The flow:**
1. Check Caffeine (in-memory) → if hit, return instantly
2. Check Redis (distributed) → if hit, populate Caffeine, return
3. Query database → populate both caches, return

### Cache with TTL (Time-To-Live)

@Configuration
@EnableCaching
public class CacheConfig {
    
    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager();
        manager.setCaffeine(Caffeine.newBuilder()
            .maximumSize(5_000)
            .expireAfterWrite(Duration.ofMinutes(10))
            // ↑ Entries auto-expire after 10 minutes
            // ↑ Prevents stale data
        );
        return manager;
    }
}

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Caching everything | Memory bloat, stale data | Cache only hot paths |
| No eviction strategy | Cache grows forever | Use TTL + max size |
| No `sync = true` on hot keys | Cache stampede — multiple threads rebuild simultaneously | Use `sync = true` |
| Caching mutable data without eviction | Stale data served forever | Evict on every write |
| No monitoring | Can't tell if cache helps | Enable Caffeine stats |

### Line-by-Line Code Explanation


**What this code does — step by step:**

1. ↑ Spring-managed service bean — caching annotations are processed by Spring
2. ↑ JPA repository — talks to the database
3. ↑ Constructor injection — Spring provides the repository
4. ↑ @Cacheable tells Spring: "Cache the result of this method". ↑ value = "products" — cache name (for organization). ↑ key = "#id" — use the 'id' parameter as cache key. ↑ unless = "#result == null" — don't cache null results
5. ↑ This method body ONLY runs if the cache doesn't have the key. ↑ First call: runs query, caches result, returns it. ↑ Subsequent calls: returns cached value, method body is SKIPPED
6. ↑ Database query — only executes on cache miss. ↑ orElseThrow() means null is never returned. ↑ So the 'unless' clause above is actually unnecessary here
7. ↑ @CacheEvict tells Spring: "Remove this entry from cache". ↑ Called automatically when deleteProduct runs
8. ↑ After deletion, the cache entry is evicted. ↑ Next getProductById(id) will query the database (and return 404)
9. ↑ @CachePut tells Spring: "Run the method, then update the cache". ↑ Unlike @Cacheable, the method ALWAYS runs
10. ↑ Database is updated. ↑ Spring puts 'updated' into the "products" cache with key=id. ↑ Next getProductById(id) returns the fresh value from cache

The same code, clean:

```java
@Service

public class ProductService {

    private final ProductRepository productRepository;

    public ProductService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    @Cacheable(value = "products", key = "#id", unless = "#result == null")

    public Product getProductById(Long id) {

        return productRepository.findById(id).orElseThrow();
    }

    @CacheEvict(value = "products", key = "#id")

    public void deleteProduct(Long id) {
        productRepository.deleteById(id);
    }

    @CachePut(value = "products", key = "#id")

    public Product updateProduct(Long id, ProductUpdateRequest request) {
        Product product = productRepository.findById(id).orElseThrow();
        product.setName(request.name());
        product.setPrice(request.price());
        Product updated = productRepository.save(product);
        return updated;
    }
}
```

### Key Takeaways

1. **`@Cacheable`** — returns cached value if available, otherwise runs method
2. **`@CacheEvict`** — clears cache entries (use on all write operations)
3. **`@CachePut`** — always runs method, then updates cache
4. **Use `sync = true`** on hot keys to prevent cache stampede
5. **Multi-tier caching** — Caffeine (memory) + Redis (distributed)
6. **Always set TTL** — prevent stale data from living forever
7. **Monitor cache hit rates** — if hit rate < 80%, your cache config needs tuning

### Real-World Organization Scenario

An e-commerce platform serves 100,000 requests/second. Product catalog queries hit the database 10,000 times/second without caching. After implementing Spring Cache with Caffeine (L1) + Redis (L2):
- Database load drops to 100 queries/second (99% reduction)
- Average response time drops from 50ms to 0.5ms
- Redis handles cache invalidation across 20 server instances
- Caffeine handles in-memory caching with 95% hit rate

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [docs.spring.io/spring-framework/reference/integration/cache.html](https://docs.spring.io/spring-framework/reference/integration/cache.html)
