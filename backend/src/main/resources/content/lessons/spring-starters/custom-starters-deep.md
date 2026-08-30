---
title: Building Custom Spring Boot Starters — Sharing Configuration Across Teams
summary: How to package auto-configuration, metadata, and dependencies into a reusable Spring Boot starter JAR that any team can consume with a single dependency declaration.
order: 2
minutes: 30
topics: ["custom starter", "auto-configuration", "spring.factories", "configuration metadata", "starter naming"]
docs:
  - url: "https://docs.spring.io/spring-boot/reference/packaging.html"
    title: "Spring Boot Starters"
---

## The Concept, From Zero

When your organization has 20 Spring Boot microservices, they all need the same Redis cache config, the same monitoring setup, the same error handling. Copy-pasting configuration across 20 projects is fragile and slow.

A **custom Spring Boot starter** packages all of this into a single JAR. Other teams just add one `<dependency>` and everything works automatically — no configuration needed.

Think of it like this: a starter is a **configuration library**. It contains:
1. **Auto-configuration class** — the `@Configuration` that sets everything up
2. **Metadata** — IDE hints that show available properties in `application.yml`
3. **Dependencies** — transitive JARs pulled in automatically

**When organizations use this:**
- Platform teams build internal starters for logging, security, and monitoring
- Data teams create starters for database, cache, and search configurations
- Infrastructure teams package cloud-specific configurations (AWS, GCP)

---

## Anatomy of a Custom Starter

```
my-cache-starter/
├── pom.xml
└── src/main/
    ├── java/
    │   └── com/example/starter/cache/
    │       ├── CacheAutoConfiguration.java    # The main setup
    │       ├── CacheProperties.java           # @ConfigurationProperties
    │       ├── RedisCacheManager.java         # Custom bean
    │       └── CacheHealthIndicator.java      # Actuator integration
    └── resources/
        └── META-INF/
            └── spring/
                └── org.springframework.boot.autoconfigure.AutoConfiguration.imports
```

### Naming Convention
- Prefix: `acme-cache-spring-boot-starter`
- Group: `com.acme.cache`
- The artifact ID becomes the dependency users add

---

## Step-by-Step Build

### Step 1: Create the Starter Project

```xml
<!-- pom.xml for the starter -->
<project>
    <groupId>com.acme.cache</groupId>
    <artifactId>acme-cache-spring-boot-starter</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>

    <dependencies>
        <!-- Spring Boot auto-configuration support -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-autoconfigure</artifactId>
        </dependency>

        <!-- Configuration properties metadata generation -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-configuration-processor</artifactId>
            <optional>true</optional>
        </dependency>

        <!-- Redis (your starter's actual functionality) -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-redis</artifactId>
        </dependency>

        <!-- Actuator integration (optional) -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
            <optional>true</optional>
        </dependency>
    </dependencies>
</project>
```

### Step 2: Configuration Properties

```java
package com.acme.cache;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * These properties become available in application.yml:
 * 
 * acme:
 *   cache:
 *     enabled: true
 *     ttl: 3600
 *     max-entries: 10000
 *     serializer: json
 *     key-prefix: "myapp:"
 */
@ConfigurationProperties(prefix = "acme.cache")
public class CacheProperties {

    /** Enable or disable the cache. Default: true */
    private boolean enabled = true;

    /** Time-to-live in seconds. Default: 3600 (1 hour) */
    private int ttl = 3600;

    /** Maximum cache entries. Default: 10000 */
    private long maxEntries = 10000;

    /** Serialization format. Default: json */
    private SerializerType serializer = SerializerType.JSON;

    /** Redis key prefix. Default: "myapp:" */
    private String keyPrefix = "myapp:";

    /** Redis host. Default: localhost */
    private String host = "localhost";

    /** Redis port. Default: 6379 */
    private int port = 6379;

    // Getters and setters...
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public int getTtl() { return ttl; }
    public void setTtl(int ttl) { this.ttl = ttl; }
    public long getMaxEntries() { return maxEntries; }
    public void setMaxEntries(long maxEntries) { this.maxEntries = maxEntries; }
    public SerializerType getSerializer() { return serializer; }
    public void setSerializer(SerializerType serializer) { this.serializer = serializer; }
    public String getKeyPrefix() { return keyPrefix; }
    public void setKeyPrefix(String keyPrefix) { this.keyPrefix = keyPrefix; }
    public String getHost() { return host; }
    public void setHost(String host) { this.host = host; }
    public int getPort() { return port; }
    public void setPort(int port) { this.port = port; }

    public enum SerializerType { JSON, JDK, STRING }
}
```

