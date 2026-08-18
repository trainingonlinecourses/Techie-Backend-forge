---
title: Elasticsearch Operations — Clusters, Shards, and the ELK Stack
module: elasticsearch-deep
order: 5
minutes: 26
topics: ["cluster", "shards", "ELK stack", "snapshots", "performance", "capacity planning"]
docs:
  - title: "Elasticsearch Cluster (Elastic docs)"
    url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/scalability.html"
  - title: "Snapshots and Restore (Elastic docs)"
    url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/snapshot-restore.html"
---

# Elasticsearch Operations — Clusters, Shards, and the ELK Stack

## The Concept: The Cluster Is the Product

The search API is easy; the **cluster** is what production runs. An Elasticsearch deployment is a set of **nodes** (JVM processes) forming a cluster: documents are stored in shards spread across nodes, replicas provide redundancy, and a master-eligible node coordinates. Understanding how shards and replicas actually behave — and what they cost — is the difference between a search that scales and a cluster that melts at 2 AM.

**The mental model:** the cluster is a team of librarians. Documents (books) live in **shards** (bookshelves); each shelf is assigned to a librarian (node). **Replicas** are duplicate shelves — if a librarian is out sick, the duplicate shelf serves requests. The **master-eligible node** is the head librarian who decides which shelves go where. When you add a librarian (node), the head librarian *moves shelves around* to balance the load — and that moving costs I/O while it happens.

## Shards and Replicas: The Two Dials

**Shards** split an index horizontally: an index with 3 primary shards stores each document in exactly one shard, determined by `hash(routing) % 3`. Shards give **scale** — an index too big for one node's disk or CPU is spread across many.

