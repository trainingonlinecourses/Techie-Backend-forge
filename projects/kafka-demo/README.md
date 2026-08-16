# Kafka Demo — Outbox, Consumers & DLT

A runnable Spring Kafka application demonstrating the Spring Kafka module end to end:

- **Transactional outbox pattern** — `POST /api/orders` writes the order **and** an outbox
  row in one DB transaction; a polling relay publishes `OrderCreated` to the `orders` topic.
- **Consumer groups** — the `order-processors` group consumes the topic with a
  processed-events table for **idempotency** (at-least-once delivery is the default).
- **Retries & DLQs** — `@RetryableTopic` retries failing notifications with backoff, then a
  `@DltHandler` records the permanent failure on the dead letter topic.

## Run it

```bash
cd projects/kafka-demo
docker compose up -d          # Kafka on :9092, Kafka UI on http://localhost:8085
mvn spring-boot:run           # app on :9095
```

## Try it

```bash
# 1. Create an order → outbox row + OrderCreated event published + consumed
curl -X POST localhost:9095/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"customerId":"c1","amount":"19.99"}'

# 2. Watch the consumer log: "Processed OrderCreated 1 (customer c1, amount 19.99)"
#    and confirm the outbox drained:
curl localhost:9095/api/outbox/pending-count   # → 0

# 3. Send a notification that always fails → retries → DLT
curl -X POST localhost:9095/api/notifications \
  -H 'Content-Type: application/json' \
  -d '{"id":"n1","message":"boom fail"}'
sleep 5
curl localhost:9095/api/notifications/stats    # handled: []  dead: [n1]

# 4. Send a healthy one → handled on the first attempt
curl -X POST localhost:9095/api/notifications \
  -H 'Content-Type: application/json' \
  -d '{"id":"n2","message":"hello"}'
curl localhost:9095/api/notifications/stats    # handled: [n2]
```

## Tests

```bash
mvn test
```

Two embedded-broker (`@EmbeddedKafka`) integration tests, no Docker needed:

- `OutboxRelayTest` — create order → relay publishes → consumer records the event (idempotency row).
- `RetryDltTest` — failing message exhausts retries and lands in the DLT; healthy message is handled.

## Project layout

| Package | Responsibility |
|---|---|
| `order` | Order entity + `OrderService` (writes outbox row in the same `@Transactional`) |
| `outbox` | `OutboxEntry`, `OutboxRepository`, `OutboxRelay` (`@Scheduled` poller) |
| `events` | `OrderCreated` — past-fact event with a stable id |
| `consumer` | `OrderEventConsumer` — idempotent listener in the `order-processors` group |
| `retry` | `NotificationListener` — `@RetryableTopic` + `@DltHandler` |
| `config` | JSON producer/consumer factories and listener container factory |

Official docs: [Spring Kafka Reference](https://docs.spring.io/spring-kafka/reference/),
[Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html),
[RetryTopic](https://docs.spring.io/spring-kafka/reference/retrytopic/index.html).
