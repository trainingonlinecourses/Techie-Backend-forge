---
title: Debugging Auto-Configuration — Understanding Why Beans Are Created (or Not)
summary: How to debug auto-configuration with --debug, condition reports, Actuator endpoints, and the tools that make Spring Boot's magic transparent.
order: 4
minutes: 18
topics: [debug, condition-report, actuator, logging, troubleshooting]
docs:
  - https://docs.spring.io/spring-boot/reference/features/logging.html
  - https://docs.spring.io/spring-boot/reference/actuator.html
---

## The Concept, From Zero

Spring Boot creates dozens of beans automatically. Sometimes a bean you expect isn't created, or an unexpected bean appears. How do you figure out why?

Spring Boot provides **condition reports** that tell you exactly which auto-configuration classes were considered and why each was applied or skipped.

```bash
# Start with debug logging
java -jar app.jar --debug

# Or add to application.yml
debug: true

# Output shows:
# EmailAutoConfiguration:
#    Did not match:
#       - @ConditionalOnClass did not find required class 'javax.mail.Transport'
#    Matched:
#       - @ConditionalOnProperty (app.email.enabled=true)
```

---

## The Debug Toolkit

### 1. Condition Report (`--debug`)

```bash
# Command line
java -jar app.jar --debug

# Or application.yml
debug: true
```

Output shows every auto-configuration class and why it was applied or skipped:

```
DataSourceAutoConfiguration:
   Did not match:
      - @ConditionalOnClass did not find required class 'org.springframework.jdbc.datasource.DataSourceAutoConfiguration'
   Matched:
      - @ConditionalOnProperty (spring.datasource.url=jdbc:postgresql://...)

RedisAutoConfiguration:
   Did not match:
      - @ConditionalOnClass did not find required class 'redis.clients.jedis.Jedis'
   Matched: none
```

### 2. Actuator Conditions Endpoint

```yaml
# application.yml
management:
  endpoints:
    web:
      exposure:
        include: conditions,beans,env
```

```bash
# Get full condition report
curl http://localhost:8080/actuator/conditions

# Returns JSON with all auto-configuration classes and their conditions
```

### 3. Actuator Beans Endpoint

```bash
# List all beans and their dependencies
curl http://localhost:8080/actuator/beans

# Shows which beans were created and their sources
```

---

## Line-by-Line Walkthrough

```java
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.actuate.autoconfigure.endpoint.EndpointProperties;

@SpringBootApplication
public class DebuggingDemo {
    
    public static void main(String[] args) {
        // Line 1: Enable debug mode via command line
        // java -jar app.jar --debug
        
        // Line 2: Or via application.yml
        // debug: true
        
        // Line 3: Or programmatically
        System.setProperty("debug", "true");
        
        SpringApplication.run(DebuggingDemo.class, args);
    }
}

// Line 4: Check conditions in logs
// 2024-01-15 10:30:15 DEBUG - DataSourceAutoConfiguration:
//   Did not match:
//     - @ConditionalOnClass did not find required class 'javax.sql.DataSource'
//   Matched:
//     - @ConditionalOnProperty (spring.datasource.url having value jdbc:...)

// Line 5: Use Actuator to inspect beans
// curl http://localhost:8080/actuator/beans | jq '.contexts.application.beans'
```

---

## Real-World Scenarios

### Scenario 1: Why isn't my DataSource created?

```bash
# Check condition report
curl http://localhost:8080/actuator/conditions | jq '.contexts.application.conditions

# Look for DataSourceAutoConfiguration
# Common issues:
# 1. Missing JDBC driver on classpath
# 2. spring.datasource.url not configured
# 3. Another DataSource bean already exists

# Fix: Add driver and URL
# application.yml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    driver-class-name: org.postgresql.Driver
    username: user
    password: pass
```

### Scenario 2: Override auto-configuration

```java
// If auto-configuration creates a bean you don't want:
@SpringBootApplication(exclude = {
    DataSourceAutoConfiguration.class,
    RedisAutoConfiguration.class
})
public class MyApp {
    // DataSource and Redis beans won't be created
}

// Or exclude specific conditions:
@Bean
@ConditionalOnMissingBean
public CacheManager customCacheManager() {
    return new MyCustomCacheManager();  // Overrides default
}
```

### Scenario 3: Log auto-configuration details

```yaml
# application.yml
logging:
  level:
    org.springframework.boot.autoconfigure: DEBUG
    org.springframework.context.annotation: DEBUG
```

```java
// Custom logger for specific auto-configuration
@Configuration
@ConditionalOnClass(CustomService.class)
public class CustomAutoConfiguration {
    
    private static final Logger log = LoggerFactory.getLogger(CustomAutoConfiguration.class);
    
    @Bean
    @ConditionalOnMissingBean
    public CustomService customService() {
        log.info("Creating custom service - this auto-configuration was applied");
        return new CustomService();
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Forgetting `debug: true` | No condition output | Add debug mode |
| Checking wrong endpoint | No data | Use `/actuator/conditions` |
| Not excluding unwanted | Unexpected beans | Use `@SpringBootApplication(exclude = ...)` |
| Ignoring condition reports | Mystery beans | Always check conditions when debugging |
| Overriding without `@ConditionalOnMissingBean` | Duplicate beans | Add condition annotations |

---

## Quick Reference

```bash
# Debug mode
java -jar app.jar --debug

# Actuator endpoints
curl http://localhost:8080/actuator/conditions
curl http://localhost:8080/actuator/beans
curl http://localhost:8080/actuator/env

# Logs
logging.level.org.springframework.boot.autoconfigure=DEBUG

# Exclude auto-configuration
@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class})
```
