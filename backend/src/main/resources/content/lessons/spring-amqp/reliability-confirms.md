---
title: Publisher Confirms & Reliability
module: spring-amqp
order: 2
minutes: 22
topics: ["publisher confirms", "mandatory", "returned messages", "transactions", "idempotent consumers"]
docs:
  - title: "Spring AMQP template"
    url: "https://docs.spring.io/spring-amqp/reference/template.html"
summary: "Sent" is not "delivered". Without confirms, a publish that hits a downed broker, a full queue, or a missing exchange silently disappears. Publishe...
---

# Publisher Confirms & Reliability

"Sent" is not "delivered". Without confirms, a publish that hits a downed broker, a full queue, or a missing exchange **silently disappears**. Publisher confirms give producers certainty; idempotent consumers make retries safe. This lesson is the reliability layer of RabbitMQ.

## The Reliability Chain

```
Producer → ConfirmCallback (broker ack)
         → ReturnCallback (message undeliverable, mandatory)
Broker   → Queue persistence (durable queue + PERSISTENT message)
         → Consumer ack (AUTO/MANUAL)
Consumer → Idempotency (process exactly once despite redelivery)
```

## Enabling Publisher Confirms

```yaml
spring:
  rabbitmq:
    publisher-confirm-type: correlated
    publisher-returns: true
```

```java
@Configuration
public class RabbitConfig {

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory factory,
                                        ObjectMapper objectMapper) {
        RabbitTemplate template = new RabbitTemplate(factory);
        template.setMessageConverter(new Jackson2JsonMessageConverter(objectMapper));

        // ReturnCallback: message bounced back (no route found)
        template.setMandatory(true);
        template.setReturnsCallback(returned ->
            log.error("Message returned: exchange={}, key={}, reply={}",
                returned.getExchange(), returned.getRoutingKey(),
                returned.getReplyText()));

        // ConfirmCallback: broker accepted the message
        template.setConfirmCallback((correlationData, ack, cause) -> {
            if (ack) {
                log.debug("Confirmed: {}", correlationData.getId());
            } else {
                log.error("Not confirmed: {} cause: {}", correlationData.getId(), cause);
            }
        });
        return template;
    }
}
```

## Correlation Data: Tracking the Outcome

Correlate a publish to its confirmation:

```java
public void orderCreated(Order order) {
    CorrelationData correlation = new CorrelationData(order.getId().toString());

    rabbitTemplate.convertAndSend(
        "orders.exchange", "orders.new", new OrderEvent(order), correlation);

    correlation.getFuture().whenComplete((confirm, ex) -> {
        if (confirm != null && confirm.isAck()) {
            log.info("Order event {} confirmed by broker", order.getId());
        } else {
            log.error("Order event {} NOT confirmed: {}",
                order.getId(), ex != null ? ex.getMessage() : "nack");
            // retry, alert, or persist for replay
            failedPublishStore.save(new FailedPublish(order.getId(), Instant.now()));
        }
    });
}
```

The `CorrelationData.getFuture()` completes when the broker confirms — asynchronous certainty.

## The Returned-Message Pattern

With `mandatory=true`, a message that matches **no queue** comes back to the producer:

```
Routing key "orders.nonexistent" → no binding → ReturnCallback fires
```

Use it to detect topology drift (queue deleted, binding changed) at runtime instead of discovering silent drops.

## Transactions vs. Confirms

RabbitMQ supports true transactions (`channel.txSelect()`), but confirms are the recommended path:

| | Transactions | Publisher confirms |
|--|--------------|-------------------|
| Throughput | ~2-10× slower (fsync per tx) | Near-normal |
| Semantics | Atomic batch | Per-message |
| Complexity | Simple | Slightly more code |
| Recommendation | Legacy | ✅ Modern default |

Spring AMQP: `rabbitTemplate.setChannelTransacted(true)` enables transactions; but confirms + idempotency cover the same guarantees faster.

## Idempotent Consumers

Redelivery happens (requeue, consumer crash after ack-less processing, DLQ reprocessing). **Consumers must be idempotent** — the third pillar:

```java
@RabbitListener(queues = "orders.new")
public void onOrderCreated(OrderEvent event) {
    // Claim pattern: insert-if-absent in the DB
    try {
        processedOrders.insertIfAbsent(event.orderId());
    } catch (DuplicateKeyException e) {
        log.info("Order {} already processed — skipping duplicate", event.orderId());
        return;
    }
    inventoryService.reserve(event.orderId());
}
```

A unique constraint on the processed-id table turns redelivery into a no-op.

## At-Most-Once vs At-Least-Once

| Mode | Guarantee | Configuration |
|------|-----------|---------------|
| At-most-once | Message may be lost, never duplicated | `acknowledge-mode: NONE` |
| At-least-once | Duplicates possible, never lost | AUTO/MANUAL ack + durable + confirms |
| Exactly-once | Neither (hard) | At-least-once + idempotent consumer |

Production default: **at-least-once + idempotency** = effectively exactly-once for your business logic.

## The Full Reliable Pipeline

```java
@Service
public class ReliablePublisher {

    private final RabbitTemplate template;
    private final FailedPublishRepository failures;

    public void publish(String exchange, String key, Object payload, String correlationId) {
        CorrelationData cd = new CorrelationData(correlationId);
        template.convertAndSend(exchange, key, payload, cd);

        cd.getFuture().whenComplete((confirm, ex) -> {
            boolean ok = confirm != null && confirm.isAck() && ex == null;
            if (!ok) {
                // Persist for a replay job (outbox-style safety net)
                failures.save(new FailedPublish(correlationId, exchange, key,
                    json(payload), Instant.now()));
            }
        });
    }
}
```

The failed-publish table + a replay scheduler gives you the transactional-outbox guarantee without the outbox boilerplate.

## Testing Reliability

```java
@Test
void confirmCallbackFiresOnAck() {
    CorrelationData cd = new CorrelationData("order-1");
    template.convertAndSend("orders.exchange", "orders.new", event, cd);

    assertTrue(cd.getFuture().get(5, TimeUnit.SECONDS).isAck());
}

@Test
void mandatoryReturnsUndeliverableMessage() {
    // publish to a routing key with no binding
    template.convertAndSend("orders.exchange", "no.such.route", event, new CorrelationData("x"));

    // assert the ReturnsCallback captured the return
    await().atMost(Duration.ofSeconds(5))
        .untilAsserted(() -> assertNotNull(testReturn.get()));
}
```

## Summary

| Guarantee | Mechanism |
|-----------|-----------|
| Broker received it | Publisher confirms (`correlated` + `ConfirmCallback`) |
| Route existed | `mandatory=true` + `ReturnsCallback` |
| Survives broker restart | Durable queue + `PERSISTENT` delivery mode |
| Consumer processed it | AUTO/MANUAL ack |
| No duplicate side effects | Idempotent consumer (unique key claim) |
| Crash safety net | Persist failed publishes for replay |

Reliability is a chain: confirms tell you the broker accepted, returns tell you routing failed, acks tell you the consumer finished, and idempotency makes every retry harmless. Build all four and "at-least-once" becomes "effectively exactly-once".
