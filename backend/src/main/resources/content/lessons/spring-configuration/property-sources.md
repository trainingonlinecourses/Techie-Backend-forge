---
title: Property Sources — Where Configuration Comes From
module: spring-configuration
order: 4
minutes: 23
topics: ["@PropertySource", "Environment", "property sources", "custom sources", "placeholder resolution"]
docs:
  - title: "Environment abstraction (Spring docs)"
    url: "https://docs.spring.io/spring-framework/reference/core/beans/environment.html"
summary: The Environment is Spring's unified view of configuration: a list of property sources (each a Maplike of key → value), consulted in order. Every ${...
---

# Property Sources — Where Configuration Comes From

## The Concept: One Abstraction Over Many Places

The `Environment` is Spring's unified view of configuration: a list of **property sources** (each a `Map`-like of key → value), consulted in order. Every `${...}` placeholder you've seen — in `@Value`, XML, `@ConfigurationProperties` — is resolved by asking the `Environment`: "walk the sources from highest precedence down; first source that has the key wins."

The sources include:

- System environment variables
- JVM system properties
- `application.properties` / `application.yml` (and profile variants)
- `@PropertySource` files you declare
- Command-line arguments
- Servlet context parameters

The elegance: **code never cares *where* a value came from.** `@Value("${app.name}")` works whether `app.name` is in a file, an env var, or a custom database-backed source. You can even add your *own* property source — that's how config servers (Spring Cloud Config, covered in the cloud module) inject values: they register a custom source the Environment consults.

## The Code Walkthrough

```java
import org.springframework.core.env.Environment;
import org.springframework.context.annotation.PropertySource;
import org.springframework.stereotype.Component;

// ---- 1. Load an extra properties file ----
@Component
@PropertySource("classpath:extra-config.properties")     // adds a source
public class FeatureConfig {

    private final Environment env;                        // inject the Environment

    public FeatureConfig(Environment env) { this.env = env; }

    public void report() {
        // ---- 2. Query with defaults ----
        String flag = env.getProperty("feature.x", "false");      // default if missing
        int max = env.getProperty("feature.max", Integer.class, 10);

        // ---- 3. Check where a value came from ----
        System.out.println("feature.x = " + flag);
        System.out.println("feature.max = " + max);
        System.out.println("feature.x origin: "
                + env.getPropertySources().stream()
                        .filter(ps -> ps.getProperty("feature.x") != null)
                        .map(ps -> ps.getName())
                        .findFirst().orElse("(not set)"));
    }
}
```

```properties
# extra-config.properties (in classpath)
feature.x=true
feature.max=42
```

### Walking Through Each Part

**`@PropertySource("classpath:extra-config.properties")`** — registers an additional properties file as a property source, making its keys resolvable via `${feature.x}` everywhere. This is how you pull in external/additional config files (e.g., a shared `common.properties`). Note: `@PropertySource` doesn't merge with `application.properties` — it *adds* a source at a specific place in the hierarchy.

**Injecting `Environment`** — the object itself is a bean; inject it anywhere you need dynamic property lookups (defaults, type conversions, runtime decisions).

**`env.getProperty(key, Class, default)`** — programmatic lookup with type conversion and a default. Useful when a property's presence/absence drives logic (e.g., "feature flag on?").

**The origin check** — walking the sources to find *which* one holds a key. This is the programmatic version of `/actuator/env` — the debugging tool for "where is this value coming from?".

## Precedence and Override — The Full Ladder

From highest to lowest (Spring Boot, simplified):

1. Devtools global settings
2. `@TestPropertySource` (tests)
3. Command-line args
4. `SPRING_APPLICATION_JSON`
5. Servlet config/context params
6. JNDI
7. Java system properties
8. OS environment variables
9. Random values (`random.*`)
10. Profile-specific files (outside jar first)
11. Profile-specific files (in jar)
12. `application.properties` (outside jar, then in jar)
13. `@PropertySource` files
14. Default properties (`SpringApplication.setDefaultProperties`)

Two rules make this usable:

- **Later sources override earlier ones** — an env var beats a file value.
- **Any source can be *added* programmatically** — `env.getPropertySources().addFirst(new MapPropertySource("db-config", map))` inserts a source at the top, beating everything. Config servers do exactly this.

## Custom Property Sources — The Config-Server Pattern

A `PropertySource` is a `Map`-like over keys; you can implement one backed by anything (a database, an HTTP endpoint, a vault):

```java
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.MapPropertySource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class DbPropertySourceConfig {

    @Bean
    public PropertySource<?> databasePropertySource(ConfigRepository repo) {
        // Load config keys from a database into a map
        return new MapPropertySource("db-config", repo.loadConfigAsMap());
    }

    // Register it FIRST so it beats application.properties:
    // (via EnvironmentPostProcessor or ApplicationContextInitializer in real apps)
}
```

This is how Spring Cloud Config works: the config client registers a remote-backed property source, and every `${...}` in your app resolves against it — your code never knows the config came from a server. Same abstraction, different backing.

## Placeholder Resolution Rules

- `${key}` — resolve from the Environment (any source).
- `${key:default}` — fallback if missing.
- `${a.b.c}` — nested property names.
- `placeholder` nesting: `${db:${database.url}}` — defaults can themselves be placeholders.
- Escaping — `$${key}` yields the literal `${key}` (for config that's a template itself).

## Common Beginner Pitfalls

1. **`@PropertySource` doesn't override `application.properties`** — it's added *after* the main files in precedence; same keys resolve from the main file first. For overrides, use env vars or `addFirst`.
2. **Property names case/format** — system properties are case-sensitive (`app.name` vs `App.NAME`); env vars are relaxed-mapped, but direct `env.getProperty` calls match exactly.
3. **Forgetting defaults in production** — a `${key}` with no default and no source fails startup; every non-essential key should carry `:default`.
4. **Custom sources not registered early** — a `PropertySource` added during bean creation is too late for bean property binding; use `EnvironmentPostProcessor` or an initializer for startup-time sources.
5. **`random.*` misuse** — `random.int` etc. resolve once per key access; don't use them for values that must be stable (use code or a DB).

## Key Takeaways

- The `Environment` is the unified config view: an ordered list of property sources.
- Every `${...}` placeholder resolves by walking sources from highest precedence down.
- `@PropertySource` adds files; env vars/system props/CLI args are built-in sources.
- `env.getProperty(key, type, default)` is programmatic lookup; origin-walking debugs "where did this come from".
- Custom `PropertySource`s (DB, config server, vault) plug into the same abstraction.
- Precedence ladder rules everything: env > system props > profile files > base files > defaults.
