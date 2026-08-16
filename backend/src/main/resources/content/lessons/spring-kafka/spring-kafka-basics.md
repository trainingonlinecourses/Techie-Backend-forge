---
title: Spring Kafka — Producers & Listeners
summary: KafkaTemplate, @KafkaListener, JSON serialization, config, and the consumer container that powers it all.
order: 2
minutes: 20
topics: [spring-kafka, kafkatemplate, kafkalistener, serde, json]
docs:
  - https://docs.spring.io/spring-kafka/reference/quick-tour.html
  - https://docs.spring.io/spring-kafka/reference/kafka/receiving-messages/receiving-messages.html
---

# Spring Kafka — Producers & Listeners

## The two building blocks

Spring Kafka gives you a producer and a consumer abstraction over the native client:

- **`KafkaTemplate<K, V>`** — send a record to a topic. Built on a `ProducerFactory` (which needs the broker address and serializers).
- **`@KafkaListener`** — a method that receives records from a topic, backed by a **`ConcurrentMessageListenerContainer`** (threads → consumers → partitions).

## Producer — KafkaTemplate

```java
@Service
public class OrderEventPublisher {

    private final KafkaTemplate<String, Object> kafka;

    public OrderEventPublisher(KafkaTemplate<String, Object> kafka) {
        this.kafka = kafka;
    }

    public void orderCreated(OrderCreated event) {
        // key = aggregate id → same order always lands on the same partition → ordered per order
        kafka.send("orders", event.orderId().toString(), event);
    }
}
```

The **key** decides partitioning: same key → same partition → strict per-key ordering. No key → round-robin (good for parallelism, no ordering guarantee).

## Consumer — @KafkaListener

```java
@Component
public class OrderEventConsumer {

    @KafkaListener(topics = "orders", groupId = "order-processors")
    public void onOrderCreated(OrderCreated event) {
        // process the event. If this throws, the message is redelivered (at-least-once).
        warehouseService.reserveStock(event);
    }
}
```

The method runs in the **consumer container**; returning normally commits the offset. Throwing triggers redelivery — which is why listeners must be **idempotent** (process by event id).

## Configuration (application.yml)

```yaml
spring:
  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
      acks: all
    consumer:
      group-id: order-processors
      auto-offset-reset: earliest
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      properties:
        spring.json.trusted.packages: "com.acme.messaging"
```

The `JsonSerializer`/`JsonDeserializer` pair handles **type headers**: the producer writes `__TypeId__` into the record, so the consumer knows which class to deserialize into. The deserializer needs `spring.json.trusted.packages` pointing at your event package (it refuses unknown types — a security default).

## Records, batches and concurrency

```java
@KafkaListener(topics = "orders", groupId = "order-processors",
               concurrency = "3") // 3 threads → 3 consumers in this group
public void onOrder(List<OrderCreated> batch) { // batch mode: use ConsumerRecord or List
    ...
}
```

- Default is one record per call; `concurrency` spins up multiple consumers that split the topic's partitions.
- **A partition is always processed by exactly one consumer in a group** — scaling past the partition count doesn't help.
- Ordering is per-partition; if you need strict global ordering, one partition (and you lose parallelism).

## Callbacks and async errors

```java
CompletableFuture<SendResult<String, Object>> future = kafka.send("orders", key, event);
future.whenComplete((res, ex) -> {
    if (ex != null) log.error("Failed to publish order event {}", event.orderId(), ex);
});
```

`send` is async — check the future or listen for errors, and **never swallow producer exceptions silently** (the message is lost).

> **Why it matters (organizational view)** — Standardize the *shape* of your events and the *mechanics* of publishing: one event class package (`events`), one serde convention (JSON + type headers, later Avro + Schema Registry), keys = aggregate ids, and every listener idempotent. Teams that skip these conventions get events with different shapes, mismatched types, and consumers that can't safely redeploy. Also standardize `groupId` naming (`<service>-<purpose>`) so consumer lag is attributable to a team.

## Key takeaways

- `KafkaTemplate.send(topic, key, payload)` is the producer API; key = partition = ordering.
- `@KafkaListener(topics, groupId)` is the consumer API; throw = redelivery = at-least-once.
- JSON serde with type headers; configure `spring.json.trusted.packages`.
- `concurrency` on the listener = threads in the group; ordering is per-partition.
- `auto-offset-reset: earliest` matters for new groups (replay vs skip).

## Official docs

- [Spring Kafka Quick Tour](https://docs.spring.io/spring-kafka/reference/quick-tour.html)
- [Receiving Messages (@KafkaListener)](https://docs.spring.io/spring-kafka/reference/kafka/receiving-messages/receiving-messages.html)
- [Apache Kafka Producer/Consumer docs](https://kafka.apache.org/documentation/#producerapi)
