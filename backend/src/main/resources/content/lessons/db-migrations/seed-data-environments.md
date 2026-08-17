---
title: Seed Data & Environment Strategy
summary: Reference data, dev fixtures and demo accounts — what belongs in migrations vs application startup, and how to keep environments honest.
order: 4
minutes: 12
topics: [seed data, reference data, environments, dev fixtures, demo accounts]
docs:
  - https://docs.spring.io/spring-boot/reference/how-to/data-initialization.html
---

# Seed Data & Environment Strategy

## Three kinds of "seed data" — three homes

| Kind | Example | Where it belongs |
|---|---|---|
| **Reference data** | countries, currencies, status codes, rate tables | a **migration** (or an idempotent startup loader) — prod needs it too |
| **Demo/dev fixtures** | sample orders, fake users, exercise data | **profile-gated** — dev/test only, never prod |
| **System accounts** | the admin bootstrap account | **idempotent startup seeding** — exists in prod, created once |

The cardinal sin: a migration that inserts *demo* data (it leaks into prod, then a user's real data collides with `user123@example.com`). **Reference data belongs everywhere; fixtures belong nowhere near prod.**

## Reference data as migrations

```sql
-- V2__seed_currencies.sql
INSERT INTO currency (code, name, decimals) VALUES
  ('EUR', 'Euro', 2), ('USD', 'US Dollar', 2), ('JPY', 'Japanese Yen', 0);
```

Because migrations apply once and in order, the reference set is versioned and diff-able — `V7__add_currency_xof.sql` adds a currency the same way a schema change adds a column. The rule: if prod needs it, it's a migration; if only a developer's laptop needs it, it's a fixture.

## Bootstrapping system accounts (idempotent)

The academy's own seeding is the pattern: a `CommandLineRunner` that creates the demo accounts **only if they don't exist**:

```java
@Component
public class DemoDataSeeder implements ApplicationRunner {
    @Override
    public void run(ApplicationArguments args) {
        if (userRepo.findByUsername("admin").isEmpty()) {
            userRepo.save(new User("admin", "admin123", Role.ADMIN));
        }
        if (userRepo.findByUsername("learner").isEmpty()) {
            userRepo.save(new User("learner", "learner123", Role.USER));
        }
    }
}
```

The idempotency is the whole game — **the seeder must survive redeploys without touching user data** (this academy learned that the hard way with module seeding: see the loader's reuse-existing-rows fix). Never `deleteAll` + re-seed in a startup runner — that's a data-loss bug wearing a seeding costume.

## Profile-gated fixtures

```yaml
# application-dev.yml
spring.jpa.properties.hibernate.hbm2ddl.import_files: fixtures.sql   # Hibernate's dev fixture hook
```

```java
@Configuration
@Profile("dev")                          // these beans do not exist outside dev
public class DevFixtures {
    @Bean
    ApplicationRunner devData(UserRepository users, OrderRepository orders) { ... }
}
```

The mechanisms vary (Hibernate import, Liquibase contexts, Spring `@Profile` beans) — the discipline is the same: **fixtures are compiled out of every non-dev environment**, so "it works on my machine with 10,000 orders" can't silently become prod's data set.

## Data per environment — the honest matrix

| Environment | Reference data | Fixtures | Real user data |
|---|---|---|---|
| local dev | migration | rich, random-ish | none |
| CI/test | migration | minimal, deterministic | none |
| staging | migration | production-shaped volume | synthetic |
| production | migration | **none** | real |

**Staging is where prod-shaped volume matters** — a backfill on 3 rows in CI never rehearses the 50M-row problem. Generate staging fixtures programmatically (the pattern: a `@Profile("staging")` generator), sized to prod's order of magnitude.

## The seed-data checklist

1. Reference data → migration (versioned, ordered, applied everywhere).
2. Demo accounts → idempotent startup seeding (guard with `exists` checks).
3. Dev fixtures → profile-gated, deterministic, never in prod.
4. Staging volume → programmatic, prod-shaped.
5. Every environment's data set is **recreatable from migrations + seeds** — the moment a developer must hand-fix a DB to make a feature work, the seed strategy failed.

## Key takeaways

- Reference data is migration material; fixtures are dev-only; system accounts are idempotent seeding.
- Seeders must be idempotent — redeploys never touch user data (no deleteAll-and-reseed).
- Gate fixtures by profile so they cannot leak into prod; make staging prod-shaped.
- If an environment's data isn't recreatable from code, the seed strategy failed.

Official docs: [Boot data initialization](https://docs.spring.io/spring-boot/reference/how-to/data-initialization.html)
