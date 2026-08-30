---
title: @ConfigurationProperties — Type-Safe Configuration
summary: What @ConfigurationProperties is, binding rules, nested properties, validation, defaults, and how organizations manage configuration safely.
order: 1
minutes: 20
topics: [@configurationproperties, type-safe-config, validation, defaults, spring-boot]
docs:
  - https://docs.spring.io/spring-boot/reference/features/external-config.html
---

## The Concept, From Zero

Instead of scattering `@Value` annotations everywhere, `@ConfigurationProperties` binds an entire YAML/properties tree to a type-safe Java object:

```yaml
# application.yml
app:
  name: Order Service
  database:
    url: jdbc:postgresql://localhost:5432/orders
    pool:
      max-size: 20
      min-idle: 5
  features:
    cache-enabled: true
    rate-limit: 1000
```

```java
@ConfigurationProperties(prefix = "app")
public record AppProperties(
    String name,
    DatabaseProperties database,
    FeatureProperties features
) {
    public record DatabaseProperties(String url, PoolProperties pool) {
        public record PoolProperties(int maxSize, int minIdle) {}
    }
    public record FeatureProperties(boolean cacheEnabled, int rateLimit) {}
}

// Access: appProperties.database().pool().maxSize() → 20
```

---

## Line-by-Line Walkthrough

```java
import jakarta.validation.constraints.*;
import org.springframework.boot.context.properties.*;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

// Line 1: Basic @ConfigurationProperties
@ConfigurationProperties(prefix = "app")
@Validated
public record AppProperties(
    @NotBlank String name,
    String version,
    ServerProperties server,
    DatabaseProperties database
) {
    // Nested records for complex configuration
    public record ServerProperties(
        @DefaultValue("8080") int port,
        @DefaultValue("localhost") String host,
        @DefaultValue("30s") Duration timeout
    ) {}

    public record DatabaseProperties(
        @NotBlank String url,
        @DefaultValue("sa") String username,
        @DefaultValue("") String password,
        @DefaultValue("10") int poolSize
    ) {}
}

// Line 2: Enable configuration properties
@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}

// Line 3: Using configuration properties
@Service
public class OrderService {
    private final AppProperties properties;

    public OrderService(AppProperties properties) {
        this.properties = properties;
    }

    public void createOrder(Order order) {
        if (properties.database().url().contains("prod")) {
            // Production-specific logic
        }
    }
}

// Line 4: Map-based properties (flexible)
@ConfigurationProperties(prefix = "app.metrics")
public class MetricsProperties {
    private Map<String, String> tags = new HashMap<>();
    private Map<String, Boolean> enabled = new HashMap<>();

    // getters and setters
}

// application.yml
// app:
//   metrics:
//     tags:
//       env: production
//       region: us-east-1
//     enabled:
//       jvm: true
//       http: true
```

---

## Real-World Scenarios

### Scenario 1: Multi-environment configuration

```yaml
# application.yml
app:
  name: Order Service
  database:
    url: jdbc:postgresql://localhost:5432/orders
    pool-size: 10

---
spring:
  config:
    activate:
      on-profile: prod
app:
  database:
    url: jdbc:postgresql://prod-server:5432/orders
    pool-size: 50
  server:
    timeout: 30s
```

### Scenario 2: External API configuration

```yaml
app:
  external-apis:
    payment:
      url: https://api.stripe.com
      key: ${STRIPE_API_KEY}
      timeout: 10s
      retry-attempts: 3
    shipping:
      url: https://api.ups.com
      key: ${UPS_API_KEY}
      timeout: 15s
```

```java
@ConfigurationProperties(prefix = "app.external-apis")
public record ExternalApisProperties(
    Map<String, ApiConfig> apis
) {
    public record ApiConfig(String url, String key, Duration timeout, int retryAttempts) {}
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `@Value` for complex config | No type safety, no validation | Use `@ConfigurationProperties` |
| Forgetting `@EnableConfigurationProperties` | Properties not bound | Add to `@SpringBootApplication` class |
| Not validating required fields | Null values at runtime | Add `@NotBlank`, `@NotNull` |
| Using mutable properties | Thread safety issues | Use records or immutable objects |
| Not providing defaults | Configuration required for every env | Add `@DefaultValue` |
