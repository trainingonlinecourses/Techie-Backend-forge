---
title: Auto-Configuration — How Spring Boot Configures Itself
module: spring-boot-internals
order: 1
minutes: 26
topics: ["auto-configuration", "@ConditionalOnClass", "@EnableAutoConfiguration", "spring.factories", "starters"]
summary: When you add springbootstarterweb and write a @RestController, Spring Boot magically sets up an embedded Tomcat, Jackson JSON, an error handler, a ...
docs:
  - title: "Auto-configuration (Spring Boot docs)"
    url: "https://docs.spring.io/spring-boot/reference/using/auto-configuration.html"
---

# Auto-Configuration — How Spring Boot Configures Itself

## The Concept: The Magic Behind "It Just Works"

When you add `spring-boot-starter-web` and write a `@RestController`, Spring Boot *magically* sets up an embedded Tomcat, Jackson JSON, an error handler, a health endpoint, and a dozen other pieces — **without you configuring any of them**. How does Boot know?

**Auto-configuration** is the answer: on startup, Spring Boot inspects your **classpath** (which jars are present) and your **properties**, then *conditionally* creates beans it believes you need. The key word is *conditional*:

- Is `Tomcat` on the classpath? → configure an embedded Tomcat server.
- Is `DataSource` available? → configure a connection pool (Hikari) from `spring.datasource.*` properties.
- Is Jackson on the classpath? → configure the JSON `ObjectMapper`.

It's a giant library of "if you have X, here's a sensible default configuration for X" — all behind one annotation: `@EnableAutoConfiguration` (which `@SpringBootApplication` includes).

## The Conditional Logic — "If" Annotations

Every auto-configuration is guarded by `@Conditional` annotations. The most important:

```java
@ConditionalOnClass(DataSource.class)          // only if the class is on the classpath
@ConditionalOnMissingBean(DataSource.class)    // only if the USER hasn't defined one already
class DataSourceAutoConfiguration { ... }
```

Two rules make it safe:

1. **`@ConditionalOnClass`** — runs only when the relevant library is present. No Hibernate jar? No Hibernate config, no error.
2. **`@ConditionalOnMissingBean`** — your own `@Bean` *wins*. If you define a `DataSource` yourself, Boot's default backs off. **Your explicit configuration always overrides auto-configuration.**

That second rule is why the magic never fights you: you can override anything by defining your own bean or property.

## The Code Walkthrough

```java
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

// ---- A custom auto-configuration (what Boot itself looks like) ----

@Configuration
@ConditionalOnClass(name = "com.example.some.Library")     // only if the library is present
public class MyLibraryAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean        // back off if the user defined their own
    public MyLibraryClient myLibraryClient(MyLibraryProperties props) {
        return new MyLibraryClient(props.getBaseUrl());
    }

    @Bean
    @ConditionalOnProperty(prefix = "my.library", name = "enabled", havingValue = "true", matchIfMissing = true)
    public HealthIndicator myLibraryHealth(MyLibraryClient client) {
        return () -> client.isHealthy() ? Health.up().build() : Health.down().build();
    }
}

// ---- Properties bound from application.properties ----
// my.library.base-url=https://api.example.com
// my.library.enabled=true
```

### Walking Through Each Part

**`@Configuration` + `@ConditionalOnClass`** — the whole class activates only when the named class exists on the classpath. This is how Boot adds Tomcat config only when Tomcat is present: the condition *is* the discovery mechanism.

**`@Bean` + `@ConditionalOnMissingBean`** — create `MyLibraryClient` **unless the user already made one**. The user's bean wins. This is the polite protocol: auto-configuration provides defaults; explicit user config overrides.

**`@ConditionalOnProperty`** — a feature switches on a property: `my.library.enabled=true` (defaulting to enabled). This is how Boot toggles optional features (e.g., `management.endpoint.health.enabled`).

**Properties** — auto-configurations bind `*Properties` classes to namespaced properties (`my.library.base-url`) and feed them to the beans. Everything is configurable through properties — no code edits.

## Why "It Just Works" Sometimes Doesn't

The classic confusion: **why isn't my auto-configuration running?** The standard causes:

1. **The class isn't on the classpath** — `@ConditionalOnClass` is false; nothing to configure.
2. **A property disables it** — `@ConditionalOnProperty(matchIfMissing=false)` means "off unless enabled".
3. **The user (or another auto-config) already defined the bean** — `@ConditionalOnMissingBean` backs off.
4. **Ordering** — auto-configurations run in a defined order (`@AutoConfigureBefore`/`@AutoConfigureAfter`); a misordering can prevent one from seeing another's beans.

The debugging tools: `--debug` logging prints a report of *positive and negative* auto-configuration matches — exactly why each config ran or didn't. This report is the single most useful diagnostic for "Spring Boot did something I didn't expect / didn't do what I expected":

```
============================
CONDITIONS EVALUATION REPORT
============================
DataSourceAutoConfiguration matched:
  - @ConditionalOnClass found required classes 'javax.sql.DataSource' ...
  - @ConditionalOnMissingBean did not find any beans ...
```

## The Debug Report in Action

Run your app with `--debug` (or set `logging.level.org.springframework.boot.autoconfigure=DEBUG`) and Spring prints the full conditions report on startup. It shows, for every auto-configuration, whether it matched and why. When something's mysteriously configured or missing, this report is the map.

## How Starters and Auto-Config Work Together

- **Starters** (`spring-boot-starter-web`) are just *dependency bundles*: they pull in the right jars.
- **Auto-configuration** then reacts to those jars being present.

Starter + auto-config = "add one dependency, get a working subsystem." `spring-boot-starter-data-jpa` brings Hibernate + Hikari + the JPA annotations; `JpaAutoConfiguration` then wires the `EntityManagerFactory`, the transaction manager, and the repositories — all conditional on those jars being there.

## Common Beginner Pitfalls

1. **Expecting auto-config without the starter** — auto-config runs on *classpath contents*; missing jar = no config. Add the starter.
2. **Fighting auto-config with XML** — define your own `@Bean`/properties to override; that's the supported escape hatch.
3. **Mysterious duplicate beans** — you defined a bean *and* auto-config created one? No: `@ConditionalOnMissingBean` prevents that — unless your bean is defined too late or in a non-scanned package. Put `@Configuration` in a scanned package.
4. **Not knowing the conditions report exists** — `--debug` output is the #1 debugging tool for "why is my app configured this way".
5. **Custom auto-configuration without `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`** — your own auto-config classes must be listed there (modern Spring Boot) to be discovered; a plain `@Configuration` in the scanned app package works but isn't *auto*-configuration.

## Key Takeaways

- Auto-configuration conditionally creates beans based on classpath + properties.
- `@ConditionalOnClass` = "only if the library is present"; `@ConditionalOnMissingBean` = "only if the user hasn't".
- Your explicit beans and properties always override auto-configuration.
- Starters bundle dependencies; auto-configuration reacts to them.
- The conditions evaluation report (`--debug`) explains every "matched"/"not matched" decision — use it when behavior surprises you.
