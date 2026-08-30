---
title: Consumer Groups — Partition Assignment and Rebalancing
module: kafka-deep
order: 3
minutes: 25
topics: ["consumer groups", "rebalancing", "partition assignment", "group coordinator", "lag"]
docs:
  - title: "Consumer Groups (Kafka docs)"
    url: "https://kafka.apache.org/documentation/#intro_consumers"
  - title: "Kafka Consumer Group Internals (Confluent)"
    url: "https://docs.confluent.io/platform/current/clients/consumer.html"
summary: A single consumer reading a topic processes events one at a time. A consumer group is Kafka's mechanism for parallelizing that work: the group's me...
---

# Consumer Groups — Partition Assignment and Rebalancing

## The Concept: The Load-Balancing Brain of Kafka

A single consumer reading a topic processes events one at a time. A **consumer group** is Kafka's mechanism for parallelizing that work: the group's members *divide the topic's partitions among themselves*, each member processing its share independently. The group is also Kafka's mechanism for *fault tolerance*: when a member dies, its partitions are reassigned to survivors automatically.

**The mental model:** a pizza delivery office with one phone line (one consumer) can take orders one at a time. Add more lines (more consumers in the group), and each line handles its share of the orders — but only one line per *neighborhood* (partition), because two lines taking orders from the same neighborhood would both try to deliver the same pizzas. The group coordinator (the office manager) decides who gets which neighborhood, and when a line worker quits, reassigns their neighborhoods to the rest.

**The contract to internalize:** within a partition, events are ordered and processed **by exactly one consumer at a time**. The group guarantees no two members process the same partition simultaneously — that's what makes per-partition ordering meaningful at the group level.

## How the Group Divides Work: Partition Assignment

The mechanics: every consumer group has a **group coordinator** (one of the brokers). When a consumer calls `subscribe(topic)`, it joins the group via the coordinator. The coordinator runs a **group leader election** (the first member becomes the leader for assignment purposes), the leader computes the partition assignment, and the coordinator distributes it.

**The three assignment strategies:**

- **RangeAssignor** (the old default): partitions are divided in ranges by topic. Consumer 0 gets partitions 0, 1, 2; consumer 1 gets 3, 4, 5. Simple, but can be unbalanced across multiple topics.
- **RoundRobinAssignor**: partitions are dealt out round-robin like cards — best balance across many topics.
- **StickyAssignor** (the modern default): balances *and* keeps as many previous assignments as possible during rebalances — minimizing partition moves and their cost.

```java
// Explicitly choosing the strategy:
props.put("partition.assignment.strategy",
          "org.apache.kafka.clients.consumer.RoundRobinAssignor");
```

For most applications the default (sticky) is right; the strategy matters when you have many topics or observe uneven load.

## The Lifecycle: Join, Process, Rebalance

The consumer's entire existence is the **poll loop**, and every `poll` is also a **heartbeat** to the coordinator:

```java
props.put("group.id", "order-processor");
props.put("heartbeat.interval.ms", 3000);       // how often to ping
props.put("session.timeout.ms", 45000);         // "dead" if silent this long
props.put("max.poll.interval.ms", 300000);      // max time between polls

KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
consumer.subscribe(List.of("orders"));          // express interest in the topic

while (true) {
    ConsumerRecords<String, String> records = consumer.poll(100);
    for (ConsumerRecord<String, String> r : records) {
        process(r);      // the actual work happens between polls
    }
}
```

**The three timers and what they protect:**

- `heartbeat.interval.ms` — the consumer pings the coordinator.
- `session.timeout.ms` — if the coordinator hears nothing for this long, it declares the consumer **dead** and triggers a rebalance to reassign its partitions. (A crashed or network-partitioned consumer.)
- `max.poll.interval.ms` — if the consumer *polls* nothing for this long (e.g., a single record's processing takes 10 minutes), the coordinator kicks it out of the group — even though it's alive — because it's clearly not keeping up. This is the setting that bites: **slow processing → the group thinks you're gone → partitions get reassigned → duplicate processing while you're still working on the old partition.**

**The fix for slow processors:** process fewer records per poll (`max.poll.records=10`), do the heavy work on a separate thread while polling continues, or increase `max.poll.interval.ms`. The poll loop must keep beating.

## Rebalancing: The Moment Everything Pauses

A **rebalance** happens when: a member joins, a member leaves (graceful `close()`), a member is declared dead, or partitions are added to the topic. During a rebalance:

1. The group revokes all current partition assignments (the **revoke** phase — `onPartitionsRevoked` callback fires).
2. A new assignment is computed (join + sync with the coordinator).
3. The new assignment is handed out (`onPartitionsAssigned` fires).

**The costs:** while rebalancing, *no processing happens* — the group is paused. And unless you handle it, in-flight work on a revoked partition may be *duplicated*: you were processing partition 3's events, the rebalance revokes partition 3, another consumer picks it up from the last committed offset — and your uncommitted work gets redone. The classic mitigation: **commit offsets before the revocation** (in `onPartitionsRevoked`, flush and commit), so the new owner starts from where you actually finished. **Cooperative rebalancing** (KIP-429, default in modern Kafka) shrinks the pause by reassigning only the partitions that must move, instead of everything.

## Monitoring Lag: The Number That Tells the Truth

The health metric for a consumer group is **lag** — how far each consumer's committed offset is behind the end of its partition:

```bash
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
    --group order-processor --describe
# GROUP            TOPIC   PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
# order-processor  orders  0          15234           15234           0
# order-processor  orders  1          9871            10200           329
```

- **Lag = 0**: caught up — the consumer is keeping pace with production.
- **Lag growing**: the consumer can't keep up — either too few consumers (add more, up to partition count), slow processing, or a stuck poll loop.
- **Lag spiking**: a consumer died and its partitions sat idle until the rebalance — or processing is blocked.

**Lag is the early warning system.** A consumer group that falls permanently behind means stale data everywhere downstream (analytics, search, notifications). Alert on lag thresholds, not on "is the process up" — a running-but-lagging consumer is a broken pipeline wearing a healthy-looking mask.

## Group Design Rules

1. **One group per logical consumer** ("order-processor", "analytics", "search-indexer"). Different concerns = different groups — each reads the full topic independently.
2. **Don't exceed partition count with consumers** — extras sit idle. Scale partitions when you outgrow them (planned, before the topic is hot).
3. **Handle rebalance callbacks** — commit on revoke, so reassigned partitions don't duplicate work.
4. **Make processing idempotent anyway** — rebalances can always cause reprocessing; idempotence makes it harmless.
5. **Alert on lag** — it's the one metric that says "the pipeline is healthy" truthfully.

## Recap

Consumer groups are Kafka's parallel-processing and fault-tolerance mechanism: members split the topic's partitions (exactly one consumer per partition at a time), the coordinator manages membership and assignments, and the poll loop doubles as the heartbeat. Rebalancing — triggered by joins, leaves, crashes, or slow processing — pauses the group and reassigns partitions, so you must commit on revoke and tolerate reprocessing. The three timers (heartbeat, session timeout, max.poll.interval) define "alive" and "keeping up," and **lag** is the metric that reveals the truth about your pipeline's health. Design groups per logical consumer, size for partition count, and treat rebalances as normal events — because in a healthy Kafka deployment, they are.
