---
title: YAML Configuration — Structured and Readable
module: spring-configuration
order: 3
minutes: 22
topics: ["YAML", "application.yml", "structured config", "lists and maps", "multi-document"]
summary: application.properties is a flat list of key=value lines. As config grows, that gets repetitive and hard to group:
docs:
  - title: "YAML configuration (Spring Boot docs)"
    url: "https://docs.spring.io/spring-boot/reference/features/external-config.html#features.external-config.files"
---

# YAML Configuration — Structured and Readable

## The Concept: Properties with Structure

`application.properties` is a flat list of `key=value` lines. As config grows, that gets repetitive and hard to group:

```properties
mail.host=smtp.example.com
mail.port=587
mail.tls=true
mail.retry.max-attempts=5
mail.retry.delay=2s
```

**YAML** (`application.yml`) expresses the same config with **nesting** — the structure mirrors the object it binds to:

```yaml
mail:
  host: smtp.example.com
  port: 587
  tls: true
  retry:
    max-attempts: 5
    delay: 2s
```

Same data, but the hierarchy is *visible*. Reading it, you immediately see `retry` belongs to `mail`. This is why YAML is the default choice for Spring Boot config with any depth (and for Docker Compose, Kubernetes manifests, GitHub Actions...).

## YAML Syntax Essentials

| Feature | YAML | Notes |
|---|---|---|
| Nested objects | Indentation (2 spaces) | `mail:` then indented keys |
| Lists | `- item` | A `-` before each element |
| Maps of maps | Nested indentation | e.g., datasource per profile |
| Multi-line strings | `\|` block, `>` folded | For long text |
| Comments | `#` | Document intent |
| Multi-document | `---` separators | Multiple YAML docs in one file |

**The indentation rule is the whole game**: YAML is whitespace-sensitive. Wrong indentation = wrong structure or parse errors. Spring's YAML parser is lenient about *unknown keys* (they're ignored) but strict about *syntax*.

## The Code Walkthrough

```yaml
# application.yml
spring:
  application:
    name: backendforge-academy
  datasource:
    url: jdbc:postgresql://localhost:5432/academy
    username: ${DB_USER:academy}       # placeholder with default
    password: ${DB_PASSWORD}           # from env, required
    hikari:
      maximum-pool-size: 10

server:
  port: 8080

app:
  features:
    - name: ai-tutor
      enabled: true
    - name: progress-tracking
      enabled: true
    - name: certificates
      enabled: false
  admin-emails:
    - admin@example.com
    - ops@example.com
```

```java
// ---- Bind the structured config to a typed object ----
@Component
@ConfigurationProperties(prefix = "app")
public class AppFeatures {

    private List<Feature> features = List.of();
    private List<String> adminEmails = List.of();

    public static class Feature {
        private String name;
        private boolean enabled;
        // getters & setters...
    }
    // getters & setters...
}
```

### Walking Through Each Part

**Nested binding** — the YAML tree `app.features[].name` binds directly to the `@ConfigurationProperties` structure: `features` is a list of objects with `name` and `enabled` fields. The YAML shape *is* the object shape — that's the payoff of YAML over flat properties for structured data.

**Placeholders** — `${DB_USER:academy}` resolves `DB_USER` from the environment with `academy` as the default; `${DB_PASSWORD}` (no default) fails startup if missing. Same placeholder machinery as properties — YAML is just a different *file format*, the resolution model is identical.

**Lists** — `admin-emails` (a list of strings) and `features` (a list of objects) both bind to `List` fields. Relaxed binding maps `admin-emails` → `adminEmails`.

## Multi-Document YAML — Profiles in One File

A single `application.yml` can hold **multiple documents** separated by `---`, each tied to a profile:

```yaml
spring:
  datasource:
    url: jdbc:h2:mem:academy        # default (no profile) — dev-friendly

---
spring:
  config:
    activate:
      on-profile: prod
  datasource:
    url: jdbc:postgresql://${DB_HOST}/academy
```

The first document is the default; the second activates only when the `prod` profile is active. This keeps *all* environment config in one file (small apps) — for larger setups, separate `application-prod.yml` files scale better.

## YAML vs Properties — Choosing

| | application.yml | application.properties |
|---|---|---|
| Structure | Nested, readable for deep config | Flat, simple for a few keys |
| Lists/maps | Natural | Clumsy (`list[0]=x`) |
| Whitespace | Sensitive — errors if wrong | None |
| Multi-line strings | Native | Awkward |
| When to prefer | Deep config, structured data, profiles in one file | Minimal config, generated files, environments without YAML tooling |

Both formats are equivalent to Spring — **choose one per project and be consistent**. Note: if both `application.properties` and `application.yml` exist, properties wins (higher precedence) — a classic "why isn't my YAML working?" gotcha.

## Common Beginner Pitfalls

1. **Tab characters** — YAML forbids tabs for indentation; use spaces (2 or 4, consistent).
2. **Wrong indentation silently** — Spring ignores *unknown* keys, so a mis-indented key may bind to nothing without error. Check `/actuator/env` or log the bound object.
3. **Both `application.properties` and `application.yml`** — properties silently wins; delete one.
4. **Quoting strings that look like numbers** — `port: 8080` is fine, but a string like `version: 3.4.1` parses as... a string here (multi-dot), while `mode: on` can parse as boolean. Quote when in doubt: `mode: "on"`.
5. **Multi-doc without `spring.config.activate.on-profile`** — a second document with no profile activation merges into the base (surprising behavior); always scope it.
6. **Secrets in committed YAML** — same rule as properties: env vars for secrets, `${VAR}` placeholders in YAML.

## Key Takeaways

- YAML expresses config as a nested structure that mirrors your `@ConfigurationProperties` objects.
- Lists (`- item`), nested maps, and multi-document (`---`) profiles are the power features.
- Placeholders (`${ENV_VAR:default}`) work identically to properties.
- Indentation is the syntax — spaces, never tabs; wrong indentation binds to nothing.
- YAML and properties are interchangeable to Spring; pick one, stay consistent.
- Same secret rules apply: `${VAR}` placeholders, never committed credentials.
