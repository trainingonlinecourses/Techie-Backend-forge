---
title: Microservices in Production — Data, Security & Testing
summary: Data consistency (outbox, saga, idempotency), inter-service auth, testing distributed systems, and anti-patterns.
order: 7
minutes: 20
topics: [data-consistency, outbox, saga, testing, inter-service-security]
docs:
  - https://microservices.io/patterns/data/transactional-outbox.html
  - https://docs.spring.io/spring-cloud-reference/reference/
---

# Microservices in Production — Data, Security & Testing

## The hard part: data consistency

A monolith updates the database in one transaction. A microservice can't: the customer and the invoice live in different services, often different databases. The three standard answers:

### 1. Outbox pattern (the default for "must not lose the event")

Write the side effect **in the same transaction** as the state change, then a relay publishes it:

```java
@Transactional
public void createOrder(Order order) {
    orders.save(order);                                             // 1. business state
    outbox.save(new OutboxEvent("order.created", order.getId()));   // 2. event, SAME tx
}
// OutboxRelay (polling or CDC) publishes committed events to Kafka and marks them sent
```

If the process crashes between save and publish, the un-published row is still in the outbox — nothing is lost. This is the pattern that makes "exactly-once-ish" event delivery achievable in practice.

### 2. Saga (for multi-service business flows)

A saga is a sequence of local transactions with **compensating actions**:

```
OrderService: create order (tx) ──▶ PaymentService: charge (tx)
                                          │ failure
                                          ▼
OrderService: cancel order (compensating tx) ◀── PaymentService: refund (compensation)
```

Choreographed (each service publishes events, next acts) or orchestrated (a coordinator service drives steps). Rules: every step has a compensating step; every step is idempotent.

### 3. Idempotency everywhere

Network retries mean the same message can arrive twice. Every mutating endpoint/service must be idempotent:

```java
if (transfers.existsByIdempotencyKey(key)) throw new DuplicateTransferException(key);
// or: unique constraint on the key, retries return the original result
```

## Inter-service security

| Layer | Standard |
|---|---|
| **Edge** | Gateway validates the user JWT, propagates identity via headers |
| **Inter-service** | Propagate the token downstream (`Authorization` passthrough) or issue scoped service tokens |
| **Service-to-service trust** | Network policy (only gateway + peers reach services), mTLS in prod |
| **Authorization** | Each service still checks its own `@PreAuthorize` — never trust the gateway alone |

```java
@FeignClient(name = "inventory-service", configuration = TokenForwardConfig.class)
public interface InventoryClient { ... }

// Forward the inbound Authorization header with the request:
@Bean
RequestInterceptor tokenForwarding() {
    return template -> {
        String token = SecurityContextHolder.getContext() != null
            ? currentToken() : null;
        if (token != null) template.header("Authorization", "Bearer " + token);
    };
}
```

## Testing a distributed system

| Level | What | Tools |
|---|---|---|
| Unit | Services with mocked clients | JUnit + Mockito |
| **Contract** | Service A's expectations vs B's responses | Spring Cloud Contract / Pact |
| Integration | One service + real broker/db | `@SpringBootTest`, Testcontainers, EmbeddedKafka |
| End-to-end | The whole stack | Testcontainers network or docker-compose in CI |

Contract tests are the microservices-specific discipline: they pin the API between teams so a breaking change fails in CI, not in prod.

```java
// Spring Cloud Contract example (consumer side)
@SpringBootTest
class InventoryContractTest {
    @Test
    void shouldReturnStock() {
        assertThat(new ContractVerifier().verify(
                request -> http.get("/api/inventory/sku-1"),
                response -> response.statusCode(200).body("stock", equalTo(10))))
            .isTrue();
    }
}
```

## Deployment & the operational baseline

- **Containerize everything**: one image per service, `:8080` inside, health probes (`/actuator/health`).
- **Orchestrate**: Kubernetes (k8s) is the default; Eureka often yields to k8s DNS in production — Spring Cloud Kubernetes supports both (discovery + config from k8s).
- **Per-service config**: config server (or k8s ConfigMaps) — never build-time env injection per instance.
- **Observability baseline**: every service ships health, metrics, structured logs with trace ids, and tracing (see the tracing lesson).
- **CI**: build + test + contract tests + image scan per service; deploy via GitOps.

## The microservices anti-patterns (what orgs learn the hard way)

| Anti-pattern | Fix |
|---|---|
| **Distributed monolith** | Services sharing one database → split by ownership or stay a monolith |
| **Chatty calls** | N+1 HTTP calls between services → coarse-grained APIs, batch endpoints, caching |
| **Sync call chains** | A→B→C→D in the request path → async/events where possible |
| **No fallbacks** | One dead service kills the UI → resilience defaults + graceful degradation |
| **Greenfield rewrite** | Rewriting a working monolith "to microservices" → extract services incrementally |
| **Version-less contracts** | Clients breaking on deploy → contract tests + API versioning |

> **Why it matters (organizational view)** — Microservices succeed or fail on *discipline*, not technology. The org baseline: outbox for every event, sagas with compensations for multi-step flows, idempotency on every mutation, contract tests between teams, edge+service security, and the observability triad. Teams that skip these get the distributed-system tax without the benefits.

## Key takeaways

- Data consistency: outbox (default), saga (multi-step flows), idempotency (always).
- Authenticate at the edge, propagate identity, authorize in every service.
- Contract tests pin the API between teams; Testcontainers for integration.
- Containerize + k8s + health probes + observability per service.
- Watch the anti-patterns: distributed monolith, chatty calls, sync chains.

**Official docs:** [Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html) · [Spring Cloud reference](https://docs.spring.io/spring-cloud-reference/reference/)
