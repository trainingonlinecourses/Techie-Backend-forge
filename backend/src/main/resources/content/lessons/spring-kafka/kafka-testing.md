---
title: Testing Kafka Applications
summary: EmbeddedKafka, Testcontainers, testing producers, consumers and the outbox relay, and DLT assertions.
order: 6
minutes: 18
topics: [kafka, testing, embeddedkafka, testcontainers, integration-test]
docs:
  - https://docs.spring.io/spring-kafka/reference/testing.html
  - https://docs.spring.io/spring-boot/reference/testing/testcontainers.html
---

# Testing Kafka Applications

## What to test

| Layer | What can go wrong | Test |
|---|---|---|
| Serialization | Event JSON → wrong class / missing fields | Unit: serde round-trip |
| Producer logic | Right topic, right key, right payload | `@EmbeddedKafka` + `KafkaTemplate` assert |
| Consumer logic | Payload → business effect | `@EmbeddedKafka` + listener + assertion |
| **Outbox relay** | Row → event on the right topic, marked published | Integration: create order → await event |
| Retry/DLT | Failures land in DLT, not lost | `@EmbeddedKafka` + failing listener |

## @EmbeddedKafka — a real broker in your test JVM

The `spring-kafka-test` dependency ships an in-process Kafka broker — no Docker needed, fast, perfect for logic tests:

```java
@SpringBootTest
@EmbeddedKafka(partitions = 1, topics = { "orders", "notifications" })
class OutboxFlowTest {

    @Autowired KafkaTemplate<String, Object> kafka;

    @Test
    void event_reaches_listener() throws Exception {
        kafka.send("orders", "order-1", new OrderCreated("order-1", "cust-1", new BigDecimal("19.99")));

        // Awaitility: the listener is async — wait for the side effect
        await().atMost(5, TimeUnit.SECONDS).until(() -> processedStore.contains("order-1"));
    }
}
```

Key rules for embedded tests:

- **Async = await.** Listeners run on container threads; assert with Awaitility or `CountDownLatch`, never `Thread.sleep(2)`.
- **Point the app at the embedded broker.** In tests, `spring.kafka.bootstrap-servers` is auto-overridden to the embedded broker by `@EmbeddedKafka` when you inject properties — or set `spring.kafka.bootstrap-servers=${spring.embedded.kafka.brokers}`.
- **Test your group id** — a listener asserting on a shared topic can race with other tests; use distinct topics per test class.

## Testing the outbox relay end to end (what the demo project does)

```java
@SpringBootTest
@EmbeddedKafka(partitions = 1, topics = "orders")
class OutboxRelayTest {

    @Autowired OrderService orders;
    @Autowired OrderEventConsumer consumer; // captures events it receives

    @Test
    void create_order_publishes_event() {
        Order order = orders.createOrder(new CreateOrderRequest("cust-1", "19.99"));

        await().atMost(10, TimeUnit.SECONDS)
               .untilAsserted(() -> assertThat(consumer.received()).anyMatch(
                   e -> e.orderId().equals(order.getId())));
    }
}
```

This is the test that matters most: **business transaction → outbox row → relay → Kafka → consumer**, all in one. If it passes, your consistency backbone works.

## Testing retries and the DLT

```java
@SpringBootTest
@EmbeddedKafka(partitions = 1, topics = "notifications")
class RetryDltTest {

    @Autowired KafkaTemplate<String, Object> kafka;

    @Test
    void failing_message_ends_in_dlt() {
        kafka.send("notifications", "always-fails", new Notification("boom"));

        await().atMost(20, TimeUnit.SECONDS).untilAsserted(() ->
            assertThat(dltStore.received()).extracting(Notification::id).contains("boom"));
    }
}
```

Use short backoff in tests (`@RetryableTopic(backoff = @Backoff(delay = 100, multiplier = 1.0))` via a test property override) so retries don't make the test slow.

## Testcontainers — when embedded isn't enough

Use a real Kafka container when you need: multiple brokers (replication), schema registry integration, or production-fidelity behavior. `spring-kafka-test` also ships `KafkaContainer` via `testcontainers`:

```java
@Testcontainers
class KafkaContainerIT {
    @Container
    static final KafkaContainer KAFKA = new KafkaContainer(DockerImageName
            .parse("confluentinc/cp-kafka:7.6.0"));
}
```

The trade-off: Docker required, slower, but catches real-broker bugs (serde headers, partition behavior) that embedded mode glosses over. Common strategy: **embedded for fast CI unit-ish tests, containers for the critical flows.**

> **Why it matters (organizational view)** — Messaging bugs are the most expensive bugs to find in production (they surface as data loss and order weirdness, not stack traces). The org should treat the **outbox→relay→consumer→effect** flow test as mandatory for every event-emitting feature, and run embedded-Kafka tests in CI so they're fast. A failing DLT test means "your failure handling is broken" — catch it before a real incident, not after.

## Key takeaways

- `@EmbeddedKafka` = real in-process broker, no Docker, ideal for CI.
- Always await async side effects (Awaitility / latches), never sleep.
- The outbox end-to-end test (transaction → relay → topic → listener) is the most valuable test in the module.
- Test DLT routing with failing messages and short backoff.
- Testcontainers `KafkaContainer` when you need production fidelity (serde, replication, Schema Registry).

## Official docs

- [Spring Kafka — Testing Support](https://docs.spring.io/spring-kafka/reference/testing.html)
- [Spring Boot — Testcontainers](https://docs.spring.io/spring-boot/reference/testing/testcontainers.html)
- [Awaitility](https://github.com/awaitility/awaitility)
