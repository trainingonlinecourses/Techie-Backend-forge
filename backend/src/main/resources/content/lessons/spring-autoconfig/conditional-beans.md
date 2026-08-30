---
title: Conditional Beans — Creating Beans Only When Needed
summary: What @Conditional annotations are, the different types (@ConditionalOnClass, @ConditionalOnProperty, etc.), and how organizations use them to build flexible, environment-aware configurations.
order: 2
minutes: 22
topics: [@Conditional, @ConditionalOnClass, @ConditionalOnProperty, @ConditionalOnMissingBean, auto-configuration]
docs:
  - https://docs.spring.io/spring-boot/reference/features/auto-configuration.html
  - https://docs.spring.io/spring-framework/reference/core/beans/condition-annotations.html
---

## The Concept, From Zero

Imagine you're building an app that can use either Redis OR Caffeine for caching. You don't want to hardcode which one to use — you want Spring to figure it out based on what's available.

That's what `@Conditional` annotations do. They tell Spring: **"Only create this bean IF a certain condition is true."**

```java
// Only create this bean if Redis is on the classpath
@Bean
@ConditionalOnClass(name = "redis.clients.jedis.Jedis")
public CacheManager redisCacheManager() {
    return new RedisCacheManager();
}

// Only create this bean if Redis is NOT on the classpath
@Bean
@ConditionalOnMissingBean(CacheManager.class)
public CacheManager defaultCacheManager() {
    return new ConcurrentMapCacheManager();
}
```

---

## The @Conditional Family

| Annotation | What It Checks | Example Use |
|-----------|----------------|-------------|
| `@ConditionalOnClass` | Class exists on classpath | Redis, JPA, etc. |
| `@ConditionalOnMissingClass` | Class does NOT exist | Fallback implementations |
| `@ConditionalOnBean` | Bean exists in context | Override existing beans |
| `@ConditionalOnMissingBean` | Bean does NOT exist | Default implementations |
| `@ConditionalOnProperty` | Property has specific value | Feature toggles |
| `@ConditionalOnResource` | Resource file exists | Config files |
| `@ConditionalOnWebApplication` | Running as web app | Web-specific beans |

---

## Line-by-Line Walkthrough

```java
import org.springframework.boot.autoconfigure.condition.*;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;

// Line 1: Conditional on class presence
@Configuration
public class CacheConfiguration {
    
    // Only if Redis client is on classpath
    @Bean
    @ConditionalOnClass(name = "redis.clients.jedis.Jedis")
    @ConditionalOnMissingBean(CacheManager.class)  // And no other CacheManager exists
    public CacheManager redisCacheManager() {
        System.out.println("Creating Redis cache manager");
        return new RedisCacheManager();
    }
    
    // Only if Redis is NOT on classpath
    @Bean
    @ConditionalOnMissingBean(CacheManager.class)
    public CacheManager defaultCacheManager() {
        System.out.println("Creating default in-memory cache manager");
        return new ConcurrentMapCacheManager();
    }
}

// Line 2: Conditional on property
@Configuration
public class FeatureConfiguration {
    
    // Only if app.features.metrics.enabled=true
    @Bean
    @ConditionalOnProperty(name = "app.features.metrics.enabled", havingValue = "true")
    public MetricsService metricsService() {
        return new MetricsService();
    }
    
    // Only if property is false or missing
    @Bean
    @ConditionalOnProperty(name = "app.features.metrics.enabled", havingValue = "false", matchIfMissing = true)
    public MetricsService noOpMetricsService() {
        return new NoOpMetricsService();
    }
}

// Line 3: Conditional on bean existence
@Configuration
public class NotificationConfiguration {
    
    @Bean
    @ConditionalOnBean(EmailService.class)
    public NotificationService emailNotification() {
        return new EmailNotificationService();
    }
    
    @Bean
    @ConditionalOnMissingBean(NotificationService.class)
    public NotificationService fallbackNotification() {
        return new LogNotificationService();
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Database auto-configuration

```java
@AutoConfiguration
@ConditionalOnClass(JdbcTemplate.class)
public class DataSourceAutoConfiguration {
    
    @Bean
    @Primary
    @ConditionalOnMissingBean(DataSource.class)
    public DataSource dataSource(DataSourceProperties properties) {
        return properties.initializeDataSourceBuilder().build();
    }
    
    @Bean
    @ConditionalOnMissingBean(JdbcTemplate.class)
    public JdbcTemplate jdbcTemplate(DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }
}

// application.yml
// spring:
//   datasource:
//     url: jdbc:postgresql://localhost:5432/mydb
//     username: user
//     password: pass
```

### Scenario 2: Feature flags

```java
@Configuration
public class FeatureFlags {
    
    @Bean
    @ConditionalOnProperty(name = "app.feature.dark-mode", havingValue = "true")
    public ThemeService darkModeTheme() {
        return new DarkModeThemeService();
    }
    
    @Bean
    @ConditionalOnProperty(name = "app.feature.dark-mode", havingValue = "false", matchIfMissing = true)
    public ThemeService lightModeTheme() {
        return new LightModeThemeService();
    }
    
    @Bean
    @ConditionalOnProperty(name = "app.feature.ai-assistant", havingValue = "true")
    public AiAssistantService aiAssistant() {
        return new OpenAiAssistantService();
    }
}

// application.yml
// app:
//   feature:
//     dark-mode: true
//     ai-assistant: false
```

### Scenario 3: Profile-specific beans

```java
@Configuration
public class EnvironmentConfiguration {
    
    @Bean
    @Profile("dev")
    @ConditionalOnMissingBean(DataLoader.class)
    public DataLoader devDataLoader() {
        return new TestDataLoader();  // Uses test data
    }
    
    @Bean
    @Profile("prod")
    @ConditionalOnMissingBean(DataLoader.class)
    public DataLoader prodDataLoader() {
        return new RealDataLoader();  // Uses real data
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| `@ConditionalOnClass` with wrong name | Bean never created | Use fully qualified class name |
| Forgetting `matchIfMissing` | Default not created when property absent | Add `matchIfMissing = true` |
| Circular conditions | Bean A needs Bean B, B needs A | Restructure or use `@Lazy` |
| Not using `@ConditionalOnMissingBean` | Duplicate beans | Always pair with `@ConditionalOnBean` |
| Checking property before it's loaded | Condition evaluated too early | Use `@ConditionalOnProperty` with `havingValue` |

---

## Debugging Auto-Configuration

```bash
# Add to application.yml to see which conditions were met
debug: true

# Or start with:
# java -jar app.jar --debug

# Output shows:
# CacheConfiguration:
#    Did not match:
#       - @ConditionalOnClass did not find required class 'redis.clients.jedis.Jedis'
#    Matched:
#       - @ConditionalOnMissingBean (types: org.springframework.cache.CacheManager; DefaultSearch: all)
```
