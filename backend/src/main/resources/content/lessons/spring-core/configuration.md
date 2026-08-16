---
title: Configuration, Profiles & Properties
summary: @Configuration, @PropertySource, profiles, environment abstraction and the property resolution order.
order: 5
minutes: 16
topics: [configuration, profiles, properties, environment]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/environment.html
  - https://docs.spring.io/spring-boot/reference/features/external-config.html
---

# Configuration, Profiles & Properties

## The Environment abstraction

`Environment` is Spring's uniform view of configuration: system properties, OS environment variables, property files, profile state — all merged with a **precedence order** (Boot extends this: see the spring-boot/configuration lesson).

```java
@Configuration
public class AppConfig {
    @Value("${app.pagination.default-size:20}")   // property with default
    private int defaultPageSize;

    @Value("${JAVA_HOME}")                        // env vars work too
    private String javaHome;
}
```

## Typed configuration: @ConfigurationProperties

`@Value` is fine for one-offs; **typed properties** are the org standard for groups of settings — they're validated, IDE-friendly, and testable:

```java
@ConfigurationProperties(prefix = "app")
public record AppProperties(Jwt jwt, Cors cors, OpenAi openai) {
    public record Jwt(String secret, long expirationSeconds) {}
    public record Cors(List<String> allowedOrigins) {}
    public record OpenAi(String apiKey, String model) {}
}
```

```yaml
app:
  jwt:
    secret: ${APP_JWT_SECRET:dev-secret}
    expiration-seconds: 86400
```

Enable with `@EnableConfigurationProperties(AppProperties.class)` (or `@ConfigurationPropertiesScan`).

## Profiles: environment-specific behavior

```java
@Service
@Profile("!test")                       // active everywhere except tests
public class SmsNotifier implements Notifier { ... }

@Service
@Profile("local")
public class LogNotifier implements Notifier { ... }
```

```yaml
# application.yml
app:
  notifier: default

# application-local.yml
app:
  notifier: log
```

- `spring.profiles.active=local,dev` — set via args, env (`SPRING_PROFILES_ACTIVE`), or `application-{profile}.yml`.
- Profiles are for *environment differences*, not feature flags: config, beans, data sources.

## Property source order (Boot, high → low)

1. Command-line arguments
2. `SPRING_APPLICATION_JSON` / `JAVA_TOOL_OPTIONS`
3. OS environment variables
4. `application-{profile}.yml`
5. `application.yml`
6. `@PropertySource` files
7. Defaults baked into code (`:default`)

The rule: **same key, later source wins** — so env vars (`APP_JWT_SECRET`) override yml without touching code.

> **Why it matters (organizational view)** — The org convention: all settings in `application.yml` by environment (`application-dev/prod.yml`), secrets only via env vars or a vault, and typed `@ConfigurationProperties` for every custom group. This makes config *reviewable in the repo* and *overridable in the platform* — the two things ops teams need.

## Key takeaways

- `Environment` merges properties with defined precedence; Boot adds layers on top.
- Prefer `@ConfigurationProperties` records over scattered `@Value`.
- Profiles switch beans/config per environment; never use them as feature flags.
- Secrets via env vars/secrets managers, never in git.

**Official docs:** [Environment abstraction](https://docs.spring.io/spring-framework/reference/core/beans/environment.html) · [Externalized configuration](https://docs.spring.io/spring-boot/reference/features/external-config.html)
