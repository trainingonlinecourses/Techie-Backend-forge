---
title: ApplicationRunner & CommandLineRunner — Startup Work After Context Load
summary: Running code after the context starts, the difference between the two runner interfaces, ordering, and the startup-job scenarios teams use them for.
order: 12
minutes: 16
topics: [applicationrunner, commandlinerunner, startup-tasks, data-seeding, warmup, exit-codes]
docs:
  - https://docs.spring.io/spring-boot/reference/features/spring-application.html#features.spring-application.command-line-runners
---

# ApplicationRunner & CommandLineRunner — Startup Work After Context Load

## The concept: what runs after the context is ready

When a Spring Boot app starts, `SpringApplication.run()` does three phases:

1. Create and refresh the `ApplicationContext` (beans wired, ready to use).
2. Call **`ApplicationRunner`/`CommandLineRunner` beans** — code that runs *after* the context is fully ready.
3. Call `ApplicationRunner`/`CommandLineRunner` for `ApplicationContext` events and, finally, the app "starts" and the port opens.

The runners are the intended place for **startup work that needs the full context**: seeding data, warming caches, registering schedulers, checking external dependencies. The two interfaces differ only in how they receive arguments:

- **`CommandLineRunner`** — raw `String[]` args, exactly as on the command line: `--app.db.url=x`.
- **`ApplicationRunner`** — a typed `ApplicationArguments`: `getOptionNames()`, `getOptionValues(name)`, `getNonOptionArgs()`.

Prefer `ApplicationRunner` — parsing raw args is error-prone, and `ApplicationArguments` handles `--key=value` and `--key value` uniformly.

## How we use it in an organization: the scenarios

**Scenario 1 — seed reference data on first boot.** A runner that populates lookup tables only when they're empty (idempotent, so redeploys don't duplicate):

```java
@Component
public class ReferenceDataSeeder implements ApplicationRunner {
    private final CountryRepository countries;
    private final CurrencyRepository currencies;

    public ReferenceDataSeeder(CountryRepository countries, CurrencyRepository currencies) {
        this.countries = countries;
        this.currencies = currencies;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (countries.count() == 0) {
            countries.saveAll(ReferenceData.countries());   // only seed empty tables
            log.info("Seeded {} countries", countries.count());
        }
        if (currencies.count() == 0) {
            currencies.saveAll(ReferenceData.currencies());
        }
    }
}
```

The `count() == 0` guard makes it safe across restarts and across the ephemeral-vs-persistent database moves teams do.

**Scenario 2 — warm caches and connections at startup.** Eagerly load the hot reference data so the first user request doesn't pay a cold-cache penalty:

```java
@Component
public class CacheWarmer implements ApplicationRunner {
    private final ProductCache cache;
    private final ProductRepository products;

    @Override
    public void run(ApplicationArguments args) {
        products.findTopFeatured(500).forEach(p -> cache.put(p.id(), p));
        log.info("Warmed product cache with {} entries", cache.size());
    }
}
```

**Scenario 3 — fail-fast health check on boot.** A runner that verifies a critical external dependency and fails the app (via `System.exit(1)`) if it's unreachable — so a misconfigured deployment never serves traffic in a broken state:

```java
@Component
public class ExternalDependencyCheck implements ApplicationRunner {
    @Override
    public void run(ApplicationArguments args) {
        if (!paymentProvider.ping().isHealthy()) {
            log.error("Payment provider unreachable at startup — refusing to start");
            SpringApplication.exit(SpringApplication.run(...), () -> 1); // or throw
            // Simpler: throw new IllegalStateException(...) — the context fails to complete
        }
    }
}
```

**Scenario 4 — data migration step.** A one-time rename/backfill runner, guarded by a flag so it runs exactly once per environment:

```java
@Component
public class BackfillRunner implements ApplicationRunner {
    @Override
    public void run(ApplicationArguments args) {
        if ("true".equals(args.getOptionValues("backfill") != null
                ? args.getFirstOption("backfill") : null)) {
            orderService.backfillMissingTotals();   // --backfill=true on the deploy command
        }
    }
}
```

## Ordering multiple runners

Multiple runners run in unspecified order unless you order them — implement `Ordered` or annotate `@Order`:

```java
@Component @Order(1) public class DependencyCheck implements ApplicationRunner { ... }
@Component @Order(2) public class CacheWarmer implements ApplicationRunner { ... }
@Component @Order(3) public class ReferenceDataSeeder implements ApplicationRunner { ... }
```

Lower order value runs first. Use `@Order` when the sequence matters (check dependencies before warming caches).

## Runners vs the alternatives

- **`@PostConstruct` on a bean** — runs during context refresh, before the context is fully usable; not the place for cross-bean startup work.
- **`ApplicationListener<ApplicationReadyEvent>`** — equivalent to a runner (Spring Boot fires `ApplicationReadyEvent` after runners complete). Use the event if you're already an event listener.
- **`@Scheduled` with an initial delay** — for recurring work, not one-shot startup.
- **Liquibase/Flyway** — for schema migrations; runners are for *data* work, not DDL.

## Pitfalls

- Runners run **before the port opens** — a slow runner delays first traffic. Keep them fast or make them async.
- An exception in a runner **fails the whole startup** — intentional for fail-fast checks, but wrap non-critical work (warmups) in try/catch so a cache failure doesn't kill the app.
- Runners run on **every start**, including tests unless excluded — guard with profiles or `@ConditionalOnProperty`.
- Don't put long-running blocking work (batch jobs) in a runner without considering the startup timeout your orchestrator imposes.

## Key takeaways

- Runners execute after the context is ready — the home for seeding, warmup, and boot checks.
- `ApplicationRunner` with `ApplicationArguments` beats `CommandLineRunner`'s raw `String[]`.
- Use `@Order` when sequence matters; fail fast for critical checks, swallow non-critical warmups.
- Runners delay the port opening — keep them quick and profile-guarded.
