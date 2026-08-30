---
title: Configuration Best Practices — Designing for Operability
module: spring-configuration
order: 5
minutes: 24
topics: ["config design", "secrets management", "12-factor", "fail-fast", "documentation"]
docs:
  - title: "The Twelve-Factor App — Config"
    url: "https://12factor.net/config"
summary: Every config decision you make shapes how your app behaves in production — and whether your ops team (or future you) can operate it. Bad config des...
---

# Configuration Best Practices — Designing for Operability

## The Concept: Configuration Is a Product, Not an Afterthought

Every config decision you make shapes how your app behaves in production — and whether your ops team (or future you) can operate it. Bad config design looks like:

- A `Settings.java` class with 40 `static final String` constants baked into the code.
- Secrets committed "temporarily" (which means forever).
- Property names nobody can discover or document.
- An app that starts with wrong values and fails *hours later* instead of at boot.

Good config design is boring, deliberate, and follows a few durable rules. This lesson collects them into a checklist you can apply to any service.

## The Rules, With Code

### 1. Everything that varies per environment is a property — nothing else

```java
// BAD — environment-specific values hardcoded
class Config {
    static final String DB_URL = "jdbc:postgresql://localhost:5432/academy";
    static final String API_KEY = "sk-live-xxxxxxxx";
    static final int MAX_RETRIES = 3;
}

// GOOD — externalized, with defaults only for non-secrets
// application.yml:
//   app:
//     db-url: ${DB_URL:jdbc:postgresql://localhost:5432/academy}
//     api-key: ${API_KEY}          # NO default — fail fast if missing
//     max-retries: 3
```

The test: *"would this value change if I deployed to another environment?"* If yes, it's a property.

### 2. Secrets fail fast when missing

```java
// BAD — secret defaults let misconfig slip through
private final String apiKey = "dev-key-placeholder";     // goes to prod as-is!

// GOOD — no default: startup fails with a clear error if unset
//   app.api-key: ${API_KEY}
```

A secret with a default is a **silent security hole** — the app starts with the placeholder and "works" until it hits the real API and gets 401s. Require secrets via a placeholder with **no default** so boot fails loudly in an environment that forgot to provide them.

### 3. Group related settings into `@ConfigurationProperties`

```java
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        String dbUrl,          // app.db-url
        String apiKey,         // app.api-key
        int maxRetries,        // app.max-retries
        Duration timeout,      // app.timeout
        List<String> admins) {}   // app.admins
```

One typed object per *domain* (mail, datasource, ai, retry) — not one class per property, not 50 `@Value`s scattered. Validation (`@Validated`, `@NotBlank`, `@Min`) turns bad config into a startup error.

### 4. Document your properties

The `spring-boot-configuration-processor` dependency generates metadata from `@ConfigurationProperties` — your IDE then autocompletes and documents *your* keys exactly like Spring's built-ins, and actuator's `/actuator/configprops` exposes them for ops. Every property should also carry a comment in the YAML:

```yaml
app:
  max-retries: 3        # how many times to retry transient failures
  timeout: 10s          # read timeout for the AI provider
```

### 5. Use the Environment hierarchy, don't fight it

```yaml
# Base: defaults
app:
  feature-x: false

---
# Prod: override via env, never via editing files in production
spring:
  config:
    activate:
      on-profile: prod
app:
  feature-x: true
```

Production overrides come from **env vars** (platform secret managers), not from editing files on the server. The 12-factor "config in the environment" rule exists because env vars are: uniform across languages, easy to audit, and never accidentally committed.

### 6. Fail fast — validate at startup

```java
// Use a startup validator so misconfiguration never reaches users:
@ConfigurationProperties(prefix = "app")
@Validated
public record AppProperties(
        @NotBlank String dbUrl,
        @NotBlank String apiKey,
        @Min(1) int maxRetries) {}
```

Boot validation + `@Validated` = the app **refuses to start** with invalid config. A 10-second startup failure is a gift compared to a 2 AM outage from a bad value discovered at runtime.

## The Operability Checklist

Before you call config "done", verify:

- [ ] Every env-varying value is externalized (no hardcoded URLs/keys/flags).
- [ ] Secrets have **no defaults** and come from env/secret manager.
- [ ] Related settings are grouped in `@ConfigurationProperties` (typed, validated).
- [ ] Properties are documented (comments + configuration-processor metadata).
- [ ] Startup fails fast on missing/invalid config (validation on).
- [ ] No secrets in committed files (audit `git log -p` for the past).
- [ ] `/actuator/env` can show the *origin* of any value (debuggability).
- [ ] Profile files contain no secrets — only structure and non-secret overrides.

## Debugging Config in Production

| Symptom | Tool |
|---|---|
| "Why is this value X?" | `/actuator/env` — shows value + origin source |
| "Where did this property come from?" | `/actuator/env` origin field |
| "Which profiles are active?" | `/actuator/env` `spring.profiles.active` or log line at startup |
| "Is my bean bound correctly?" | `/actuator/configprops` — shows bound `@ConfigurationProperties` |
| "What changed between deploys?" | Config-as-code review: diff the env var changes in the platform |

## Common Beginner Pitfalls

1. **Secrets in code "temporarily"** — they're in Git history forever. Use env vars from day one.
2. **`@Value` sprawl** — 30 `@Value` fields instead of a typed `@ConfigurationProperties` object; the object wins for namespaces.
3. **Config validated only at first use** — a missing key discovered at 3 AM during a request. Validate at startup.
4. **Editing files on the server** — immutable infra: rebuild with new config, never ssh-edit.
5. **One giant `application.yml`** — split by domain or profile; a 2,000-line config file is unreadable.
6. **Not auditing config changes** — config is code; review it in PRs, log env-var changes in the platform.

## Key Takeaways

- Config varies per environment — externalize it; secrets especially (no defaults, env vars only).
- `@ConfigurationProperties` + validation = typed, documented, fail-fast config.
- Defaults in code/files; overrides from env; profiles for environment shape.
- Fail at startup, not at first request — validation is the safety net.
- `/actuator/env` and `/actuator/configprops` are the production debuggers.
- Config is code: document it, review it, treat it with the same rigor.
