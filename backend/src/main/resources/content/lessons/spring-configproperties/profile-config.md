---
title: Profile-Specific Configuration Properties
summary: How @ConfigurationProperties interacts with profiles, profile-specific YAML documents, and environment-specific property binding.
order: 5
minutes: 15
topics: [profile-config, yaml-multidoc, environment, conditional-binding, profile-properties]
docs:
  - https://docs.spring.io/spring-boot/reference/features/external-config.html
---

## The Concept, From Zero

You can have different configuration property values per profile using YAML multi-document or separate profile-specific files. Spring Boot binds the active profile's values automatically.

```yaml
# application.yml
app:
  storage:
    path: /tmp/storage
    type: local

---
# application-prod.yml (or use --- separator)
spring:
  config:
    activate:
      on-profile: prod
app:
  storage:
    path: /data/storage
    type: s3
    s3:
      bucket: my-prod-bucket
```

---

## Line-by-Line Walkthrough

```java
@Data
@ConfigurationProperties(prefix = "app.cache")
public class CacheProperties {

    private boolean enabled;
    private int ttlSeconds;
    private String type;  // "local" or "redis"

    private Redis redis = new Redis();

    @Data
    public static class Redis {
        private String host = "localhost";
        private int port = 6379;
    }
}
```

### Per-Profile YAML

```yaml
# application.yml
app:
  cache:
    enabled: true
    ttl-seconds: 300
    type: local

---
spring:
  config:
    activate:
      on-profile: dev
app:
  cache:
    ttl-seconds: 60  # shorter cache in dev

---
spring:
  config:
    activate:
      on-profile: prod
app:
  cache:
    type: redis
    ttl-seconds: 3600
    redis:
      host: redis.prod.internal
      port: 6379
```

---

## Real-World Scenarios

### Scenario 1: External properties per environment

```yaml
# application-docker.yml (separate file)
app:
  database:
    url: jdbc:postgresql://db:5432/myapp
    pool:
      max-size: 50
```

### Scenario 2: Conditional beans based on properties

```java
@Component
@ConditionalOnProperty(name = "app.cache.type", havingValue = "redis")
public class RedisCacheConfig {
    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory factory) {
        return new RedisTemplate<>();
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Properties in wrong file | Profile override doesn't work | Put profile-specific props in correct file |
| Missing `---` separator in multi-doc | Profile-specific section not activated | Always use `---` between documents |
| Wrong key casing | Properties not bound | Use kebab-case in YAML |
| Not testing profile switching | Wrong values in prod | Test each profile explicitly |
