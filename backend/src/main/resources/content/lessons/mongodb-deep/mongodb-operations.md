---
title: MongoDB Operations — Indexes, Replication, Sharding, Backups
module: mongodb-deep
order: 5
minutes: 26
topics: ["indexes", "replication", "sharding", "backup", "operations", "monitoring"]
docs:
  - title: "Indexes (MongoDB Manual)"
    url: "https://www.mongodb.com/docs/manual/indexes/"
  - title: "Replication and Sharding (MongoDB Manual)"
    url: "https://www.mongodb.com/docs/manual/replication/"
---

# MongoDB Operations — Indexes, Replication, Sharding, Backups

## The Concept: The Part Nobody Teaches Until It Breaks

Developers learn CRUD and aggregation; production learns that **the database is an operational system**. Indexes decide whether queries are instant or melt the server; replication decides whether an outage takes down the app; sharding decides whether the dataset outgrows one machine; backups decide whether a bad deploy is a 5-minute rollback or a data-loss incident. This lesson is the operations layer — what runs *around* your queries.

## Indexes: The Query Accelerators

Without an index, MongoDB scans every document in the collection to answer a query — a **collection scan**, O(n), and at scale it's catastrophic. An **index** is a sorted structure over the indexed field(s), giving O(log n) lookup. The rules:

- **Index what you filter and sort on.** `find({status: "active"}).sort({createdAt: -1})` wants `{status: 1, createdAt: -1}` — a **compound index** covering both.
- **Index the "selectivity" field first.** Put the most discriminating field first in a compound index.
- **Unique indexes enforce integrity** — the document model's substitute for a primary-key constraint on business fields:

```js
// Enforce one account per email — at the DATABASE level:
db.users.createIndex({ email: 1 }, { unique: true });

// Compound index for the common query pattern:
db.orders.createIndex({ customerId: 1, createdAt: -1 });

// TTL index — auto-delete documents after N seconds (sessions, logs!):
db.sessions.createIndex({ lastSeen: 1 }, { expireAfterSeconds: 3600 });
```

In Spring Data, declare them on the model: `@Indexed(unique = true)`, `@CompoundIndex(def = "{'customerId': 1, 'createdAt': -1}")` — indexes are created at startup. The TTL index is the operational gem: MongoDB deletes expired documents automatically, giving you session cleanup for free.

**How to know you need one:** run the query with `.explain("executionStats")` — it reports `COLLSCAN` (bad — full scan) vs `IXSCAN` (good — index used). Every slow-query investigation in MongoDB starts and ends with explain.

## Replication: Replica Sets

A **replica set** is a group of MongoDB servers holding the same data: one **primary** (accepts writes) and multiple **secondaries** (replicate from the primary, serve reads if configured). It's the availability layer — if the primary dies, the set *elects* a new primary automatically (typically within seconds), and the app keeps working.

- Writes go to the primary, which journals them to its **oplog** (operation log); secondaries replay the oplog.
- **Read preferences** control routing: `primary` (default — reads from primary, strong consistency), `primaryPreferred`, `secondary` (read scaling), `nearest` (lowest latency).
- **Write concerns** dial durability: `w: 1` (ack from primary only — default), `w: majority` (ack from a majority of members — survives a primary loss without losing acknowledged writes). The production rule for critical data: `w: majority`.

Spring Data configures all of this via the URI: `mongodb://host1,host2,host3/academy?replicaSet=rs0&w=majority`.

## Sharding: Scaling Out

When a single replica set can't hold the data or handle the write rate, **sharding** splits the dataset across many nodes. MongoDB partitions collections by a **shard key** — the field that determines which shard holds which documents:

- **The shard key must be chosen with your access patterns.** If you query by `customerId`, shard on `customerId` — then all of one customer's data lives on one shard, and queries route to a single node.
- **Bad shard keys kill performance:** low-cardinality keys (a boolean — only 2 shards ever used), monotonically-increasing keys (all writes to one shard — a hot spot), or keys you don't filter by (every query becomes a scatter-gather across all shards).
- **Chunks** (ranges of shard-key values) migrate between shards automatically for balance; **`hashed` shard keys** (`sh.shardCollection("db.c", {_id: "hashed"})`) spread writes evenly when there's no natural range.

Sharding is the last resort, not the default: it adds real operational complexity (balancers, chunk migrations, cross-shard query costs). The sane ladder: single node → replica set → sharded cluster — and only when measured growth demands it.

## Backups: The Undo Button

Replication protects against *node* failure; backups protect against *everything else* — bad deploys, `db.dropDatabase()` typos, ransomware. The standard methods:

- **`mongodump`/`mongorestore`** — logical backups (BSON files). Simple, but slow for large datasets and not a point-in-time story by itself.
- **File-system snapshots** — consistent physical backups (LVM snapshots, cloud disk snapshots). Fast, but require coordinated quiescing (`db.fsyncLock()`/`unlock`).
- **Managed services (MongoDB Atlas)** — automated continuous backups with point-in-time recovery; the pragmatic choice for most teams.

The discipline: **back up regularly, test restores, and keep backups off the primary's machine.** An untested backup is a hope, not a plan.

## The Monitoring Essentials

- **`db.serverStatus()`** — connection counts, memory, operations.
- **`db.currentOp()`** — what's running right now; find long-running queries to kill (`db.killOp(opid)`).
- **`db.collection.stats()`** — sizes, index sizes, fragmentation.
- **Slow query log** — set `slowms` (default 100ms) and watch for `COLLSCAN`s.
- **Atlas / Ops Manager** — dashboards for the standard metrics: connections, opcounters, cache usage, replication lag.

The two numbers that predict incidents: **replication lag** (secondaries falling behind → read staleness, election risks) and **working set vs memory** (when the hot data exceeds RAM, every query hits disk and latency explodes).

## The Operational Checklist

1. Index every field you filter, sort, or join on — verified with `.explain()`.
2. Run a replica set in production (`w: majority` for critical writes).
3. Shard only when a single replica set is measurably insufficient — and choose the shard key from your access patterns.
4. Back up continuously, store off-machine, and *test restores*.
5. Monitor lag, memory, and slow queries; act on `COLLSCAN`s immediately.
6. Apply TTL indexes for expiring data; unique indexes for integrity.
7. Protect the deployment: authentication, TLS, and network isolation (the ops security basics every database needs).

## Recap

MongoDB operations are what make it production-safe: indexes turn collection scans into instant lookups (verified via `explain`, declared with `@Indexed` in Spring), replica sets provide automatic failover with `w: majority` durability, sharding scales out across machines when one node can't cope, and backups — tested, off-machine — provide the undo button. The operational habits — index-first, monitor lag and memory, shard deliberately, back up religiously — are identical in spirit to running Postgres or any database. The document model changes your queries, but the laws of running a database at scale do not.
