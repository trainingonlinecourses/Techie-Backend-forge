---
title: "Spring Caching — Speed Up Your App Without Changing Code"
summary: "How @Cacheable works, cache eviction strategies, multi-tier caching with Caffeine + Redis, and how organizations use caching to handle millions of requests."
order: 6
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

```java
@Service
public class ProductService {
    
    @Cacheable("products")
    public List<Product> getAllProducts() {
        // This method only runs the FIRST time it's called
        // Subsequent calls return the cached result
        slowDatabaseQuery(); // Only runs once
        return productRepository.findAll();
    }
    
    @CacheEvict("products")
    public void deleteProduct(Long id) {
        // Clears the cache when a product is deleted
        productRepository.deleteById(id);
        // Next getAllProducts() call will re-fetch from database
    }
    
    @CachePut("products")
    public Product updateProduct(Long id, ProductUpdateRequest request) {
        // Updates the cache with the new value
        Product updated = productRepository.save(update(id, request));
        return updated;
        // Cache is updated WITHOUT calling the method again
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

```java
@Service
public class ProductService {
    
    // Simple caching
    @Cacheable("products")
    public List<Product> getAllProducts() {
        return productRepository.findAll();
    }
    
    // Cache with key
    @Cacheable(value = "products", key = "#id")
    public Product getProductById(Long id) {
        return productRepository.findById(id).orElseThrow();
    }
    
    // Cache with condition (only cache if condition is true)
    @Cacheable(value = "products", condition = "#id > 0")
    public Product getProductByIdSafe(Long id) {
        return productRepository.findById(id).orElseThrow();
    }
    
    // Cache with unless (don't cache if result matches)
    @Cacheable(value = "products", unless = "#result == null")
    public Product findProductByCode(String code) {
        return productRepository.findByCode(code).orElse(null);
    }
    
    // Cache with sync (prevent cache stampede)
    @Cacheable(value = "products", sync = true)
    public Product getPopularProduct() {
        return productRepository.findMostPopular().orElseThrow();
    }
    // sync=true ensures only one thread populates the cache
    // Other threads wait for the first thread's result
}
```

### Cache Eviction Strategies

```java
@Service
public class ProductService {
    
    // Evict specific key
    @CacheEvict(value = "products", key = "#id")
    public void deleteProduct(Long id) {
        productRepository.deleteById(id);
    }
    
    // Evict ALL entries in the cache
    @CacheEvict(value = "products", allEntries = true)
    public void refreshAllProducts() {
        // After bulk import, clear entire cache
        productRepository.bulkImport();
    }
    
    // Evict before method runs (beforeInvocation = true)
    @CacheEvict(value = "products", beforeInvocation = true)
    public void massiveUpdate() {
        // Cache is cleared BEFORE this runs
        // Ensures fresh data even if this method fails
    }
}
```

### Multi-Tier Caching

Real applications use multiple cache layers:

```java
@Configuration
@EnableCaching
public class CacheConfig {
    
    // Layer 1: In-memory (Caffeine) — nanoseconds
    @Bean
    public CaffeineCacheManager caffeineCacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager();
        manager.setCaffeine(Caffeine.newBuilder()
            .maximumSize(10_000)           // Max 10,000 entries
            .expireAfterWrite(Duration.ofMinutes(5))  // Auto-expire after 5 min
            .recordStats()                 // Enable statistics
        );
        return manager;
    }
    
    // Layer 2: Distributed (Redis) — milliseconds
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

```java
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
```

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Caching everything | Memory bloat, stale data | Cache only hot paths |
| No eviction strategy | Cache grows forever | Use TTL + max size |
| No `sync = true` on hot keys | Cache stampede — multiple threads rebuild simultaneously | Use `sync = true` |
| Caching mutable data without eviction | Stale data served forever | Evict on every write |
| No monitoring | Can't tell if cache helps | Enable Caffeine stats |

### Line-by-Line Code Explanation

```java
@Service
// ↑ Spring-managed service bean — caching annotations are processed by Spring

public class ProductService {
    
    private final ProductRepository productRepository;
    // ↑ JPA repository — talks to the database
    
    public ProductService(ProductRepository productRepository) {
        this.productRepository = productRepository;
        // ↑ Constructor injection — Spring provides the repository
    }
    
    @Cacheable(value = "products", key = "#id", unless = "#result == null")
    // ↑ @Cacheable tells Spring: "Cache the result of this method"
    // ↑ value = "products" — cache name (for organization)
    // ↑ key = "#id" — use the 'id' parameter as cache key
    // ↑ unless = "#result == null" — don't cache null results
    
    public Product getProductById(Long id) {
        // ↑ This method body ONLY runs if the cache doesn't have the key
        // ↑ First call: runs query, caches result, returns it
        // ↑ Subsequent calls: returns cached value, method body is SKIPPED
        
        return productRepository.findById(id).orElseThrow();
        // ↑ Database query — only executes on cache miss
        // ↑ orElseThrow() means null is never returned
        // ↑ So the 'unless' clause above is actually unnecessary here
    }
    
    @CacheEvict(value = "products", key = "#id")
    // ↑ @CacheEvict tells Spring: "Remove this entry from cache"
    // ↑ Called automatically when deleteProduct runs
    
    public void deleteProduct(Long id) {
        productRepository.deleteById(id);
        // ↑ After deletion, the cache entry is evicted
        // ↑ Next getProductById(id) will query the database (and return 404)
    }
    
    @CachePut(value = "products", key = "#id")
    // ↑ @CachePut tells Spring: "Run the method, then update the cache"
    // ↑ Unlike @Cacheable, the method ALWAYS runs
    
    public Product updateProduct(Long id, ProductUpdateRequest request) {
        Product product = productRepository.findById(id).orElseThrow();
        product.setName(request.name());
        product.setPrice(request.price());
        Product updated = productRepository.save(product);
        // ↑ Database is updated
        // ↑ Spring puts 'updated' into the "products" cache with key=id
        // ↑ Next getProductById(id) returns the fresh value from cache
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
