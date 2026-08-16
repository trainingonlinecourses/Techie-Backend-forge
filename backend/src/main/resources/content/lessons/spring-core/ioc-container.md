---
title: Inversion of Control & the ApplicationContext
summary: BeanFactory vs ApplicationContext, how the container builds and wires beans, and the scopes that govern them.
order: 2
minutes: 18
topics: [ioc, applicationcontext, beans, scopes]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans.html
  - https://docs.spring.io/spring-framework/reference/core/beans/basics.html
---

# Inversion of Control & the ApplicationContext

## Inversion of control

**IoC** means: *the framework calls your code, not the other way around.* Your classes declare their dependencies; the **container** instantiates them, wires them, and hands them over. You never write `new AccountService(new AccountRepository(...))` — the context does it.

```java
// Your code — dependencies declared, not constructed:
@Service
public class AccountService {
    private final AccountRepository accounts;      // injected by the container

    public AccountService(AccountRepository accounts) {   // constructor injection
        this.accounts = accounts;
    }
}
```

## BeanFactory vs ApplicationContext

| | BeanFactory | ApplicationContext (used by Boot) |
|---|---|---|
| What | The raw container: creates + injects beans | BeanFactory + events + i18n + resources + AOP |
| When | Embedded/resource-light scenarios | Everything you will write |

```java
ApplicationContext ctx = new AnnotationConfigApplicationContext(AppConfig.class);
AccountService svc = ctx.getBean(AccountService.class);
```

## How the container builds beans

1. **Register definitions** — `@ComponentScan` finds `@Component`/`@Service`/`@Repository`/`@Controller`; `@Configuration` classes declare `@Bean` factories.
2. **Instantiate** — construct beans (resolving constructor dependencies recursively).
3. **Populate** — inject fields/methods for the remaining dependencies.
4. **Initialize** — `@PostConstruct`, `InitializingBean`, `BeanPostProcessor`s.
5. **Ready** — beans are handed to callers; proxies (AOP, `@Transactional`) wrap targets here.

```java
@Configuration
public class AppConfig {
    @Bean
    public MoneyFormatter moneyFormatter() {
        return new MoneyFormatter(Locale.US);
    }
}
```

## Bean scopes

| Scope | Lifecycle | Use for |
|---|---|---|
| `singleton` (default) | One instance per context | Stateless services, repos — 99% of beans |
| `prototype` | New instance per injection/lookup | Stateful helpers you own |
| `request` | Per HTTP request | Request-scoped state (web) |
| `session` | Per HTTP session | Session-scoped state (web) |

The #1 rule: **singleton beans must be stateless.** If a singleton has mutable fields shared across requests, you have a data race.

Injecting a prototype into a singleton — the classic trap. Each injection happens once, so a singleton gets *one* prototype instance. Use `ObjectProvider` for per-use instances:

```java
@Service
public class ReportService {
    private final ObjectProvider<ReportBuilder> builders;

    public ReportService(ObjectProvider<ReportBuilder> builders) {
        this.builders = builders;
    }
    public Report build(Query q) {
        return builders.getObject().build(q);   // fresh prototype per call
    }
}
```

> **Why it matters (organizational view)** — Understanding the container explains half of every Spring bug ever filed: "why is my singleton holding request state?", "why did the prototype get injected once?", "why is this bean created twice?" New teams should learn: constructor injection only, singleton-by-default, stateless beans, and the lifecycle order. With that, the container stops being magic and starts being the app's backbone.

## Key takeaways

- ApplicationContext = BeanFactory + events + resources + AOP wiring.
- Container lifecycle: discover → instantiate → inject → initialize → proxy.
- Constructor injection; singletons stay stateless.
- `ObjectProvider` to get fresh prototype instances.

**Official docs:** [IoC container](https://docs.spring.io/spring-framework/reference/core/beans.html) · [Bean basics](https://docs.spring.io/spring-framework/reference/core/beans/basics.html)
