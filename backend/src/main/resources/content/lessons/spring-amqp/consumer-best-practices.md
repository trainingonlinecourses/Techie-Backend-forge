---
title: Consumer Concurrency & Best Practices
module: spring-amqp
order: 5
minutes: 22
topics: ["concurrency", "prefetch", "message ordering", "batching", "backpressure", "consumer tuning"]
docs:
  - title: "Listener concurrency"
    url: "https://docs.spring.io/spring-amqp/reference/consumer-concurrency.html"
---

# Consumer Concurrency & Best Practices

A listener that processes one message at a time wastes the broker and your database. A listener with the wrong concurrency settings floods memory or reorders business events. This lesson is the tuning guide: prefetch, concurrency, ordering, and the failure modes in between.

## The Throughput Trio

```
Listener throughput ≈ concurrentConsumers × prefetchCount ÷ processing time
```

| Setting | What it controls | Effect of raising it |
|---------|------------------|----------------------|
| `concurrentConsumers` | Listener threads | More parallel processing |
| `maxConcurrentConsumers` | Ceiling (auto-scaling) | Handles bursts |
| `prefetchCount` | Messages buffered per consumer | Fewer network round-trips, more memory |

## Prefetch: The Memory/Throughput Trade

```yaml
spring:
  rabbitmq:
    listener:
      simple:
        prefetch: 10
```

- **Low prefetch (1–3)**: each consumer holds few messages; memory-bounded; more round-trips. Good for slow, expensive processing.
- **High prefetch (10–100)**: consumers grab big batches; fewer round-trips; **memory grows with prefetch × message size**. Good for fast, cheap processing.

A 100-message prefetch of 10KB messages = 1MB buffered *per consumer thread*. With 50 threads that's 50MB just in buffers — plus the unacked messages are *invisible to other consumers*.

## Concurrency

```java
@Bean
public SimpleRabbitListenerContainerFactory factory(ConnectionFactory connectionFactory) {
    SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
    factory.setConnectionFactory(connectionFactory);
    factory.setConcurrentConsumers(4);
    factory.setMaxConcurrentConsumers(16);
    factory.setPrefetchCount(10);
    factory.setBatchListener(true);               // batch mode (below)
    return factory;
}
```

`maxConcurrentConsumers` only grows when the queue is busy — Spring monitors queue depth and scales the pool up and down. Start at 1–4 concurrent consumers; scale with load tests, not guesswork.

## Message Ordering: The Hard Constraint

RabbitMQ preserves order **within a single queue for a single consumer** — and only while that consumer keeps acks in order. The moment you add concurrency, ordering across messages is lost:

```
Queue: [A, B, C]
Consumer 1 takes A, Consumer 2 takes B → B may finish before A
```

**If order matters** (money movements, state machines):

```java
// Option 1: one consumer per queue
factory.setConcurrentConsumers(1);

// Option 2: partition by key — one queue per partition (like Kafka)
//   routing key = orderId → all events for one order hit one queue
```

```java
public void orderEvent(OrderEvent event) {
    String partition = "orders." + (event.orderId().hashCode() % 8);
    template.convertAndSend("orders.exchange", partition, event);
}
```

Per-key partitioning with 8 queues gives parallelism *and* per-order ordering. The universal rule: **order only matters within the same key; partition by key.**

## Idempotency + Ordering

Even with perfect ordering, redelivery can reorder (a requeued message goes to the back). Idempotent consumers make "out of order" harmless:

```java
@RabbitListener(queues = "orders.new")
public void onOrderCreated(OrderEvent event) {
    orderStateMachine.apply(event);   // state machine rejects stale transitions
}
```

A state machine that only accepts legal transitions (NEW → PAID, never PAID → NEW) tolerates duplicates and reordering gracefully.

## Batching: Fewer Round-Trips

Spring AMQP supports batch listeners that receive arrays of messages:

```java
@RabbitListener(queues = "audit.logs")
public void onBatch(List<AuditEvent> events) {
    auditRepository.saveAll(events);       // one DB batch instead of N inserts
}
```

```yaml
spring:
  rabbitmq:
    listener:
      simple:
        batch-listener: true
```

For high-volume, order-independent workloads (audit logs, metrics, notifications), batching 10–100 messages per DB write is a 10–100× write-throughput win.

## Backpressure: Don't Outpace the Downstream

If consumers process faster than the DB can absorb, the DB melts. Prefetch is the natural backpressure: cap it so in-flight uncommitted work never exceeds what the downstream tolerates:

```
max in-flight work = concurrentConsumers × prefetchCount
                   = 8 × 10 = 80 messages in flight
```

If each message takes 50ms of DB time, the DB sees 80/50ms = 1600 msg/s max — regardless of broker throughput. Prefetch is your safety valve.

## The Consumer Checklist

| Concern | Setting |
|---------|---------|
| Base parallelism | `concurrentConsumers: 4` |
| Burst headroom | `maxConcurrentConsumers: 16` |
| Memory bound | `prefetch: 10` (tune by message size) |
| Ordering | Single consumer per queue OR partition by key |
| Idempotency | Unique-key claim in the DB |
| Poison safety | `defaultRequeueRejected: false` + DLQ |
| Error visibility | Error-handler bean + DLQ counters |
| Graceful shutdown | `forceCloseChannel` + await termination |

## The ErrorHandler

```java
@Bean
public RabbitListenerErrorHandler rabbitErrorHandler(MeterRegistry registry) {
    return (amqpMessage, message, listenerException) -> {
        registry.counter("amqp.listener.errors",
            "listener", listenerException.getFailedListenerMethod().toString())
            .increment();
        log.error("Listener failed", listenerException.getCause());
        throw listenerException;   // → retry ladder / DLQ
    };
}
```

```java
factory.setErrorHandler(rabbitErrorHandler);
```

The error handler sees every listener failure — the perfect place for metrics and alerting.

## Monitoring Consumers

```bash
# RabbitMQ management UI
rabbitmqctl list_queues name messages messages_unacknowledged consumers
```

Alert on:
- **Unacked messages climbing** — consumers stuck or too slow
- **Queue depth growing** — production outpacing consumption
- **DLQ rate rising** — regression or poison storm

## Summary

| Goal | Setting |
|------|---------|
| Throughput | Raise concurrency + prefetch (measure first) |
| Memory bound | Cap prefetch × message size |
| Ordering | One consumer per queue, or partition by key |
| Safety | Idempotency + state machines + DLQ |
| Backpressure | Prefetch as max in-flight budget |
| Observability | Error handler counters + queue-depth alerts |

Consumer tuning is a balance: threads for parallelism, prefetch for memory and backpressure, partitioning for ordering, and idempotency so the rest can fail safely. Measure, tune, and re-measure — the broker will tell you the truth.
