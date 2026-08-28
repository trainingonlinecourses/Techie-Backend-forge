---
title: Spring Expression Language (SpEL) — Dynamic Values at Runtime
summary: SpEL basics — property placeholders, bean references, conditional expressions, collection filtering, and how organizations use SpEL for dynamic configuration and security rules. Beginner-friendly with line-by-line code.
order: 6
minutes: 20
topics: [SpEL, Spring Expression Language, property placeholders, bean references, conditional, collection filtering, dynamic config]
docs:
  - https://docs.spring.io/spring-framework/reference/core/expressions.html
---

# Spring Expression Language (SpEL) — Dynamic Values at Runtime

## What is SpEL? (From Zero)

SpEL (Spring Expression Language) is a powerful expression language that lets you compute values **at runtime**. You've already used it without knowing — `${server.port}` in `application.yml` is a SpEL-like placeholder. But SpEL goes much further: it can call methods, access collections, use conditional logic, and reference Spring beans.

Think of it like Excel formulas for Spring: instead of hardcoding a value, you write an expression that Spring evaluates when the app starts (or when the value is needed).

### Where You'll See SpEL

| Where | Example | What It Does |
|---|---|---|
| `application.yml` | `${DB_PASSWORD}` | Reads environment variable |
| `@Value` annotation | `@Value("#{T(java.lang.Math).PI}")` | Injects computed value |
| `@Scheduled` | `cron = "#{@cronConfig.daily}"` | References a bean's method |
| Security expressions | `hasRole('ADMIN')` | Dynamic authorization |
| Cache key | `key = "#userId"` | Uses method parameter as key |

---

## The Code — Line by Line

### 1. Property Placeholders (Simple SpEL)

```yaml
# application.yml — SpEL placeholders:
server:
  port: ${SERVER_PORT:8080}           # Use SERVER_PORT env var, default to 8080

spring:
  datasource:
    url: ${DATABASE_URL:jdbc:h2:mem:test}
    username: ${DB_USER:sa}
    password: ${DB_PASS:}

app:
  jwt:
    secret: ${JWT_SECRET}
    expiration: ${JWT_EXPIRATION:3600000}
```

**Line-by-line explained:**
- `${SERVER_PORT:8080}` — SpEL placeholder. Looks for the `SERVER_PORT` environment variable. If not found, uses `8080`.
- `${DATABASE_URL:jdbc:h2:mem:test}` — Use the environment variable in production, default to H2 in development.
- `${JWT_SECRET}` — No default value. The app FAILS to start if this isn't set (intentional — you don't want a default secret).

### 2. @Value with SpEL Expressions

```java
@Component
public class AppConfig {

    @Value("${app.jwt.secret}")                              // Simple property lookup
    private String jwtSecret;

    @Value("#{T(java.lang.Math).PI}")                        // Reference a Java class
    private double pi;

    @Value("#{${app.limits}}")                               // Nested placeholder (map from properties)
    private Map<String, Integer> limits;

    @Value("#{2 * 60 * 1000}")                               // Inline computation
    private long cacheTtlMs;

    @Value("#{systemProperties['user.home']}")               // System property
    private String userHome;

    @Value("#{environment['PATH']}")                         // Environment variable
    private String path;

    @Value("#{@myBean.calculateTimeout()}")                  // Call a Spring bean's method
    private long timeout;

    @Value("#{configService.getMaxRetries()}")               // Call another bean's method
    private int maxRetries;
}
```

**Line-by-line explained:**
- `#{T(java.lang.Math).PI}` — Access a static field of a Java class. `T()` is the type operator.
- `#{${app.limits}}` — Double placeholder: first resolves `${app.limits}` to a string like `{"max":100,"min":0}`, then SpEL parses it as a map.
- `#{2 * 60 * 1000}` — Inline math. Result: 120000 (2 minutes in milliseconds).
- `#{systemProperties['user.home']}` — Access JVM system properties.
- `#{@myBean.calculateTimeout()}` — Call a method on a Spring bean. The `@` prefix accesses beans by name.

### 3. Conditional Expressions

