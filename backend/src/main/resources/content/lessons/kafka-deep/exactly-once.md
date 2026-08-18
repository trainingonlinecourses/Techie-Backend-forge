---
title: Exactly-Once Semantics — Transactions, Idempotence, and Real Trade-offs
module: kafka-deep
order: 4
minutes: 27
topics: ["exactly-once", "transactions", "idempotence", "EOS", "Kafka transactions", "delivery semantics"]
docs:
  - title: "Exactly-Once Semantics (Confluent docs)"
    url: "https://docs.confluent.io/platform/current/installation/configuration/consumer-configs.html"
  - title: "Kafka Transactions (Kafka docs)"
    url: "https://kafka.apache.org/documentation/#semantics"
---

# Exactly-Once Semantics — Transactions, Idempotence, and Real Trade-offs

## The Concept: The Holy Grail of Message Processing

"Every event processed exactly once, no losses, no duplicates." That's the promise behind **exactly-once semantics (EOS)** — and for most of distributed-systems history it was considered impossible. This lesson explains what's actually achievable, how Kafka does it, and — critically — when the simpler alternatives are the right engineering choice. Because "exactly-once" in the marketing sense and "exactly-once" in the system you can actually operate are often different things.

**The mental model:** three promises, and their differences matter enormously:

- **At-most-once:** the system never processes an event twice — but may process it *zero* times (events can be lost). It's the "garbage collection" model: a crash mid-way means "this event is gone."
- **At-least-once:** the system never loses an event — but may process it *twice* (duplicates after crashes). This is the default Kafka model.
- **Exactly-once:** neither loss nor duplication — each event's effect happens precisely once, even across crashes.

The classic insight: **at-least-once + idempotent consumers ≈ exactly-once in effect.** If processing an event twice produces the same result as once (idempotence), the duplicates that at-least-once can produce become invisible — the *observable* behavior is exactly-once. This is why "make your consumer idempotent" is the cheapest path to the semantics you actually want.

## The Building Blocks: What Kafka Actually Guarantees

Kafka attacks the problem in layers:

**1. Idempotent producers (no duplicates *into* the log).** Covered in the producers lesson: `enable.idempotence=true` gives each producer a `producerId` and sequence numbers per partition. When a retry happens, the broker sees a duplicate sequence number and discards the duplicate batch. Result: writes into the log are exactly-once even with retries.

**2. Transactions (atomic multi-partition writes + consume-process-produce).** The full EOS story: a **transactional producer** (`transactional.id`) can write to *multiple partitions* and mark the whole set committed or aborted atomically — like a database transaction across partitions. Consumers configured with `isolation.level=read_committed` don't see aborted records.

**3. The consume-process-produce pattern** (the actual hard problem): a consumer reads an event from topic A, processes it (updates a database, sends an email), and produces a result to topic B. How do you make *this* atomic — so a crash between "update the DB" and "commit the offset" doesn't duplicate the email?

## Kafka Transactions in Practice

```java
// 1. Configure a TRANSACTIONAL producer:
Properties props = new Properties();
props.put("bootstrap.servers", "localhost:9092");
props.put("transactional.id", "order-pipeline-1");   // MUST be stable
props.put("enable.idempotence", "true");             // required with transactions

KafkaProducer<String, String> producer = new KafkaProducer<>(props);
producer.initTransactions();   // register the transactional id

// 2. In the consumer loop, wrap each consume-process-produce cycle
//    in a transaction:
while (true) {
    ConsumerRecords<String, String> records = consumer.poll(100);
    producer.beginTransaction();              // start the atomic unit
    try {
        for (ConsumerRecord<String, String> r : records) {
            String result = process(r.value());          // your business logic
            producer.send(new ProducerRecord<>("results", r.key(), result));
            producer.sendOffsetsToTransaction(          // commit the OFFSET
                    consumer.position(r),                // atomically WITH
                    consumer.groupMetadata());           // the produced results
        }
        producer.commitTransaction();         // both the results AND the offset
    } catch (Exception e) {
        producer.abortTransaction();         // results discarded, offset NOT advanced
        // -> the same records will be re-read -> no loss, no partial effect
    }
}
```

**Walking through the magic:** `beginTransaction` starts the unit; `process` + `send` prepare the outputs; `sendOffsetsToTransaction` adds the *consumer offsets* to the same transaction. `commitTransaction` commits **both** — the produced results and the offset — atomically. If the crash happens anywhere before the commit, the abort discards the partial results *and* leaves the offset uncommitted, so the consumer re-reads the same events and re-processes them. There's no window where "results are out but the offset isn't advanced" (duplicate) or vice versa (loss). That's the transactional consume-process-produce cycle — the closest thing to true exactly-once across a distributed pipeline.

**The requirements and costs to know:**

- `transactional.id` must be **stable** across restarts (it's the identity the broker uses to fence out zombie producers — a restarted instance with the same id *fences off* (invalidates) the old one, preventing two producers from both writing).
- The consumer must use `isolation.level=read_committed` to skip aborted records.
- The producer's `transactional.id` must be **unique per application instance** — two instances with the same id break each other.
- **Performance cost:** transactional commits involve extra round trips (coordinators, fencing, marker records). Throughput drops meaningfully vs plain at-least-once.

## The Pragmatic Truth: When EOS Is Overkill

Here's the engineering judgment the books skip: **most real systems don't need Kafka transactions.** The reasons:

1. **Idempotence is usually achievable.** Email sends, database inserts with unique keys, idempotency keys on HTTP APIs — processing the same event twice is often *by design* harmless. At-least-once + idempotence = effective exactly-once with none of the transaction machinery or cost.

2. **The hard cases are narrow.** The transactional pattern shines when the *outputs* are themselves Kafka records that must not duplicate, or when the process has side effects that can't be made idempotent.

3. **Simpler systems are more operable.** A pipeline with plain at-least-once + idempotent consumers + lag monitoring is easier to debug, scale, and reason about than one with transactional producers. The failure modes are simpler: "reprocess from the last committed offset" beats "investigate a distributed transaction coordinator."

4. **The DB can be the transaction boundary instead.** If the processing is "read event → write to Postgres," then a single **database transaction** that (a) inserts the processed result with a unique event-id constraint and (b) advances the consumer offset *stored in the same DB* gives atomicity with battle-tested relational machinery. The unique constraint makes retries harmless (second insert is a no-op). This "outbox pattern" is often the production answer for event→database pipelines.

## The Decision Framework

| Situation | Recommended |
|---|---|
| Outputs are side effects (email, SMS, webhooks) | Make them idempotent (idempotency keys); at-least-once |
| Outputs go to a database | DB transaction + unique event-id (outbox-style); at-least-once |
| Outputs are Kafka records that must not duplicate | **Kafka transactions (EOS)** |
| Financial-grade "no dupes, ever" across many topics | Kafka transactions + idempotent side effects |
| Max throughput, loss-tolerant telemetry | at-most-once (`acks=0`) |

## Recap

Exactly-once semantics break into three promises — at-most-once (loss possible), at-least-once (duplicates possible), exactly-once (neither). Kafka provides the building blocks: idempotent producers (no duplicates into the log), transactions (atomic multi-partition writes with fencing), and the transactional consume-process-produce cycle (results and offsets committed atomically — the closest thing to true EOS). But the engineering wisdom is that **at-least-once + idempotence usually delivers the observable behavior you need at a fraction of the cost and complexity** — reserve Kafka transactions for the narrow cases where outputs genuinely can't tolerate duplicates. Know the semantics dial, know the idempotence shortcut, and choose deliberately.
