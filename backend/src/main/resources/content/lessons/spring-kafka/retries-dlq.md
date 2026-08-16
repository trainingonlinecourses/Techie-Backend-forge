---
title: Retries & Dead Letter Queues
summary: RetryableTopic, exponential backoff, DLT handlers, poison messages, and deserialization errors.
order: 5
minutes: 22
topics: [kafka, retry, dlq, dead-letter, backoff, error-handling, poison-message]
docs:
  - https://docs.spring.io/spring-kafka/reference/retrytopic/index.html
  - https://docs.spring.io/spring-kafka/reference/kafka/error-handling.html
---

# Retries & Dead Letter Queues

## Why you need retries and a DLT

A consumer fails for two very different reasons:

1. **Transient** — the DB was down, a dependency hiccuped. Retry in a few seconds and it works.
2. **Permanent** — the event is malformed, the schema drifted, the business rule rejects it. Retrying forever is a **poison message** that blocks the partition.

The answer: **retry transient failures with backoff, then park permanent failures in a Dead Letter Topic (DLT)** where humans/alerts can inspect them.

## @RetryableTopic — retries with a DLT, declaratively

```java
@Component
public class PaymentEventListener {

    @RetryableTopic(
        attempts = "4",                      // 1 original + 3 retries
        backoff = @Backoff(delay = 1000, multiplier = 2.0),  // 1s, 2s, 4s
        autoCreateTopics = "true")           // demo: let Spring create retry/DLT topics
    @KafkaListener(topics = "payments", groupId = "payment-ledger")
    public void onPaymentCaptured(PaymentCaptured event) {
        ledger.record(event);                // may throw transiently (DB down)
    }

    @DltHandler
    public void onDlt(PaymentCaptured event) {
        // Runs after attempts are exhausted — permanent failure.
        alerting.notify("payment event failed permanently", event);
        // Do NOT rethrow here — the DLT record is the record of the failure.
    }
}
```

Spring Kafka creates retry topics (`payments-retry-0`, `payments-retry-1`, ...) with increasing delays and a final DLT (`payments-dlt`). Records hop topics while backing off, so **your main topic/partition is never blocked**.

## The deserialization failure — a special poison message

If a record **can't be deserialized** (schema drift, garbage bytes), your listener never runs — the error happens *before* it. The default kills the consumer (records pile up as lag). Fix: **`ErrorHandlingDeserializer`** wrapping your real deserializer:

```yaml
spring:
  kafka:
    consumer:
      value-deserializer: org.springframework.kafka.support.serializer.ErrorHandlingDeserializer
      properties:
        spring.deserializer.value.delegate.class: org.springframework.kafka.support.serializer.JsonDeserializer
        spring.deserializer.value.failed.deserialization.function: "sendToDlq"
        spring.json.trusted.packages: "com.acme.messaging"
```

With a failed-deserialization function of `sendToDlq`, malformed records go straight to the DLT (with the raw bytes preserved) instead of wedging the consumer.

## Manual retry control — when you need it

```java
@KafkaListener(topics = "payments", groupId = "payment-ledger")
public void onPaymentCaptured(PaymentCaptured event) {
    try {
        ledger.record(event);
    } catch (TransientFailure e) {
        throw new RetryableException("db unavailable", e);   // container retries
    }
}
```

`RetryableException` tells the container "retry me". Any other exception → default behavior (or DLT, per config). Reserve this for cases where `@RetryableTopic` doesn't fit (e.g. you need custom logic to decide retryability).

## Observing retries and the DLT

- Retry topics are *topics* — you can see records and lag on them (`kafka-consumer-groups.sh`).
- **DLT lag = incidents waiting to happen**: alert when `payments-dlt` gets any new record.
- A DLT handler that **rethrows** is a bug — it restarts the whole retry cycle or crashes the consumer; log + alert instead.
- Replay strategy: republish DLT records to the main topic after the root cause is fixed (a small "replay tool" is worth building once).

> **Why it matters (organizational view)** — Retry/DLT is the org's *failure policy for events*, and it must be standardized: every listener gets bounded retries with backoff, every service has a DLT per topic, and **every DLT has an owner and an alert**. The DLT is not a trash can — it's the queue where permanently-failed events wait for a human decision (fix data, fix code, discard). Teams that skip DLTs get stuck consumers, mysterious lag, and silent data loss. Agree on the convention: `@RetryableTopic` by default, `ErrorHandlingDeserializer` always, DLT alerts routed to the owning team.

## Key takeaways

- Transient errors: retry with backoff. Permanent errors: DLT. Never retry forever.
- `@RetryableTopic` + `@DltHandler` = retry topics with increasing delay + final DLT, main topic never blocked.
- Wrap deserializers in `ErrorHandlingDeserializer` with `sendToDlq` so poison bytes don't kill the consumer.
- DLT handlers log/alert; they don't rethrow. Alert on DLT arrivals.
- Build a DLT replay tool once — you will need it.

## Official docs

- [Spring Kafka — RetryTopic](https://docs.spring.io/spring-kafka/reference/retrytopic/index.html)
- [Spring Kafka — Error Handling](https://docs.spring.io/spring-kafka/reference/kafka/error-handling.html)
- [Apache Kafka — Dead Letter Queues](https://kafka.apache.org/documentation/#basic_ops_consumer_lag)
