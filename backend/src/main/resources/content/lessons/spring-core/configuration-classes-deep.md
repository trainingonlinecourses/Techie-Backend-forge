---
title: @Configuration Classes in Depth — proxyBeanMethods and @Bean Semantics
summary: How @Configuration is proxied, why bean-to-bean calls return singletons, proxyBeanMethods=false, and the @Bean lifecycle wiring teams rely on.
order: 21
minutes: 18
topics: [configuration, proxybeanmethods, bean-methods, full-lite-mode, bean-wiring, lifecycle]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/java/configuration-annotation.html
  - https://docs.spring.io/spring-framework/reference/core/beans/java/bean-annotation.html
---

# @Configuration Classes in Depth — proxyBeanMethods and @Bean Semantics

## The concept: @Configuration classes are proxied

A class annotated `@Configuration` is **itself a bean**, and — by default — Spring **proxies it** (CGLIB) so that calls between its `@Bean` methods honor the container's singleton semantics:

```java
@Configuration
public class AppConfig {
    @Bean
    public DataSource dataSource() { return new HikariDataSource(props); }

    @Bean
    public JdbcTemplate jdbcTemplate() {
        return new JdbcTemplate(dataSource());   // calls the @Bean method...
        // ...but because AppConfig is proxied, this returns the SINGLETON,
        // not a second HikariDataSource — a plain method call would build a new one!
    }
}
```

The proxy intercepts `dataSource()` and returns the container-managed singleton instead of executing the method body again. That's **full mode** — the default and the behavior everyone expects: "call the @Bean method, get the shared bean".

## Lite mode — proxyBeanMethods = false

```java
@Configuration(proxyBeanMethods = false)
public class AppConfig { ... }
```

With `proxyBeanMethods = false`, the class is **not proxied** — it's treated as a plain component that happens to have `@Bean` methods ("lite mode"). Consequences:

- Faster startup (no CGLIB proxy generation) — meaningful for many small config classes.
- **Bean-to-bean calls now execute the method body every time** — `jdbcTemplate()` above would build a *second* DataSource. The container doesn't know they're related.

Lite mode is correct only when your `@Bean` methods **don't call each other** (each builds standalone beans) — the pattern Spring Boot's auto-configurations use internally. For hand-written app config, **keep the default full mode** unless startup profiling shows the proxy cost matters.

## @Bean lifecycle wiring

```java
@Configuration
public class MessagingConfig {
    @Bean(initMethod = "connect", destroyMethod = "close")   // non-annotatable classes
    public LegacyConnector legacyConnector() { return new LegacyConnector(); }

    @Bean
    @Lazy
    public HeavyResource heavyResource() { ... }              // deferred construction

    @Bean
    @Primary
    public PaymentGateway defaultGateway() { ... }            // wins ambiguous injection

    @Bean
    public PaymentGateway refundGateway() { return new AdyenGateway(); }
}
```

- `initMethod`/`destroyMethod` wire lifecycle hooks on classes you can't annotate.
- `@Bean` methods can declare `@Scope("prototype")`, `@Lazy`, `@Primary` — the full bean-definition vocabulary.
- **Bean method parameters are dependencies:** `@Bean public JdbcTemplate jdbcTemplate(DataSource ds)` — Spring resolves `ds` from the container. This is the modern, explicit form (preferred over calling `dataSource()`).

## How we use it in an organization: the scenarios

**Scenario 1 — the dependency-via-parameter pattern.** Teams write `@Bean` methods with parameters (container-resolved), not method calls:

```java
@Bean
public OrderService orderService(OrderRepository repo, PaymentGateway gateway, Clock clock) {
    return new OrderService(repo, gateway, clock);   // deps injected — no proxying surprises
}
```

This makes the config readable as a dependency graph and works identically in full and lite mode.

**Scenario 2 — conditional bean assembly.** Combine `@Bean` with `@ConditionalOnProperty`/`@Profile` (see the conditional-beans lesson) to assemble environment-specific graphs in one config class.

**Scenario 3 — external library wiring.** A library bean that needs a custom setup:

```java
@Bean
public ObjectMapper objectMapper() {
    return JsonMapper.builder()
        .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .serializerByType(BigDecimal.class, new ToStringSerializer())
        .build();
}
```

## @Configuration vs @Component — the same, but not really

- `@Configuration` classes are proxied (full mode) — bean-to-bean calls get container singletons.
- `@Component` classes with `@Bean` methods are **always lite mode** — no proxy; bean-to-bean calls build new instances.
- A `@Bean` method inside a `@Component` is fine for standalone beans, but if it calls another `@Bean` method expecting the singleton, it silently builds a new one.

The review rule: **use `@Configuration` for wiring that references other beans; use `@Component` + `@Bean` only for standalone factory methods.**

## Pitfalls

- **`proxyBeanMethods=false` with bean-to-bean calls** — silently creates multiple instances; the classic "why do I have two DataSources?" bug.
- **Final classes can't be proxied** — a `final` `@Configuration` class fails with CGLIB errors; make the class non-final (or switch to lite mode knowingly).
- **`@Bean` methods with side effects** — a `@Bean` method that's called twice (via method call) runs twice in lite mode; keep method bodies pure factory logic.
- **Circular `@Bean` references** — `beanA(beanB b)` + `beanB(beanA a)` fails with a circular-reference error; break it with `ObjectProvider` or `@Lazy` (see the circular-dependencies lesson).
- **Multiple `@Configuration` classes with overlapping beans** — duplicate names fail at startup; keep bean names unique or use `@Primary` deliberately.

## Key takeaways

- `@Configuration` is proxied in full mode — bean-to-bean calls return the container singleton.
- `proxyBeanMethods=false` (lite mode) skips the proxy — faster but bean-to-bean calls rebuild instances.
- Prefer `@Bean` methods with parameters over calling other `@Bean` methods — explicit and proxy-independent.
- Wire lifecycle (`initMethod`/`destroyMethod`), scope, and `@Primary` at the `@Bean` level.
- Use `@Configuration` for interlinked wiring; `@Component`+`@Bean` only for standalone factories.
