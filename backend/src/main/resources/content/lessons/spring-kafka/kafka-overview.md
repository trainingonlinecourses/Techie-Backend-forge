---
title: Kafka & Event-Driven Architecture — Complete Beginner's Guide
summary: Topics, partitions, offsets, delivery semantics, and when event-driven design is the right call — explained from zero with code examples.
order: 1
minutes: 22
topics: [kafka, event-driven, topics, partitions, offsets, architecture, producer, consumer]
docs:
  - https://docs.spring.io/spring-kafka/reference/
  - https://kafka.apache.org/intro
---

# Kafka & Event-Driven Architecture — Complete Beginner's Guide

## What Kafka is — explained from zero

Imagine a **newspaper office**. Reporters (producers) write articles and put them on a bulletin board (topic). Different departments read the board: the printing department (consumer group A) prints articles, the online team (consumer group B) posts them online, and the archive team (consumer group C) stores them. Each team reads from the same board but at their own pace. Nobody deletes articles — they stay on the board for a week (retention period).

**Apache Kafka** is that bulletin board, but for data events:

```java
// A producer puts an event on the board (topic)
kafkaTemplate.send("orders", new OrderCreated(orderId, customerId, total));
// Line 1: "orders" is the topic name (like a bulletin board)
// Line 2: The event is an OrderCreated record
// Line 3: Kafka stores it — it's not deleted when consumed

// A consumer reads from the board
@KafkaListener(topics = "orders")
public void handleOrder(OrderCreated event) {
    // Line 1: This method is called for every OrderCreated event
    // Line 2: The consumer reads at its own pace
    // Line 3: Multiple consumers can read the same event
    inventoryService.reserve(event.orderId());
}
```

**Key difference from a message queue:** In a traditional queue (like RabbitMQ), when a message is consumed, it's **deleted**. In Kafka, events are **read** and the reader records its position (offset). Events outlive their consumers — a producer and consumer don't need to be online at the same time.

## The building blocks

| Concept | What it is | Real-world analogy |
|---|---|---|
| **Topic** | A named stream of events (e.g., `orders`) | A bulletin board |
| **Partition** | An ordered, immutable log within a topic | Pages on the board |
| **Offset** | A consumer's position within a partition | A bookmark on the page |
| **Broker** | A Kafka server holding partitions | The office that hosts the board |
| **Consumer group** | A set of consumers that split partitions | Departments reading the board |
| **Retention** | Events kept for a time/size window | Articles stay for a week |

### How partitions work

```
Topic: "orders" (3 partitions)
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Partition 0     │  │  Partition 1     │  │  Partition 2     │
│  [0] OrderA     │  │  [0] OrderB     │  │  [0] OrderC     │
│  [1] OrderD     │  │  [1] OrderE     │  │  [1] OrderF     │
│  [2] OrderG     │  │  [2] OrderH     │  │  [2] OrderI     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
        ↑                    ↑                    ↑
   Consumer 1           Consumer 2           Consumer 3
   (reads partition 0)  (reads partition 1)  (reads partition 2)
```

**Why partitions matter:**
1. **Parallelism** — Multiple consumers can read from different partitions simultaneously
2. **Ordering** — Events within ONE partition are ordered (but NOT across partitions)
3. **Scalability** — More partitions = more parallel consumers

### How offsets work

```
Partition 0: [0] OrderA  [1] OrderD  [2] OrderG  [3] OrderJ
                              ↑
                         Consumer's offset = 1
                         (already read [0], next is [1])
```

The consumer tracks its position (offset) in each partition. When it crashes and restarts, it resumes from its last committed offset — no data lost, no duplicates (if processed before committing).

## Event-driven vs request-driven — the comparison

| | Request-driven (REST sync call) | Event-driven (Kafka) |
|---|---|---|
| **Coupling** | Tight — caller knows the callee's API and availability | Loose — producer doesn't know who listens |
| **Failure** | Caller waits, times out, retries | Producer fires and forgets; consumer retries |
| **Data** | Response is returned inline | State is reconstructed from events |
| **Debugging** | Straightforward trace | Needs tracing + offsets + consumer lag |
| **Consistency** | Easy (same DB transaction) | Hard — the reason the outbox pattern exists |

**When events are the right call:**
- Fan-out (one event → many systems): OrderCreated → inventory, billing, shipping, analytics
- Audit trails: every event is recorded, immutable, replayable
- Decoupling teams: the order team doesn't need to know about the shipping team
- Absorbing load spikes: produce fast, consume at your own pace

**When they're the wrong call:**
- Request/response flows that need a synchronous answer ("what's my balance?")
- Simple CRUD with no downstream consumers
- Teams that don't have monitoring for lag/offsets — you're adding a distributed system, not removing one

