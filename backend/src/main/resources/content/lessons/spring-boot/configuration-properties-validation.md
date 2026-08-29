---
title: @ConfigurationProperties Validation — Failing Fast on Bad Config
summary: Typed binding vs @Value, validation with jakarta annotations, nested properties, and why validated config prevents silent misconfig in prod.
order: 18
minutes: 17
topics: [configurationproperties, validation, binding, nested-properties, fail-fast, config-errors]
docs:
  - https://docs.spring.io/spring-boot/reference/features/external-config.html#features.external-config.typesafe-configuration-properties
  - https://docs.spring.io/spring-boot/reference/features/validation.html
---

# @ConfigurationProperties Validation — Failing Fast on Bad Config

## The concept: typed, validated, fail-fast configuration

`@Value("${app.payments.timeout}")` is fine for one-off values, but it has three production problems:

1. **No typing** — everything is a `String` until parsed; a typo yields a runtime parse error deep in the request path.
2. **No grouping** — related settings (`app.payments.*`) are scattered as separate `@Value` fields across classes.
3. **No validation** — a missing or malformed value is discovered only when the code *uses* it, often in production.

`@ConfigurationProperties` solves all three: bind a **whole group** of properties to a **typed, validated** object at startup. If a value is missing, wrong-typed, or fails validation, the application **fails to start** — the misconfiguration surfaces in the deploy, not in the first customer request.

```java
@Component
@ConfigurationProperties(prefix = "app.payments")
@Validated
public class PaymentProperties {
    @NotBlank
    private String provider;               // app.payments.provider — required, non-empty

    @Min(1) @Max(60)
    private int timeoutSeconds = 30;       // app.payments.timeout-seconds — bounded

    @Valid
    private Retry retry = new Retry();     // nested group

    // getters/setters (required for binding) ...

    public static class Retry {
        @Min(0) @Max(10)
        private int maxAttempts = 3;
        @Min(100) @Max(60_000)
        private long backoffMs = 500;
        // getters/setters ...
    }
}
```

With `@Validated` + `jakarta.validation` constraints, startup fails if `provider` is blank or `timeout-seconds` is out of range — with a clear message naming the property, instead of a mid-request `NullPointerException`.

## Binding rules: the parts that surprise people

- **Relaxed binding:** `timeoutSeconds` (camelCase) binds to `app.payments.timeout-seconds`, `APP_PAYMENTS_TIMEOUT_SECONDS` (env), or `app.payments.timeoutSeconds`. You write Java names; ops writes env-style names.
- **Requires setters (or constructor binding).** Classic binding needs a default constructor + setters. **Constructor binding** (preferred, immutable) uses `@ConfigurationProperties` + `@ConstructorBinding` with a single constructor and `final` fields — no setters, immutable config, and it plays with records:
- **Nested groups** need `@Valid` on the field to validate recursively — without it, only the top level is checked.
- **Lists and maps bind naturally** from `app.payments.allowed-methods[0]=CARD` style properties or YAML lists.

## How we use it in an organization: the scenarios

**Scenario 1 — immutable config with constructor binding (modern standard):**

```java
@ConfigurationProperties(prefix = "app.integrations")
public record IntegrationProps(
    String baseUrl,
    @Min(1) @Max(30) int connectTimeoutSeconds,
    List<String> allowedIpRanges
) {}
```

Records + constructor binding give typed, immutable config with validation, no boilerplate. The record is registered as a bean via `@EnableConfigurationProperties(IntegrationProps.class)` or `@ConfigurationPropertiesScan`.

**Scenario 2 — secrets stay out of the class, config comes from env.** The class declares the shape; the values come from the environment (deployment env vars, secret manager). Validation ensures the *shape* is right before anything runs:

```properties
# application.properties — defaults for local dev
app.integrations.connect-timeout-seconds=5

# prod env vars (set at deploy time, not in git)
APP_INTEGRATIONS_BASE_URL=https://payments.internal
```

**Scenario 3 — JSR-380 custom constraint for cross-field rules.** Bean Validation annotations cover single fields; a custom constraint handles relationships (e.g., backoff must be smaller than the overall timeout):

```java
@Target({ElementType.TYPE}) @Retention(RUNTIME)
@Constraint(validatedBy = TimeoutConsistencyValidator.class)
public @interface ConsistentTimeouts { String message() default "backoff must be < timeout"; }
```

**Scenario 4 — test overrides.** `@SpringBootTest(properties = "app.payments.provider=stub")` supplies test values; with validation, a wrong test value fails the test context instead of silently testing the wrong thing.

## Pitfalls

- **Validation only runs at startup** — it protects against bad *static* config, not runtime changes (config-server refreshes, feature flags). Refresh-scoped config needs its own validation path.
- **`@Value` and `@ConfigurationProperties` don't mix for the same key** — pick one; mixing leads to confusion about which source wins.
- **A missing setter silently binds nothing** — the field stays at its default and the app starts (validation catches required ones, but a non-validated optional field can silently default). Enable `debug=true` or use the configuration-properties metadata to verify binding.
- **Don't validate with business rules** — validation is for *shape* (present, in range); business invariants belong in domain logic.
- **Constructor binding with records** requires the properties class be *registered* (via `@EnableConfigurationProperties` or scan), not `@Component`-scanned with setters.

## Key takeaways

- `@ConfigurationProperties` gives typed, grouped, validated config that fails fast at startup.
- Constructor binding + records = immutable, boilerplate-free config.
- Relaxed binding means Java names ↔ env-style names work without translation.
- `@Valid` on nested groups for recursive validation; custom constraints for cross-field rules.
- Validation guards static config — runtime toggles need their own checks.
