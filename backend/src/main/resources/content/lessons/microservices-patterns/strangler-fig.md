---
title: Strangler Fig Pattern — Migrating Legacy Systems Safely
summary: How to replace a monolith piece by piece without a risky big-bang rewrite — the pattern that lets you migrate production systems with zero downtime.
order: 4
minutes: 22
topics: [strangler fig, legacy migration, big-bang rewrite, gradual migration, feature toggle, anti-corruption layer]
docs:
  - https://martinfowler.com/bliki/StranglerFigApplication.html
  - https://microservices.io/patterns/migration/strangler-fig.html
---

# Strangler Fig Pattern — Migrating Legacy Systems Safely

## What is the Strangler Fig Pattern? (From Zero)

In nature, a strangler fig grows around a tree, slowly replacing it until the original tree dies and the fig stands on its own. In software, the pattern works the same way: you **gradually replace parts of a legacy system** with new services, one piece at a time, until the old system has nothing left to do and can be decommissioned.

### Why Not a Big-Bang Rewrite?

The "rewrite from scratch" approach sounds appealing but has a terrible track record:

| Big-Bang Rewrite | Strangler Fig |
|---|---|
| Months/years of work before ANY value | Each migration delivers value immediately |
| High risk — if it fails, you've wasted everything | Low risk — if a migration fails, roll back just that piece |
| "While we're at it, let's also..." (scope creep) | Focused — migrate one thing well |
| Users stuck on old system until launch | Users get new features as they're migrated |
| The "second system effect" — overengineering | Pragmatic — you learn from the old system |

**Martin Fowler's rule:** "The only thing a big-bang rewrite guarantees is a big-bang!"

---

## How It Works — The Architecture

```
                    ┌──────────────┐
                    │   API Gateway │
                    │   (Router)    │
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              │                         │
     ┌────────▼────────┐    ┌──────────▼──────────┐
     │  New Service(s) │    │  Legacy Monolith     │
     │  (e.g., Orders) │    │  (still running)     │
     └─────────────────┘    └─────────────────────┘
```

The key is the **API Gateway/Router** that decides which requests go to the new service and which go to the old monolith. Over time, you migrate more routes until the monolith has zero routes and can be shut down.

---

## The Code — Line by Line

### Step 1: The Route Migration Config

```java
@Configuration
public class StranglerRouteConfig {

    // Feature toggle: which routes are migrated?
    @Value("${strangler.routes.migrated:orders,payments}")
    private Set<String> migratedRoutes;

    @Bean
    public RouteLocator customRouting(RouteLocatorBuilder builder) {
        return builder.routes()
            // MIGRATED: goes to the new Orders microservice
            .route("orders-api", r -> r
                .path("/api/orders/**")                          // Match order requests
                .filters(f -> f.rewritePath("/api/orders/(?<seg>.*)", "/orders/${seg}"))
                .uri("http://orders-service:8081"))              // Forward to new service

            // NOT YET MIGRATED: goes to the legacy monolith
            .route("legacy-default", r -> r
                .path("/**")                                     // Catch everything else
                .uri("http://legacy-monolith:8080"))             // Forward to old system
            .build();
    }
}
```

**Line-by-line explained:**
- `migratedRoutes` — A config-driven list of which domain areas have been migrated. This is your "progress tracker."
- `.path("/api/orders/**")` — Any request matching this path goes to the new Orders service.
- `.uri("http://orders-service:8081")` — The new microservice handles these requests.
- `.path("/**")` — The catch-all sends unmigrated requests to the legacy monolith.
- **The migration is just config changes** — no code deployments needed to shift traffic.

### Step 2: The Anti-Corruption Layer (ACL)

When the new service needs data from the legacy system during migration, you use an ACL to translate between the old and new models:

```java
@Service
public class LegacyUserACL {
    private final WebClient legacyClient;     // Talks to the old monolith

    // The new Orders service needs user info, but Users haven't been migrated yet
    public Optional<UserDTO> getUser(String userId) {
        try {
            // Call the legacy system's internal API
            LegacyUser legacy = legacyClient.get()
                .uri("/internal/users/{id}", userId)
                .retrieve()
                .bodyToMono(LegacyUser.class)
                .block(Duration.ofSeconds(2));    // Timeout — don't let legacy slowness cascade

            // TRANSLATE: old model → new model
            return Optional.of(new UserDTO(
                legacy.getId(),
                legacy.getFirstName() + " " + legacy.getLastName(),  // Old had separate fields
                legacy.getEmailAddr(),                                // Different field name
                Instant.ofEpochMilli(legacy.getCreatedTimestamp())    // Different time format
            ));
        } catch (Exception e) {
            log.warn("Legacy user lookup failed for {}: {}", userId, e.getMessage());
            return Optional.empty();   // Graceful degradation
        }
    }
}
```

