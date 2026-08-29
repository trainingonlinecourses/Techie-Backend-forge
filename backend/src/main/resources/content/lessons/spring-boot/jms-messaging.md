---
title: JMS & Spring Messaging — Decoupling Services with Message Brokers
summary: The JMS programming model (queues vs topics), Spring's JmsTemplate and @JmsListener, message acknowledgment modes, and how organizations use ActiveMQ to survive downstream outages.
order: 53
minutes: 24
topics: [jms, messaging, activemq, jmslistener, queue, topic, decoupling]
docs:
  - https://docs.spring.io/spring-framework/reference/data-access/jms.html
  - https://activemq.apache.org/components/classic
---

## The Concept, From Zero

Synchronous REST calls have a hidden weakness: if service B is down, service A fails too — their fates are welded together. **Messaging** breaks that weld. Service A drops a message onto a **broker** (a durable post office) and moves on; service B picks it up whenever it can.

**JMS (Java Message Service)** is the standard Java API for talking to such brokers (ActiveMQ, Artemis, IBM MQ, Amazon SQS-compatible...). Two delivery models:

| Model | Analogy | Who receives |
|---|---|---|
| **Queue** (point-to-point) | Office mail slot | Exactly ONE consumer gets each message |
| **Topic** (pub/sub) | Newspaper subscription | EVERY active subscriber gets a copy |

### The dependency to add

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-activemq</artifactId>   <!-- brings JMS + an embedded broker -->
</dependency>
```

## Sending — `JmsTemplate`

```java
@Service
public class OrderEventPublisher {

    private final JmsTemplate jmsTemplate;      // Spring's helper wrapping raw JMS boilerplate

    public OrderEventPublisher(JmsTemplate jmsTemplate) {
        this.jmsTemplate = jmsTemplate;
    }

    public void publishOrderCreated(Order order) {
        jmsTemplate.convertAndSend("order-events", order);
        //                     ↑ queue name     ↑ any object → auto-converted to JSON via MessageConverter
    }
}
```

One line does what raw JMS needs ~10 lines for (connections, sessions, producers). `convertAndSend` serializes the object using the configured converter — configure JSON like this:

```java
@Configuration
public class JmsConfig {

    @Bean
    public MessageConverter jacksonJmsMessageConverter() {
        MappingJackson2MessageConverter converter = new MappingJackson2MessageConverter();
        converter.setTargetType(MessageType.TEXT);            // payload stored as JSON text
        converter.setTypeIdPropertyName("_type");             // header telling receiver which class to build
        return converter;
    }
}
```

The `_type` header carries the class name so the consumer can deserialize without compile-time knowledge of your sender code.

## Receiving — `@JmsListener`

```java
@Component
public class InventoryListener {

    @JmsListener(destination = "order-events")           // container polls; method fires per message
    public void onOrderCreated(Order order) {
        inventoryService.reserveStock(order.getItems());
        // if this throws → by default the message is REDELIVERED (redelivery policy applies)
    }
}
```

Line-by-line behavior:

| Piece | What happens |
|---|---|
| `@JmsListener(destination=...)` | Spring starts background consumers on that queue at startup |
| Method parameter `Order order` | Incoming JSON converted back to the object automatically |
| Throwing an exception | Signals failure → broker redelivers later (retry semantics for free) |
| Successful return | Message acknowledged and removed from the queue |

## Reliability Settings That Matter in Production

```yaml
spring:
  jms:
    listener:
      acknowledge-mode: auto       # AUTO: ack after successful method return
      concurrency: 5               # 5 parallel consumer threads on the queue
```

Acknowledge modes, from naive to robust:

1. `AUTO` — acknowledged once your method returns normally. Simple; covers most cases.
2. Client/manual — you control acknowledgement explicitly (rarely needed).
3. **Transacted sessions** (`jmsTemplate.setSessionTransacted(true)` or `@Transactional`) — DB writes + message ack commit atomically. This kills the classic "message processed but DB insert rolled back" inconsistency.

> ⚠️ Redelivery means listeners must be **idempotent**: the same order may arrive twice. Guard with a processed-message-ID table or natural idempotency keys.

## Real Organizational Scenarios

**Scenario 1 — Surviving downstream outages.** An e-commerce platform publishes "order placed" events to a queue consumed by the email service. During an SMTP outage, emails pile up in the queue instead of failing checkouts; when SMTP recovers, the backlog drains automatically. Revenue path never touches the fragile path.

**Scenario 2 — Load smoothing / spikes.** Flash-sale traffic produces 50k orders/minute but inventory can process 8k/min. The queue absorbs the difference — producers never block, consumers work at their own pace, nothing is dropped.

**Scenario 3 — Fan-out with topics.** One "payment-captured" event fans out to fraud-check, analytics, loyalty-points, and notification services via a topic. Adding a fifth subscriber requires zero changes to the payment service — that's architectural decoupling paying off.

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Non-idempotent listeners | Duplicate side effects during redelivery | Idempotency keys / dedupe table |
| Poison messages looping forever | Queue backs up behind one bad message | Retry limit + dead-letter queue (DLQ) |
| Forgetting the MessageConverter config | Receiver gets bytes it can't parse, or wrong type | Configure Jackson converter on both sides |
| Assuming exactly-once delivery | Rare duplicates treated as bugs in design | Design for at-least-once from day one |
