---
title: Distributed Transactions and the Outbox
module: spring-transactions-deep
order: 4
minutes: 28
topics: ["2PC", "XA", "saga", "outbox pattern", "eventual consistency", "transactional outbox"]
docs:
  - title: "Spring transaction management"
    url: "https://docs.spring.io/spring-framework/reference/data-access/transaction/transaction-strategies.html"
---

# Distributed Transactions and the Outbox

A transaction spanning two databases, or a database plus a message broker, cannot use a single ACID transaction. This lesson covers why 2PC/XA mostly failed in practice, the patterns that replaced it (outbox, saga), and how to build them with Spring.

## The Problem: Two Systems, One Operation

```java
// This CANNOT be one ACID transaction:
@Transactional
public void placeOrder(OrderDto dto) {
    orderRepository.save(toEntity(dto));     // DB 1
    paymentService.charge(dto.amount());     // HTTP call to payments service
    kafkaTemplate.send("orders", event);     // message broker
}
```

Three systems, one logical operation. If the Kafka send fails after the DB commit, you have an order with no event — and no way to roll back the committed row.

## 2PC/XA: The Classic (and Why It Failed)

**Two-Phase Commit**: a coordinator asks all participants to *prepare* (write intent), then *commit* (all or nothing).

```
Coordinator → Prepare to DB1, DB2, Broker
              all say "prepared"
Coordinator → Commit to all
```

Why it failed in practice:

| Problem | Detail |
|---------|--------|
| **Availability** | One participant down → the whole tx blocks |
| **Lock duration** | Prepared-but-uncommitted locks held for minutes |
| **Coordinator crash** | In-doubt transactions — neither committed nor rolled back |
| **Broker support** | Kafka has no XA; HTTP has none |
| **Latency** | Multiple round-trips per operation |

Java's `JtaTransactionManager` + `@Transactional(transactionManager = "jtaTx")` still exists for legacy XA, but modern distributed systems deliberately avoid it.

## The Outbox Pattern: Local Atomicity + Reliable Delivery

The insight: **the DB write and the "message" live in the SAME local transaction** — an outbox table:

```
┌─────────────────────────────────────────┐
│ LOCAL TRANSACTION (one DB)              │
│  INSERT INTO orders ...                 │
│  INSERT INTO outbox (payload, status)   │
└─────────────────────────────────────────┘
        │ (commit — both are atomic)
        ▼
   Outbox Relay (poller or CDC)
        │
        ▼
   Kafka / RabbitMQ / HTTP (at-least-once)
```

```java
@Entity
public class OutboxEvent {
    @Id private UUID id;
    private String aggregateType;
    private Long aggregateId;
    private String eventType;
    @Lob private String payload;      // JSON
    private Instant createdAt;
    private Instant publishedAt;      // null = pending
}
```

```java
@Transactional
public void placeOrder(OrderDto dto) {
    Order order = orderRepository.save(toEntity(dto));
    outboxRepository.save(OutboxEvent.of("order", order.getId(),
        "ORDER_PLACED", json(eventFrom(order))));
    // COMMIT: order + outbox row are atomic
}
```

**The guarantee**: either the order AND the event both exist, or neither does. No half-states.

## The Outbox Relay

```java
@Component
public class OutboxRelay {

    private final OutboxRepository outboxRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;

    @Scheduled(fixedDelay = 2000)          // poll every 2s
    @Transactional
    public void publishPending() {
        List<OutboxEvent> pending = outboxRepository
            .findTop100ByPublishedAtIsNullOrderByCreatedAt();

        for (OutboxEvent event : pending) {
            // claim first (prevent double-send across nodes)
            int claimed = outboxRepository.markPublishing(event.getId());
            if (claimed == 0) continue;

            kafkaTemplate.send("domain-events",
                event.getAggregateType(), event.getPayload()).get(5, TimeUnit.SECONDS);
            event.setPublishedAt(Instant.now());     // same tx as the claim?
        }
    }
}
```

**The ordering trap**: the relay itself has a mini distributed transaction (DB claim + broker send). The robust pattern is **claim → send → mark-published** with retry and idempotency:

