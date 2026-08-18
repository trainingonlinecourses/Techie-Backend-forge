---
title: The Environment Abstraction — Properties, Profiles and Resolution Order
summary: Environment, PropertySources, resolution order, and how property precedence protects prod from dev defaults in real deployments.
order: 19
minutes: 20
topics: [environment, propertysources, resolution-order, property-resolution, profiles, property-override]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/environment.html
  - https://docs.spring.io/spring-boot/reference/features/external-config.html
---

# The Environment Abstraction — Properties, Profiles and Resolution Order

## The concept: one interface over every property source

`Environment` is Spring's unified view of all configuration: OS environment variables, JVM system properties, `application.properties`, `application.yml`, command-line args, and config-server values. Each source is a **`PropertySource`**; the `Environment` resolves a property by walking them **in precedence order** and returning the first hit.

```java
@Service
public class GreetingService {
    @Value("${app.greeting:hello}")   // resolve from Environment, default 'hello'
    private String greeting;
    // or programmatically:
    // environment.getProperty("app.greeting")
}
```

The whole point of the abstraction: **code never knows where a value came from**. The same `@Value("${db.url}")` works in a dev laptop (H2 via `application-dev.yml`), a CI container (env var), and prod (config server + vault). The environment decides; the code just asks.

## Precedence order (Spring Boot)

From highest to lowest — a value from an earlier source wins:

1. **Command-line arguments** (`--db.url=...`)
2. **OS environment variables** / `SPRING_APPLICATION_JSON`
3. **`application-{profile}.properties|yml`** (profile-specific, in `config/` or classpath)
4. **`application.properties|yml`** (base, in `config/` then classpath)
5. **`@PropertySource`** on configuration classes
6. Defaults from `@Value("${x:default}")` or code

The practical consequence: **operators can override anything at deploy time** without touching the repo. The prod database URL lives in the deployment environment (Render/Vercel env vars), not in `application-prod.yml` in git — so secrets never land in the repository and each environment can point at its own infrastructure.

## How we use it in an organization: the scenarios

**Scenario 1 — environment-specific config files.** Three files, selected by `SPRING_PROFILES_ACTIVE`:

```properties
# application-dev.properties
app.db.url=jdbc:h2:mem:devdb
app.features.new-checkout=true

# application-prod.properties
app.db.url=${DB_URL}            # from deployment env — secret stays out of git
app.features.new-checkout=false

# application.properties (base — safe defaults for tests)
app.db.url=jdbc:h2:mem:testdb
```

**Scenario 2 — reading the environment programmatically.** Feature toggles, region, or instance metadata:

```java
@Service
public class RegionRouter {
    private final Environment env;

    public RegionRouter(Environment env) { this.env = env; }

    public String region() {
        return env.getProperty("cloud.region", "eu-central-1");  // default for local dev
    }
}
```

`@Value` covers most needs; `Environment` is for dynamic lookups, defaults, and reading typed values (`getProperty("x", Integer.class)`).

**Scenario 3 — active profiles in code.** Knowing which profile is active for conditional behavior:

```java
if (env.acceptsProfiles(Profiles.of("prod"))) {
    metricsRegistry.enable();   // only register prod-only collectors
}
```

**Scenario 4 — test overrides.** `@SpringBootTest(properties = "app.db.url=jdbc:h2:mem:t")` adds a test property source *above* everything — tests override prod values cleanly without editing config files.

## PropertySource ordering done right

If you register your own `@PropertySource`, remember **file order and later-declared-wins nuances**: `@PropertySource` sources are added *before* the default ones in some configurations. The safe pattern: use profile files and env vars for the layering you need; reserve custom `PropertySource` for genuinely custom sources (a property database, a feature-flag server) via `EnvironmentPostProcessor`.

## Pitfalls

- **Typos are silent** — a misspelled key yields `null` or the default. `@ConfigurationProperties` (typed binding) catches this at startup; plain `@Value` does not. Prefer `@ConfigurationProperties` for groups of related settings.
- **Secrets in `application.properties`** committed to git — the recurring incident. Env vars or a secret manager, always.
- **Case sensitivity:** env vars are uppercase by convention (`DB_URL`), properties lowercase (`db.url`) — Spring Boot's relaxed binding (`DB_URL` ↔ `db.url`) handles it, but raw `System.getenv` does not.
- **Defaults can hide misconfig** — a default that "works" in prod masks a missing env var. Consider `@ConfigurationProperties(ignoreUnknownFields = false)` and validation (`@Validated`) to fail fast on missing required values.

## Key takeaways

- `Environment` unifies all property sources behind one precedence-ordered lookup.
- Command-line > env vars > profile files > base files > defaults.
- Profile files carry environment shape; secrets come from deployment env/secret stores.
- Prefer `@ConfigurationProperties` with validation over scattered `@Value` for groups of settings.
- Typos fail silently — validate configuration at startup.
