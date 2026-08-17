---
title: Modulith Events — Reliable In-Process Messaging
summary: Application events with publication tracking — event publishing, listeners, completion handling and the outbox-in-process pattern.
order: 3
minutes: 13
topics: [application events, event publication, outbox, transactional events, modulith]
docs:
  - https://docs.spring.io/spring-modulith/reference/events.html
---

# Modulith Events — Reliable In-Process Messaging

## The problem plain Spring events don't solve

Spring's `ApplicationEventPublisher` is in-memory and fire-and-forget: if the listener throws, the event is **lost**. In a modular monolith, a lost `OrderPaid` event means fulfillment never ships — the failure is silent and data-dependent. Spring Modulith's **event publication registry** gives application events the reliability of the outbox pattern, in-process.

## Publishing with tracking

```java
// Any bean — the framework records the event BEFORE the transaction commits:
@Service
public class BillingService {
    private final ApplicationEventPublisher events;

    public void markPaid(Order order) {
        paymentRepo.recordPaid(order);                // business write (same tx)
        events.publishEvent(new OrderPaid(order.id(), order.total()));
        // if this transaction rolls back, the recorded event rolls back with it
    }
}
```

The `EventPublicationRegistry` table stores the event + its state (`IN_PROGRESS`, `COMPLETED`, `CANCELLED`, or failed) inside the same database transaction as the business data — **atomic: either the payment is recorded AND the event is recorded, or neither**.

## Listening: synchronous or async

```java
@Component
public class FulfillmentListener {

    // Runs in the SAME transaction as the publisher (after the handler completes).
    // Side effects here must be transactional-safe (DB writes, not external calls).
    @EventListener
    void handle(OrderPaid event) { ... }

    // Runs AFTER the publishing transaction commits — the safe spot for
    // external side effects (email, HTTP, file writes).
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void handleAfterCommit(OrderPaid event) { ... }

    // Or fully async on its own executor:
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void handleAsync(OrderPaid event) { ... }
}
```

The three modes are a decision, not a pick-one: same-transaction for *consistency* (both write or neither), after-commit for *external side effects*, async for *throughput*.

## Completion handling: the retry story

By default an event is marked `COMPLETED` when the listener returns; if it throws, the publication stays pending. **`@CompletionHandler`** is the Modulith answer to "the listener crashed":

```java
@Component
public class OrderPaidCompletion {

    @CompletionHandler
    void complete(OrderPaid event, EventPublication publication) { ... }

    @CompletionHandler
    void onFailure(OrderPaid event, RuntimeException failure, EventPublication publication) {
        // park the event, alert, prepare a replay — never swallow silently
    }
}
```

Combined with the **`EventPublicationRegistry`**, this gives you the full DLQ discipline in-process: events that failed are *queryable* (`registry.findIncompletePublications()`), replayable (`registry.markCompleted(...)` after a fix), and auditable — without Kafka.

## The admin/ops surface

```java
// Ops endpoint or scheduled job — find what's stuck:
List<EventPublication> stuck = registry.findIncompletePublications();
// after fixing the listener, complete them:
stuck.forEach(p -> registry.markCompleted(p.getIdentifier(), Instant.now(), null));
```

A scheduled reconcile ("complete any publication that's been IN_PROGRESS for > 5 min with a still-pending listener") is the in-process version of the Kafka consumer's rebalance: **events can't vanish silently**.

## The outbox pattern, in-process

This is the exact reasoning of the transactional outbox (the Kafka module), minus the broker:

| | Kafka outbox | Modulith events |
|---|---|---|
| Atomic with business data | outbox table in the same tx | publication registry in the same tx |
| Delivery | broker + consumer group | listener + completion handler |
| Replay | re-publish from outbox | registry replay |
| Scope | across services (distributed) | within the monolith (in-process) |

The decision rule: **in-process events for module coupling inside the monolith; Kafka for service boundaries** (and for anything that outlives the app). A modular monolith that later splits keeps its event vocabulary — the events become Kafka messages, the listeners become consumers.

## Key takeaways

- Modulith events = application events with **publication tracking** — atomic with the business transaction, replayable, queryable.
- `@EventListener` same-tx, `@TransactionalEventListener(AFTER_COMMIT)` for external side effects, `@Async` for throughput.
- `@CompletionHandler` + the `EventPublicationRegistry` give the DLQ discipline in-process: park, alert, replay.
- It's the outbox pattern without the broker — use it inside the monolith; move to Kafka at the service boundary.

Official docs: [Spring Modulith — Events](https://docs.spring.io/spring-modulith/reference/events.html)