- Claim atomically (`UPDATE ... SET status='SENDING' WHERE id=? AND status='PENDING'`)
- Send to the broker (at-least-once; broker dedup by event id)
- Mark published in a *new* transaction — if the app crashes between send and mark, the relay resends → consumers must be idempotent (dedup by event id)

## Debezium: CDC Instead of Polling

Instead of polling the outbox table, **stream the DB's own transaction log**:

```
Postgres WAL ──▶ Debezium (CDC) ──▶ Kafka "orders.outbox"
```

- Reads the WAL — captures commits the moment they happen
- No polling latency, no relay code, no second transaction
- The outbox table still exists (as the source), the relay is replaced by the connector

Setup: `debezium-connector-postgres` with a table filter on `outbox_events`, and the `tombstone.on.delete=false` option to keep events.

## The Saga Pattern: Choreography

For multi-service workflows, the saga compensates instead of rolling back:

```
Order Service: create order (pending)
  ↓ event: ORDER_CREATED
Payment Service: charge (commit)          → on failure: ORDER_CANCELLED
  ↓ event: PAYMENT_SUCCEEDED
Inventory Service: reserve (commit)       → on failure: REFUND (compensate)
  ↓ event: INVENTORY_RESERVED
Shipment Service: ship (commit)           → on failure: UNRESERVE + REFUND
```

```java
// Choreography: each service reacts to events and emits the next
@Component
public class OrderSaga {

    @TransactionalEventListener(phase = AFTER_COMMIT)
    public void onOrderCreated(OrderCreated e) {
        paymentClient.charge(e.orderId());      // if fails → emits OrderCancelled
    }

    @TransactionalEventListener(phase = AFTER_COMMIT)
    public void onPaymentFailed(PaymentFailed e) {
        orderService.cancel(e.orderId());       // compensation
    }
}
```

**Key principle**: every step commits independently; failures trigger **compensating actions** (refund, cancel, unreserve) — not rollback.

## The Decision Framework

| Situation | Pattern |
|-----------|---------|
| One DB + one broker | **Outbox** — local tx + relay |
| Multiple services, need workflow | **Saga** (choreography or orchestration) |
| Legacy XA systems | JTA (rarely worth it) |
| Single DB, single service | Plain @Transactional — done |

## The Outbox vs. Direct Send

```java
// ❌ Direct send: event lost if the broker is down after commit
@Transactional
public void placeOrder(OrderDto dto) {
    orderRepository.save(toEntity(dto));
    kafkaTemplate.send("orders", event);   // NOT part of the tx!
}

// ✅ Outbox: event survives as a row, relay delivers later
@Transactional
public void placeOrder(OrderDto dto) {
    orderRepository.save(toEntity(dto));
    outboxRepository.save(OutboxEvent.of(...));   // atomic with the order
}
```

## Testing the Outbox

```java
@SpringBootTest
@Testcontainers
class OutboxTest {

    @Autowired OrderService orderService;
    @Autowired OutboxRepository outboxRepository;
    @Autowired OutboxRelay relay;

    @Test
    void orderAndOutboxRowCommitAtomically() {
        orderService.placeOrder(dto);

        assertEquals(1, outboxRepository.countByPublishedAtIsNull());
        // and if the outbox insert failed, the order insert rolls back too
    }

    @Test
    void relayPublishesAndMarks() {
        orderService.placeOrder(dto);
        relay.publishPending();

        assertEquals(0, outboxRepository.countByPublishedAtIsNull());  // drained
    }
}
```

## Summary

| Concern | Pattern |
|---------|---------|
| DB + broker atomicity | Transactional outbox (local tx + relay) |
| Low-latency delivery | Debezium CDC on the outbox table |
| Multi-service workflows | Saga with compensating actions |
| Exactly-once | At-least-once delivery + idempotent consumers |
| Legacy | 2PC/XA — avoid for new systems |

Distributed transactions aren't about making the impossible possible — they're about **making partial failure safe**: the outbox makes the DB+broker boundary atomic, sagas make multi-service failures recoverable, and idempotency makes retries harmless. Every pattern trades global atomicity for reliability + eventual consistency, which is the right trade in distributed systems.
