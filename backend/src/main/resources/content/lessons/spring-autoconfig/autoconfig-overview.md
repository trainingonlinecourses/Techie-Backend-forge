---
title: Spring Boot Auto-Configuration — How the Magic Works
summary: What auto-configuration is, @EnableAutoConfiguration, conditional beans, custom auto-configuration, and how Spring Boot configures your app automatically.
order: 1
minutes: 25
topics: [auto-configuration, @EnableAutoConfiguration, conditional, spring-boot-starter, spring-boot]
docs:
  - https://docs.spring.io/spring-boot/reference/features/auto-configuration.html
---

## The Concept, From Zero

When you add `spring-boot-starter-data-jpa` to your project, Spring Boot automatically:
1. Creates an EntityManagerFactory
2. Configures a DataSource
3. Enables transaction management
4. Sets up Hibernate properties

You didn't write any configuration. That's **auto-configuration** — Spring Boot configures your application based on what's on the classpath.

```java
@SpringBootApplication  // includes @EnableAutoConfiguration
public class MyApp {
    public static void main(String[] args) {
        SpringApplication.run(MyApp.class, args);
    }
}

// @SpringBootApplication = @Configuration + @EnableAutoConfiguration + @ComponentScan
```

---

## How It Works

```java
// Spring Boot checks the classpath for classes
// If certain classes exist, it configures beans automatically

// Example: DataSourceAutoConfiguration
@AutoConfiguration
@ConditionalOnClass(DataSource.class)           // Only if DataSource class exists
@ConditionalOnMissingBean(DataSource.class)      // Only if no DataSource bean defined
@EnableConfigurationProperties(DataSourceProperties.class)
public class DataSourceAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public DataSource dataSource(DataSourceProperties properties) {
        // Create and configure DataSource from application.yml
        return properties.initializeDataSourceBuilder().build();
    }
}
```

---

## Line-by-Line Walkthrough

```java
import org.springframework.boot.autoconfigure.*;
import org.springframework.boot.autoconfigure.condition.*;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;

// Line 1: Understanding @SpringBootApplication
@SpringBootApplication
// Equivalent to:
// @Configuration          — marks this as a configuration class
// @EnableAutoConfiguration — enables auto-configuration
// @ComponentScan          — scans for @Component, @Service, etc.
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}

// Line 2: Conditional beans — only created when conditions met
@Configuration
public class MyConfig {

    @Bean
    @ConditionalOnClass(name = "com.mysql.cj.jdbc.Driver")  // MySQL on classpath
    public DataSource mysqlDataSource() {
        return new MysqlDataSource();
    }

    @Bean
    @ConditionalOnProperty(name = "app.feature.enabled", havingValue = "true")
    public FeatureService featureService() {
        return new FeatureService();
    }

    @Bean
    @ConditionalOnMissingBean(CacheManager.class)  // Only if no CacheManager exists
    public CacheManager defaultCacheManager() {
        return new ConcurrentMapCacheManager();
    }
}

// Line 3: Custom auto-configuration
@AutoConfiguration
@ConditionalOnClass(RedisOperations.class)
@ConditionalOnProperty(name = "app.redis.enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(RedisProperties.class)
public class RedisAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public RedisTemplate<String, Object> redisTemplate(
            RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);
        return template;
    }
}

// Line 4: Exclude auto-configuration
@SpringBootApplication(exclude = {
    DataSourceAutoConfiguration.class,
    RedisAutoConfiguration.class
})
public class AppWithoutDatabase {
    // DataSource and Redis beans won't be created
}

// Line 5: Debug auto-configuration
// Add to application.yml:
// debug: true
// This prints which auto-configurations were applied and why

// Line 6: List all auto-configuration classes
// Check META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
// or META-INF/spring.factories (older versions)
```

---

## Real-World Scenarios

### Scenario 1: Feature toggle with auto-configuration

```java
@AutoConfiguration
@ConditionalOnProperty(name = "app.features.metrics.enabled", havingValue = "true")
@EnableConfigurationProperties(MetricsProperties.class)
public class MetricsAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public MeterRegistryCustomizer<PrometheusMeterRegistry> prometheusCustomizer(
            MetricsProperties properties) {
        return registry -> {
            registry.config().commonTags("application", properties.getAppName());
        };
    }
}

// application.yml
// app:
//   features:
//     metrics:
//       enabled: true
//       app-name: my-service
```

### Scenario 2: Database auto-configuration with multiple databases

```java
@AutoConfiguration
@ConditionalOnClass(JdbcTemplate.class)
public class MultiDatabaseAutoConfiguration {

    @Bean
    @Primary
    @ConditionalOnProperty(name = "app.database.primary", havingValue = "postgres")
    public DataSource primaryDataSource() {
        // PostgreSQL for primary
    }

    @Bean
    @ConditionalOnProperty(name = "app.database.secondary", havingValue = "mysql")
    public DataSource secondaryDataSource() {
        // MySQL for secondary
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Not understanding why beans exist | "Where did this DataSource come from?" | Check auto-configuration with `debug: true` |
| Overriding auto-configuration | Beans not created | Use `@ConditionalOnMissingBean` |
| Forgetting `@AutoConfiguration` | Not processed as auto-config | Add `@AutoConfiguration` annotation |
| Not excluding unwanted auto-config | Unnecessary beans created | Use `spring.autoconfigure.exclude` |
| Circular dependencies | Startup fails | Use `@Lazy` or restructure beans |
