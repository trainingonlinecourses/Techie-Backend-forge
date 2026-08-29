---
title: Spring Boot 3 & Java 21 — The Modern Stack
summary: Virtual threads, records and pattern matching with Spring, Docker Compose support, Problem Details, and the modernization checklist orgs follow.
order: 23
minutes: 18
topics: [spring-boot-3, java-21, virtual-threads, records, docker-compose, problem-details, modernization]
docs:
  - https://docs.spring.io/spring-boot/reference/upgrading.html
  - https://docs.spring.io/spring-boot/reference/features/spring-application.html
---

# Spring Boot 3 & Java 21 — The Modern Stack

## The concept: the baseline for new builds

Spring Boot 3.x (jakarta namespace, Java 17+) and Java 21 (the current LTS) together define the modern backend baseline. For organizations, the combination is not just "newer" — it changes *how* code is written: less boilerplate, cheaper concurrency, and cleaner configuration. The features teams actually adopt:

## Virtual threads — the concurrency change

Java 21's **virtual threads** are lightweight threads that let a service handle **thousands of concurrent blocking I/O operations** with a handful of platform threads:

```java
// Classic: one platform thread per request — a thread pool limits concurrency
// With virtual threads: thread-per-request WITHOUT the pool ceiling

// Spring Boot 3.2+ — one property enables virtual threads for MVC:
spring.threads.virtual.enabled=true
```

**Why it matters:** a blocking call (DB, HTTP client) no longer consumes a scarce platform thread. Under I/O-bound load, virtual-thread apps sustain far higher concurrency than a fixed pool. The trade-offs to know:

- Virtual threads are for **blocking I/O** — CPU-bound work doesn't benefit.
- **ThreadLocal misuse** leaks (a virtual thread is *reused* after its task completes, so a ThreadLocal set without removal can leak to the next task) — Spring Security propagates context deliberately; be careful with your own ThreadLocals.
- Pinning (a virtual thread holding a monitor blocks a platform thread) reduces the benefit in `synchronized`-heavy code; modern code prefers `ReentrantLock`.

## Records, pattern matching, switch expressions — less boilerplate

Java 21 + Spring Boot 3 make **records the default DTO/domain-value type**:

```java
@RestController
public class OrderController {
    @PostMapping("/api/orders")
    public OrderCreated create(@Valid @RequestBody CreateOrderRequest request) {
        // CreateOrderRequest is a record — Jackson maps JSON, Bean Validation validates components
        ...
    }
}

public record CreateOrderRequest(@NotBlank String customerId,
                                 @NotNull @Min(1) BigDecimal amount,
                                 String note) { }
```

And **pattern matching** cleans up instanceof chains (e.g., in exception handlers and event listeners):

```java
if (obj instanceof Order order && order.status().equals("PAID")) { ... }
// switch expressions over sealed types give exhaustive, checked dispatch:
return switch (event) {
    case PaymentEvent p -> handlePayment(p);
    case RefundEvent r -> handleRefund(r);
};
```

Spring's own code accepts records naturally: `@ConfigurationProperties` with constructor binding, repository projections, event payloads.

## Docker Compose support — dev infrastructure as code

Boot 3.1+ has first-class **Docker Compose integration**:

```yaml
# compose.yaml at the project root
services:
  postgres:
    image: postgres:16
    environment: { POSTGRES_DB: app, POSTGRES_PASSWORD: dev }
    ports: ["5432:5432"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
```

```properties
spring.docker.compose.enabled=true
# Spring Boot starts the services on boot and maps their properties
# (spring.datasource.url etc.) automatically for local dev
```

Developers get a one-command reproducible stack (`docker compose up` or just run the app), and CI can use the same compose file. This is the pattern that replaced hand-written local setup scripts in most modern teams.

## Problem Details, observability, and the rest of the checklist

- **RFC 9457 Problem Details** (`spring.mvc.problemdetails.enabled=true`) — standardized error bodies (see the error-handling lesson).
- **Micrometer Tracing** — `micrometer-tracing-bridge-otel` + `@Observed` gives distributed traces with minimal code.
- **Graceful shutdown**, **AOT/native**, **DevTools** — all covered in their own lessons.
- **Jakarta namespace** — `javax.*` → `jakarta.*` is the breaking change in 3.x; migration tooling (`spring-boot-properties-migrator`) catches old property names.

## How we use it in an organization: the modernization checklist

1. **Run on Java 21 LTS** — the baseline; static analysis (SpotBugs/Error Prone) updated to the language level.
2. **Records for DTOs/values** — new code uses records; legacy classes migrate opportunistically.
3. **Virtual threads for I/O-bound services** — enable per service after load-testing; watch ThreadLocals and pinned monitors.
4. **Docker Compose for dev parity** — same stack in dev and CI.
5. **Problem Details + standardized errors** — one error contract across services.
6. **Observability via Micrometer** — metrics, tracing, and the custom endpoints from the Actuator lesson.

## Pitfalls

- **Virtual threads are not free** — CPU-bound work, `synchronized` hot spots, and ThreadLocal leaks negate the benefit. Load-test before and after.
- **Records are immutable** — they don't fit mutable JPA entities (which need setters); use records at the API/domain-value boundary, not as entities.
- **Compose auto-config requires the service on the classpath** — add `spring-boot-docker-compose` (Boot 3.1+ auto-includes it); a compose file that references a service without the matching starter just won't wire.
- **Migrating from Boot 2** — jakarta namespace, property renames, and security defaults changed; run the migrator and upgrade incrementally, not in one giant diff.
- **Switch-pattern exhaustiveness** — adding a new subtype to a sealed hierarchy breaks exhaustive switches at compile time — by design, but be ready for the compiler's demands.

## Key takeaways

- Boot 3 + Java 21 is the modern baseline: virtual threads, records, pattern matching, Compose support, Problem Details.
- Virtual threads raise I/O concurrency — enable deliberately and watch ThreadLocal/pinning issues.
- Records + constructor binding replace DTO boilerplate; sealed types + switch give exhaustive dispatch.
- Docker Compose integration gives reproducible dev/CI stacks.
- Modernize incrementally: migrate namespace/properties first, then adopt features per service.
