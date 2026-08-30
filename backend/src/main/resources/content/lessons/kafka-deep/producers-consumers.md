---
title: Producers and Consumers — Configuration, Delivery Semantics, and Idioms
module: kafka-deep
order: 2
minutes: 27
topics: ["producers", "consumers", "delivery semantics", "acks", "idempotence", "consumer groups"]
summary: Producers and consumers are the endpoints of the Kafka conversation — and the subtlety of Kafka lives in their configuration: settings that trade t...
docs:
  - title: "Producing Messages (Kafka docs)"
    url: "https://kafka.apache.org/documentation/#producerconfigs"
  - title: "Consuming Messages (Kafka docs)"
    url: "https://kafka.apache.org/documentation/#consumerconfigs"
---

# Producers and Consumers — Configuration, Delivery Semantics, and Idioms

## The Concept: The Dial That Controls Your Guarantees

Producers and consumers are the endpoints of the Kafka conversation — and the subtlety of Kafka lives in their **configuration**: settings that trade throughput against guarantees. The single most important idea is the **delivery semantics** — what exactly happens to a message when things go wrong — because that determines whether your system can lose data, duplicate data, or neither. Most Kafka production incidents trace back to a wrong dial here.

## Producer Configuration: The Durability Dial

```java
Properties props = new Properties();
props.put("bootstrap.servers", "broker1:9092,broker2:9092,broker3:9092");
props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");

// --- The three big producer settings ---

// acks: how many replicas must confirm before the send is "successful".
//   0      — fire and forget: fastest, may LOSE messages (broker crash).
//   1      — leader confirmed only: fast, small loss window.
//   all    — all in-sync replicas confirmed: no loss on broker crash. DEFAULT-safe choice.
props.put("acks", "all");

// retries: how many times to retry a failed send. With acks=all this
// can produce DUPLICATES unless idempotence is on — hence the next setting.
props.put("retries", Integer.MAX_VALUE);

// enable.idempotence=true: the producer tags each batch with a sequence
// number so the broker can DEDUPLICATE retried batches.
// Result: exactly-once writes INTO Kafka, no dupes despite retries.
props.put("enable.idempotence", "true");

// Compression: reduces network + disk, big win for JSON/JSONL payloads.
props.put("compression.type", "lz4");
```

**The settings tell a story:** `acks=all` + `retries=MAX` + `enable.idempotence=true` is the modern production baseline — it means "never lose an acknowledged write, and never duplicate one either." That combination (called *idempotent producer*) gives exactly-once semantics into the log. `acks=0` exists for extreme-throughput telemetry where loss is acceptable. Most applications should use the baseline and forget the dial exists.

## Producer Idioms: Synchronous vs Asynchronous Sends

```java
try (KafkaProducer<String, String> producer = new KafkaProducer<>(props)) {

    // Fire-and-forget — fastest, errors only surface in the callback:
    producer.send(new ProducerRecord<>("orders", key, value));

    // Callback — asynchronous with error visibility:
    producer.send(new ProducerRecord<>("orders", key, value), (metadata, exception) -> {
        if (exception != null) {
            log.error("Send failed: {}", exception.getMessage());
            // retry, dead-letter, or alert — never silent!
        } else {
            log.info("Stored in {}-{} at offset {}", metadata.topic(),
                     metadata.partition(), metadata.offset());
        }
    });

    // Blocking — for critical writes (payments, audit):
    // producer.send(record).get();   // throws on failure
}
```

The `send` is asynchronous; the `get()` (or the callback) is where success or failure surfaces. Production code never ignores the result of `send` for critical data — silent send failures are lost events.

## Consumer Configuration: The Offset Dial

```java
Properties cprops = new Properties();
cprops.put("bootstrap.servers", "broker1:9092");
cprops.put("group.id", "order-processor");
cprops.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
cprops.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");

// Where to START when the group has no committed offset for a partition:
//   earliest — from the beginning (replay the whole topic)
//   latest   — only new events (default)
cprops.put("auto.offset.reset", "earliest");

// enable.auto.commit=true  -> at-most-once risk window (auto-commit is
//                             async; crash between poll and commit loses events)
// enable.auto.commit=false -> you commit manually -> at-least-once control
cprops.put("enable.auto.commit", "false");
```

