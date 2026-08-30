---
title: Externalized Configuration — One App, Many Environments
module: spring-configuration
order: 1
minutes: 25
topics: ["externalized config", "property sources", "precedence", "env vars", "command line"]
summary: A deployed application is a generic machine: the same jar runs in dev, staging, and production. What differs is configuration — database URLs, API ...
docs:
  - title: "Externalized Configuration (Spring Boot docs)"
    url: "https://docs.spring.io/spring-boot/reference/features/external-config.html"
---

# Externalized Configuration — One App, Many Environments

## The Concept: The Same Jar, Configured Externally

A deployed application is a *generic machine*: the same jar runs in dev, staging, and production. What differs is **configuration** — database URLs, API keys, feature flags, ports. Hardcoding these into the jar is a deployment anti-pattern:

- Secrets in source code leak (Git history is forever).
- Every environment needs a different build — a build matrix from hell.
- Ops can't tune behavior without a redeploy.

**Externalized configuration** means: the application *reads* its settings from the environment at startup, from many possible sources, and never bakes them in. Spring Boot's model is a **property source hierarchy**: a single key (`server.port`, `spring.datasource.url`) can be provided by any source, and the sources have a **fixed precedence** — higher sources win.

## The Precedence Ladder (Highest → Lowest)

| Rank | Source | Example |
|---|---|---|
| 1 | Command-line args | `--server.port=8081` |
| 2 | OS environment variables | `SERVER_PORT=8081` |
| 3 | Java system properties | `-Dserver.port=8081` |
| 4 | Profile-specific files | `application-prod.properties` |
| 5 | Base config file | `application.properties` |
| 6 | Defaults in code | `@ConfigurationProperties` defaults |

The golden rule: **defaults live in code; files provide overrides; environment variables rule in the cloud.** A config key set via env var *silently beats* the same key in `application.properties` — which is exactly how you run one jar everywhere.

## The Code Walkthrough

```java
// application.properties — the base defaults
server.port=8080
app.name=BackendForge
spring.datasource.url=jdbc:postgresql://localhost:5432/academy
```

```java
// Production overrides via environment variables (Render/Railway style):
// SERVER_PORT=8080
// APP_NAME=BackendForge Academy
// SPRING_DATASOURCE_URL=jdbc:postgresql://dpg-xxxx.oregon-postgres.render.com/academy
// DB_PASSWORD=...     (mapped to spring.datasource.password)

@Service
public class AppInfo {

    // A value that may come from any source in the ladder
    @Value("${app.name:BackendForge}")            // default in the expression itself
    private String appName;

    @Value("${spring.datasource.url}")
    private String dbUrl;

    public void describe() {
        System.out.println("App: " + appName + " | DB: " + dbUrl);
    }
}
```

### Walking Through Each Part

**`application.properties`** — the base: dev-friendly defaults (localhost DB, port 8080). Anything not overridden by a higher source uses these.

**Environment variables** — Render/Railway/Vercel-style platforms inject config as env vars. Spring Boot's **relaxed binding** maps `SPRING_DATASOURCE_URL` → property `spring.datasource.url` automatically. So the *same jar* with different env vars runs different environments — no rebuild.

**`@Value("${app.name:BackendForge}")`** — the `${...}` placeholder is resolved from the property sources; the `:default` syntax supplies a fallback if no source defines it. `@Value` is for *single values*; a namespace of related settings belongs in `@ConfigurationProperties` (from the Spring Boot internals module).

## The Three Configuration Files

Spring Boot reads (in order) `application.properties` (or YAML), then `application-{profile}.properties` — profile files *layer over* the base. Plus:

- **`application.properties`** in the classpath — packaged defaults.
- **`application.properties` next to the jar** — external overrides, same file name.
- **`SPRING_CONFIG_LOCATION`/`SPRING_CONFIG_ADDITIONAL_LOCATIONS`** — point at config outside the jar entirely (ops-owned files).

## Secrets — Never in the Jar

The rule for credentials:

1. **Never** put secrets in `application.properties` committed to Git.
2. Provide them via **environment variables** (platforms like Render/Railway have secret managers) or **`SPRING_CONFIG_*` external files**.
3. For local dev, `.env` files loaded by your run tooling (not committed) or Spring's `SPRING_CONFIG_ADDITIONAL_LOCATION=file:.env-local.properties`.
4. **Audit**: the actuator `/env` endpoint can reveal them if exposed — keep actuator endpoints locked down (see the actuator lesson).

## The `/actuator/env` Inspector

With actuator, `GET /actuator/env` shows *every* property and *which source* provided it — the debugging map for "why is my app using this value?":

```
"server.port": {
  "value": 8081,
  "origin": "System Environment Property \"SERVER_PORT\""
}
```

When a value surprises you, this endpoint tells you exactly which source won.

## Common Beginner Pitfalls

1. **Secrets in `application.properties`** — committed to Git, leaked forever. Env vars / secret managers only.
2. **Forgetting precedence** — a value "not working" is often a *higher* source overriding your file. Check `/actuator/env`.
3. **Rebuilding per environment** — if your build changes per env, you've defeated externalization; one jar + env vars.
4. **`@Value` without a default that's actually set** — startup fails with a placeholder error if the key is missing; provide `:default` or use `@ConfigurationProperties` with defaults.
5. **Mismatched key spellings** — relaxed binding is forgiving (kebab, camel, env-style), but a genuinely wrong key silently uses the default; audit with the env endpoint.

## Key Takeaways

- Externalized config = one jar, configured by the environment at startup.
- Precedence ladder: CLI args > env vars > system props > profile files > base file > code defaults.
- Env vars + relaxed binding = cloud-native config for free.
- Secrets live in env vars/secret managers, never in the committed jar.
- `/actuator/env` shows the winning source for any property — the debugging tool.
- Defaults in code; files override; env rules in production.
