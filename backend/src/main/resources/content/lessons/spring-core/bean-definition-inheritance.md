---
title: Bean Definitions & FactoryBean — How Beans Are Actually Built
summary: BeanDefinition as the recipe, FactoryBean for complex construction, and the container internals that explain lazy init, aliases and primary beans.
order: 18
minutes: 20
topics: [beandefinition, factorybean, lazy-init, aliases, primary, bean-lifecycle, container-internals]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/definition.html
  - https://docs.spring.io/spring-framework/reference/core/beans/factory-extension.html
---

# Bean Definitions & FactoryBean — How Beans Are Actually Built

## The concept: every bean starts as a definition

Before a bean *instance* exists, Spring holds a **`BeanDefinition`** — the *recipe*: the class to instantiate, constructor arguments, property values, scope, lazy flag, init/destroy method names, and whether it's a candidate for autowiring. The container's flow is:

1. **Register** `BeanDefinition`s (from `@Bean`, scanning, XML, imports).
2. **Post-process** definitions (`BeanFactoryPostProcessor` can edit them).
3. **Instantiate** each bean from its definition, honoring scope and lazy flags.
4. **Populate** properties, run init callbacks, apply `BeanPostProcessor`s.

Understanding that *definitions are data* explains everything: why `@Profile` can drop beans (the definition is removed before instantiation), why `@Lazy` works (defer instantiation), and why a property value can be overridden in tests (edit the definition).

## FactoryBean — when construction is too complex for a method

`FactoryBean<T>` is a recipe that produces a bean of type `T` via a `getObject()` call. It's the classic pattern for **objects that are hard or dangerous to construct** — connection factories, XML parsers, JNDI lookups — because construction is deferred and controlled:

```java
@Component
public class XmlParserFactoryBean implements FactoryBean<DocumentBuilder> {
    @Override public DocumentBuilder getObject() throws Exception {
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true); // XXE guard
        return f.newDocumentBuilder();       // constructed only when injected
    }
    @Override public Class<?> getObjectType() { return DocumentBuilder.class; }
    @Override public boolean isSingleton() { return true; }
}
```

Injecting `DocumentBuilder` anywhere gives you the factory-built instance. Injecting `FactoryBean<DocumentBuilder>` (with an `&` prefix in `getBean("&xmlParserFactoryBean")`) gives you the factory itself. In modern Spring, `@Bean` methods with full bodies usually replace `FactoryBean`, but you still *see* the pattern in framework code and in legacy integration configs.

## How we use it in an organization: the scenarios

**Scenario 1 — lazy-init for heavyweight beans.** A bean that allocates pools or connects to external systems on construction should not run during every test bootstrap:

```java
@Bean
@Lazy
public KafkaAdmin kafkaAdmin() { return new KafkaAdmin(props); }  // only built when first used
```

`@Lazy` on a *dependency* defers its creation until first injection; on a `@Bean` it defers until first lookup. JPA `@OneToMany` lazy loading is unrelated — this is bean-level laziness.

**Scenario 2 — aliases for environment-specific names.** The same underlying bean under two names so legacy callers keep working:

```java
@Bean("orderStore")
@Primary
public OrderRepository orderRepository() { ... }
// getBean("orderStore") and getBean("orderRepository") resolve the same bean
```

**Scenario 3 — `@Primary` and `@Qualifier` for ambiguous wiring.** When two beans of the same type exist, `@Primary` picks the default; `@Qualifier` overrides per injection point:

```java
@Bean @Primary public PaymentGateway defaultGateway() { return new StripeGateway(); }
@Bean @Qualifier("refund") public PaymentGateway refundGateway() { return new AdyenGateway(); }

@Service
public class CheckoutService {
    public CheckoutService(@Qualifier("refund") PaymentGateway refundOnly) { ... }
}
```

**Scenario 4 — controlling init/destroy.** `@PostConstruct`/`@PreDestroy`, or the definition-level `initMethod`/`destroyMethod` for beans you can't annotate:

```java
@Bean(initMethod = "connect", destroyMethod = "close")
public LegacyConnector legacyConnector() { return new LegacyConnector(); }
```

## What bean order does (and doesn't) guarantee

Spring creates beans **lazily on first use by default** (eager for singletons at startup, but in a dependency-driven order). You cannot rely on `@Bean` method declaration order for side effects. If bean A must exist before bean B does work, express it as a **dependency** (constructor parameter), not by hoping the container builds A first. `@DependsOn("a")` forces ordering for side-effect beans (e.g., a schema initializer before a repository) — use sparingly, since real dependencies should flow through constructors.

## Pitfalls

- `@Lazy` hides construction failures until first use — a misconfigured bean surfaces mid-request, not at startup. Use it deliberately.
- `FactoryBean` that returns `null` from `getObject()` confuses autowiring — `getObjectType` should be accurate.
- A definition edited too late (after instantiation) has no effect — post-process definitions in `BeanFactoryPostProcessor`, not `BeanPostProcessor`.
- `@Bean` methods that return interfaces (e.g., `@Bean PaymentGateway`) — Spring uses the *return type* as the bean type for autowiring; the concrete class only matters for proxy decisions.

## Key takeaways

- Every bean starts as a `BeanDefinition` recipe; post-processors edit recipes or decorate instances.
- `FactoryBean` defers and controls construction — the pattern behind hard-to-build objects.
- `@Lazy`, `@Primary`, `@Qualifier`, aliases, and init/destroy methods are all definition-level features.
- Express real dependencies through constructors; `@DependsOn` only for side-effect ordering.
