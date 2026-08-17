---
title: Configuration Properties — Typed, Bound Configuration
module: spring-boot-internals
order: 4
minutes: 25
topics: ["@ConfigurationProperties", "property binding", "relaxed binding", "validation", "profiles"]
docs:
  - title: "Configuration properties (Spring Boot docs)"
    url: "https://docs.spring.io/spring-boot/reference/features/external-config.html#features.external-config.typesafe-configuration-properties"
---

# Configuration Properties — Typed, Bound Configuration

## The Concept: From Scattered Properties to a Typed Object

The naive way to read configuration in Spring is `@Value`:

```java
@Service
class EmailService {

    @Value("${mail.host}")       private String host;
    @Value("${mail.port}")       private int port;
    @Value("${mail.username}")   private String username;
    @Value("${mail.password}")   private String password;
    @Value("${mail.tls}")        private boolean tls;
    @Value("${mail.timeout}")    private Duration timeout;

    void send() { /* use the five fields */ }
}
```

Problems:

- Every field is a separate `@Value` — scattered, typo-prone (a wrong key fails *at runtime*, silently defaulting or erroring).
- No type safety beyond simple conversions.
- Validation is manual.
- The config isn't reusable across services (another service needing `mail.*` duplicates the annotations).

**`@ConfigurationProperties`** binds a *namespace* of properties into one **typed, immutable-friendly object**:

```java
@ConfigurationProperties(prefix = "mail")
public class MailProperties {
    private String host;
    private int port = 25;              // defaults in code
    private String username;
    private String password;
    private boolean tls = true;
    private Duration timeout = Duration.ofSeconds(10);
    // getters & setters (or Java records in Boot 3)
}
```

Then inject the whole thing:

```java
@Service
class EmailService {
    private final MailProperties props;

    EmailService(MailProperties props) { this.props = props; }   // one dependency, typed
}
```

## Relaxed Binding — "mail.host" Means Many Things

Spring's **relaxed binding** accepts several spellings for the same property, all mapping to `host`:

```
mail.host=...
mail.host=...            (canonical)
MAIL_HOST=...            (env var style)
mail.host=...            (kebab-case, the recommended default)
```

This is why environment variables work without extra config: `MAIL_HOST=smtp.example.com` binds to `MailProperties.host` automatically. **Kebab-case in properties files** (`mail.host`, `mail.smtp-timeout`) is the convention; camelCase fields in Java.

## The Code Walkthrough

```java
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

@Component
@ConfigurationProperties(prefix = "mail")
@Validated                      // turn on validation for this binding
public class MailProperties {

    @NotBlank
    private String host;                    // required — binding fails if missing

    @Min(1) @Max(65535)
    private int port = 25;

    @Email
    private String from;                    // must look like an email

    private boolean tls = true;
    private Duration timeout = Duration.ofSeconds(10);
    private List<String> allowedDomains = List.of();   // collections bind too

    // ---- nested objects ----
    private final Retry retry = new Retry();   // mail.retry.max-attempts, mail.retry.delay

    public static class Retry {
        private int maxAttempts = 3;
        private Duration delay = Duration.ofSeconds(1);
        // getters/setters...
    }

    // getters & setters for every field...
}
```

```properties
# application.properties
mail.host=smtp.example.com
mail.port=587
mail.from=academy@example.com
mail.tls=true
mail.timeout=5s
mail.retry.max-attempts=5
mail.retry.delay=2s
mail.allowed-domains=example.com,example.org
```

### Walking Through Each Part

**`@ConfigurationProperties(prefix = "mail")`** — binds every property under `mail.*` to this object's fields. The class can be a `@Component` (scanned) or registered via `@EnableConfigurationProperties(MailProperties.class)` (recommended for library/framework-style code).

**Validation** — with `@Validated` + Jakarta validation annotations, Boot *fails startup* with a clear message if `mail.host` is missing or `mail.port` is out of range. Configuration errors surface at boot, not at first use — a huge win over `@Value` typos.

**Defaults in code** — `port = 25`, `tls = true`, `timeout = ...`: unset properties fall back to these. You can even ship a config with zero `mail.*` keys and it still works (as long as required fields have defaults or validation passes).

**Nested objects** — `mail.retry.max-attempts` binds into the nested `Retry` object. `Duration` and `List<String>` bind with automatic conversion (`5s` → `Duration.ofSeconds(5)`, comma list → `List`).

**Records (Boot 3+)** — with constructor binding, you can make the properties a **record** — immutable configuration:

```java
@ConfigurationProperties(prefix = "mail")
public record MailProperties(
        String host,
        int port,
        String from,
        boolean tls,
        Duration timeout) {}
```

Bind via `@EnableConfigurationProperties` and constructor injection; no setters needed. Records make config objects immutable and trivially testable.

## The Metadata Magic (IDE Support)

Add the `spring-boot-configuration-processor` dependency and your IDE gets **completion, docs, and type hints** for *your* properties in `application.properties` — same as for Spring's built-ins. It also powers the actuator's `configprops` endpoint.

## Properties vs Profiles vs Env — The Precedence

Spring resolves a property from the highest-priority source first. From highest to lowest (roughly):

1. Command-line args (`--mail.host=x`)
2. OS environment variables (`MAIL_HOST`)
3. Java system properties
4. `application-{profile}.properties` (profile-specific)
5. `application.properties` (base)
6. Defaults in code

This chain is why the same jar runs locally, in tests, and in production: **code has defaults, files have overrides, env vars rule in the cloud**. Profile-specific files (`application-prod.properties`) layer on top of the base.

## Common Beginner Pitfalls

1. **`@Value` for everything** — fine for a single value, but a namespace of related settings belongs in `@ConfigurationProperties`.
2. **Typos in property keys** — with plain `@Value`, a wrong key silently defaults (or NPEs at first use); with `@ConfigurationProperties` + validation it fails fast.
3. **Forgetting validation** — `@ConfigurationProperties` without `@Validated` ignores your constraints.
4. **No `@EnableConfigurationProperties`/`@Component`** — the class is never registered, and properties silently do nothing.
5. **Setter-less classes** — binding needs setters (or constructor binding via records); a getter-only class throws `BindingException` at startup.
6. **Expecting `@Value`-style single defaults to work in records** — record components with defaults need `@DefaultValue` or you handle them in the record's compact constructor.

## Key Takeaways

- `@ConfigurationProperties(prefix=...)` binds a property namespace into a typed object.
- Relaxed binding: `mail.host`, `mail.host`, `MAIL_HOST` all work.
- Validation + `@Validated` fails startup on bad config — errors early, not at first use.
- Nested objects, collections, and `Duration` bind automatically.
- Prefer records (constructor binding) for immutable configuration objects.
- Defaults live in code; files override; env vars rule in production.
