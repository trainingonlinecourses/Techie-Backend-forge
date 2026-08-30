---
title: Profiles — Environment-Specific Behavior
module: spring-configuration
order: 2
minutes: 24
topics: ["@Profile", "profiles", "environment-specific config", "active profiles", "conditional beans"]
summary: Dev, test, staging, production — each environment wants slightly different behavior: dev uses an inmemory H2 database and fake email; production us...
docs:
  - title: "Profiles (Spring Boot docs)"
    url: "https://docs.spring.io/spring-boot/reference/features/profiles.html"
---

# Profiles — Environment-Specific Behavior

## The Concept: One App, Several Personas

Dev, test, staging, production — each environment wants slightly *different behavior*: dev uses an in-memory H2 database and fake email; production uses Postgres and real email. You don't want four codebases — you want **one app that knows which environment it's in** and activates the matching behavior.

**Profiles** are named sets of configuration and beans. The app activates one or more profiles (e.g., `prod`), and:

- Profile-specific properties files load (`application-prod.properties`).
- Beans annotated `@Profile("prod")` register; others don't.
- `@Configuration` classes can be profile-scoped too.

The canonical example: a fake vs real payment gateway.

## How Profiles Are Activated

```bash
# Command line (highest precedence):
java -jar app.jar --spring.profiles.active=prod

# Environment variable (platforms use this):
SPRING_PROFILES_ACTIVE=prod

# In application.properties (a default, overridable):
spring.profiles.default=dev
```

Platforms like Render/Railway set `SPRING_PROFILES_ACTIVE` as an env var on the service — that's how the same jar becomes "prod" in the cloud.

## The Code Walkthrough

```java
// ---- 1. Profile-specific properties ----
// application-dev.properties:
spring.datasource.url=jdbc:h2:mem:academy
app.email.enabled=false

// application-prod.properties:
spring.datasource.url=jdbc:postgresql://${DB_HOST}/academy
app.email.enabled=true

// ---- 2. Profile-scoped beans ----
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

// Fake emailer — used only in dev/test
@Service
@Profile("dev")
public class FakeEmailService implements EmailService {
    public void send(String to, String body) {
        System.out.println("[FAKE] would email " + to + ": " + body);
    }
}

// Real emailer — used in prod
@Service
@Profile("prod")
public class SmtpEmailService implements EmailService {
    public void send(String to, String body) { /* real SMTP */ }
}

// ---- 3. Profile logic in @Configuration ----
@Configuration
public class DataSourceConfig {

    @Bean
    @Profile("dev")
    public DataSource h2DataSource() {
        return new HikariDataSource();      // in-memory
    }

    @Bean
    @Profile("prod")
    public DataSource postgresDataSource() {
        return new HikariDataSource();      // from env vars
    }
}
```

### Walking Through Each Part

**Profile-specific properties** — `application-{profile}.properties` layers over the base file. With `prod` active: `spring.datasource.url` comes from the prod file (or env), `app.email.enabled=true` turns on real email. The base file holds common settings; profiles override.

**Profile-scoped beans** — exactly one `EmailService` implementation is registered, depending on the active profile. Both classes exist in the jar; only the matching one becomes a bean. If *no* profile matched (or two matched), Spring fails at startup with an ambiguous-bean error — a clear signal you misconfigured.

**Profile logic in `@Configuration`** — same idea at the bean-definition level: the `@Profile("prod")` bean method only registers its bean when prod is active.

## The Default Profile and "Either/Or" Gotchas

- **`spring.profiles.default=dev`** — if nothing is active, `dev` becomes active. This is why a fresh checkout behaves like dev.
- **A profile is active or not** — there's no "else" syntax. The pattern for "dev OR test but not prod" is `@Profile({"dev", "test"})`.
- **Negative matching** — `@Profile("!prod")` registers the bean in *every* environment except prod. Useful for a fallback:

```java
@Service
@Profile("!prod")
public class ConsoleNotifier implements Notifier { ... }   // anything not prod
```

## Grouping and Inheritance

**Profile groups** (Boot) let one profile imply others:

```properties
# application.properties
spring.profiles.group.prod=postgres,email-smtp,logging-prod
```

Activating `prod` activates the whole group — a tidy way to compose environment behavior from reusable pieces instead of one giant profile.

**Profile-specific files and groups** combine with the externalized-config ladder: env var `SPRING_PROFILES_ACTIVE` has higher precedence than `spring.profiles.default`, so the platform's choice wins.

## Testing with Profiles

```java
@SpringBootTest
@ActiveProfiles("test")          // activates the test profile for the whole test
class UserServiceTest { ... }

// Or per-test:
@Test
@ActiveProfiles("dev")
void devBehavior() { ... }
```

`@ActiveProfiles` is how tests pick their environment — test DB, test mocks, faster config — without touching the real profiles.

## Common Beginner Pitfalls

1. **Two beans match the active profile** — ambiguous injection at startup. Fix: make profiles mutually exclusive or use `@Primary`.
2. **Forgetting `spring.profiles.default`** — on a fresh machine with no profile set, profile-scoped beans may all be absent → `NoSuchBeanDefinitionException`.
3. **Secrets inside profile files committed to Git** — `application-prod.properties` with real passwords is a leak; use env vars for secrets even in prod files.
4. **`@Profile` on a class that should always exist** — if a bean is needed in every environment, don't profile it.
5. **Profile names with dashes/case sensitivity** — `@Profile("PROD")` vs `"prod"` must match exactly; keep them lowercase and consistent.
6. **Changing profiles at runtime** — profiles are fixed at startup (mostly); you don't flip prod↔dev mid-flight.

## Key Takeaways

- Profiles = named configurations + bean sets activated by environment.
- Activate via `SPRING_PROFILES_ACTIVE` env var, `--spring.profiles.active=`, or `spring.profiles.default`.
- `application-{profile}.properties` layers over the base file.
- `@Profile("prod")` / `@Profile("dev")` scope beans and configurations.
- Use groups to compose reusable profile pieces; `!prod` for fallbacks.
- `@ActiveProfiles` in tests picks the environment per test.
- The same jar + different profiles = dev, test, and prod behavior from one build.
