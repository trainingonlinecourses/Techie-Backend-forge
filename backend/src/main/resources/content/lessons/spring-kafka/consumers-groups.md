---
title: Consumers, Groups & Partitioning
summary: How consumer groups split partitions, offsets and rebalancing work, and how to get ordering + idempotency right.
order: 3
minutes: 20
topics: [kafka, consumer-groups, partitions, offsets, rebalancing, idempotency]
docs:
  - https://kafka.apache.org/documentation/#intro_consumers
  - https://docs.spring.io/spring-kafka/reference/kafka/receiving-messages/receiving-messages.html
---

# Consumers, Groups & Partitioning

## The group model — one partition, one consumer

A **consumer group** is how Kafka scales consumption *and* preserves order. Rule: **each partition is assigned to exactly one consumer in the group** at any time.

```
Topic "orders" — 4 partitions
  group "order-processors" with 3 consumers:
    consumer-1 → partitions 0, 1
    consumer-2 → partition 2
    consumer-3 → partition 3
```

- Add consumers up to the partition count → more parallelism.
- More consumers than partitions → idle consumers (they hold no partitions).
- Rebalance = the group reassigns partitions when a consumer joins/leaves/crashes.

## Offsets — the consumer's bookmark

Each consumer commits its **offset** per partition — "I've processed everything up to here". Two settings decide the failure behavior:

| Setting | Behavior | Risk |
|---|---|---|
| commit before processing (`enable.auto.commit` / early ack) | Crash = no reprocessing | **Lost events** |
| commit after processing (default in Spring) | Crash = reprocessing from last commit | **Duplicates** |

Spring Kafka commits after the listener returns. A listener that **throws** doesn't commit → redelivery → the duplicate problem you must design for. That's why:

> **Every consumer must be idempotent.** "Process" means: check if event id was already handled; if yes, skip. In practice: a processed-ids table (unique constraint), or a domain operation that is naturally idempotent (setting status, upsert by natural key).

## Rebalancing — the silent killer

When a consumer joins or leaves the group (deploy, crash, partition count change), Kafka **rebalances**: partitions move between consumers, and every affected consumer re-fetches from its committed offset. Rebalance storms happen when consumers keep dying on startup and rejoining (e.g. misconfigured `session.timeout`).

Spring Kafka makes rebalances safe-ish by default: it stops processing, rebalances, then resumes. Use **`AckMode` and cooperative rebalancing** (`partition.assignment.strategy: CooperativeStickyAssignor`) for large groups. And keep consumer processing **fast** — a slow consumer triggers rebalances and lag alarms.

## Ordering: what you actually get

- **Per-key ordering** — same key → same partition → strict order. The rule you rely on: *all events for one order/entity are processed in order by one consumer.*
- **No cross-key ordering** — two different keys on different partitions arrive in any order.
- Ordering is **per-partition, per-group**. A second group reading the same topic sees the same order independently.

Getting ordering wrong usually looks like: "the `OrderUpdated` event was processed before `OrderCreated`" — that's a key/partitioning bug (different keys, or a key that changes between events).

## Idempotency in Spring Kafka

```java
@Component
public class OrderEventConsumer {

    private final ProcessedEventRepository processed; // unique key: (eventType, eventId)

    @KafkaListener(topics = "orders", groupId = "order-processors")
    public void on(OrderCreated event) {
        if (processed.exists(event.id())) return;          // already applied — skip
        try {
            warehouse.reserveStock(event);
            processed.record(event.id());                  // record AFTER success
        } catch (DuplicateKeyException e) {
            // concurrent duplicate — treat as done
        }
    }
}
```

The `record` + unique constraint is the backbone: it converts at-least-once into effectively-once for your business state.

## Partition count — decide once, live with it

Raising partitions later is a **breaking change** (ordering for existing keys shifts). Choose at topic creation:

- **Throughput** — each partition is the unit of parallelism for consumers; target roughly how many consumer instances you'll ever run.
- **Key skew** — hot keys (a popular entity) land on one partition and cap its throughput.
- Practical default: start with `partitions = 3 × (expected max consumers)`, revisit with data.

> **Why it matters (organizational view)** — The group/partition model is the *concurrency contract* of your event platform. The org must decide: consumer group per service (each reads the full stream independently), partition count owned by the topic owner, and **idempotency as a mandatory code-review checklist item** (every listener handles duplicates). Most Kafka incidents are consumer lag and duplicate processing — both are prevented at design time, not by monitoring.

## Key takeaways

- One partition → one consumer per group; add consumers up to the partition count.
- Offsets committed after processing ⇒ at-least-once ⇒ duplicates ⇒ **idempotent consumers**.
- Rebalances redistribute partitions when members join/leave; keep processing fast, prefer cooperative assignment.
- Ordering is per-partition/per-key — never per-topic.
- Partition count is effectively permanent; size it for peak consumers and key skew.

## Official docs

- [Apache Kafka — Consumers (groups, offsets)](https://kafka.apache.org/documentation/#intro_consumers)
- [Spring Kafka — Receiving Messages](https://docs.spring.io/spring-kafka/reference/kafka/receiving-messages/receiving-messages.html)
- [Kafka rebalancing & cooperative sticky assignor](https://kafka.apache.org/34/documentation/#consumer_rebalance)
