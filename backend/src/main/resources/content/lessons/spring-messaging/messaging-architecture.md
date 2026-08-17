---
title: Messaging Architecture — The Big Picture
module: spring-messaging
order: 1
minutes: 25
topics: ["messaging", "message brokers", "point-to-point", "pub-sub", "Spring Integration"]
docs:
  - title: "Spring Integration overview"
    url: "https://docs.spring.io/spring-integration/reference/overview.html"
---

# Messaging Architecture — The Big Picture

## The Concept: Talking Through a Mailbox, Not a Phone Line

In direct calls (REST), the caller waits: request → response, both parties alive, tightly coupled in time and space. **Messaging** replaces the phone line with a **mailbox**: the sender drops a message and moves on; the receiver picks it up whenever it's ready. The two are decoupled in *time* (no waiting), *space* (no address — a broker routes it), and *technology* (different systems can speak different formats through a translator).

Think of a restaurant kitchen: the waiter writes the order on a ticket and clips it to the pass. The chef cooks when ready. The waiter doesn't stand there while the food cooks (time decoupling); the chef doesn't know which waiter took the order (space decoupling); and if two waiters use different shorthand, the ticket is still understood because there's an agreed format (protocol).

## The Two Messaging Models

### 1. Point-to-Point (Queues)

```
Producer ──> Queue ──> ONE consumer
```

A message in a queue is delivered to **exactly one** consumer. If two workers listen, each message goes to one of them (load balancing). Classic use: job queues — "process this order", "resize this image". The message is *consumed* — gone after processing.

### 2. Publish-Subscribe (Topics)

```
Producer ──> Topic ──> Consumer A
                  └──> Consumer B
                  └──> Consumer C
```

A message on a topic goes to **every** subscriber. Each consumer gets its own copy. Classic use: events — "user registered" goes to email-sender, analytics, and audit simultaneously.

**The rule:** a *task* belongs in a queue (one worker should do it); a *fact/event* belongs on a topic (everyone interested should hear it).

## The Broker — The Middleman

In JMS, AMQP (RabbitMQ), or Kafka, a **broker** (the mailbox service) sits between producers and consumers:

- **Stores** messages (durable — survive restarts).
- **Routes** them (queue vs topic, routing keys, headers).
- **Delivers** them (push to consumers, or consumers pull).
- **Tracks** acknowledgments — a message is only removed when the consumer confirms it processed.

The broker is what makes decoupling real: the producer never needs to know the consumer exists, and vice versa.

## The Code Walkthrough — Spring Integration Style

Spring Integration (the framework behind `@MessagingGateway`, channels, and transformers) models messaging *in-process* first, then bridges to brokers. Here's the shape:

```java
import org.springframework.integration.annotation.Gateway;
import org.springframework.integration.annotation.MessagingGateway;
import org.springframework.integration.annotation.ServiceActivator;
import org.springframework.stereotype.Component;

// ---- 1. The gateway: your code calls a Java method, messaging happens ----
@MessagingGateway
public interface OrderGateway {

    @Gateway(requestChannel = "orders.in")
    void submit(Order order);
}

// ---- 2. The pipeline: channel -> transformer -> service ----
@Component
public class OrderFlow {

    // Receives from the 'orders.in' channel
    @ServiceActivator(inputChannel = "orders.in", outputChannel = "orders.processed")
    public Order validate(Order order) {
        if (order == null || order.items().isEmpty()) {
            throw new IllegalArgumentException("empty order");
        }
        return order;
    }
}

// ---- 3. Where the processed order ends up ----
@Component
public class OrderHandler {

    @ServiceActivator(inputChannel = "orders.processed")
    public void handle(Order order) {
        System.out.println("processing order " + order.id());
        // call the payment service, or publish to a broker
    }
}
```

### Walking Through Each Part

**The `@MessagingGateway`** — the entry point. Your service calls `orderGateway.submit(order)` like a plain method; behind the scenes, Spring Integration drops a `Message` onto the `orders.in` channel. The caller is decoupled from whatever happens downstream.

**`@ServiceActivator`** — a handler bound to a channel. `validate` consumes from `orders.in`, and its return value is published to the *output* channel `orders.processed`. This is the **pipeline**: messages flow channel → handler → channel → handler.

**The handler** — the final stage. In a real app, this might publish to RabbitMQ/Kafka (bridging the in-process flow to a broker) or invoke a service.

The concept to internalize: **everything in messaging is a `Message` flowing through channels, transformed by handlers.** This "message bus" pattern is what Spring Integration formalizes, and the same mental model underlies Kafka/RabbitMQ/WebSocket STOMP flows.

## The Contract — What a Message Is

A message has three parts:

```
Message {
  payload:  the data (order JSON, image bytes, event text)
  headers:  metadata (id, timestamp, contentType, correlationId, routingKey)
}
```

Headers are where routing and tracing live: `correlationId` for request-reply, `routingKey` for topic routing, `contentType` for the translator. This is why logging/tracing middleware can flow through messaging unchanged — it reads headers, not payloads.

## In-Process vs Broker Messaging

| | In-process (Spring Integration channels) | Broker (RabbitMQ/Kafka/JMS) |
|---|---|---|
| Decoupling | Method-level (async channels) | Process-level (separate services) |
| Durability | None (in-memory) | Durable (survive restarts) |
| Scale | Single JVM | Many consumers, many services |
| Typical role | Internal pipelines, async in one app | Cross-service integration |

The academy's own backend uses this split: `@Async`/`@EventListener` for in-process events, and the RabbitMQ/Kafka modules for cross-service messaging. Same conceptual model, different scope.

## Common Beginner Pitfalls

1. **Using a queue for events** — an "order placed" event on a queue reaches only *one* subscriber; analytics and audit miss it. Events → topic; tasks → queue.
2. **Tightly coupled producers** — if the producer knows the consumer's API, you've built REST, not messaging.
3. **Ignoring durability** — in-memory channels lose messages on restart; use a broker for anything that must survive.
4. **No idempotency** — consumers must tolerate redelivery (brokers deliver at-least-once); make handlers idempotent.
5. **Huge payloads in messages** — brokers are not data lakes; put the data in storage, send the reference.
6. **Synchronous assumptions** — messaging is async by nature; don't design flows that need an instant answer (use request-reply patterns explicitly if you must).

## Key Takeaways

- Messaging decouples producers and consumers in time, space, and technology.
- Queues = point-to-point tasks (one consumer); topics = pub-sub events (all subscribers).
- The broker stores, routes, and acknowledges — making decoupling durable.
- A message = payload + headers (id, correlation, routing).
- Spring Integration: `@MessagingGateway` → channels → `@ServiceActivator` pipelines.
- In-process channels for internal async; brokers for cross-service integration.
