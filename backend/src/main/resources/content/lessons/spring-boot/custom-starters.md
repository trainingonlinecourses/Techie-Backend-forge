---
title: Building Custom Spring Boot Starters — Packaging Reusable Auto-Configuration
summary: How to create a reusable starter with auto-configuration, conditional beans, configuration properties, and the naming conventions that make your starter discoverable.
order: 25
minutes: 22
topics: [starters, auto-configuration, conditional beans, META-INF, spring.factories, configuration properties]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#boot-features-developing-auto-configuration
  - https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#using-auto-configuration
---

# Building Custom Spring Boot Starters — Packaging Reusable Auto-Configuration

## The concept: bundle configuration as a dependency

A Spring Boot starter is a JAR that brings everything needed for a feature — auto-configured beans, properties, dependencies — just by adding it to the classpath. If your organization has a common pattern (rate limiting, audit logging, feature flags, observability), packaging it as a starter means every team gets it with a single Maven dependency and zero configuration.

## Starter structure

A starter consists of three parts:

1. **The starter module** (`my-feature-spring-boot-starter`) — only dependencies, no code
2. **The auto-configuration module** (`my-feature-spring-boot-autoconfigure`) — the `@Configuration` classes
3. **`META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`** — registers the configuration

```
my-feature/
├── my-feature-spring-boot-starter/
│   └── pom.xml              (dependencies only)
├── my-feature-spring-boot-autoconfigure/
│   ├── src/main/java/...    (auto-configuration classes)
│   └── src/main/resources/META-INF/
│       └── spring/
│           └── org.springframework.boot.autoconfigure.AutoConfiguration.imports
│       (or for Spring Boot 2.x: META-INF/spring.factories)
└── pom.xml                  (parent)
```

## Writing the auto-configuration

```java
@AutoConfiguration
@ConditionalOnClass(RateLimiter.class)
@EnableConfigurationProperties(RateLimitProperties.class)
public class RateLimitAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public RateLimiter rateLimiter(RateLimitProperties props) {
        return new RateLimiter(
            props.getMaxRequests(),
            props.getDuration()
        );
    }

    @Bean
    @ConditionalOnProperty(prefix = "rate-limit", name = "enabled", havingValue = "true")
    public RateLimitInterceptor rateLimitInterceptor(RateLimiter limiter) {
        return new RateLimitInterceptor(limiter);
    }
}
```

## Configuration properties

```java
@ConfigurationProperties(prefix = "rate-limit")
public class RateLimitProperties {
    private int maxRequests = 100;          // default: 100
    private Duration duration = Duration.ofMinutes(1);
    private boolean enabled = false;        // opt-in via property

    // getters and setters...
}
```

```yaml
# application.yml — user just adds this
rate-limit:
  enabled: true
  max-requests: 50
  duration: 30s
```

## Conditional beans — the auto-configuration arsenal

```java
@ConditionalOnClass(RedisTemplate.class)           // only if Redis is on classpath
@ConditionalOnMissingBean(RedisTemplate.class)     // only if user hasn't defined one
@ConditionalOnProperty(prefix = "cache", name = "type", havingValue = "redis")
@ConditionalOnBean(CacheManager.class)            // only if CacheManager exists
@ConditionalOnWebApplication                      // only in web apps
@ConditionalOnExpression("${feature.enabled:false}")  // SpEL expression
```

**The org pattern:** `@ConditionalOnMissingBean` lets users override any bean your starter provides. Always annotate your beans with it — it's the escape hatch.

## Registering the auto-configuration

**Spring Boot 3.x** (`META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`):

```
com.example.ratelimit.RateLimitAutoConfiguration
```

**Spring Boot 2.x** (`META-INF/spring.factories`):

```properties
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
  com.example.ratelimit.RateLimitAutoConfiguration
```

## The starter POM — only dependencies

```xml
<dependency>
    <groupId>com.example</groupId>
    <artifactId>my-feature-spring-boot-autoconfigure</artifactId>
</dependency>

<!-- Transitive dependencies that the auto-config needs -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
    <optional>true</optional>  <!-- optional: starter works without web -->
</dependency>
```

## org scenario — audit logging starter

```java
@AutoConfiguration
@ConditionalOnClass(AuditEvent.class)
@EnableConfigurationProperties(AuditProperties.class)
public class AuditAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public AuditService auditService(AuditProperties props, AuditRepository repo) {
        return new AuditService(repo, props.getRetentionPolicy());
    }

    @Bean
    @ConditionalOnMissingBean
    public AuditInterceptor auditInterceptor(AuditService svc, AuditProperties props) {
        return new AuditInterceptor(svc, props.getExcludePaths());
    }
}
```

```yaml
# Teams enable with one property
audit:
  enabled: true
  retention-policy: 90d
  exclude-paths:
    - /actuator/**
    - /health
```

## Key takeaways

- A starter is a thin dependency POM; the auto-configuration module contains the `@Configuration` classes.
- `@AutoConfiguration` + `@ConditionalOnClass` + `@ConditionalOnMissingBean` are the core annotations.
- Use `@EnableConfigurationProperties` to bind YAML/properties to a POJO with defaults.
- Register auto-configurations in `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` (Boot 3+) or `spring.factories` (Boot 2).
- Always use `@ConditionalOnMissingBean` so users can override any bean your starter provides.
