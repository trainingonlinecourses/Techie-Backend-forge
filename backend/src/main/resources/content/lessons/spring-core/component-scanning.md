---
title: Component Scanning & @Import — How Beans Get Discovered
summary: @ComponentScan mechanics, filters, @Import for config assembly, and why bean discovery order and duplicate detection matter in real apps.
order: 17
minutes: 20
topics: [componentscan, import, stereotypes, filters, bean-discovery, include-filters, exclude-filters]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/classpath-scanning.html
  - https://docs.spring.io/spring-framework/reference/core/beans/java/import.html
---

# Component Scanning & @Import — How Beans Get Discovered

## The concept: two ways beans enter the context

Spring beans come from exactly two places:

1. **Explicit registration** — `@Configuration` classes with `@Bean` methods, or `@Import(...)` pulling in other config classes.
2. **Component scanning** — Spring walks a package tree, finds classes annotated with **stereotypes** (`@Component`, `@Service`, `@Repository`, `@Controller`, `@Configuration`, and any meta-annotated type), and registers them as beans.

`@SpringBootApplication` is itself `@Configuration` + `@ComponentScan` + `@EnableAutoConfiguration`, and its scan starts at the **package of the class it's on**. That's why the rule "put the main class at the top of the package tree" exists — Spring scans *downward* from there, and anything outside the tree is invisible unless registered explicitly.

## Component scanning in detail

```java
@Configuration
@ComponentScan(
    basePackages = "com.acme.orders",
    includeFilters = @ComponentScan.Filter(type = FilterType.REGEX, pattern = ".*Service"),
    excludeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE,
                                           classes = LegacyMigrationService.class)
)
public class OrdersConfig { }
```

Filter types: `ANNOTATION`, `ASSIGNABLE_TYPE` (by class), `REGEX`, `ASPECTJ`, and `CUSTOM` (your own `TypeFilter`). In practice most apps never filter — they rely on the default: *all stereotypes under the base package*. Filters are the escape hatch for adopting a library or migration where you must control exactly what is discovered.

## @Import — explicit assembly when scanning isn't enough

```java
@Configuration
@Import({ DataSourceConfig.class, SecurityConfig.class, PaymentModuleConfig.class })
public class AppConfig { }
```

`@Import` is how you compose configuration: import `@Configuration` classes, plain `@Component` types, or even `ImportSelector`/`ImportBeanDefinitionRegistrar` (the machinery behind `@Enable*` annotations — `@EnableAsync`, `@EnableScheduling`, `@EnableWebMvc` all work by importing a selector that registers extra bean definitions). Libraries can't scan your packages, so every library's `@EnableXxx` is an `@Import` in disguise.

## How we use it in an organization: the scenarios

**Scenario 1 — the layered-package convention.** Teams organize by feature: `com.acme.orders` containing `OrdersController`, `OrderService`, `OrderRepository`. The main class sits at `com.acme` so one `@SpringBootApplication` scans everything. Adding a feature = adding a package under the root; no config edits.

**Scenario 2 — excluding a bean in tests.** A `@SpringBootTest` can exclude a noisy integration bean without touching production code:

```java
@SpringBootTest
@ComponentScan(excludeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE,
                                                     classes = KafkaIngestService.class))
class OrderServiceTest { ... }
```

**Scenario 3 — importing a third-party module.** A payment module ships as a jar with `PaymentConfig`; the app wire-up is one line:

```java
@Import(PaymentConfig.class)
public class AppConfig { }
```

The jar can't be scanned (it's a dependency, not in your base package), so `@Import` is the contract.

**Scenario 4 — backstops with duplicate beans.** When the same `@Component` appears twice (e.g., two modules in one jar), Spring fails fast with `ConflictingBeanDefinitionException: bean with name 'x' already defined`. That error is a feature: silent duplicate wiring is far worse. Fix by `@Primary`, `@Qualifier`, or removing the duplicate — not by suppressing the error.

## Pitfalls

- **Wrong base package** — the classic "bean not found" with a working classpath. If the main class isn't above the components, scanning silently misses them. Enable `debug=true` in application properties to see which classes are scanned.
- **`@Component` on a class with constructor args needing config values** — works (constructor injection), but if the value comes from `@Value` on fields, prefer `@ConfigurationProperties` classes registered as beans.
- **Scanning too much:** scanning giant third-party packages slows startup and can register unintended beans. Keep `basePackages` tight.
- **Meta-annotations:** `@Service` is itself annotated `@Component` — custom annotations built from `@Component` participate in scanning automatically. That's how `@RestController` (a `@Controller` meta-annotation) is discovered.

## Key takeaways

- Scanning discovers stereotypes under the base package; `@Import` registers explicitly.
- `@SpringBootApplication` scans its own package downward — keep the main class at the top.
- `@Enable*` annotations are `@Import` + selectors under the hood — the library pattern.
- Filters (`include`/`exclude`) control discovery for adoptions and tests.
- Duplicate bean names fail fast by design — resolve with `@Primary`/`@Qualifier`, not suppression.
