---
title: Kafka Architecture — Brokers, Topics, Partitions, and Offsets
module: kafka-deep
order: 1
minutes: 27
topics: ["Kafka", "brokers", "topics", "partitions", "offsets", "event streaming"]
docs:
  - title: "Kafka Documentation — Architecture"
    url: "https://kafka.apache.org/documentation/#intro_architecture"
  - title: "Kafka Design (kafka.apache.org)"
    url: "https://kafka.apache.org/documentation/#design"
summary: Kafka is a distributed eventstreaming platform — but the cleanest way to understand it is as a distributed commit log: an appendonly, ordered, repl...
---

# Kafka Architecture — Brokers, Topics, Partitions, and Offsets

## The Concept: A Commit Log for Your Whole System

Kafka is a **distributed event-streaming platform** — but the cleanest way to understand it is as a *distributed commit log*: an append-only, ordered, replayable record of events. Producers write events; consumers read them; and crucially, **consumers don't delete what they read** — events persist for a configured retention window, and any consumer can re-read from any point. This is the fundamental break from message queues: in a queue, a message is consumed and gone; in Kafka, events are *stored facts* that many consumers can each read independently.

**The mental model:** think of a town's public record office. Every event (birth, marriage, property transfer) is written to the register in order, forever (well, for the retention window). Anyone — the tax office, the census, the police — can read the register independently, each starting from whatever point they care about. Nobody "consumes" a birth certificate and destroys it for everyone else. Kafka is that register, distributed across many machines.

**Why this changed the industry:** before Kafka, systems communicated by direct calls (HTTP) or queues (one-shot messages). Kafka's log model enables: **decoupling** (producers and consumers never know about each other), **replay** (reprocess historical events to rebuild state or fix bugs), **multiple consumers** (the same event feeds analytics, search, and billing independently), and **durability** (events survive, replicated across brokers).

## The Core Pieces

```text
Producers ──write──▶ [Topic: orders] ──read──▶ Consumer Group A (order processing)
                        │  partition 0 ─────▶ Consumer Group B (analytics)
                        │  partition 1 ─────▶ Consumer Group C (search index)
                        │  partition 2
                        ▼
                Brokers (distributed storage)
```

- **Event (record)** — a key, a value (bytes), a timestamp, and optional headers. The unit of data.
- **Topic** — a named category of events ("orders", "page-views", "payments"). The logical stream.
- **Partition** — a topic is *split* into partitions. Each partition is an ordered, append-only log. Partitions are the unit of parallelism and ordering.
- **Offset** — each event's position within its partition (0, 1, 2, ...). Consumers track offsets to know where they are.
- **Broker** — a Kafka server; a cluster is several brokers. Partitions are distributed across brokers and **replicated** (leader + followers) for fault tolerance.
- **Producer** — writes events to a topic's partitions.
- **Consumer / consumer group** — reads events. A group divides the partitions among its members.

## Partitions: The Key to Scale and Ordering

The partition is the most important concept to internalize. Why partition at all?

**Parallelism:** a topic with 3 partitions can be written by 3 producers in parallel and read by up to 3 consumers in parallel (one per partition). One partition = one ordered stream; partitions are what let Kafka scale horizontally.

**Ordering within a partition:** Kafka guarantees order **per partition**, not per topic. Events with the same key always go to the same partition (via `hash(key) % numPartitions`), so all events for a given entity (say, one customer's orders) are strictly ordered. This is the design contract: *if you need ordering, use a key that identifies the entity — the partition provides the order.*

**The consequence to respect:** events for *different* keys can land in *different* partitions and have no global order. Systems that need global order (a single sequence number across everything) fight Kafka's model — the standard answer is to partition by the entity and keep ordering per entity, which is what almost all real systems actually need.

```java
// Producer: the KEY controls the partition. All "cust-42" events
// go to the same partition -> guaranteed order per customer.
producer.send(new ProducerRecord<>("orders", "cust-42", orderJson));
```

## Producers, Consumers, and the Offset

```java
// PRODUCER — fire-and-forget or with acknowledgment.
Properties props = new Properties();
props.put("bootstrap.servers", "localhost:9092");
props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
// acks=all: wait for ALL replicas to confirm -> no data loss on broker crash.
props.put("acks", "all");

try (KafkaProducer<String, String> producer = new KafkaProducer<>(props)) {
    producer.send(new ProducerRecord<>("orders", "cust-42",
            "{\"orderId\": 9001, \"total\": 49.99}"));
}
```

```java
// CONSUMER — a consumer GROUP divides the topic's partitions among members.
Properties cprops = new Properties();
cprops.put("bootstrap.servers", "localhost:9092");
cprops.put("group.id", "order-processor");      // the consumer group
cprops.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
cprops.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
cprops.put("enable.auto.commit", "true");       // auto-commit offsets

try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(cprops)) {
    consumer.subscribe(List.of("orders"));       // join the group, get partitions
    while (true) {
        // poll returns any new events for THIS consumer's partitions.
        for (ConsumerRecord<String, String> record : consumer.poll(100)) {
            System.out.println("offset=" + record.offset() +
                    " key=" + record.key() + " value=" + record.value());
        }
    }
}
```

**Walking through the essential mechanics:**

- The producer's `bootstrap.servers` is just the *entry point* — the client learns the full cluster topology from it. `acks=all` is the durability dial: the write is acknowledged only after all in-sync replicas stored it.
- The consumer's `group.id` is the load-balancing mechanism: a topic with 3 partitions served by a group of 3 consumers gives each consumer one partition; a group of 6 consumers would have 3 idle (a partition is processed by exactly one member at a time).
- `poll()` is the consumer's heartbeat to the group: it both fetches events *and* keeps the consumer's membership alive. The `while(true) { poll }` loop is the consumer's entire life.
- **Offsets** are where each consumer group *is* in each partition. `enable.auto.commit=true` lets Kafka commit offsets automatically — convenient, but "at-most-once" semantics if you crash between processing and commit (the records you processed are skipped). `enable.auto.commit=false` + manual commit gives "at-least-once" — you may reprocess after a crash, but never lose events. Exactly-once is possible with transactions — the subject of a later lesson.

## Replication and the Leader-Follower Model

Each partition lives on multiple brokers: one **leader** (serves all reads/writes) and **followers** (replicate from the leader). If a leader broker dies, followers elect a new leader from the in-sync replicas and continue — the partition stays available. This is the fault-tolerance story: `replication.factor=3` means the partition exists on 3 brokers; losing one broker loses nothing. Combined with `acks=all` at the producer, acknowledged events survive a broker failure.

## The Retention Model: Events Don't Disappear

Topics have **retention**, not deletion-on-read: by size or time (`log.retention.hours=168` — the default 7 days, or `log.retention.bytes`). Consumers read at their own pace from their own offsets; a slow consumer can lag, and a new consumer can start from the beginning (`auto.offset.reset=earliest`) to read the entire history. This is the property that makes Kafka a *system of record* rather than a message bus: the events are the data, and the consumers are just different views over it.

## Recap

Kafka is a distributed commit log: append-only, ordered-per-partition, replicated, and replayable. Topics hold events; partitions provide parallelism and per-key ordering; offsets track each consumer group's position; brokers replicate partitions for fault tolerance. Producers write with configurable durability (`acks=all`), and consumers in groups divide partitions among themselves, polling for events and committing offsets. The three shifts in thinking Kafka demands: events are stored facts, not one-shot messages; ordering is per-partition (so key by entity); and consumers replay history rather than draining queues. Internalize those and the whole ecosystem — consumer groups, stream processing, Spring Kafka — becomes predictable.
