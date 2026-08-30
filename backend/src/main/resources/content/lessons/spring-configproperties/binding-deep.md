---
title: @ConfigurationProperties Deep Dive — Type-Safe Configuration Binding
summary: Advanced @ConfigurationProperties patterns: nested properties, constructor binding, @DefaultValue, validation, prefix aliases, relaxed binding rules, and configuration profiles.
order: 2
minutes: 28
topics: ["constructor binding", "nested properties", "validation", "relaxed binding", "defaultValue", "profile-specific config"]
docs:
  - url: "https://docs.spring.io/spring-boot/reference/features/configuration-properties.html"
    title: "Type-Safe Configuration"
---

## The Concept, From Zero

Spring Boot's `@ConfigurationProperties` is the official way to bind `application.yml` values to Java objects with full type safety, IDE completion, and validation. This lesson covers the advanced patterns you need in production.

---

## Constructor Binding (Recommended)

Instead of setters, use constructors for immutable configuration:

```java
@ConfigurationProperties(prefix = "app.payment")
public record PaymentProperties(
    String gateway,
    String apiKey,
    @DefaultValue("USD") String defaultCurrency,
    @DefaultValue("30") int timeoutSeconds,
    @DefaultValue("true") boolean enableRetries,
    List<String> supportedCurrencies,
    RetryProperties retry,
    Map<String, GatewayConfig> gateways
) {
    /**
     * Records auto-generate the constructor.
     * @DefaultValue provides fallback values.
     * Relaxed binding: "api-key" in YAML → apiKey in Java.
     */
    public record RetryProperties(
        @DefaultValue("3") int maxAttempts,
        @DefaultValue("1000") long backoffMs
    ) {}

    public record GatewayConfig(
        String url,
        String apiKey,
        @DefaultValue("5000") int timeoutMs
    ) {}
}
```

```yaml
app:
  payment:
    gateway: stripe
    api-key: sk_test_abc123
    default-currency: EUR
    supported-currencies:
      - USD
      - EUR
      - GBP
    retry:
      max-attempts: 5
      backoff-ms: 2000
    gateways:
      stripe:
        url: https://api.stripe.com
        api-key: sk_test_stripe
        timeout-ms: 3000
      paypal:
        url: https://api.paypal.com
        api-key: AYax...abc
        timeout-ms: 5000
```

### Line-by-Line Breakdown

```java
@ConfigurationProperties(prefix = "app.payment")
```
- The `prefix` maps to `app.payment.*` in YAML. All properties under this prefix bind to this record.

```java
@DefaultValue("USD") String defaultCurrency
```
- If `app.payment.default-currency` is not set in YAML, the value defaults to `"USD"`.

```java
RetryProperties retry
```
- **Nested binding**: `app.payment.retry.*` maps to a `RetryProperties` record. Spring Boot automatically binds nested objects.

```java
Map<String, GatewayConfig> gateways
```
- **Map binding**: `app.payment.gateways.stripe.*` becomes a map entry with key `"stripe"` and value `GatewayConfig`.

---

## Constructor Binding with @ConstructorBinding

For classes (not records):

```java
@ConfigurationProperties(prefix = "app.redis")
@ConstructorBinding
public class RedisProperties {

    private final String host;
    private final int port;
    private final Duration timeout;
    private final Pool pool;

    public RedisProperties(
            String host,
            @DefaultValue("6379") int port,
            @DefaultValue("2s") Duration timeout,
            Pool pool) {
        this.host = host;
        this.port = port;
        this.timeout = timeout;
        this.pool = pool;
    }

    // Getters only — no setters (immutable!)
    public String getHost() { return host; }
    public int getPort() { return port; }
    public Duration getTimeout() { return timeout; }
    public Pool getPool() { return pool; }

    public record Pool(
        @DefaultValue("10") int maxActive,
        @DefaultValue("5") int maxIdle,
        @DefaultValue("0") int minIdle
    ) {}
}
```

```yaml
app:
  redis:
    host: redis.example.com
    timeout: 5s
    pool:
      max-active: 20
```

---

## Validation

Add `@Validated` and Jakarta Bean Validation constraints:

```java
@ConfigurationProperties(prefix = "app.email")
@Validated
public record EmailProperties(
    @NotBlank String smtpHost,
    @Min(1) @Max(65535) int smtpPort,
    @Email String fromAddress,
    @Min(1) @Max(100) int maxRecipients,
    @NotBlank String apiKey
) {}
```

```yaml
app:
  email:
    smtp-host: smtp.gmail.com
    smtp-port: 587
    from-address: noreply@example.com
    max-recipients: 50
    api-key: sg_abc123
```

If validation fails at startup, Spring Boot throws `MethodValidationException` with clear error messages.

---

## Relaxed Binding Rules

Spring Boot automatically maps YAML kebab-case to Java camelCase:

| YAML Property | Java Field |
|--------------|------------|
| `app.payment.api-key` | `apiKey` |
| `app.payment.max-retries` | `maxRetries` |
| `app.payment.enable-ssl` | `enableSsl` |
| `APP_PAYMENT_API_KEY` | `apiKey` (env var) |
| `app.payment.ApiKey` | `apiKey` (any casing) |

This means the same Java class works with any of these YAML styles:
```yaml
# All three are equivalent:
app.payment:
  api-key: abc123       # kebab-case (recommended)
  apiKey: abc123        # camelCase
  Api-Key: abc123       # PascalCase

# Or as environment variables:
APP_PAYMENT_API_KEY=abc123
```

---

## Common Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| Using `@Value` for structured config | No type safety, no IDE hints | Use `@ConfigurationProperties` |
| Mutable properties with setters | Thread safety issues in production | Use records or `@ConstructorBinding` |
| Forgetting `@Validated` | Invalid config silently accepted | Add `@Validated` + constraint annotations |
| Using `@Component` instead of `@EnableConfigurationProperties` | Less control over activation | Use `@EnableConfigurationProperties` on a `@Configuration` class |
| Deep nesting (>3 levels) | Configuration becomes hard to understand | Flatten: use dot-separated property names |
