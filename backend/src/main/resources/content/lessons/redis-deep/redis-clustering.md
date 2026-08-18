---
title: Redis Clustering — Replication, Sentinel, and Cluster Mode
module: redis-deep
order: 4
minutes: 27
topics: ["replication", "Sentinel", "Redis Cluster", "high availability", "sharding", "failover"]
docs:
  - title: "Replication (redis.io)"
    url: "https://redis.io/docs/latest/operate/oss_and_stack/management/replication/"
  - title: "Redis Cluster Specification (redis.io)"
    url: "https://redis.io/docs/latest/operate/oss_and_stack/management/scaling/"
---

# Redis Clustering — Replication, Sentinel, and Cluster Mode

## The Concept: One Redis Is a Single Point of Failure

A single Redis instance is fast — and fragile. If the machine dies, your cache, sessions, and queues die with it. Production Redis setups answer with three escalating strategies: **replication** (copies of the data), **Sentinel** (automatic failover), and **Cluster** (sharding across many nodes). Understanding which layer solves which problem is the whole game.

**The mental model:** replication is having a backup generator — a second machine holds a copy of the data. Sentinel is the automatic transfer switch — it detects the primary dying and promotes the backup without human intervention. Cluster is building a *bigger* system out of many small Redis instances — data split across nodes (sharding), each with its own backup. Generator (replication) → switch (Sentinel) → power grid (Cluster).

## Replication: The Primary-Replica Copy

In replication, one **primary** (master) node accepts writes; one or more **replicas** (slaves) receive a copy of every write asynchronously and serve reads:

```conf
# On the REPLICA's redis.conf:
replicaof 10.0.0.1 6379     # this node replicates from the primary
replica-read-only yes        # replicas serve reads, not writes
```

**How it works:** the replica connects to the primary, requests a full sync (an RDB snapshot + the backlog of changes since), and then streams every write command as it happens. The replication is *asynchronous*: the primary acknowledges a write without waiting for replicas — fast, but a replica can lag behind by some milliseconds.

**The uses:** read scaling (replicas absorb read traffic), disaster recovery (a replica on another machine/region), and — combined with Sentinel — failover. The costs to know: replicas are eventually consistent (a read on a lagging replica may miss the very latest write), and a replica that disconnects must resync (catching up via the replication backlog, or a full resync if it fell too far behind).

## Sentinel: Automatic Failover

Replication alone doesn't recover from a dead primary — someone must notice and promote a replica. **Redis Sentinel** is the monitoring/failover daemon (typically run as 3–5 separate Sentinel processes for its own quorum safety). Its job:

1. **Monitor** primaries and replicas (PING-based health checks).
2. **Notify** operators/apps when something looks wrong.
3. **Fail over**: when a primary is unreachable by the configured quorum of Sentinels, Sentinel promotes a replica to primary and reconfigures the others to follow it.
4. **Configure clients**: Sentinels tell your application *who the current primary is* — so the app always connects to the live master.

```java
// In Spring Boot, point at Sentinels and Boot asks them for the master:
spring.data.redis.sentinel.master=mymaster
spring.data.redis.sentinel.nodes=10.0.0.1:26379,10.0.0.2:26379,10.0.0.3:26379
```

When the primary fails, Sentinel promotes a replica, your app reconnects to the new master — and the outage is measured in seconds, not hours.

## Redis Cluster: Sharding for Scale

When one Redis (even with replicas) can't hold the data or handle the writes, **Redis Cluster** splits the key space across many primary nodes — **sharding**. The mechanism: the key space is divided into **16,384 hash slots**; each node owns a range of slots; a key's slot is `CRC16(key) % 16384`. Clients (Lettuce, Jedis with cluster support) compute the slot, find the owning node, and route the request there.

```conf
# Cluster mode on each node:
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
```

**Key rules you must live with in Cluster mode:**

- Keys are **not globally addressable**: a multi-key operation (`MGET`, `SINTER`) works only if all keys hash to the same slot. Cross-slot operations return errors. The workaround is **hash tags**: `{user:42}:cart` and `{user:42}:orders` — Redis hashes only the part inside `{}`, forcing both keys into the same slot so they can be operated on together.
- **Multi-key transactions and Lua scripts** have the same slot constraint.
- Each primary typically has one or more replicas for failover (cluster slots migrate automatically if a node dies and its replica exists).
- Adding/removing nodes **reshards** slots between them — a live operation, but one that adds load and latency while it runs.

**When to use Cluster:** you've outgrown a single instance — tens of gigabytes, write throughput beyond one node, or a hard availability requirement. For the common case (a few GB of cache behind one database), a single Redis with replication + Sentinel is simpler and perfectly adequate. Cluster's complexity (slot constraints, hash tags, resharding) is a real tax — pay it only when scale demands.

## The Production Architecture in Practice

The mature pattern combines all three:

- **A primary** for writes.
- **Replicas** for read scaling and failover targets.
- **Sentinel** (odd count, ≥3) for automatic failover.
- **External backups** (RDB snapshots copied off-machine) for disasters.
- **Persistence** (AOF `everysec`) so a restart loses at most a second.

And on the client side, Spring Boot's Lettuce integration speaks Sentinel and Cluster natively: point at the sentinels or the cluster nodes and Boot handles routing and failover reconnection — your `RedisTemplate` code doesn't change at all.

## A Cautionary Note on Asynchronous Replication

Because replication is async, there's a real window: a write acknowledged by the primary may not have reached a replica when the primary dies. Sentinel promotes a replica that is *slightly behind* — losing the last few writes. If your system can't tolerate that, options are limited (WAIT command, or accept that Redis is fast-and-eventually-consistent and keep the authoritative data in Postgres). This is precisely why "Redis as a cache in front of Postgres" is the standard architecture: Redis gives speed, Postgres gives the durable source of truth, and the eventual-consistency window is absorbed by cache-refresh semantics.

## Recap

Replication copies primary writes to replicas (async, for reads and failover targets); Sentinel automates failover and tells clients who the live master is; Cluster shards the key space across nodes via 16,384 hash slots, with hash tags and single-slot constraints as its discipline. The practical ladder: single instance for dev, primary + replicas + Sentinel for production availability, Cluster only when one node truly can't cope. And always pair the topology with persistence (AOF) and off-machine backups — availability (many nodes) and durability (disk + backups) solve different failure modes, and production needs both.