**Line-by-line explained:**
- `LegacyUserACL` — The name says it all: this is an Anti-Corruption Layer. It prevents the new service from being polluted by legacy data models.
- `legacyClient.get().uri("/internal/users/{id}", userId)` — Calls the legacy monolith's internal API. This is temporary — once Users are migrated, this call disappears.
- The translation block converts old models to new models — separate name fields become a single name, timestamps change formats, etc.
- `Duration.ofSeconds(2)` — Critical: always timeout legacy calls. If the monolith is slow, you don't want the new service to cascade.

### Step 3: Data Migration (Dual Write → Cutover)

```java
@Service
public class OrderMigrationService {

    // During migration: write to BOTH old and new systems
    @Transactional
    public Order createOrder(OrderRequest request) {
        // 1. Create in the new system
        Order newOrder = orderRepository.save(new Order(request));

        // 2. Also write to legacy (dual write — temporary!)
        legacyOrderClient.post()
            .uri("/api/orders")
            .bodyValue(toLegacyOrder(newOrder))
            .retrieve()
            .bodyToMono(Void.class)
            .timeout(Duration.ofSeconds(5))
            .retry(3)
            .subscribe();      // Fire-and-forget with retries

        return newOrder;
    }

    // After cutover: reads from new system, legacy is decommissioned
    @Scheduled(cron = "0 0 3 * * ?")   // Daily verification
    public void verifyMigration() {
        long legacyCount = legacyOrderClient.get()
            .uri("/api/orders/count")
            .retrieve()
            .bodyToMono(Long.class)
            .block();

        long newCount = orderRepository.count();

        if (legacyCount != newCount) {
            log.error("Migration drift! Legacy: {}, New: {}", legacyCount, newCount);
            alertService.send("Order migration count mismatch");
        }
    }
}
```

**Line-by-line explained:**
- Dual write is **temporary** — during migration, writes go to both systems. This ensures no data loss during the transition.
- The legacy write has timeout + retry — if the old system is down, the new system still works (best-effort dual write).
- `verifyMigration()` runs daily to catch any drift between the two systems during the migration window.

---

## Real-World Scenarios

### Scenario 1: Migrating User Authentication

```
Month 1: New login page → routes to new Auth service → legacy handles everything else
Month 2: Profile page → routes to new User service
Month 3: Permissions → routes to new AuthZ service
Month 4: Legacy auth code has no callers → remove it
```

### Scenario 2: Database Migration

```sql
-- Phase 1: New service reads from BOTH databases
SELECT * FROM new_orders WHERE id = ?    -- Try new first
-- If not found:
SELECT * FROM legacy_orders WHERE id = ? -- Fall back to old

-- Phase 2: Dual write (write to both)
-- Phase 3: Backfill legacy data into new DB
-- Phase 4: New service reads only from new DB
-- Phase 5: Drop legacy tables
```

### Scenario 3: Payment System Migration

Old payment system handles credit cards and PayPal. You want to migrate credit cards first:

```
Router: /api/payments/credit-card/* → new Payment Service
Router: /api/payments/paypal/*     → legacy Monolith
Router: /api/payments/**           → legacy Monolith (catch-all)
```

After credit cards are migrated, migrate PayPal the same way. Then the legacy payment code has no callers and can be removed.

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Big-bang rewrite | Months of work, high risk, no intermediate value | Use strangler: migrate one route at a time |
| Skipping the ACL | New services inherit legacy data model cruft | Always translate between old and new models |
| No dual-write phase | Data is lost during cutover | Write to both systems temporarily, verify with reconciliation |
| Leaving dual-write forever | Performance overhead, two systems to maintain | Set a cutover date, migrate data, decommission |
| No monitoring during migration | Drift between old and new goes unnoticed | Daily reconciliation checks + dashboards |
| Migrating everything at once | Too many changes, can't isolate failures | Migrate one bounded context at a time |

---

## Key Takeaways

- **Strangler fig = gradual migration** — replace the monolith piece by piece, route by route.
- **The router/gateway** controls which requests go where — migration is just config changes.
- **Anti-Corruption Layer (ACL)** translates between old and new models — keeps new services clean.
- **Dual write temporarily** during migration, then verify with reconciliation before cutting over.
- **One bounded context at a time** — don't try to migrate everything simultaneously.

Official docs: [Strangler Fig (Fowler)](https://martinfowler.com/bliki/StranglerFigApplication.html) · [Strangler Fig (microservices.io)](https://microservices.io/patterns/migration/strangler-fig.html)
