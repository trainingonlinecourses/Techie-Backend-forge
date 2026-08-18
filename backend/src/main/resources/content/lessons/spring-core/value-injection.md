---
title: @Value Injection — Property Placeholders and SpEL in Fields
summary: ${...} vs #{...}, defaults, constructor injection of values, and the scenarios where @Value is right and where @ConfigurationProperties is better.
order: 20
minutes: 18
topics: [value, placeholder, spel, property-injection, defaults, constructor-injection]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/value-annotations.html
  - https://docs.spring.io/spring-boot/reference/features/external-config.html
---

# @Value Injection — Property Placeholders and SpEL in Fields

## The concept: two expression languages in one annotation

`@Value` injects a value from the environment — and it accepts **two different syntaxes**:

- **`${...}` — property placeholder:** resolved from the `Environment` (properties files, env vars, profiles). `@Value("${app.db.url}")` looks up `app.db.url` through the property-source precedence chain.
- **`#{...}` — SpEL expression:** evaluated by the Spring Expression Language — can call beans, methods, and compute values. `@Value("#{systemProperties['user.home']}")` or `@Value("#{cache.maxSize}")`.

They compose: `${...}` can appear *inside* a SpEL string. Most code uses `${...}` for config and `#{...}` for computed/bean-derived values.

## The essentials: defaults and types

```java
@Service
public class EmailSender {
    @Value("${app.mail.host}")                    // required — startup fails if missing
    private String host;

    @Value("${app.mail.port:587}")                // default 587 if property absent
    private int port;

    @Value("${app.features.beta:false}")          // boolean default
    private boolean betaEnabled;

    @Value("${app.retry.max:3}")                  // numeric default
    private int maxRetries;

    @Value("#{${app.retry.max:3} * 1000}")        // SpEL arithmetic on a property
    private long backoffMs;
}
```

Spring converts the string to the field type (int, boolean, `Duration` via `@Value("${x:PT5S}")` with `@DurationUnit` or Boot's binding, enums). A missing property **without a default** fails startup with a clear `Could not resolve placeholder` — the fail-fast behavior teams rely on.

## Constructor injection of values — the modern form

Field `@Value` is convenient but hides dependencies (same critique as field injection). The modern pattern — especially with records — is constructor injection:

```java
@Service
public class Mailer {
    private final String host;
    private final int port;

    public Mailer(@Value("${app.mail.host}") String host,
                  @Value("${app.mail.port:587}") int port) {
        this.host = host;
        this.port = port;
    }
}
```

Immutable `final` fields, testable constructor, no hidden wiring. Record-based config properties with `@ConfigurationProperties` go one step further and drop the `@Value` boilerplate entirely (see the configuration-properties lesson).

## How we use it in an organization: the scenarios

**Scenario 1 — wiring env-specific values into a component.** The deployment sets env vars; the code reads them via `@Value`:

```java
@Value("${cloud.region:us-east-1}")
private String region;
// locally defaults to us-east-1; in prod the env var CLOUD_REGION wins
```

**Scenario 2 — SpEL for bean-derived values.** A value computed from another bean:

```java
@Value("#{threadPoolCoreSize}")                  // a bean property
private int poolSize;

@Value("#{T(java.util.concurrent.TimeUnit).SECONDS.toMillis(30)}")
private long timeoutMs;                          // static-method SpEL
```

**Scenario 3 — test overrides.** `@SpringBootTest(properties = "app.mail.host=localhost:2525")` overrides the `@Value` resolution for tests — the property source stack handles it without touching prod config.

## @Value vs @ConfigurationProperties — the decision

| | `@Value` | `@ConfigurationProperties` |
|---|---|---|
| Best for | A single value here and there | A group of related settings |
| Typing | String→field conversion | Strongly typed, validated |
| Binding names | Literal key | Relaxed binding (`db-url` ↔ `dbUrl`) |
| Validation | Manual | `@Validated` + Bean Validation |
| IDE/refactor | Strings — no refactoring safety | Metadata + typed access |

**Org rule:** `@Value` for one-off values (a flag, a URL, a timeout); `@ConfigurationProperties` for groups (all payment settings, all cache settings) where type-safety and validation pay off. Mixing both for the same group is a review smell.

## Pitfalls

- **Typos are silent without defaults** — a wrong key yields `null` (field injection) or a startup failure (missing placeholder with no default). Prefer constructor injection so the missing value surfaces at construction.
- **`@Value` on a static field doesn't work** (unless via a setter); use instance fields or constructor params.
- **SpEL `${...}` vs `#{...}` confusion** — `${}` resolves properties (string lookup), `#{}` evaluates expressions. Writing `#{app.foo}` looks for a *bean* named `app`, not a property — a common error.
- **Placeholder resolution order** — `@Value` resolves against the Environment; a property defined only in a test profile won't appear in prod. Know your precedence chain.
- **Secrets via @Value are still config** — same rules as any config: read from env/secret stores, never commit values.

## Key takeaways

- `${...}` resolves properties through the Environment; `#{...}` evaluates SpEL.
- Use defaults (`${key:default}`) for optional values; required keys fail fast at startup.
- Prefer constructor injection for testable, immutable wiring.
- `@Value` for one-offs; `@ConfigurationProperties` for typed, validated groups.
- Mind the `${}` vs `#{}` distinction and property-source precedence.
