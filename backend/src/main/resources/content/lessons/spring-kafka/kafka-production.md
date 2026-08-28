---
title: Kafka in Production — Hardening Your Event Streaming
summary: Production configuration for Kafka — consumer groups, partitioning, idempotent producers, dead letter queues, monitoring, and the operational patterns that prevent data loss. Beginner-friendly with line-by-line code.
order: 7
minutes: 22
topics: [Kafka production, consumer groups, partitioning, idempotent producer, DLQ, monitoring, exactly-once, production config]
docs:
  - https://kafka.apache.org/documentation/#producerconfigs
  - https://docs.spring.io/spring-kafka/reference/html/
---

# Kafka in Production — Hardening Your Event Streaming

## What Changes in Production? (From Zero)

Getting Kafka working in development is easy. Making it work reliably in production — with exactly-once delivery, consumer group rebalancing, partition ordering, and dead letter queues — is where the real engineering happens.

### Production vs Development

| Concern | Development | Production |
|---|---|---|
| Broker count | 1 | 3+ (replication) |
| Acknowledgments | `acks=0` (fire-and-forget) | `acks=all` (durable) |
| Retries | `retries=0` | `retries=Integer.MAX_VALUE` |
| Dead letter queue | None | Every topic has a DLQ |
| Monitoring | Logs only | Metrics, alerts, dashboards |
| Idempotency | Not needed | Every producer is idempotent |

---

## The Code — Line by Line

### Production Producer Configuration

```java
@Bean
public ProducerFactory<String, OrderEvent> producerFactory() {
    Map<String, Object> config = new HashMap<>();

    // Bootstrap servers (multiple for HA):
    config.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG,
        "kafka-1:9092,kafka-2:9092,kafka-3:9092");

    // Serialization:
    config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
    config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);

    // Durability: wait for ALL replicas to acknowledge:
    config.put(ProducerConfig.ACKS_CONFIG, "all");              // "all" = wait for ISR replicas

    // Reliability: retry on transient failures:
    config.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);  // Retry forever (with backoff)
    config.put(ProducerConfig.RETRY_BACKOFF_MS_CONFIG, 1000);     // Wait 1s between retries

    // Idempotency: prevent duplicate messages:
    config.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);   // Each message written exactly once
    config.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5);  // Allow 5 concurrent requests

    // Batching (performance):
    config.put(ProducerConfig.BATCH_SIZE_CONFIG, 16384);         // 16KB batch size
    config.put(ProducerConfig.LINGER_MS_CONFIG, 5);              // Wait 5ms to fill batch

    // Compression:
    config.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "snappy"); // Compress for network efficiency

    return new DefaultKafkaProducerFactory<>(config);
}
```

**Line-by-line explained:**
- `ACKS_CONFIG = "all"` — The producer waits until all in-sync replicas (ISR) have written the message. This prevents data loss if a broker crashes.
- `RETRIES_CONFIG = Integer.MAX_VALUE` — Retry forever on transient errors (broker temporarily unavailable). The default (0) means "give up immediately."
- `ENABLE_IDEMPOTENCE_CONFIG = true` — Each producer assigns a sequence number to each message. The broker deduplicates automatically. Prevents duplicates from retries.
- `BATCH_SIZE_CONFIG + LINGER_MS_CONFIG` — Batching: collect multiple messages and send them together. Better throughput than sending one at a time.

### Production Consumer Configuration

```java
@Bean
public ConcurrentKafkaListenerContainerFactory<String, OrderEvent> kafkaListenerContainerFactory() {
    ConcurrentKafkaListenerContainerFactory<String, OrderEvent> factory =
        new ConcurrentKafkaListenerContainerFactory<>();

    factory.setConsumerFactory(consumerFactory());
    factory.setConcurrency(3);                             // 3 consumer threads (match partitions)

    // Acknowledgment mode:
    factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
    // Manually acknowledge AFTER processing — prevents data loss

    // Retry and DLQ:
    factory.setCommonErrorHandler(dltHandler());

    // Shutdown:
    factory.getContainerProperties().setStopImmediate(true);  // Stop processing immediately on shutdown

    return factory;
}

@Bean
public ConsumerFactory<String, OrderEvent> consumerFactory() {
    Map<String, Object> config = new HashMap<>();

    config.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG,
        "kafka-1:9092,kafka-2:9092,kafka-3:9092");

    config.put(ConsumerConfig.GROUP_ID_CONFIG, "order-processing-group");
    config.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
    config.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class);

    // Auto-offset reset: start from beginning if no offset exists:
    config.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");

    // Don't auto-commit — we'll commit manually after processing:
    config.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);

    // Max poll records (prevent rebalancing):
    config.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 100);   // Process 100 at a time

    return new DefaultKafkaConsumerFactory<>(config);
}
```

