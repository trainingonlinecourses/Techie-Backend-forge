---
title: Bean Post-Processors — The Hooks That Make Spring Spring
summary: BeanPostProcessor vs BeanFactoryPostProcessor, the lifecycle hooks, and the production use-cases — property redaction, proxying, and customization.
order: 14
minutes: 22
topics: [beanpostprocessor, beanfactorypostprocessor, postprocess, lifecycle-hooks, proxies, customization]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/factory-extension.html
  - https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/autowired.html
---

# Bean Post-Processors — The Hooks That Make Spring Spring

## The concept: two kinds of post-processor

Spring itself is built on two extension hooks that run during container startup:

1. **`BeanFactoryPostProcessor`** — runs **before any bean is instantiated**, and can modify **bean definitions**: add/remove properties, change scopes, rewrite values. Perfect for environment-specific tweaks.
2. **`BeanPostProcessor`** — runs **after each bean is instantiated** (and after dependency injection), wrapping the bean or tweaking its state right before it's used. This is how Spring creates **proxies**: AOP, `@Transactional`, `@Async`, and Spring Security's method security all register their own `BeanPostProcessor` that wraps beans in a proxy.

The mental model: *factory* post-processor edits the **recipe** (definition), *bean* post-processor decorates the **cooked dish** (instance).

## The lifecycle, concretely

```text
bean definitions loaded (from @Configuration, XML, components)
      ↓
BeanFactoryPostProcessor.postProcessBeanFactory()   ← edit definitions first
      ↓
for each bean:
    instantiate
    populate properties (constructor/setter injection)
    BeanPostProcessor.postProcessBeforeInitialization()   ← before init
    @PostConstruct / afterPropertiesSet()
    BeanPostProcessor.postProcessAfterInitialization()    ← after init — where proxies are made
```

## How we use it in an organization: three real scenarios

**Scenario 1 — redact secrets in Actuator config dumps.** Configuration properties end up exposed via `ConfigDataEnvironmentPostProcessor`/`/actuator/env` unless masked. A `BeanFactoryPostProcessor` rewrites definitions so password-ish properties are redacted from any actuator exposure:

```java
@Component
public class SecretRedactionPostProcessor implements BeanFactoryPostProcessor {
    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory factory) {
        for (String name : factory.getBeanDefinitionNames()) {
            MutablePropertyValues pv = factory.getBeanDefinition(name).getPropertyValues();
            pv.forEach(prop -> {
                if (prop.getName().toLowerCase().contains("password")
                        || prop.getName().toLowerCase().contains("secret")) {
                    prop.setConvertedValue("*****");   // never echo real secrets
                }
            });
        }
    }
}
```

**Scenario 2 — a company-wide "traceable" marker on every service bean.** After init, record the bean so an ops tool can inspect everything the container knows:

```java
@Component
public class ServiceRegistryPostProcessor implements BeanPostProcessor {
    private final List<Class<?>> services = new CopyOnWriteArrayList<>();

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        if (bean.getClass().isAnnotationPresent(Service.class)) {
            services.add(bean.getClass());
        }
        return bean;   // IMPORTANT: return the (possibly wrapped) bean!
    }
}
```

The cardinal rule of `BeanPostProcessor`: **return the bean** — possibly a wrapped/proxied version, but never null and never a replacement that breaks contracts, or the container silently loses the bean.

**Scenario 3 — the proxy you already use.** `@Transactional` is not magic — Spring's `InfrastructureAdvisorAutoProxyCreator` (a `BeanPostProcessor`) sees the `@Transactional` annotation on your service, builds an `Advisor`, and returns a **CGLIB/JDK proxy** from `postProcessAfterInitialization`:

```java
@Service
public class PaymentService {
    @Transactional
    public void charge(Payment p) { ... }
}
// At runtime the injected PaymentService is a PROXY whose method calls
// first hit the transaction interceptor, then your real method.
```

That's why self-invocation (`this.someTransactionalMethod()`) bypasses transactions — the proxy isn't in the path; the real object is.

## When you need to write your own

Most teams write post-processors only for cross-cutting, container-wide concerns: audit wiring, secret redaction, bean naming conventions, or wrapping every bean of an interface with a decorator (e.g., add metrics collection to every `MetricsExporter`). If only *one* bean needs behavior, an aspect or an `@Bean` factory method is simpler. If *many* beans need uniform treatment, a post-processor is the right tool — and exactly how the framework solves it internally.

## Pitfalls

- Post-processors are instantiated **very early** — they can't depend on most other beans (their own dependencies are limited). Keep them dependency-free or careful.
- Order matters when several post-processors wrap the same bean — use `Ordered`/`@Order`.
- Returning a *different* object from `postProcessAfterInitialization` is how proxies happen — but replacing the bean type can break `@Autowired` resolution unless the proxy implements the original interfaces.
- `BeanFactoryPostProcessor` runs before `@Value`/`@Autowired` injection is resolved — edit definitions, not instances.

## Key takeaways

- `BeanFactoryPostProcessor` edits bean *definitions* before instantiation.
- `BeanPostProcessor` decorates *instances* after injection — the mechanism behind proxies.
- Always return the bean; use `@Order` to control sequence.
- AOP, transactions, `@Async`, method security — all are post-processor-created proxies.
