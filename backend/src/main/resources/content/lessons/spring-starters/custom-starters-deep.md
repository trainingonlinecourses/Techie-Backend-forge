---
title: Spring Boot Starters & Custom Starters
summary: What starters are, how they bundle dependencies, creating custom starters, and how organizations standardize infrastructure across teams.
order: 1
minutes: 25
topics: [starters, custom-starter, dependency-management, spring-boot]
docs:
  - https://docs.spring.io/spring-boot/reference/features/developing-auto-configuration.html
---

## The Concept, From Zero

A **starter** is a dependency descriptor that pulls in a set of related libraries:

```xml
<!-- This ONE dependency brings in Spring MVC, Jackson, Tomcat, etc. -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>

<!-- This brings in JPA, Hibernate, DataSource, etc. -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-jpa</artifactId>
</dependency>
```

**Custom starters** let you create your own reusable bundles for your organization:

```xml
<!-- Your custom starter: all teams get the same Redis caching setup -->
<dependency>
    <groupId>com.mycompany</groupId>
    <artifactId>mycompany-redis-starter</artifactId>
    <version>1.0.0</version>
</dependency>
```

---

## Line-by-Line Walkthrough

```java
// === Creating a Custom Starter ===

// Step 1: Create two modules
// mycompany-redis-spring-boot-starter       (auto-configuration)
// mycompany-redis-spring-boot-autoconfigure (auto-configuration code)

// Step 2: Auto-configuration module
@AutoConfiguration
@ConditionalOnClass(RedisOperations.class)
@EnableConfigurationProperties(MyCompanyRedisProperties.class)
public class MyCompanyRedisAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public RedisTemplate<String, Object> redisTemplate(
            RedisConnectionFactory connectionFactory,
            MyCompanyRedisProperties properties) {

        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(new GenericJackson2JsonRedisSerializer());

        // Apply custom properties
        template.setExposeConnectionKeysInHeaders(properties.isExposeHeaders());

        return template;
    }

    @Bean
    @ConditionalOnMissingBean
    public CacheManager redisCacheManager(RedisConnectionFactory connectionFactory) {
        return RedisCacheManager.builder(connectionFactory)
            .cacheDefaults(RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(properties.getCacheTtl())))
            .build();
    }
}

// Step 3: Properties class
@ConfigurationProperties(prefix = "mycompany.redis")
public class MyCompanyRedisProperties {
    private boolean exposeHeaders = false;
    private int cacheTtl = 30;  // minutes
    private String keyPrefix = "app:";

    // getters and setters
}

// Step 4: Register auto-configuration
// META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
com.mycompany.redis.autoconfigure.MyCompanyRedisAutoConfiguration

// Step 5: Use in application.yml
// mycompany:
//   redis:
//     expose-headers: true
//     cache-ttl: 60
//     key-prefix: "myservice:"
```

---

## Real-World Scenarios

### Scenario 1: Organization-wide security starter

```java
// mycompany-security-spring-boot-starter
@AutoConfiguration
@ConditionalOnClass(SecurityFilterChain.class)
@EnableConfigurationProperties(MyCompanySecurityProperties.class)
public class MyCompanySecurityAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public SecurityFilterChain filterChain(HttpSecurity http,
            MyCompanySecurityProperties properties) throws Exception {
        return http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/public/**").permitAll()
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt
                    .issuerUri(properties.getIssuerUri())
                    .audience(properties.getAudience())
                )
            )
            .build();
    }
}

// Usage: teams just add the starter dependency
// <dependency>
//   <groupId>com.mycompany</groupId>
//   <artifactId>mycompany-security-starter</artifactId>
// </dependency>
```

### Scenario 2: Database migration starter

```java
@AutoConfiguration
@ConditionalOnClass(Flyway.class)
@EnableConfigurationProperties(MyCompanyFlywayProperties.class)
public class FlywayAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public FlywayMigrationInitializer flywayInitializer(
            DataSource dataSource,
            MyCompanyFlywayProperties properties) {

        Flyway flyway = Flyway.configure()
            .dataSource(dataSource)
            .locations(properties.getLocations())
            .baselineOnMigrate(true)
            .validateOnMigrate(true)
            .load();

        return new FlywayMigrationInitializer(flyway);
    }
}

// Teams just add: mycompany.flyway.locations=classpath:db/migration
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Not using `@AutoConfiguration` | Not processed as auto-config | Use `@AutoConfiguration` |
| Missing `@ConditionalOnMissingBean` | Overrides user beans | Always add missing-bean condition |
| Not providing defaults | Config required for every use | Provide sensible defaults |
| Bundling too many dependencies | Classpath bloat | Keep starters focused |
| Not testing starter in isolation | Works in your app, breaks elsewhere | Test with minimal dependencies |