```java
try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(cprops)) {
    consumer.subscribe(List.of("orders"));
    while (true) {
        ConsumerRecords<String, String> records = consumer.poll(100);
        for (ConsumerRecord<String, String> record : records) {
            process(record);                    // DO the work
            // Manual commit AFTER processing: if we crash now, this
            // offset is uncommitted -> the event is reprocessed.
            // At-least-once: no loss, possible duplicates.
            consumer.commitSync();              // block until committed
        }
    }
}
```

**The semantics in plain English:**

- **At-most-once:** auto-commit fires *before* you process (or you commit eagerly). Crash → events between commit and process are skipped. "Every event at most once" — loss possible.
- **At-least-once:** commit *after* processing. Crash → events reprocessed from the last commit. "Every event at least once" — duplicates possible, no loss. **This is the standard choice**, because the duplicate problem is solvable (make the consumer **idempotent**: processing the same event twice must be harmless).
- **Exactly-once:** Kafka's transactions (`transactional.id` + `initTransactions`) make the consume-process-produce cycle atomic. Powerful and complex — used when duplicates are genuinely unacceptable end-to-end (the subject of a later lesson).

## The Consumer Group: Scaling and Rebalancing

A consumer group's members **split the partitions** — each partition is processed by exactly one member. This is how consumption scales: 3 partitions, 3 consumers = parallel processing. The dynamic part is **rebalancing**: when a consumer joins, leaves, or crashes, the group *rebalances* — partitions get reassigned among remaining members. During a rebalance, no processing happens (the group is briefly paused). Newer Kafka versions use *cooperative* rebalancing (incremental) to minimize the pause, but the mental model stands: **the group divides and reassigns partitions, and your consumer code must be partition-agnostic** — it must handle being assigned any partition at any time.

**The anti-pattern to know:** more consumers than partitions = idle consumers (a partition can't be split further). Scaling consumption means scaling *partitions*, and partition count is fixed at topic creation (increasing it later breaks per-key ordering guarantees). Choose partition count for the target parallelism up front.

## Consumer Idioms: The Poll Loop and Idempotence

The `while(true) { poll }` loop is the consumer's heartbeat: `poll` fetches events *and* keeps the group membership alive (`max.poll.interval.ms` — if you process so long the group thinks you died, it rebalances and your partitions move on). The rules:

1. **Keep processing fast** or tune `max.poll.interval.ms`/`max.poll.records` for slow work.
2. **Commit after processing, not before** (for at-least-once).
3. **Make processing idempotent** — dedupe on an event id (store processed ids, use a unique constraint), so retries are harmless.
4. **Handle poison messages** — an unparseable event will throw forever and block the partition; catch, log, and skip (or route to a dead-letter topic) rather than crashing the loop.

```java
// Idempotent processing — the key to safe retries:
public void process(ConsumerRecord<String, String> record) {
    String eventId = record.headers().lastHeader("eventId") != null
            ? new String(record.headers().lastHeader("eventId").value()) : record.offset() + "";
    if (processedIds.add(eventId)) {   // a Set of seen ids (or DB unique check)
        doTheWork(record.value());
    } else {
        log.debug("Duplicate event {} — skipping", eventId);
    }
}
```

## Recap

Producer and consumer configuration is a set of guarantee dials. Producers: `acks=all` + `retries` + `enable.idempotence=true` gives exactly-once *into* the log — the production baseline; never ignore a `send` result for critical events. Consumers: `auto.offset.reset` controls where a fresh group starts; manual commit-after-processing gives at-least-once (no loss, possible duplicates — solved by making consumers idempotent); Kafka transactions give exactly-once end-to-end at real complexity cost. Consumer groups scale by splitting partitions and rebalance when members change — so write partition-agnostic, idempotent consumers and size partitions for the parallelism you need. Internalize the semantics dial and Kafka's guarantees stop being mysterious — they become settings you chose.
