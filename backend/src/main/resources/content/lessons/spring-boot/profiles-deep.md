---
title: Spring Profiles — Environment-Specific Configuration
summary: Profile-based beans, YAML multi-document profiles, @Profile on @Configuration, activation strategies, profile groups, and how organizations isolate dev/staging/prod without config drift.
order: 27
minutes: 22
topics: [spring-profile, profile-activation, profile-specific-yaml, @profile, profile-groups, config-drift, environment-isolation]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/html/features.html#features.profiles
  - https://docs.spring.io/spring-framework/reference/core/beans/environment-profiles.html
---

# Spring Profiles — Environment-Specific Configuration

## The concept

A **profile** is a named, selectable configuration group. When you activate a profile, only the beans, properties, and configuration classes marked for that profile are loaded. This lets you run the same codebase in development, staging, and production with different behaviors — without `if/else` in your code.

**Why not just use different `application.properties` files?** Because profiles let you:
- Activate multiple profiles simultaneously (`dev,debug`).
- Switch between databases without changing any file (just activate a profile).
- Load different bean implementations (in-memory cache vs Redis).
- Keep environment-specific logic declarative (annotations) instead of imperative (code).

## Profile-specific property files

Spring Boot automatically loads `application-{profile}.properties` or `application-{profile}.yaml` when that profile is active:

```
src/main/resources/
  application.yml          # common config
  application-dev.yml      # dev overrides
  application-prod.yml     # prod overrides
  application-test.yml     # test overrides
```

```yaml
# application.yml (always loaded)
spring:
  datasource:
    driver-class-name: org.postgresql.Driver
  jpa:
    hibernate:
      ddl-auto: validate

---

# application-dev.yml (loaded when profile=dev is active)
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/devdb
    username: dev
    password: dev
  jpa:
    hibernate:
      ddl-auto: update   # auto-create tables in dev

logging:
  level:
    com.backendforge: DEBUG

---

# application-prod.yml (loaded when profile=prod is active)
spring:
  datasource:
    url: jdbc:postgresql://prod-db:5432/proddb
    username: ${DB_USER}
    password: ${DB_PASS}

logging:
  level:
    root: WARN
    com.backendforge: INFO
```

## Activating profiles

```bash
# Command line
java -jar app.jar --spring.profiles.active=prod

# Environment variable
SPRING_PROFILES_ACTIVE=prod java -jar app.jar

# application.yml default
spring:
  profiles:
    active: dev
```

**Multiple profiles:** `spring.profiles.active=prod,metrics` activates both `prod` and `metrics` profiles. Beans and properties from both are loaded.

## @Profile on beans and configurations

```java
@Configuration
public class CacheConfig {

    @Bean
    @Profile("dev")
    public CacheService devCache() {
        return new ConcurrentHashMapCache();  // simple in-memory cache for dev
    }

    @Bean
    @Profile("prod")
    public CacheService prodCache() {
        return new RedisCacheService();  // production-grade Redis cache
    }
}
```

```java
@Configuration
@Profile("prod")
@EnableScheduling
public class ProductionMetricsConfig {

    @Bean
    public MeterRegistryCustomizer<PrometheusMeterRegistry> metricsCustomizer() {
        return registry -> registry.config().commonTags("env", "prod");
    }
}
```

**Negation:** `@Profile("!prod")` means "load this bean in every profile EXCEPT prod."

```java
@Bean
@Profile("!prod")
public DataSource devDataSource() {
    return new EmbeddedDatabaseBuilder().setType(H2).build();  // H2 for non-prod
}
```

## Profile groups

Since Spring Boot 2.4, you can define profile groups to activate multiple profiles with one name:

```yaml
spring:
  profiles:
    group:
      production: prod,metrics,audit
      development: dev,debug,local
```

Now `--spring.profiles.active=production` activates `prod`, `metrics`, and `audit` simultaneously.

## Conditional beans with profiles

Combine `@Profile` with other conditions for fine-grained control:

```java
@Component
@Profile("prod & monitoring")
@ConditionalOnProperty(name = "management.prometheus.enabled", havingValue = "true")
public class CustomPrometheusExporter {
    // Only loads when prod profile is active AND monitoring profile is active
    // AND prometheus is enabled in properties
}
```

## How we use it in organizations

### Scenario 1: different payment gateways per environment

```java
@Configuration
public class PaymentGatewayConfig {

    @Bean
    @Profile("sandbox")
    public PaymentGateway sandboxGateway() {
        return new StripeTestGateway("sk_test_...");
    }

    @Bean
    @Profile("prod")
    public PaymentGateway productionGateway() {
        return new StripeLiveGateway("sk_live_...");
    }

    @Bean
    @Profile("local")
    public PaymentGateway mockGateway() {
        return new MockPaymentGateway();  // always succeeds
    }
}
```

Developers use `local` (mock), QA uses `sandbox` (test keys), production uses `prod` (real keys). Zero config changes needed to switch.

### Scenario 2: database per environment

```java
@Configuration
@Profile("test")
public class TestDatabaseConfig {

    @Bean
    public DataSource testDataSource() {
        return new EmbeddedDatabaseBuilder()
            .setType(EmbeddedDatabaseType.H2)
            .addScript("schema-test.sql")
            .build();
    }

    @Bean
    public FlywayMigrationStrategy flywayStrategy() {
        return Flyway::migrate;  // run migrations on test DB
    }
}
```

### Scenario 3: scheduled tasks only in production

```java
@Component
@Profile("prod")
public class DailyReportScheduler {

    @Scheduled(cron = "0 0 6 * * ?")  // 6 AM daily
    public void generateDailyReport() {
        Report report = reportService.generateYesterday();
        emailService.send(report);
        s3Service.upload(report);
    }
}
```

Developers do not get spammed with daily reports during local development.

## Profile inheritance and precedence

When multiple profiles define the same property, the **last activated** profile wins:

```yaml
# application.yml
app.feature.cache-ttl: 60

# application-dev.yml
app.feature.cache-ttl: 5   # overrides for dev

# application-prod.yml
app.feature.cache-ttl: 300  # overrides for prod
```

If active profiles are `dev,prod`, the value is `300` (prod wins because it was activated last).

## Common mistakes

| Mistake | Consequence |
|---|---|
| Using profile names as feature flags | Profiles are for environments, not features |
| Hardcoding profile names in code | Couples code to deployment topology |
| Too many profiles | Combinatorial explosion — hard to test |
| Not activating profiles in tests | Tests run with default config, not environment-specific |
| Storing secrets in profile YAML files | Secrets in source control — use env vars instead |