**Line-by-line explained:**
- `setConcurrency(3)` — 3 consumer threads. Should match the number of partitions for optimal parallelism.
- `AckMode.MANUAL_IMMEDIATE` — The consumer acknowledges each message individually after processing. If the consumer crashes mid-batch, unacknowledged messages are redelivered.
- `AUTO_OFFSET_RESET_CONFIG = "earliest"` — If this consumer group has never consumed this topic, start from the beginning. Don't lose messages.
- `ENABLE_AUTO_COMMIT_CONFIG = false` — Don't auto-commit offsets. Commit only after successful processing.

### Dead Letter Queue (DLQ)

```java
@Bean
public DefaultErrorHandler dltHandler() {
    // When a message fails after all retries, send it to the DLQ:
    DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(kafkaTemplate);

    DefaultErrorHandler errorHandler = new DefaultErrorHandler(
        recoverer,
        new FixedBackOff(1000L, 3L)     // Retry 3 times with 1s delay before DLQ
    );

    // Don't retry for these exceptions (permanent failures):
    errorHandler.addNotRetryableExceptions(
        ValidationException.class,       // Bad data — retrying won't help
        SerializationException.class     // Can't deserialize — retrying won't help
    );

    return errorHandler;
}

// DLQ consumer — monitor and alert on failed messages:
@KafkaListener(topics = "order-events.DLT", groupId = "dlq-monitor")
public void handleDLT(OrderEvent event,
                      @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
                      @Header(KafkaHeaders.EXCEPTION_MESSAGE) String error) {
    log.error("Message failed: topic={}, error={}, event={}", topic, error, event);
    alertService.send("Kafka DLQ: message failed in " + topic);
    dlqRepository.save(new DLQEntry(topic, event, error, Instant.now()));
}
```

---

## Real-World Scenarios

### Scenario 1: Exactly-Once Order Processing

```java
@Service
public class OrderEventHandler {

    @KafkaListener(topics = "order-events", groupId = "order-processing")
    public void handleOrderEvent(OrderEvent event, Acknowledgment ack) {
        try {
            // 1. Check if already processed (idempotency):
            if (processedEvents.contains(event.getEventId())) {
                ack.acknowledge();     // Skip — already processed
                return;
            }

            // 2. Process the event:
            orderService.processPayment(event.getOrderId(), event.getAmount());

            // 3. Mark as processed:
            processedEvents.add(event.getEventId());

            // 4. Acknowledge:
            ack.acknowledge();         // Offset committed — won't be redelivered

        } catch (Exception e) {
            log.error("Failed to process event {}: {}", event.getEventId(), e.getMessage());
            // Don't acknowledge — message will be redelivered
            // After max retries, it goes to DLQ
            throw e;
        }
    }
}
```

### Scenario 2: Partition Ordering

```java
// Key-based partitioning ensures messages with the same key go to the same partition:
kafkaTemplate.send("order-events", order.getCustomerId(), orderEvent);
// ↑ CustomerId is the KEY → all events for the same customer are ordered

// The consumer processes each partition sequentially:
@KafkaListener(topics = "order-events", concurrency = "3")  // 3 partitions
public void handle(OrderEvent event) {
    // Within each partition, events are processed IN ORDER
    // Across partitions, order is not guaranteed
}
```

### Scenario 3: Consumer Group Scaling

```
Before scaling (1 consumer, 3 partitions):
  Partition 0 → Consumer A
  Partition 1 → Consumer A
  Partition 2 → Consumer A

After scaling (3 consumers, 3 partitions):
  Partition 0 → Consumer A
  Partition 1 → Consumer B
  Partition 2 → Consumer C

Consumer D joins (4 consumers, 3 partitions):
  Partition 0 → Consumer A
  Partition 1 → Consumer B
  Partition 2 → Consumer C
  Consumer D → idle (no partition assigned)
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| `acks=0` or `acks=1` in production | Messages lost on broker crash | Use `acks=all` |
| No DLQ | Failed messages are lost forever | Configure DLQ for every topic |
| Auto-commit in consumer | Processed but uncommitted messages are redelivered | Use manual acknowledgment |
| Not monitoring consumer lag | Consumers fall behind, processing delay grows | Alert when lag > threshold |
| Not matching concurrency to partitions | Underutilized or rebalancing | Set `concurrency = number of partitions` |

---

## Key Takeaways

- **`acks=all` + idempotent producers** = no data loss, no duplicates.
- **Manual acknowledgment** = process-then-commit = no data loss on consumer crash.
- **Dead Letter Queue** = failed messages are captured, not lost. Always configure one.
- **Match consumer concurrency to partition count** for optimal throughput.
- **Monitor consumer lag** — it's the most important Kafka metric in production.

Official docs: [Kafka Producer Config](https://kafka.apache.org/documentation/#producerconfigs) · [Spring Kafka](https://docs.spring.io/spring-kafka/reference/html/)
