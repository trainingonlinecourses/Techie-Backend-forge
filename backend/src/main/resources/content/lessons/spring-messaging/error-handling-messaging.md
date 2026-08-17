---
title: Error Handling — Dead Letters, Retries, and Poison Messages
module: spring-messaging
order: 4
minutes: 25
topics: ["error channels", "dead letter queue", "retries", "poison messages", "idempotency"]
docs:
  - title: "Error handling (Spring Integration)"
    url: "https://docs.spring.io/spring-integration/reference/error-handling.html"
---

# Error Handling — Dead Letters, Retries, and Poison Messages

## The Concept: Messages Fail Differently Than Method Calls

When a method throws, the caller gets the exception in a stack trace. When a **message consumer** throws, there's often no caller — the message came from a channel or broker. The failure must be handled *by the messaging infrastructure itself*: retried, routed to an error channel, or parked in a **dead letter queue** (DLQ) for human inspection.

The three-layer reality of messaging failures:

1. **Transient failures** — the DB was briefly down; retrying in a second succeeds.
2. **Permanent failures** — the payload is malformed; retrying 100 times never helps.
3. **Poison messages** — a message that *always* throws when consumed (bad data, a bug); it can loop forever, blocking the queue.

The toolkit: **retries** (bounded, with backoff), **error channels** (a destination for failed messages), and **DLQs** (where poison messages rest until investigated). Plus the golden rule: **consumers must be idempotent**, because at-least-once delivery means a message *will* be redelivered.

## The Code Walkthrough

```java
import org.springframework.integration.annotation.ServiceActivator;
import org.springframework.integration.channel.DirectChannel;
import org.springframework.integration.support.MessageBuilder;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageHandler;
import org.springframework.stereotype.Component;

@Component
public class OrderConsumer {

    private int attempts = 0;

    // ---- The consumer: processing can fail ----
    @ServiceActivator(inputChannel = "orders.processed")
    public void handle(Order order) {
        // Simulate a transient DB hiccup that clears up after 2 tries
        if (attempts++ < 2) {
            throw new IllegalStateException("db temporarily unavailable");
        }
        System.out.println("order " + order.id() + " processed");
    }

    // ---- The error channel: where failures land after retries ----
    // Wire in config: errorChannel -> retry advice -> orders.processed
    @ServiceActivator(inputChannel = "orders.errors")
    public void onError(Message<?> failed) {
        Throwable cause = (Throwable) failed.getPayload();
        Order original = (Order) failed.getHeaders().get("order");
        System.out.println("FINAL failure for order "
                + (original != null ? original.id() : "?") + ": " + cause.getMessage());
        // notify ops, log, park in a dead-letter table...
    }
}
```

```java
// ---- The retry advice: bounded retries with backoff, then error channel ----
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.integration.channel.DirectChannel;
import org.springframework.integration.handler.advice.RequestHandlerRetryAdvice;
import org.springframework.messaging.MessageChannel;
import org.springframework.retry.backoff.ExponentialBackOffPolicy;
import org.springframework.retry.support.RetryTemplate;

@Configuration
public class RetryConfig {

    @Bean
    public MessageChannel ordersErrors() {
        return new DirectChannel();
    }

    @Bean
    public RequestHandlerRetryAdvice retryAdvice() {
        RetryTemplate template = new RetryTemplate();
        template.setRetryPolicy(new org.springframework.retry.policy.SimpleRetryPolicy(3));

        ExponentialBackOffPolicy backoff = new ExponentialBackOffPolicy();
        backoff.setInitialInterval(500);      // 0.5s, then 1s, then 2s
        backoff.setMultiplier(2.0);
        template.setBackOffPolicy(backoff);

        RequestHandlerRetryAdvice advice = new RequestHandlerRetryAdvice();
        advice.setRetryTemplate(template);
        // after retries are exhausted, the failure routes to the error channel
        return advice;
    }
}
```

### Walking Through Each Part

**The consumer** — throws on its first two attempts (simulating a transient failure), succeeds on the third. With the retry advice wrapping it, the first two failures are invisible to the outside world — the message is retried with backoff (0.5s → 1s), and only then processed.

**The retry advice** — `RequestHandlerRetryAdvice` wraps the consumer handler: up to 3 attempts, exponential backoff. **Bounded** — the retry policy caps attempts, so a permanently failing message doesn't loop forever *at this layer*.

**The error channel** — after retries exhaust, the failed message (with the exception as payload and headers preserved) is published to the error channel. `onError` logs, alerts ops, and can park the message. This is the *dead letter* destination in-process.

## The Poison Message Problem

A message that always fails (malformed payload, a code bug) will: fail → retry 3× → error channel. But **if you republish it to the main channel**, it loops forever — the *poison message* pattern. The protections:

1. **Don't auto-republish** — park failures in a DLQ/error table for inspection, never loop them back.
2. **Distinguish poison early** — a payload that fails *validation* should be rejected at the transformer/filter stage, not retried (retries don't fix bad data).
3. **Track attempts in headers** — a header like `x-death` (RabbitMQ) or your own counter tells you a message has been through N times; act on the count.

## At-Least-Once Delivery Demands Idempotency

Brokers deliver **at least once** — the same message may arrive twice (consumer crashed after processing but before acking). Therefore:

```java
// The consumer MUST tolerate duplicates:
@ServiceActivator(inputChannel = "orders.processed")
public void handle(Order order) {
    if (processedOrders.add(order.id())) {      // idempotency guard: dedupe by key
        process(order);                          // runs once per order id
    }
}
```

Idempotency patterns: a `processed` table keyed by message id, a dedupe set, or natural idempotency (a `SET balance = balance - x` that's safe to re-run... no — for financial ops use a unique constraint on the operation id).

## Error Channel vs Broker DLQ

| Layer | Mechanism | Purpose |
|---|---|---|
| In-process | Retry advice + error channel | Handle transient failures, capture failures |
| Broker (RabbitMQ) | `x-dead-letter-exchange` | Park poison messages in a DLQ |
| Broker (Kafka) | Consumer retry + `__consumer_offsets`/DLT topic | Retry then park in a dead-letter topic |

The broker DLQ (covered in the AMQP/Kafka modules) is the durable version: failed messages sit in a queue until someone re-drives or investigates them — surviving restarts, visible to ops.

## Common Beginner Pitfalls

1. **Infinite retries** — a retry policy without a max attempts can spin forever; always bound it.
2. **Republishing failures to the main channel** — the poison-message loop. Park, don't loop.
3. **No error channel** — failures are silently dropped (or crash the consumer thread); always route somewhere visible.
4. **Non-idempotent consumers** — duplicate charges/emails on redelivery; dedupe by message key.
5. **Retrying validation failures** — malformed payloads never heal; validate early, don't retry.
6. **Not inspecting the DLQ** — a DLQ full of messages no one reads is a silent data-loss queue; alert on DLQ depth.

## Key Takeaways

- Messaging failures are handled by infrastructure: bounded retries, error channels, DLQs.
- Retry transient failures with exponential backoff; cap the attempts.
- Route exhausted failures to an error channel/DLQ — park them, never loop them back.
- Poison messages need attempt tracking and DLQ inspection, not endless reprocessing.
- At-least-once delivery means consumers must be idempotent — dedupe by message key.
- Alert on DLQ depth: an unread dead-letter queue is silent data loss.
