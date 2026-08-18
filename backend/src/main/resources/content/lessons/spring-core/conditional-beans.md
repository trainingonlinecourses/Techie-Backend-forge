---
title: Conditional Beans — @Conditional, @Profile and Feature Flags
summary: @Profile vs @Conditional, Spring Boot's @ConditionalOn* family, custom conditions, and the environment-driven bean selection patterns orgs use.
order: 15
minutes: 22
topics: [conditional, profile, conditionalonproperty, conditionalonclass, feature-flag, bean-selection]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/conditional.html
  - https://docs.spring.io/spring-boot/reference/features/profiles.html
  - https://docs.spring.io/spring-boot/reference/using/configuration-metadata.html
---

# Conditional Beans — @Conditional, @Profile and Feature Flags

## The concept: beans that appear only when conditions hold

By default every `@Bean`/`@Component` in a context is created. **Conditional beans** are registered *only if a condition evaluates true at startup*. Spring offers two layers:

- **`@Profile("...")`** — the simple, environment-level switch (dev/stage/prod, or `"jdbc"` vs `"mongo"` data access).
- **`@Conditional(...)`** — the general mechanism, of which `@Profile` is just one implementation. A custom `Condition` can inspect the `Environment`, classpath, system properties, or other beans.

Spring Boot adds the famous `@ConditionalOn*` family (`@ConditionalOnProperty`, `@ConditionalOnClass`, `@ConditionalOnMissingBean`, `@ConditionalOnBean`, `@ConditionalOnExpression`…) — these are what auto-configuration uses to decide "should I wire the DataSource, the Kafka producer, the scheduler?".

## @Profile — the simplest switch

```java
@Configuration
public class DataSourceConfig {
    @Bean
    @Profile("prod")                                   // only in prod
    public DataSource prodDataSource() { return new HikariDataSource(prodProps); }

    @Bean
    @Profile({"dev", "test"})                          // dev AND test
    public DataSource embeddedDataSource() { return new H2DataSource(); }
}
```

`spring.profiles.active=prod` on the command line or in the environment picks the set. Profiles compose — you can activate several at once (`dev,fast-tests`). They're the standard for **deployment environments**, not for fine-grained feature control.

## How we use it in an organization: the patterns

**Pattern 1 — kill-switch a feature via a property flag.** The most common org pattern: a config property that switches between implementations without a redeploy:

```java
@Service
@ConditionalOnProperty(name = "payments.provider", havingValue = "stripe", matchIfMissing = true)
public class StripePaymentGateway implements PaymentGateway { ... }

@Service
@ConditionalOnProperty(name = "payments.provider", havingValue = "adyen")
public class AdyenPaymentGateway implements PaymentGateway { ... }
```

Flip `payments.provider=adyen` in config, restart — the container now wires Adyen and *drops* Stripe. No code change, no risk of both beans colliding on `@Autowired PaymentGateway`.

**Pattern 2 — only wire the integration if its client library is on the classpath.** Auto-configuration does this constantly:

```java
@Configuration
@ConditionalOnClass(name = "org.apache.kafka.clients.producer.KafkaProducer")
@ConditionalOnProperty(name = "app.kafka.enabled", havingValue = "true", matchIfMissing = true)
public class KafkaProducerAutoConfig { ... }
```

`@ConditionalOnClass` checks whether the class *can be loaded* (it doesn't force loading) — this is how Spring Boot ships one jar of auto-configurations that activate only for the starters you added.

**Pattern 3 — feature flag for a gradual rollout.** Tying conditionals to a feature-flag service needs the dynamic check at *runtime*, not startup — so the condition reads a property that ops can flip between restarts:

```java
@Component
public class V2SearchFlag implements Condition {
    @Override
    public boolean matches(ConditionContext ctx, AnnotatedTypeMetadata meta) {
        String v = ctx.getEnvironment().getProperty("search.engine");
        return "v2".equals(v);
    }
}

@Configuration
@Conditional(V2SearchFlag.class)
public class V2SearchConfig { @Bean SearchEngine v2Engine() { ... } }
```

A `Condition` gets the full `Environment` — so the flag can come from config server, env var, or system property, and the decision is made once, at startup.

## Choosing the right tool

| Need | Tool |
|---|---|
| Environment (dev/stage/prod) | `@Profile` |
| Property-driven implementation switch | `@ConditionalOnProperty` |
| Presence of a library/class | `@ConditionalOnClass` |
| "Only if no other bean of this type exists" | `@ConditionalOnMissingBean` (backstop defaults) |
| Complex multi-factor decision | custom `Condition` |
| Runtime, per-request toggle | NOT a conditional — use a feature-flag library or a strategy bean |

A common mistake: using `@ConditionalOnMissingBean` where a plain `@Primary`/`@Qualifier` would do. `@ConditionalOnMissingBean` is for **auto-configuration defaults** ("wire the default unless the user defined their own") — not for resolving two explicit beans you control.

## Pitfalls

- Conditionals are evaluated **once at startup** — they are not runtime switches. For toggles that change mid-run, use a feature-flag service consulted per request.
- `@ConditionalOnBean` is evaluated while bean definitions are still being processed — bean order can make it fragile. Prefer `@ConditionalOnMissingBean` or `@ConditionalOnClass`.
- Don't scatter conditionals: keep them in `@Configuration` classes so the wiring rules are visible in one place.
- `matchIfMissing = true` is a foot-gun: the bean appears when the property is *absent*, which may not be what a kill-switch should do. Default to `false` unless the feature should be on by default.

## Key takeaways

- `@Profile` for environments; `@ConditionalOn*` for auto-configuration and property switches.
- Custom `Condition`s can inspect the environment for multi-factor startup decisions.
- Conditionals decide at startup only — runtime toggles need feature flags.
- `@ConditionalOnMissingBean` is the backstop pattern for defaults, not a general "either/or" tool.
