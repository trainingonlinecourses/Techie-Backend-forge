---
title: Feature Flags with Spring Profiles
summary: Using profiles as feature flags, conditional beans, @ConditionalOnProperty, and gradual rollout strategies.
order: 5
minutes: 15
topics: [feature-flags, conditional-beans, conditional-on-property, gradual-rollout, a-b-testing]
docs:
  - https://docs.spring.io/spring-boot/reference/features/developing-auto-configuration.html
---

## The Concept, From Zero

Feature flags let you enable or disable features without deploying new code. Spring profiles are a simple way to implement them — activate a profile to enable a feature.

```yaml
# application.yml
app:
  features:
    new-search: true
    dark-mode: false
```

```java
@Component
@ConditionalOnProperty(name = "app.features.new-search", havingValue = "true")
public class NewSearchService { ... }
```

---

## Profile-Based Feature Flags

```java
@Component
@Profile("feature-checkout-v2")
public class CheckoutV2Service implements CheckoutService { ... }

@Component
@Profile("!feature-checkout-v2")
public class CheckoutV1Service implements CheckoutService { ... }
```

```yaml
# Enable in production
---
spring:
  config:
    activate:
      on-profile: prod
app:
  features:
    checkout-v2: true
```

---

## @ConditionalOnProperty

More fine-grained than profiles:

```java
@Component
@ConditionalOnProperty(
    name = "app.features.cache.enabled",
    havingValue = "true",
    matchIfMissing = true  // default to enabled
)
public class CacheService { ... }
```

---

## Real-World Scenarios

### Scenario 1: Gradual rollout

```yaml
# 10% of users see new feature
app:
  features:
    new-dashboard:
      enabled: true
      percentage: 10
```

### Scenario 2: A/B testing

```java
@Component
@ConditionalOnProperty(name = "app.experiment.search-algo", havingValue = "tfidf")
public class TfIdfSearch implements SearchAlgorithm { }

@Component
@ConditionalOnProperty(name = "app.experiment.search-algo", havingValue = "bm25")
public class Bm25Search implements SearchAlgorithm { }
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Profile flags never cleaned up | Technical debt accumulates | Remove old feature profiles after rollout |
| Overusing profiles for config | Profiles should be env-specific, not per-feature | Use @ConditionalOnProperty for features |
| Forgetting default | Feature off when flag missing | Use `matchIfMissing = true` for safe defaults |
