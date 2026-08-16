---
title: Bean Scopes & Lifecycle
summary: The full lifecycle of a bean — instantiation to destruction — plus the stereotypes and @Bean patterns.
order: 4
minutes: 16
topics: [lifecycle, stereotypes, postconstruct, beandefinition]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/factory-scopes.html
  - https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/bean.html
---

# Bean Scopes & Lifecycle

## The complete lifecycle

```
1. instantiate (constructor injection resolves deps)
2. populate properties
3. Aware callbacks (BeanNameAware, ApplicationContextAware, ...)
4. BeanPostProcessor.postProcessBeforeInitialization
5. @PostConstruct / InitializingBean.afterPropertiesSet
6. BeanPostProcessor.postProcessAfterInitialization   ← proxies wrap HERE
7. bean is ready to use
8. context closes → @PreDestroy / DisposableBean.destroy
```

Step 6 is where AOP proxies are created — that's why `@Transactional`, `@Async`, `@Cacheable` and security annotations work: the context hands out a **proxy** that adds behavior around your bean.

```java
@Component
public class LifecycleLogger implements BeanPostProcessor {
    @Override
    public Object postProcessAfterInitialization(Object bean, String name) {
        if (bean instanceof AccountService)
            System.out.println("wrapped: " + bean.getClass());  // shows the PROXY class
        return bean;
    }
}
```

## The stereotypes

| Annotation | Meaning | Extras |
|---|---|---|
| `@Component` | Generic Spring-managed bean | discovery via component scan |
| `@Service` | Business logic layer | same as @Component, semantic |
| `@Repository` | Data access layer | **translates persistence exceptions** to Spring's `DataAccessException` |
| `@Controller` / `@RestController` | Web layer | request mapping, message conversion |
| `@Configuration` + `@Bean` | Factory methods for beans | full control, non-component classes |

```java
@Configuration
public class InfrastructureConfig {
    @Bean
    public Clock clock() { return Clock.systemUTC(); }        // inject testable Clock everywhere

    @Bean
    public RestClient billingClient(RestClient.Builder builder) { ... }
}
```

## Lifecycle annotations

```java
@Component
public class CacheWarmer {
    @PostConstruct
    public void warm() { /* runs once after injection, before first use */ }

    @PreDestroy
    public void flush() { /* runs on graceful shutdown */ }
}
```

`@PostConstruct` is for *your* initialization; for infrastructure-level hooks use `ApplicationRunner`/`CommandLineRunner` (Boot) or `InitializingBean`.

## Singletons must be stateless

The default scope shares one instance across the whole app. Mutable fields on a singleton = shared mutable state = data races and cross-request contamination:

```java
// WRONG — request data leaks between users
@Service
public class BadService {
    private String currentUser;            // shared, mutable — disaster
    public void doWork(String user) { this.currentUser = user; ... }
}

// RIGHT — everything is per-call
@Service
public class GoodService {
    public Result doWork(String user) { ... }    // no fields at all
}
```

## Where beans come from

- **Component scan**: `@SpringBootApplication` on your root package scans everything below it. Keep the root package stable; that's why Boot apps put the main class at the top.
- **`@Bean` methods**: explicit factories for third-party or parameterized beans.
- **Auto-configuration**: Boot's `@ConditionalOnXxx` classes add beans when conditions match (a DataSource if H2 is on the classpath, etc.).

> **Why it matters (organizational view)** — Lifecycle knowledge pays off in production: "why is my cache cold?" (missed @PostConstruct or eager init), "why do I get a different object than the one I configured?" (proxy), "why is state leaking between users?" (mutable singleton). The standard: services hold only final injected deps; state lives in entities, request scopes, or the database — never in singleton fields.

## Key takeaways

- Lifecycle: construct → inject → init (@PostConstruct) → proxy → use → @PreDestroy.
- Stereotypes document layer; `@Repository` adds exception translation.
- Singleton beans: stateless, always.
- `@Bean` for factories, component scan for your own classes.

**Official docs:** [Bean scopes](https://docs.spring.io/spring-framework/reference/core/beans/factory-scopes.html) · [@Bean](https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/bean.html)
