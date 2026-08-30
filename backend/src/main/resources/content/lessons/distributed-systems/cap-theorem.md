---
title: The CAP Theorem and Consistency Models
module: distributed-systems
order: 1
minutes: 25
topics: ["CAP", "consistency models", "eventual consistency", "strong consistency", "partition tolerance", "PACELC"]
summary: Every distributed system makes the same fundamental trade — and most teams discover it by accident in production. The CAP theorem and its successor...
docs:
  - title: "CAP theorem"
    url: "https://en.wikipedia.org/wiki/CAP_theorem"
---

# The CAP Theorem and Consistency Models

Every distributed system makes the same fundamental trade — and most teams discover it by accident in production. The CAP theorem and its successor PACELC give you the vocabulary to make that trade *deliberately*: what consistency your system promises, and what it does when the network partitions.

## CAP: Three Properties, Pick Two

| Property | Meaning |
|----------|---------|
| **C**onsistency | Every read sees the latest write (linearizability) |
| **A**vailability | Every request gets a response (not necessarily the latest data) |
| **P**artition tolerance | The system keeps working when the network splits |

**The theorem**: during a network partition, you must choose between **C and A** — you cannot have both. The system can either answer with possibly-stale data (availability) or refuse to answer until it can verify freshness (consistency).

## The Classic Partition

```
        ┌──────────┐         ┌──────────┐
        │  Node A  │◀──X──▶│  Node B  │
        │  (data)  │ network│  (data)  │
        └──────────┘ split  └──────────┘

Client writes to A. Client reads from B.
B can't reach A. B must decide:
  - Answer with what it has (stale) → AVAILABLE, not consistent
  - Wait/refuse until it can sync → CONSISTENT, not available
```

**The uncomfortable truth**: partition tolerance is not optional in real networks — P is always chosen (a system that stops working on a network blip is useless). So the real choice is **CP vs AP** per operation.

## CP vs AP in Real Systems

| | CP (Consistency) | AP (Availability) |
|--|-------------------|--------------------|
| During partition | Reject writes on the minority side | Accept writes everywhere |
| Reads | May fail / return "unavailable" | Return possibly-stale data |
| Example | ZooKeeper, etcd, Spanner | Cassandra, DynamoDB, CouchDB |
| When the partition heals | Minority data discarded/resynced | Conflicts merged (last-write-wins, versioning) |
| Use for | Money, locks, coordination | Feeds, caches, shopping carts |

```java
// A CP choice: the majority must agree before the write is durable
// (etcd/ZooKeeper quorum writes)
// A write to the minority side → error, not silent acceptance

// An AP choice: any node accepts the write and replicates async
// (Cassandra/DynamoDB hinted handoff)
// Reads may lag — eventual consistency
```

## Consistency Models: The Spectrum

| Model | Guarantee | Example |
|-------|-----------|---------|
| **Linearizable** | Read sees the latest write; total order | etcd, ZooKeeper |
| **Sequential** | Operations appear in *some* order, same for all | Many single-master DBs |
| **Causal** | Causally related writes seen in order | Some CRDT systems |
| **Read-your-writes** | You see your own writes | Session consistency |
| **Monotonic reads** | Reads never go backward in time | Replica routing |
| **Eventual** | Replicas converge, given time | DNS, Cassandra, cache invalidation |

The Spring-app reality: your **primary database** is the strong-consistency anchor (single-master Postgres = linearizable writes); your **cache, replicas, and message queue** are eventually consistent. The skill is knowing which operations need which model.

## PACELC: The Theorem That Includes Normal Operation

CAP only describes *partitions*. **PACELC** covers the rest of the time:

> If a network **P**artition occurs, trade **A**vailability vs **C**onsistency.
> **E**lse (normal operation), trade **L**atency vs **C**onsistency.

```
Partition:  A vs C
Else:       L vs C   ← most systems spend 99.99% of time HERE
```

- **Cassandra**: partition → A; else → low latency (eventual)
- **DynamoDB**: partition → A; else → configurable (eventual or strong)
- **Spanner/etcd**: partition → C; else → strong consistency (higher latency)

The practical takeaway: even without partitions, you trade consistency for latency on every request — which is why caches exist and why cache invalidation is a consistency decision.

## Applying This to Your Spring App

```java
// The consistency budget per feature:
// Strong (DB):      money, orders, inventory, auth
// Eventual (cache): course listings, leaderboards, metrics

// ✅ Money: strong consistency via the DB
@Transactional
public void transfer(...) { ... }   // linearizable

// ✅ Feeds: eventual consistency via Redis
@Cacheable(value = "leaderboard", sync = true)
public List<Entry> leaderboard() { ... }   // stale up to TTL — fine
```

## The Anti-Pattern: Pretending There's No Trade

```java
// ❌ "Write to DB + cache + search index, all must be perfect NOW"
@Transactional
public void updateCourse(CourseDto dto) {
    db.save(course);            // strong
    cache.evict(key);           // might fail silently
    searchIndex.index(course);  // async — lag
    // NO SINGLE OPERATION CAN GUARANTEE ALL THREE ARE IN SYNC
}
```

The fix is a *decision*, not code: the DB is the source of truth (strong), the cache and index are projections (eventual). Design for the lag — that's what the consistency budget means.

## Summary

| Concept | Takeaway |
|---------|----------|
| CAP | During a partition: consistency or availability |
| P is mandatory | Networks fail — design for partitions |
| CP | Quorum systems: etcd, ZooKeeper, Spanner |
| AP | Converging systems: Cassandra, DynamoDB |
| PACELC | Even normally: latency vs consistency |
| In Spring | DB strong, cache/queue eventual — by design |

CAP isn't a pick-two menu at design time — it's a per-operation decision at runtime: which data must be strong, which can lag, and what happens during a partition. Decide the consistency budget for each feature, write it down, and let the DB anchor strong consistency while caches and replicas converge.
