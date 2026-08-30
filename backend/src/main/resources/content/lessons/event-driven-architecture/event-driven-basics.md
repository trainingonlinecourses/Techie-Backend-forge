---
title: Event-Driven Architecture — The Shift From Calls to Facts
module: event-driven-architecture
order: 1
minutes: 27
topics: ["event-driven architecture", "events", "event sourcing", "decoupling", "message brokers", "Kafka"]
docs:
  - title: "Event-Driven Architecture (AWS)"
    url: "https://aws.amazon.com/event-driven-architecture/"
  - title: "What is Event-Driven Architecture? (Confluent)"
    url: "https://developer.confluent.io/learn/event-driven-architecture/"
summary: Traditional (requestdriven) architecture is built on commands: service A calls service B and waits — "please create the invoice, here's the order."...
---

# Event-Driven Architecture — The Shift From Calls to Facts

## The Concept: From "Do This" to "This Happened"

Traditional (request-driven) architecture is built on *commands*: service A *calls* service B and waits — "please create the invoice, here's the order." **Event-driven architecture (EDA)** is built on *facts*: services *publish what happened* ("OrderPlaced") and other services react asynchronously. The producer doesn't know — or care — who reacts; the consumer doesn't know who published. The coupling is replaced by a shared vocabulary of events flowing through a **message broker** (Kafka, RabbitMQ, or an event bus).

**The mental model:** the request-driven world is a phone call — direct, synchronous, and *coupling*: if the person you're calling is busy, you wait; if they change their number, your call breaks. The event-driven world is a newspaper — the publisher writes the story (event) and anyone may subscribe. The publisher never calls anyone; subscribers read what interests them, whenever they can. The decoupling is total: new subscribers join without the publisher knowing, and a slow subscriber never blocks a publisher.

**Why the industry shifted:** request-driven monoliths *couple* every feature — a new "send email on order" feature means editing the order service. Event-driven systems let features *attach*: a new service subscribes to `OrderPlaced` and the order service never changes. This is the scalability (each service scales independently), the resilience (a subscriber's outage doesn't break the publisher), and the extensibility (new consumers, zero producer changes) that microservices promised.

## The Core Vocabulary

- **Event** — a *fact* that happened: "OrderPlaced", "PaymentCaptured", "UserRegistered". Written in the past tense, carrying the data about what happened (`{orderId, total, customerId}`) — never a command ("sendEmail").
- **Producer (publisher)** — publishes events when facts occur, with zero knowledge of consumers.
- **Consumer (subscriber)** — subscribes to events and reacts; multiple consumers can each react independently.
- **Broker** — the transport: Kafka (durable log, replayable — the modern default for EDA), RabbitMQ (routing, request/reply), or a cloud bus (EventBridge, SNS/SQS).
- **Topic / channel** — the named stream events flow through.

## A Concrete Example: Order Placement

```java
// PRODUCER — the order service publishes a fact, then moves on:
@Service
public class OrderService {

    private final KafkaTemplate<String, Object> kafka;

    public void placeOrder(OrderRequest req) {
        Order order = orderRepo.save(req.toEntity());

        // Publish the FACT — no idea who listens (email, analytics,
        // inventory, shipping, the data warehouse...).
        kafka.send("orders", order.getId(),
                   new OrderPlaced(order.getId(), order.getCustomerId(),
                                   order.getTotal(), order.getItems()));
        // The method returns immediately — publishing is async.
    }
}
```

```java
// CONSUMER 1 — email service reacts independently:
@KafkaListener(topics = "orders")
public void onOrderPlaced(OrderPlaced event) {
    if (event.total() > 0) emailService.sendReceipt(event.customerId(), event.orderId());
}

// CONSUMER 2 — inventory service reacts independently, at its own pace:
@KafkaListener(topics = "orders")
public void reserveStock(OrderPlaced event) {
    inventoryService.reserve(event.items());
}

// CONSUMER 3 — analytics, added LATER, without touching the order service:
@KafkaListener(topics = "orders")
public void recordSale(OrderPlaced event) {
    analytics.record(event);
}
```

