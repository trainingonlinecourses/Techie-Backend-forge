---
title: The Outbox Pattern — Atomic Writes to the Database and the Broker
module: event-driven-architecture
order: 2
minutes: 27
topics: ["outbox pattern", "transactional outbox", "atomicity", "dual write", "event publishing", "reliability"]
summary: When an event must be published because a database row changed, you face the dualwrite problem: two systems (the database and the broker) must both...
docs:
  - title: "The Outbox Pattern (microservices.io)"
    url: "https://microservices.io/patterns/data/transactional-outbox.html"
  - title: "Transactional Outbox (Event-Driven Architecture)"
    url: "https://developer.confluent.io/learn/transactional-outbox/"
---

# The Outbox Pattern — Atomic Writes to the Database and the Broker

## The Concept: The Dual-Write Problem

When an event must be published *because* a database row changed, you face the **dual-write problem**: two systems (the database and the broker) must both change — and you can't do both atomically. Write the DB first, then publish → a crash between them loses the event (a subscriber never learns the order exists). Publish first, then write → a crash or a failed write leaves an event for something that never happened. Neither order is atomic, and the retry attempts make it worse (publish twice → duplicate events).

**The mental model:** you must mail a letter (publish the event) at the exact moment you update the register (save the order). But the mailbox and the register are on opposite sides of town (separate systems). Any sequence — register then mailbox, mailbox then register — has a window where a disaster (crash) leaves them inconsistent. The **outbox pattern** solves it with a trick: **put the letter in a tray next to the register** — the event is written *in the same transaction* as the order — and a dedicated courier (the relay) delivers tray letters to the mailbox afterward.

## The Pattern in Action

**1. The outbox table** — events are written in the *same database transaction* as the business change:

```java
@Transactional
public void placeOrder(OrderRequest req) {
    // The business change...
    Order order = orderRepo.save(req.toEntity());

    // ...and the EVENT, in the SAME transaction:
    outboxRepo.save(new OutboxEvent(
            "OrderPlaced",
            order.getId(),
            json(order),          // the event payload
            OutboxStatus.PENDING));
    // Both commit or both roll back. No window.
}
```

The `outbox_events` table:

```sql
CREATE TABLE outbox_events (
    id            UUID PRIMARY KEY,
    aggregate_id  VARCHAR(64)   NOT NULL,   -- the business entity id
    event_type    VARCHAR(128)  NOT NULL,   -- "OrderPlaced"
    payload       JSONB         NOT NULL,   -- the event data
    status        VARCHAR(16)   NOT NULL DEFAULT 'PENDING',
    created_at    TIMESTAMP     NOT NULL DEFAULT now()
);
```

**The atomicity:** `@Transactional` wraps both saves. If the order insert fails, the outbox row rolls back too — no event for a non-existent order. If both commit, the event is *durably stored* in the same database. The database is now the source of truth for *both* the state and the "events to publish" — the dual-write problem is converted into a single transaction.

**2. The relay** — a background process (a scheduled job, or Debezium via CDC) publishes pending events:

```java
@Scheduled(fixedDelay = 1000)          // every second (or use a relay framework)
public void publishPending() {
    // Take a batch of PENDING events...
    List<OutboxEvent> pending = outboxRepo.findTop50ByStatusOrderByCreatedAt(PENDING);

    for (OutboxEvent event : pending) {
        // Publish to the broker (Kafka/RabbitMQ/EventBridge)...
        kafka.send("orders", event.aggregateId, event.payload);
        // ...and mark it DONE only after the broker ACKNOWLEDGES.
        outboxRepo.markPublished(event.id);
    }
}
```

**The at-least-once contract:** the relay publishes, then marks done. Crash between publish and mark → the event is re-published on the next tick → **duplicates are possible** — which is why consumers must be idempotent (dedupe on event id). The relay can also retry failures with a dead-letter/backoff policy: a permanently-failing event (malformed payload) gets quarantined, not infinitely retried.

**3. Idempotent consumers** — the pattern's completion:

```java
@KafkaListener(topics = "orders")
public void onOrderPlaced(OrderPlaced event) {
    // Dedupe on the event id — at-least-once delivery is now harmless:
    if (processedEvents.exists(event.eventId())) return;   // already handled
    emailService.sendReceipt(event.customerId());
    processedEvents.record(event.eventId());               // mark handled
}
```

## Why the Outbox Beats the Alternatives

| Approach | Problem |
|---|---|
| Publish after commit (in the same method) | crash window between commit and publish → lost events |
| Publish before commit | events for transactions that roll back → phantom events |
| Retry loops around either | duplicates, ordering races, no consistency story |
| **Outbox (event in the same transaction + relay)** | **no lost events, no phantom events, duplicates only (handled by idempotent consumers)** |

**The guarantee stated precisely:** every committed business change produces *at least one* event, and *every* published event corresponds to a committed change. That's the strongest practical guarantee available without distributed transactions — and it comes from a single database transaction plus a relay, with no 2PC coordinator.

## The Variants and the Production Details

**1. The relay as CDC (Change Data Capture).** Instead of a scheduled job polling the table, **Debezium** tails the database's transaction log and publishes each committed outbox row as an event — no polling, no app code, near-real-time:

```text
Postgres WAL ──▶ Debezium ──▶ Kafka topic (the events)
```

This is the production-grade relay: the DB's own log is the trigger, so events flow the instant a transaction commits. The scheduled-poll relay is the simpler self-contained version; CDC is the scaler.

**2. Ordering.** The relay must publish in `created_at` order (hence `findTop50By...OrderByCreatedAt`) so events for one aggregate arrive in sequence. Consumers keyed by `aggregate_id` get per-entity ordering from Kafka.

**3. Batching and backpressure.** A large backlog of pending events → the relay processes in bounded batches (`LIMIT 50`), so it paces itself and recovers from outages gracefully.

**4. The payload format.** Store the event payload as JSONB (the schema-evolution-friendly form), and let the schema registry govern versions.

## The Outbox in the Spring Ecosystem

- **Spring Modulith's event publication registry** — Spring's own outbox: `@TransactionalEventListener` + the event publication registry persists events in-transaction and publishes after commit (the modulith module covers this).
- **Debezium + Kafka** — the CDC relay, standard for PostgreSQL/MySQL.
- **Solace/other frameworks** — the same pattern, different plumbing.

The framework choice is secondary: the *pattern* — write the event in the business transaction, relay it afterward, consume idempotently — is the transferable knowledge.

## The Anti-Patterns

1. **Publishing in the same method, after commit, without the outbox** — the crash window returns.
2. **The outbox table without a relay** — events accumulate forever; the "pattern" is just a log.
3. **Marking published before the broker acknowledges** — lost events on crash.
4. **Non-idempotent consumers** — the at-least-once delivery (inherent to the pattern) becomes duplicate side effects.
5. **Payloads without versioning** — events live longer than code; schema-evolve them deliberately.

## Recap

The outbox pattern solves the dual-write problem — "change the database AND publish an event, atomically" — by writing the event into an `outbox_events` table *in the same transaction* as the business change, then having a relay publish pending events afterward (a scheduled poller or Debezium's CDC) and mark them done only on broker acknowledgment. The guarantees: no lost events, no phantom events, duplicates possible but harmless with idempotent consumers. It's the pragmatic substitute for distributed transactions — a single local transaction plus a relay — and it's the pattern every reliable event-driven system is built on. The discipline: keep the event in the business transaction, relay with acknowledgment, order by creation, and consume idempotently.
