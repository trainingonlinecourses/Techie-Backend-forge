---
title: Retries, Dead Letter Queues and Poison Messages
module: spring-amqp
order: 3
minutes: 25
topics: ["retry", "backoff", "DLQ", "poison messages", "reprocessing", "message recovery"]
summary: Transient failures deserve a retry; permanent failures deserve a dead letter. Without a retry policy, a database blip during a message storm causes...
docs:
  - title: "Retry and recovery"
    url: "https://docs.spring.io/spring-amqp/reference/retry.html"
---

# Retries, Dead Letter Queues and Poison Messages

Transient failures deserve a retry; permanent failures deserve a dead letter. Without a retry policy, a database blip during a message storm causes infinite requeue loops. Without a DLQ, poison messages block the queue forever. This lesson builds the full recovery ladder.

## The Retry Ladder

```
Message arrives
  → attempt 1 (fail — transient: DB down)
  → backoff, retry (attempt 2, 3...)
  → attempts exhausted
  → message → DLQ (dead letter queue)
  → DLQ consumer: log, alert, or park for manual reprocessing
```

## Spring AMQP's Retry Interceptor

```java
@Bean
public RabbitListenerContainerFactory<SimpleMessageListenerContainer>
        rabbitListenerContainerFactory(ConnectionFactory connectionFactory) {
    SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
    factory.setConnectionFactory(connectionFactory);

    factory.setAdviceChain(RetryInterceptorBuilder.stateless()
        .maxAttempts(3)
        .backOffOptions(1000, 2.0, 10_000)   // 1s, ×2, cap 10s
        .recoverer(new RejectAndDontRequeueRecoverer())
        .build());

    factory.setDefaultRequeueRejected(false);   // final failure → DLQ, not infinite loop
    return factory;
}
```

- `maxAttempts(3)` — 3 total attempts (1 initial + 2 retries)
- `backOffOptions(1000, 2.0, 10000)` — initial 1s delay, ×2 each retry, capped at 10s
- `RejectAndDontRequeueRecoverer` — after the last failure, reject without requeue → routes to DLQ
- `setDefaultRequeueRejected(false)` — double-guard against the infinite loop

## The Exponential Backoff

```
attempt 1: t+0
attempt 2: t+1s
attempt 3: t+3s   (1×2 + initial? — the multiplier compounds the *delay*)
attempt 4: t+7s
attempt 5: t+15s
```

Backoff gives the downstream system (DB, external API) time to recover. A fixed 1s retry storm can *cause* the outage you're retrying through.

## Declaring the DLQ Topology

```java
@Configuration
public class DlqConfig {

    @Bean
    public Queue ordersQueue() {
        return QueueBuilder.durable("orders.new")
            .deadLetterExchange("")
            .deadLetterRoutingKey("orders.new.dlq")
            .build();
    }

    @Bean
    public Queue ordersDlq() {
        return QueueBuilder.durable("orders.new.dlq").build();
    }

    // Bind the DLQ to the default exchange with its routing key
    @Bean
    public Binding dlqBinding() {
        return BindingBuilder.bind(ordersDlq())
            .to(new DirectExchange("")).with("orders.new.dlq");
    }
}
```

When a message is rejected-and-not-requeued (or expires), RabbitMQ republishes it to the dead-letter exchange with the dead-letter routing key.

## The DLQ Consumer

```java
@Component
public class OrderDlqConsumer {

    @RabbitListener(queues = "orders.new.dlq")
    public void onPoisonOrder(Message message) {
        String body = new String(message.getBody());
        String originalQueue = message.getMessageProperties()
            .getHeader("x-death") != null
            ? ((List<?>) message.getMessageProperties().getHeader("x-death")).toString()
            : "unknown";

        log.error("Poison message from {}: {}", originalQueue, body);

        // Option A: park in a replay table for manual inspection
        parkedMessages.save(ParkedMessage.from(message));

        // Option B: alert and drop
        alertService.notify("Order consumer failing: " + body);
    }
}
```

The `x-death` header records the original queue, reason (`rejected`/`expired`/`maxlen`), and retry count — forensic data for debugging.

## Distinguishing Transient vs. Permanent

Not every failure should retry. A validation error will never succeed:

```java
@RabbitListener(queues = "orders.new")
public void onOrderCreated(OrderEvent event) {
    try {
        process(event);
    } catch (InvalidOrderException e) {
        // permanent: don't retry, go straight to DLQ
        throw new AmqpRejectAndDontRequeueException(e);
    }
    // other exceptions: retry per the interceptor policy
}

private void process(OrderEvent event) {
    if (event.amount() <= 0) throw new InvalidOrderException(event);
    // ...
}
```

`AmqpRejectAndDontRequeueException` bypasses the retry ladder — the message is rejected immediately and routed to the DLQ.

## The Retry Table Pattern (Reprocessing)

For critical messages, the DLQ isn't the end — it's a parking lot. A reprocessing job drains it:

```java
@Component
public class DlqReprocessor {

    private final RabbitTemplate template;

    @Scheduled(fixedDelay = 60_000)
    public void drain() {
        // Pull from DLQ, validate, republish to the main queue
        GetResponse response = template.receive("orders.new.dlq");
        while (response != null) {
            Message message = response.getMessage();
            try {
                template.send("orders.new", message);   // back into the ladder
                template.ack(response);                  // remove from DLQ
            } catch (Exception e) {
                template.nack(response, false, false);   // leave in DLQ
                break;
            }
            response = template.receive("orders.new.dlq");
        }
    }
}
```

With a retry counter in the header (`x-death`), stop reprocessing after N attempts and page a human.

## Common RabbitMQ Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Queue grows unbounded | Consumer down or too slow | Alert on queue depth, scale consumers |
| Infinite redelivery loop | Requeue on poison messages | `defaultRequeueRejected(false)` + DLQ |
| Messages vanish | Publisher confirms off | Enable confirms + mandatory |
| Listener reconnects forever | Broker down | Connection retry (Spring handles); monitor |
| Memory spike | Unbounded prefetch | Cap `prefetchCount` |

## Monitoring the Recovery Ladder

```java
@RabbitListener(queues = "orders.new.dlq")
public void onDlq(Message message) {
    dlqCounter.increment();                    // Micrometer counter
    // alert when DLQ rate exceeds threshold
    if (dlqCounter.count() % 10 == 0) {
        alertService.warn("10 messages in DLQ");
    }
}
```

A DLQ rate > 0 is normal (transient storms happen); a **rising** DLQ rate is a deploy regression signal.

## Summary

| Stage | Mechanism |
|-------|-----------|
| Attempt | `@RabbitListener` method |
| Retry | `RetryInterceptorBuilder` (attempts + exponential backoff) |
| Permanent failure | `AmqpRejectAndDontRequeueException` |
| After retries | `RejectAndDontRequeueRecoverer` → DLQ |
| DLQ routing | `deadLetterExchange` + `deadLetterRoutingKey` |
| Reprocessing | Scheduled drain job with attempt caps |
| Monitoring | DLQ counters + queue depth alerts |

The recovery ladder turns "a message failed" from a silent data-loss event into a visible, replayable, alertable condition. Retry the transient, reject the permanent, park the poison, and reprocess deliberately.
