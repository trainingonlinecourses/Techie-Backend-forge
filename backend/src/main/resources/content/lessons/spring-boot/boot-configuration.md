---
title: Externalized Configuration & @ConfigurationProperties
summary: application.yml, profiles, environment overrides, typed properties and the precedence chain in Boot.
order: 3
minutes: 16
topics: [application-yml, profiles, configurationproperties, env]
docs:
  - https://docs.spring.io/spring-boot/reference/features/external-config.html
  - https://docs.spring.io/spring-boot/reference/features/external-config.html#features.external-config.typesafe-configuration-properties
---

# Externalized Configuration & @ConfigurationProperties

## application.yml — the config home

```yaml
server:
  port: 8080

spring:
  application:
    name: payments-api
  datasource:
    url: jdbc:postgresql://localhost:5432/payments
    username: app
    password: ${DB_PASSWORD}          # env override
  jpa:
    hibernate:
      ddl-auto: update

app:
  jwt:
    secret: ${APP_JWT_SECRET:dev-only-secret}
    expiration-seconds: 86400
```

## The precedence chain (Boot 3)

| Priority | Source |
|---|---|
| 1 (highest) | Command-line args (`--server.port=8081`) |
| 2 | `SPRING_APPLICATION_JSON` |
| 3 | OS environment variables (`SERVER_PORT`, `DB_PASSWORD`) |
| 4 | `application-{profile}.yml` |
| 5 | `application.yml` |
| 6 (lowest) | Defaults in code (`:default` values) |

Key insight: **environment variables override files**, so the same jar runs in dev, staging, prod with zero code changes. Spring relaxed binding: `APP_JWT_SECRET` ↔ `app.jwt.secret`.

## Profile-specific files

```bash
java -jar app.jar --spring.profiles.active=prod
# loads application.yml + application-prod.yml
```

```yaml
# application-dev.yml
spring:
  datasource:
    url: jdbc:h2:mem:devdb

# application-prod.yml
spring:
  datasource:
    url: jdbc:postgresql://prod-db:5432/payments
```

## Typed properties: @ConfigurationProperties

The org standard for your own settings — a typed, validated record:

```java
@ConfigurationProperties(prefix = "app")
public record AppProperties(Jwt jwt, Cors cors) {
    public record Jwt(String secret, long expirationSeconds) {}
    public record Cors(List<String> allowedOrigins) {}
}
```

```java
@Configuration
@EnableConfigurationProperties(AppProperties.class)   // or @ConfigurationPropertiesScan on the app class
public class AppConfig {
    // inject AppProperties anywhere
}
```

Benefits over `@Value`: one class per config group, validation (`@Validated` + constraints), IDE completion, and easy unit tests.

## Secrets

- **Never** commit secrets; use env vars or a secrets manager (Vault, cloud KMS).
- `@Value("${...}")` with a wrong key fails fast at startup — good.
- Spring relaxed binding handles prefixes (`SPRING_DATASOURCE_PASSWORD`).

> **Why it matters (organizational view)** — Config-as-code (in the repo) + secrets-as-environment (in the platform) is the standard that lets the same artifact promote through environments safely. The review rules: no hardcoded credentials, typed `@ConfigurationProperties` for custom groups, profiles per environment, and documentation of every non-obvious property.

## Key takeaways

- yml for defaults, env vars for overrides, args for one-offs.
- Profile files segment environments; keep the artifact identical.
- Typed `@ConfigurationProperties` records over scattered `@Value`.
- Secrets live outside the repo, always.

**Official docs:** [Externalized configuration](https://docs.spring.io/spring-boot/reference/features/external-config.html) · [Type-safe properties](https://docs.spring.io/spring-boot/reference/features/external-config.html#features.external-config.typesafe-configuration-properties)
