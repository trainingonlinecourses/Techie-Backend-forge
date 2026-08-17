---
title: Spring Cloud Stream
summary: Event-driven microservices with a bindable messaging abstraction — functional binders, Kafka/Rabbit backends, consumer groups, partitioning and error handling.
order: 8
minutes: 15
topics: [spring cloud stream, binders, event-driven, consumer groups, kafka, rabbitmq]
docs:
  - https://docs.spring.io/spring-cloud-stream/reference/
  - https://docs.spring.io/spring-cloud-stream/reference/kafka/
---

# Spring Cloud Stream

## What it is

Spring Cloud Stream is the **messaging abstraction** for event-driven microservices: you write producers/consumers against a neutral API, and a *binder* connects it to the real broker (Kafka, RabbitMQ, or others). The same code runs on either — swapping `spring-cloud-starter-stream-kafka` for `-rabbit` changes only the config.

## Functional binding (the modern API)

Since Spring Cloud Stream 3.x, bindings are plain `java.util.function` beans — no more legacy `@EnableBinding`/`@StreamListener`:

```java
@Configuration
public class OrderBindings {

    // Consume: any method that takes a message and returns void/Publisher
    @Bean
    Consumer<OrderCreated> onOrderCreated() {
        return event -> orderService.handle(event);
    }

    // Produce: a Supplier streams into the broker
    @Bean
    Supplier<OrderShipped> shipOrders() {
        return () -> orderService.nextToShip();
    }
}
```

The bean name *is* the binding name: `onOrderCreated` → consumer binding, `shipOrders` → producer binding. Config wires names to destinations:

```yaml
spring:
  cloud:
    stream:
      bindings:
        onOrderCreated-in-0:          # <function>-in-<index>
          destination: orders.created # broker topic/queue
          group: order-service        # consumer group
        shipOrders-out-0:
          destination: orders.shipped
```

## Consumer groups and partitioning

- **Consumer groups**: multiple instances of `order-service` in the same `group` **share** the partition stream — each event reaches exactly one instance (competing consumers, exactly the Kafka model). Change the group name and every instance gets every event.
- **Partitioning**: keep related events on the same partition so a consumer can maintain ordering — all events for `customerId=42` on one partition:

```yaml
spring.cloud.stream.bindings.shipOrders-out-0.producer:
  partition-key-expression: payload.customerId
  partition-count: 6
```

## Content type & serialization

Spring Cloud Stream uses **content-type negotiation** (like HTTP headers) plus `application/json` by default. A `Message<OrderCreated>` with JSON payload is automatically converted with Jackson — record types work out of the box. Custom types need `spring.cloud.stream.bindings.<binding>.content-type: application/json` and a deserializer for the payload type.

## Error handling: retries and DLQs

Failures are retried by default (3 attempts); after that the message is sent to an **error destination** (the DLQ pattern):

```yaml
spring.cloud.stream.bindings.onOrderCreated-in-0.consumer:
  max-attempts: 5
  back-off-initial-interval: 1000
  back-off-multiplier: 2.0

# Where the poison message goes:
spring.cloud.stream.bindings.onOrderCreated-in-0.consumer:
  enable-dlq: true
  dlq-name: orders.created.dlq
```

A separate `Consumer<Message<?>>` on the DLQ binding can log, alert, or park the message for manual replay — the same DLQ discipline as the Kafka module in this curriculum.

## Why it beats hand-rolled Kafka listeners

- **Binder abstraction** — vendor-neutral code; config-only switch between Kafka and Rabbit.
- **Poison-message handling, retries and DLQs are declarative** — you don't implement the retry loop.
- **Binding naming conventions** (`-in-0`/`-out-0`) are consistent and testable.
- **Test binder** — `spring-cloud-stream-test-binder` replaces the broker in tests with an in-memory implementation, so integration tests don't need Kafka running:

```java
@SpringBootTest
@AutoConfigureOutputBindings
class OrderBindingsTest {
    @Test
    void publishes() {
        // assert that shipOrders() emitted onto the output binding
    }
}
```

## Key takeaways

- Functional beans (`Consumer`/`Supplier`/`Function`) are the bindings; the bean name determines the binding name.
- `destination` = broker topic; `group` = competing-consumer set; partition keys keep related events ordered.
- Retries and DLQs are configuration, not code — the poison-message discipline comes free.
- The binder abstraction and the test binder keep broker choice (and broker-in-test) out of your business logic.

Official docs: [Spring Cloud Stream](https://docs.spring.io/spring-cloud-stream/reference/) · [Kafka binder reference](https://docs.spring.io/spring-cloud-stream/reference/kafka/)
