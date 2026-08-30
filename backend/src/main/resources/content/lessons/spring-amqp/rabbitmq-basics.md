---
title: RabbitMQ & AMQP Fundamentals
module: spring-amqp
order: 1
minutes: 25
topics: ["RabbitMQ", "AMQP", "exchanges", "queues", "bindings", "Spring AMQP setup"]
summary: RabbitMQ is the most widely deployed opensource message broker. Its AMQP 091 model — exchanges, queues, bindings — is the mental model behind Sprin...
docs:
  - title: "Spring AMQP reference"
    url: "https://docs.spring.io/spring-amqp/reference/"
---

# RabbitMQ & AMQP Fundamentals

RabbitMQ is the most widely deployed open-source message broker. Its AMQP 0-9-1 model — exchanges, queues, bindings — is the mental model behind Spring AMQP's `RabbitTemplate` and `@RabbitListener`. This lesson builds that model from the ground up.

## Why Messaging?

Messaging decouples producers from consumers:

```
Producer ──▶ Exchange ──▶ Queue ──▶ Consumer
              (router)   (buffer)
```

- **Decoupling** — producer doesn't know consumers, or even if any exist.
- **Buffering** — queues absorb bursts; consumers drain at their own pace.
- **Reliability** — messages survive consumer restarts (durable queues + persisted messages).
- **Fan-out** — one event, many independent consumers.

## The AMQP Model

Unlike Kafka (topic log), AMQP has four components:

| Component | Role |
|-----------|------|
| **Exchange** | Receives messages from producers, routes them |
| **Queue** | Buffers messages until consumed |
| **Binding** | Rule connecting an exchange to a queue |
| **Message** | Payload + headers + routing key |

The producer never sends "to a queue" — it sends to an **exchange** with a **routing key**. The exchange decides where it goes.

## The Four Exchange Types

### Direct — exact routing key match

```
        ┌── binding: routingKey="orders.new" ──▶ Queue A
Exchange ┤
        └── binding: routingKey="orders.cancel" ─▶ Queue B
```

### Topic — wildcard patterns

```
binding: "orders.*"     → orders.new, orders.cancel   (* one word)
binding: "orders.#"     → orders.new.urgent           (# many words)
binding: "audit.#"      → audit, audit.orders.new
```

### Fanout — broadcast to every bound queue

```
Exchange ──▶ Queue A
        ──▶ Queue B     (routing key ignored)
        ──▶ Queue C
```

### Headers — route on header values (rare)

## Defining Topology in Spring

```java
@Configuration
public class RabbitConfig {

    @Bean
    public TopicExchange ordersExchange() {
        return new TopicExchange("orders.exchange", true, false);
    }

    @Bean
    public Queue newOrdersQueue() {
        return QueueBuilder.durable("orders.new").build();
    }

    @Bean
    public Queue cancelledOrdersQueue() {
        return QueueBuilder.durable("orders.cancelled").build();
    }

    @Bean
    public Binding newOrdersBinding() {
        return BindingBuilder.bind(newOrdersQueue())
            .to(ordersExchange()).with("orders.new");
    }

    @Bean
    public Binding cancelledBinding() {
        return BindingBuilder.bind(cancelledOrdersQueue())
            .to(ordersExchange()).with("orders.cancelled");
    }
}
```

`durable` queues survive broker restarts; `autoDelete(false)` keeps them until explicitly removed.

## Sending With RabbitTemplate

```java
@Service
public class OrderPublisher {

    private final RabbitTemplate rabbitTemplate;

    public void orderCreated(Order order) {
        OrderEvent event = new OrderEvent(order.getId(), order.getTotal());
        rabbitTemplate.convertAndSend(
            "orders.exchange",      // exchange
            "orders.new",           // routing key
            event,                  // payload → JSON via Jackson converter
            m -> {
                m.getMessageProperties().setDeliveryMode(MessageDeliveryMode.PERSISTENT);
                m.getMessageProperties().setCorrelationId(UUID.randomUUID().toString());
                return m;
            });
    }
}
```

`convertAndSend` serializes POJOs with the configured `MessageConverter` (Jackson JSON by default in Boot).

## Consuming With @RabbitListener

```java
@Component
public class OrderConsumer {

    @RabbitListener(queues = "orders.new")
    public void onOrderCreated(OrderEvent event) {
        log.info("Processing order {}", event.orderId());
        inventoryService.reserve(event.orderId());
    }
}
```

The listener runs on the listener container's threads, automatically: deserializes the message, invokes the method, **acks on success** and **nacks on exception** (default: requeue).

## Message Acknowledgement Modes

```yaml
spring:
  rabbitmq:
    listener:
      simple:
        acknowledge-mode: auto    # default
```

| Mode | Behavior |
|------|----------|
| `AUTO` (default) | Ack on normal return; requeue on exception |
| `MANUAL` | Your code calls `channel.basicAck/nack` |
| `NONE` | Broker assumes delivery succeeded (at-most-once) |

AUTO is right for most cases; MANUAL when you need fine-grained control (e.g., ack after a multi-step process completes); NONE only for disposable/duplicate-tolerant data.

## Configuring the Listener Container

```java
@Bean
public RabbitListenerContainerFactory<SimpleMessageListenerContainer>
        rabbitListenerContainerFactory(ConnectionFactory connectionFactory) {
    SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
    factory.setConnectionFactory(connectionFactory);
    factory.setConcurrentConsumers(2);
    factory.setMaxConcurrentConsumers(8);
    factory.setPrefetchCount(10);
    factory.setDefaultRequeueRejected(false);   // don't loop poison messages
    factory.setAcknowledgeMode(AcknowledgeMode.AUTO);
    return factory;
}
```

**Concurrency**: `concurrentConsumers` × `prefetchCount` is your throughput dial. **`defaultRequeueRejected(false)`**: poison messages (that always throw) go to the DLQ instead of looping forever.

## Message Converters

```java
@Bean
public Jackson2JsonMessageConverter jsonMessageConverter(ObjectMapper objectMapper) {
    Jackson2JsonMessageConverter converter = new Jackson2JsonMessageConverter(objectMapper);
    converter.setCreateMessageIds(true);
    return converter;
}
```

Set it on both sides (producer + consumer factory) and POJOs round-trip as JSON with `__TypeId__` headers for polymorphic safety.

## Failure Modes

| Failure | Default behavior | Fix |
|---------|------------------|-----|
| Consumer throws | Message requeued → retried forever | DLQ + `defaultRequeueRejected(false)` |
| Broker down at publish | `PublisherReturns` — message lost | Publisher confirms + retry |
| Queue full | Message dropped | Publisher confirms, monitor queue depth |
| Slow consumer | Prefetch buffer grows | Tune prefetch, scale consumers |

## Summary

| Concept | Spring AMQP |
|---------|-------------|
| Exchange | `TopicExchange`/`DirectExchange`/`FanoutExchange` beans |
| Queue | `QueueBuilder.durable(...)` |
| Binding | `BindingBuilder.bind(queue).to(exchange).with(key)` |
| Publish | `rabbitTemplate.convertAndSend(exchange, key, payload)` |
| Consume | `@RabbitListener(queues = "...")` |
| Serialization | `Jackson2JsonMessageConverter` |
| Acks | `AUTO` default; requeue on failure; DLQ for poison |

RabbitMQ's model is small and precise: exchanges route, queues buffer, listeners consume. Spring AMQP wraps it so the entire topology is beans and annotations — the next lessons cover reliability, retries/DLQs, and request/reply patterns.