**Walking through the decoupling:** the order service publishes `OrderPlaced` — one line, no knowledge of email, inventory, or analytics. Three consumers (and any future ones) react independently. If the email service is down, orders still flow (the event waits in Kafka); if analytics is slow, nothing blocks. **Adding a feature = adding a consumer**, not editing the producer. That's the entire value proposition in one example.

## Event Types: The Three Kinds

- **Domain events** — business facts ("OrderPlaced", "PaymentReceived"). The heart of EDA; named in the business's language, carrying business data.
- **Data-change events (CDC)** — "a row changed in table X" — captured from the database's transaction log (Debezium). The pragmatic bridge: existing systems become event producers without code changes.
- **Operational events** — deployment, health, metrics — the platform's own facts.

The discipline: **events are facts, not commands.** An event says "this happened"; a command says "do this." If a consumer must *do* something, the request-driven pattern (API call) or a *command message* (RabbitMQ-style) is the right tool — mixing the two muddies the semantics.

## The Hard Parts: What EDA Actually Costs

The sales pitch is decoupling; the fine print is the *new problems*:

1. **Eventual consistency.** The email might lag the order by seconds (or minutes under load). "Show me my order — was the receipt sent?" has no synchronous answer. *The fix:* design for eventual consistency (sagas, compensating actions), never assume a subscriber has processed an event.
2. **At-least-once delivery.** Brokers may deliver an event twice (retries, crashes between process-and-commit). *The fix:* **idempotent consumers** — processing `OrderPlaced` twice must produce the same result (dedupe on `eventId`, unique constraints).
3. **Event ordering.** Kafka guarantees order per partition, not globally. *The fix:* key events by entity (`orderId`), so each entity's events stay ordered.
4. **Schema evolution.** Events live for years; consumers read old and new shapes. *The fix:* schema registries (Avro/JSON Schema), forward/backward compatibility, versioning.
5. **Observability.** A request-driven failure has one stack trace; an event-driven failure spans producers, brokers, and consumers. *The fix:* correlation ids propagated through event headers, tracing, and lag monitoring (from the Kafka lessons).

## The Patterns Built on Events

The rest of this module covers the big three:

- **Event Sourcing** — the events *are* the state: store every event, derive the current state by replaying them. Perfect audit, temporal queries, no lost updates.
- **The Outbox pattern** — publish events *atomically* with the database transaction, so a publish never fails or duplicates while the DB commit succeeds.
- **Change Data Capture** — turn database changes into events without application code, the bridge for legacy systems.

## When to Choose EDA (and When Not To)

**Choose EDA when:** multiple services/features must react to the same fact; the reactions can be asynchronous; you need independent scaling or resilience (a consumer's failure must not break the producer); you want new features to attach without touching producers.

**Don't choose EDA when:** the operation needs a synchronous answer (a user waits for the result — keep the API call); the flow is a simple linear sequence (request-driven is simpler); the team isn't ready for eventual consistency, idempotency, and monitoring complexity. **The pragmatic rule:** start request-driven; introduce events at the boundaries where the decoupling pays — and never let a broker become the team's first distributed-systems lesson under production load.

## Recap

Event-driven architecture replaces "do this" calls with "this happened" facts: producers publish events (in the past tense, with no knowledge of consumers), consumers subscribe independently, and a broker (Kafka first among equals) transports them. The payoff is total decoupling — features attach by subscribing, services scale and fail independently. The costs are the distributed-systems homework: eventual consistency (design for it), at-least-once delivery (idempotent consumers), ordering (key by entity), schema evolution (registries), and observability (tracing and lag). The patterns — event sourcing, the outbox, CDC — build on the same foundation. Choose EDA at the boundaries where decoupling pays, and keep the simple flows simple.
