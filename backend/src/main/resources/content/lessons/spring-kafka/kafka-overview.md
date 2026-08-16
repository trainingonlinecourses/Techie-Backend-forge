---
title: Kafka & Event-Driven Architecture — The Big Picture
summary: Topics, partitions, offsets and delivery semantics — and when event-driven design is the right call for an organization.
order: 1
minutes: 18
topics: [kafka, event-driven, topics, partitions, offsets, architecture]
docs:
  - https://docs.spring.io/spring-kafka/reference/
  - https://kafka.apache.org/intro
---

# Kafka & Event-Driven Architecture — The Big Picture

## What Kafka is

Apache Kafka is a **distributed commit log**. Producers append events to **topics**; consumers read them back in order. It is not a message queue in the classic sense — events are not "consumed and deleted", they are *read* and the reader records its position (**offset**):

| Concept | What it is | Why it matters |
|---|---|---|
| **Topic** | A named stream of events (e.g. `orders`, `payments`) | The unit of organization and retention |
| **Partition** | An ordered, immutable log; a topic is split into N partitions | Ordering + parallelism live here |
| **Offset** | A consumer's position within a partition | Consumers re-read from any point in time |
| **Broker** | A Kafka server holding partitions | Scale-out + replication |
| **Consumer group** | A set of consumers that split the partitions of a topic | This is how you scale consumption |
| **Retention** | Events are kept for a time/size window, not deleted on read | Replay, analytics, event sourcing |

The killer property: **events outlive their consumers**. A producer and consumer don't need to be online at the same time, and multiple independent consumers can read the same event.

## Event-driven vs request-driven

| | Request-driven (REST sync call) | Event-driven (Kafka) |
|---|---|---|
| Coupling | Tight — caller knows the callee's API and availability | Loose — producer doesn't know who listens |
| Failure | Caller waits, times out, retries | Producer fires and forgets; consumer retries |
| Data | Response is returned inline | State is reconstructed from events |
| Debugging | Straightforward trace | Needs tracing + offsets + consumer lag |
| Consistency | Easy (same DB transaction) | Hard — the reason the outbox pattern exists |

**When events are the right call:** fan-out (one event → many systems), audit trails, replays, decoupling teams, absorbing load spikes (produce fast, consume at your own pace).

**When they're the wrong call:** request/response flows that need a synchronous answer, simple CRUD with no downstream consumers, and teams that don't already have monitoring for lag/offsets — you're adding a distributed system, not removing one.

## Delivery semantics — the sentence you'll be asked in every interview

Kafka gives you **at-least-once** by default: a consumer that crashes after processing but before committing its offset causes the event to be **reprocessed**. The trio:

1. **At-most-once** — commit offset *before* processing. Crash = lost event. Rarely used.
2. **At-least-once** — commit *after* processing. Crash = duplicate processing. **Default.**
3. **Exactly-once** — achievable with Kafka transactions + an idempotent consumer, or by making processing **idempotent** (check if the event's ID was already applied).

Because at-least-once is the practical default, **every consumer must be idempotent** — the outbox lesson and consumers/groups lesson drill into this.

> **Why it matters (organizational view)** — Kafka is a platform decision, not a library choice. The org gets: a shared backbone where `orders` means the same thing to the web, the warehouse, and the finance team; replayable events for audits; and decoupled team delivery. The org pays for it in **new operational surface**: broker monitoring, consumer lag alerts, schema governance, and the discipline that every consumer tolerates duplicates. The standard rollout: start with one or two high-value events (order lifecycle is the classic), prove the ops story, then expand.

## The event contract matters as much as the event

Events are the API between teams. Spend the same care as you would on a REST contract:

- **Name events as past facts**: `OrderCreated`, `PaymentCaptured`, not `createOrder`/`doPayment` (commands).
- **Include a stable ID** (the aggregate/entity id) — consumers use it for idempotency.
- **Include a version** (or use a schema registry) — consumers evolve independently.
- **Never change an event's meaning** — add a new event type instead.

## Key takeaways

- Kafka = distributed commit log: topics → partitions → ordered logs; consumers track offsets.
- Events are retained and replayable; multiple independent consumers read the same stream.
- At-least-once is the default → **consumers must be idempotent**.
- Event-driven decouples teams but adds ops surface: monitoring, schemas, lag.
- Name events as past facts with stable ids and versions.

## Official docs

- [Spring Kafka Reference](https://docs.spring.io/spring-kafka/reference/)
- [Apache Kafka Introduction](https://kafka.apache.org/intro)
- [The Transactional Outbox pattern (microservices.io)](https://microservices.io/patterns/data/transactional-outbox.html)