```java
@Component
public class FeatureFlags {

    @Value("#{${app.feature.cache-enabled:false} ? 'redis' : 'concurrent-map'}")
    private String cacheType;                                // "redis" if enabled, "concurrent-map" otherwise

    @Value("#{${app.profile} == 'production' ? 'INFO' : 'DEBUG'}")
    private String logLevel;                                 // INFO in prod, DEBUG elsewhere

    @Value("#{${app.replicas:1} > 1 ? true : false}")
    private boolean multiInstance;                           // True if multiple replicas
}
```

### 4. SpEL in Annotations

```java
// @Scheduled with SpEL:
@Scheduled("#{@cronConfig.orderCleanup}")                    // References a bean's method that returns cron expression
public void cleanupOldOrders() { ... }

// Cache key using SpEL:
@Cacheable(value = "users", key = "#userId + ':' + #region")
public User findUser(String userId, String region) { ... }

// Security expressions:
@PreAuthorize("hasRole('ADMIN') or #userId == authentication.name")
public User getUser(String userId) { ... }

@PostFilter("filterObject.region == authentication.details.region")
public List<Order> getAllOrders() { ... }
```

---

## Real-World Scenarios

### Scenario 1: Dynamic Feature Flags

```java
@Service
public class OrderService {

    @Value("#{${app.features.new-payment:false}}")
    private boolean newPaymentEnabled;

    public PaymentResult processPayment(Order order) {
        if (newPaymentEnabled) {
            return newPaymentService.charge(order);          // New payment gateway
        } else {
            return legacyPaymentService.charge(order);       // Legacy payment gateway
        }
    }
}
```

```yaml
# Toggle via environment variable without code change:
# app.features.new-payment=true → uses new gateway
# app.features.new-payment=false → uses legacy gateway
```

### Scenario 2: Security Rules with SpEL

```java
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public MethodSecurityExpressionHandler methodSecurityExpressionHandler() {
        return new DefaultMethodSecurityExpressionHandler();
    }
}

@Service
public class OrderService {

    @PreAuthorize("hasRole('ADMIN') or #order.customerId == authentication.name")
    public Order updateOrder(String orderId, OrderUpdate update) {
        // Only admins or the order's own customer can update
    }

    @PostFilter("filterObject.status != 'DELETED'")
    public List<Order> getAllOrders() {
        // Filter out deleted orders from the result
    }
}
```

### Scenario 3: Environment-Specific Configuration

```java
@Configuration
public class CacheConfig {

    @Bean
    @ConditionalOnProperty(name = "app.cache.type", havingValue = "redis")
    public CacheManager redisCacheManager(RedisConnectionFactory factory) {
        return RedisCacheManager.builder(factory).build();
    }

    @Bean
    @ConditionalOnProperty(name = "app.cache.type", havingValue = "concurrent-map",
                           matchIfMissing = true)
    public CacheManager concurrentMapCacheManager() {
        return new ConcurrentMapCacheManager("users", "orders", "products");
    }
}
```

```yaml
# Dev: uses ConcurrentMapCacheManager (in-memory, no Redis needed)
app.cache.type: concurrent-map

# Prod: uses Redis (shared across instances)
app.cache.type: redis
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| SpEL syntax error | App fails to start with cryptic error | Test expressions in SpEL evaluator first |
| No default for required properties | App fails without clear message | Use `${PROP}` (no default) intentionally for required config |
| Overusing SpEL | Hard to debug complex expressions | Keep SpEL simple; move logic to Java code |
| SpEL injection vulnerability | User input in SpEL = remote code execution | Never put user input in SpEL expressions |
| Missing `#{}` vs `${}` | `#{}` = SpEL expression, `${}` = property placeholder | `#{}` evaluates SpEL, `${}` resolves properties |

---

## Key Takeaways

- **`${}` = property placeholder** (resolves properties/env vars). **`#{}` = SpEL expression** (evaluates at runtime).
- **`@Value("#{expression}")`** — inject computed values into your beans.
- **SpEL in annotations** — `@PreAuthorize`, `@Cacheable key`, `@Scheduled cron`.
- **Conditional expressions** — `#{condition ? trueVal : falseVal}` for feature flags.
- **Never put user input in SpEL** — it can execute arbitrary code (security vulnerability).

Official docs: [SpEL Reference](https://docs.spring.io/spring-framework/reference/core/expressions.html) · [Spring Expression Language](https://docs.spring.io/spring-framework/reference/core/expressions.html)
