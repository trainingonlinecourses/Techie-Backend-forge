---
title: Profile-Specific Beans — Conditional Registration
summary: How @Profile works, bean registration strategies, profile groups, default profiles, and how to wire different implementations per environment.
order: 2
minutes: 20
topics: [@Profile, conditional, environment, default-profile, profile-groups, dev-prod]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/environment-profiles.html
---

## The Concept, From Zero

`@Profile` registers a bean only when a specific Spring profile is active. This lets you swap entire implementations between environments without changing any code.

```java
// Only register when "dev" profile is active
@Component
@Profile("dev")
public class ConsoleNotificationService implements NotificationService {
    public void send(String msg) { System.out.println(msg); }
}

// Only register when "prod" profile is active
@Component
@Profile("prod")
public class EmailNotificationService implements NotificationService {
    public void send(String msg) { /* send email */ }
}
```

---

## Profile Activation

```bash
# Command line
--spring.profiles.active=dev

# Environment variable
SPRING_PROFILES_ACTIVE=dev

# application.yml
spring:
  profiles:
    active: dev
```

### Default Profile

```java
// Fallback when no profile is active
@Component
@Profile("default")
public class H2DataSourceConfig { ... }
```

---

## Line-by-Line Walkthrough

```java
import org.springframework.context.annotation.*;
import org.springframework.stereotype.Component;

@Configuration
public class ProfileConfig {

    // Profile-specific beans
    @Bean
    @Profile("dev")
    public DataSource devDataSource() {
        return new EmbeddedDatabaseBuilder()
            .setType(EmbeddedDatabaseType.H2)
            .addScript("schema-dev.sql")
            .build();
    }

    @Bean
    @Profile("prod")
    public DataSource prodDataSource() {
        return DataSourceBuilder.create()
            .url("jdbc:postgresql://prod-db:5432/myapp")
            .build();
    }

    // Negative profile: NOT dev AND NOT test
    @Bean
    @Profile("!dev & !test")
    public EmailService emailService() {
        return new ProductionEmailService();
    }

    // Profile groups
    @Bean
    @Profile("production & cloud")
    public CloudStorageService cloudStorage() {
        return new AwsS3StorageService();
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Feature flags with profiles

```java
@Component
@Profile("feature-search-v2")
public class V2SearchService implements SearchService { ... }

@Component
@Profile("!feature-search-v2")
public class V1SearchService implements SearchService { ... }
```

### Scenario 2: Testing with mocks

```java
@Component
@Profile("test")
public class MockPaymentGateway implements PaymentGateway {
    public PaymentResult charge(Money amount) {
        return PaymentResult.success("mock-123");
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Forgetting to set profile | Wrong beans registered | Always set `spring.profiles.active` |
| Using `!` for negation when you need AND | Wrong logic | Use `!dev & !test` not `!dev !test` |
| Profile name with spaces | Doesn't match | Use hyphens: `my-feature` not `my feature` |