## Delivery semantics — the concept

Kafka gives you **at-least-once** by default. What does that mean?

```
Producer → sends "OrderCreated" → Kafka stores it
                                        ↓
Consumer reads "OrderCreated" → processes it → BUT crashes before committing offset
                                        ↓
Kafka still has the event → consumer restarts → reads it AGAIN
                                        ↓
Result: The event was processed TWICE (at-least-once)
```

**The three options:**

1. **At-most-once** — Commit offset BEFORE processing. Crash = lost event. Rarely used.
2. **At-least-once** — Commit AFTER processing. Crash = duplicate processing. **Default.**
3. **Exactly-once** — Achievable with Kafka transactions + idempotent consumers.

**Because at-least-once is the practical default, every consumer must be idempotent:**

```java
@KafkaListener(topics = "orders")
public void handleOrder(OrderCreated event) {
    // Line 1: Check if we already processed this event
    if (processedEvents.contains(event.eventId())) {
        return;  // Line 2: Skip duplicate — idempotent!
    }
    // Line 3: Process the event
    inventoryService.reserve(event.orderId());
    // Line 4: Mark as processed
    processedEvents.add(event.eventId());
}
```

## Spring Boot integration — line by line

```java
// Producer — sends events to Kafka
@Service
public class OrderEventPublisher {
    private final KafkaTemplate<String, OrderCreated> kafkaTemplate;  // Line 1: Spring's Kafka client
    
    @Transactional  // Line 2: Publish atomically with the DB write
    public void publishOrderCreated(Order order) {
        OrderCreated event = new OrderCreated(order.getId(), order.getCustomer());  // Line 3: Create event
        kafkaTemplate.send("orders", order.getId().toString(), event);  // Line 4: Send to Kafka
        // Line 5: Topic="orders", key=orderId (ensures same order goes to same partition)
    }
}

// Consumer — receives events from Kafka
@Component
public class InventoryEventHandler {
    @KafkaListener(topics = "orders", groupId = "inventory-service")  // Line 6: Listen to "orders" topic
    public void onOrderCreated(OrderCreated event) {                   // Line 7: Method called for each event
        inventoryService.reserve(event.orderId());                     // Line 8: Process the event
        // Line 9: Spring auto-commits the offset after this method returns
    }
}
```

**Configuration (application.yml):**

```yaml
spring:
  kafka:
    bootstrap-servers: localhost:9092                    # Line 1: Kafka broker address
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer  # Line 2: Key format
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer  # Line 3: Value format
    consumer:
      group-id: inventory-service                        # Line 4: Consumer group name
      auto-offset-reset: earliest                        # Line 5: Start from beginning if no offset
```

## The event contract — naming matters

Events are the API between teams. Name them as **past facts** (things that happened), not commands (things to do):

```java
// GOOD — past facts (things that happened)
record OrderCreated(UUID orderId, UUID customerId) {}
record PaymentCaptured(UUID orderId, Money amount) {}
record ShipmentDispatched(UUID orderId, TrackingNumber tracking) {}

// BAD — commands (things to do)
record CreateOrder(UUID orderId) {}      // This is a command, not a fact
record ProcessPayment(UUID orderId) {}   // This tells someone what to do
```

**Why:** An event represents something that ALREADY happened. "OrderCreated" means the order WAS created. You can't un-create it. A command like "CreateOrder" implies it might not happen — that's a different pattern.

## Real-world scenario — e-commerce order flow

```
Customer places order
    ↓
Order Service: creates order → publishes OrderCreated
    ↓
Inventory Service: receives OrderCreated → reserves stock → publishes StockReserved
    ↓
Payment Service: receives StockReserved → charges card → publishes PaymentCaptured
    ↓
Shipping Service: receives PaymentCaptured → creates shipment → publishes ShipmentDispatched
    ↓
Notification Service: receives ShipmentDispatched → sends email to customer
```

Each service is independent. If the Payment Service is down, orders queue up and process when it recovers. The Order Service doesn't know or care about the Shipping Service.

## Key takeaways

- Kafka = distributed commit log: topics → partitions → ordered logs; consumers track offsets
- Events are retained and replayable; multiple independent consumers read the same stream
- At-least-once is the default → consumers must be idempotent
- Event-driven decouples teams but adds ops surface: monitoring, schemas, lag
- Name events as past facts with stable IDs and versions

**Official docs:** [Spring Kafka Reference](https://docs.spring.io/spring-kafka/reference/) · [Apache Kafka Introduction](https://kafka.apache.org/intro)