**Replicas** are copies of a shard on *different* nodes. They give **availability** (a node dies; its shards' replicas serve) and **read parallelism** (queries load-balance across primary + replicas). Writes go to the primary shard and replicate to replicas.

**The decision that's hard to reverse:** the primary shard count is fixed at index creation. Choose it for the *peak* size you expect (the rule of thumb: ~20–40GB per shard, and a few shards per GB of heap). Too few shards = an index that can't scale; too many = overhead (each shard has its own data structures, and every query fans out to every shard). Replicas, by contrast, can be changed anytime (`PUT /index/_settings { "number_of_replicas": 2 }`).

**The classic capacity numbers:** a 3-node cluster with `number_of_shards: 3, number_of_replicas: 1` gives 6 shards total — 3 primaries + 3 replicas, one of each per node. Lose one node and every shard still has a copy elsewhere. That's the minimum sensible production shape.

## The ELK Stack: Where Elasticsearch Lives in the Wild

The overwhelming majority of Elasticsearch deployments run the **ELK stack** (now "Elastic Stack"): **Elasticsearch** (storage + search), **Logstash** (ingestion/transformation), **Kibana** (visualization/dashboards). The modern variant replaces Logstash with **Beats/Filebeat** (lightweight agents) shipping straight to Elasticsearch, often via Kafka for buffering.

```
App logs ──▶ Filebeat ──▶ [Kafka] ──▶ Logstash ──▶ Elasticsearch ──▶ Kibana
```

**Why it matters to you as a Java/Spring developer:** the ELK stack is how production applications get *searchable logs*. The flow: your Spring Boot app logs to stdout/file; Filebeat ships them; Logstash parses them into fields (timestamp, level, message, exception stack as one field); Elasticsearch indexes them; Kibana gives dashboards and the famous "search across all logs in seconds" experience. The pattern to learn: **logs are documents** — each log line becomes a searchable, aggregatable document (with `@timestamp` for the date histogram "errors per hour"). The `logstash-logback-encoder` for Logback is the Spring side of this — it emits structured JSON logs that the pipeline parses natively.

## Snapshots: The Backup That Works

Elasticsearch's backup mechanism is the **snapshot API**: point-in-time copies of indices (or the whole cluster) to a shared filesystem or object storage (S3, GCS):

```bash
# Register a snapshot repository:
PUT /_snapshot/my_backups
{ "type": "s3", "settings": { "bucket": "es-backups", "region": "us-east-1" } }

# Take a snapshot of the critical indices:
PUT /_snapshot/my_backups/snapshot_20250115
{ "indices": "products,orders,logs-*", "ignore_unavailable": true }
```

**The two truths about snapshots:** they're **incremental** (only changed segments are copied — cheap after the first), and they're **restorable to a different cluster** (the migration/disaster-recovery story). The discipline: schedule snapshots, store them *off the cluster* (object storage), and **test a restore** — a snapshot that's never been restored is a hope, not a plan.

## Performance: The Heap and the Hot Path

The operational facts that dominate Elasticsearch performance:

1. **The JVM heap is the working set.** ES wants ~50% of RAM as heap (up to ~30GB — beyond that, compressed ordinary object pointers stop helping); the rest is OS page cache for the Lucene files. **Query performance is determined by whether the index fits in cache** — a working set exceeding RAM means every query hits disk.
2. **Refresh interval controls visibility.** Documents become searchable only after a **refresh** (default 1s). That's why ES is *near-real-time*, not real-time — writes are visible within ~1s. For bulk loads you can disable refresh during the load (`refresh=false`) and enable after — the classic bulk-indexing speedup.
3. **Bulk API for writes.** Indexing document-by-document over HTTP is slow; the `_bulk` API batches hundreds/thousands of documents per request. Spring's `BulkOperations` wraps it.
4. **Query caching.** Filter clauses are cached (that's why constraints belong in `filter`); heavy aggregations and wildcard-heavy queries are the CPU hogs to watch.

## Capacity Planning: The Numbers That Matter

The practical planning process:

1. **Estimate document size and count** → total index size. Add replication factor.
2. **Check RAM:** working set (hot indices) should fit in node memory + cache. ~30–50GB RAM per data node is a typical sweet spot.
3. **Check disk:** total size × (1 + margin for segments, merges) — ES writes *new* segments during merges, so it needs ~1.5× the final index size transiently.
4. **Shard count:** primary shards ≈ total size ÷ 30GB (per-shard target), distributed across nodes.

**The warning signs:** high CPU from `term` queries on high-cardinality `keyword` fields (use aggregations instead), disk filling (set disk watermark thresholds — ES auto-blocks writes at 95% by default — *and alert before*), and **unassigned shards** (replicas that couldn't be placed — the first thing to check in any cluster health issue: `GET /_cluster/health` shows `red`/`yellow`/`green`, and `GET /_cat/shards` shows what's stuck).

## The Operational Checklist

1. **Cluster health** (`green` = all primaries + replicas allocated) monitored with alerting.
2. **Snapshots** scheduled to off-cluster storage; restores tested.
3. **Heap** sized correctly (half the RAM, ≤30GB); working set fits in cache.
4. **Shards** sized ~20–40GB; primaries fixed at creation, replicas tuned live.
5. **Disk watermarks** monitored *before* the auto-write-block.
6. **Security on**: TLS, authentication, authorization — Elasticsearch trusts the network by default and must not.
7. **Bulk indexing** for writes; refresh discipline for load windows.

## Recap

The cluster is the product: shards split indices for scale (fixed at creation, sized ~20–40GB), replicas provide availability and read parallelism (tunable live), and a master-eligible node coordinates placement. The ELK stack — Elasticsearch, Logstash, Kibana — is where search meets ops: logs become searchable documents, with structured JSON logging from Spring as the pipeline's input. Snapshots (incremental, off-cluster, tested) are the backup story; heap sizing, refresh intervals, and bulk indexing are the performance levers; and cluster health color plus unassigned shards are the first diagnostics. Search engines reward the same discipline as databases — plan capacity, back up, monitor, and keep the working set in memory.