### Step 3: Auto-Configuration

```java
package com.acme.cache;

import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;

@Configuration
@ConditionalOnClass(RedisTemplate.class)           // Only if Redis is on classpath
@ConditionalOnProperty(prefix = "acme.cache",      // Only if enabled
                        name = "enabled",
                        havingValue = "true",
                        matchIfMissing = true)      // Default: enabled
@EnableConfigurationProperties(CacheProperties.class)
public class AcmeCacheAutoConfiguration {

    /**
     * Create the cache manager if no one else already has.
     * @ConditionalOnMissingBean — this is the key pattern:
     * if someone defines their own, this one is skipped.
     */
    @Bean
    @ConditionalOnMissingBean
    public AcmeCacheManager acmeCacheManager(
            RedisConnectionFactory connectionFactory,
            CacheProperties properties) {

        return new AcmeCacheManager(
            connectionFactory,
            properties.getTtl(),
            properties.getMaxEntries(),
            properties.getKeyPrefix(),
            properties.getSerializer()
        );
    }

    /**
     * Optional: Actuator health indicator for the cache.
     */
    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnClass(
        name = "org.springframework.boot.actuate.health.HealthIndicator")
    public AcmeCacheHealthIndicator cacheHealthIndicator(
            AcmeCacheManager cacheManager) {
        return new AcmeCacheHealthIndicator(cacheManager);
    }
}
```

### Step 4: Register Auto-Configuration

Create `src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`:

```
com.acme.cache.AcmeCacheAutoConfiguration
```

This file tells Spring Boot: "When someone includes this JAR, automatically load this configuration class."

---

## How to Use the Starter

Another team just adds one dependency:

```xml
<dependency>
    <groupId>com.acme.cache</groupId>
    <artifactId>acme-cache-spring-boot-starter</artifactId>
    <version>1.0.0</version>
</dependency>
```

And it works. No code, no configuration (unless they want to customize):

```yaml
# Optional customization in their application.yml:
acme:
  cache:
    ttl: 7200          # Override default 1 hour → 2 hours
    key-prefix: "my-service:"
```

**That's the power of starters.** One dependency, zero boilerplate.

---

## Configuration Metadata (IDE Hints)

Add `additional-spring-configuration-metadata.json` in `src/main/resources/META-INF/`:

```json
{
  "properties": {
    "acme.cache.enabled": {
      "type": "boolean",
      "description": "Enable Acme cache auto-configuration.",
      "defaultValue": true
    },
    "acme.cache.ttl": {
      "type": "integer",
      "description": "Time-to-live for cache entries in seconds.",
      "defaultValue": 3600
    }
  },
  "hints": [
    {
      "name": "acme.cache.serializer",
      "values": [
        { "value": "JSON", "description": "Jackson JSON serialization" },
        { "value": "JDK", "description": "Standard Java serialization" },
        { "value": "STRING", "description": "Plain string serialization" }
      ]
    }
  ]
}
```

---

## Common Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| Forgetting `@ConditionalOnMissingBean` | Can't override/replace the bean | Always add it to primary beans |
| Not registering in `.imports` file | Auto-config never loads | Add class to `AutoConfiguration.imports` |
| Naming artifact without `-spring-boot-starter` suffix | Violates convention, confuses users | Always use `acme-X-spring-boot-starter` |
| Making starters too opinionated | Users can't customize behavior | Provide sensible defaults + `@ConditionalOnProperty` toggles |
| Not including `<optional>true</optional>` | Pulls in unnecessary transitive deps | Mark optional dependencies as optional |
