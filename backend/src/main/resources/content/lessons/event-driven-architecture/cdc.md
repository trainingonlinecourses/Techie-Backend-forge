---
title: Change Data Capture — The Database as Event Producer
module: event-driven-architecture
order: 4
minutes: 26
topics: ["change data capture", "Debezium", "WAL", "binlog", "CDC", "database events", "legacy integration"]
docs:
  - title: "Debezium Documentation"
    url: "https://debezium.io/documentation/reference/stable/index.html"
  - title: "Change Data Capture (Confluent)"
    url: "https://developer.confluent.io/learn/change-data-capture/"
---

# Change Data Capture — The Database as Event Producer

## The Concept: Events Without Application Code

Event-driven systems need events — but existing applications don't publish them. **Change Data Capture (CDC)** solves the retrofit: it turns *database changes* into events by reading the database's own **transaction log** (PostgreSQL's WAL, MySQL's binlog, SQL Server's log) — the append-only record the database already writes for every committed change. A CDC tool (the standard is **Debezium**) tails the log and publishes each change as an event: "row inserted", "row updated", "row deleted" — with the full before/after data.

**The mental model:** the database keeps a *diary* (the transaction log) of everything it does, for its own crash-recovery. CDC reads that diary — no application code required, no changes to the existing app, no polling. Every insert/update/delete in the database becomes a stream of events *the moment it commits*. Legacy systems, monoliths, and anything with a database become event producers retroactively — the bridge between "we have a database" and "we want events."

**Why this matters:** the outbox pattern made *new* code publish events transactionally; CDC makes *existing* code publish events without touching it. For a legacy monolith you can't (or won't) refactor, CDC is the way into event-driven architecture. And it's the standard production relay for the outbox pattern itself (Debezium reads the outbox table's changes).

## How It Works

```text
+----------------+      WAL/binlog      +-----------+      events      +--------+
| PostgreSQL     | -------------------->| Debezium  |----------------->| Kafka  |
| (any writes)   |  (transaction log)   | (CDC tool)|   (JSON/Avro)    | topics |
+----------------+                      +-----------+                  +--------+
       ^                                                                    |
       | a legacy app keeps writing rows                                    v
       | NO changes to the app                                       consumers subscribe
```

**The pipeline:** the legacy app writes to the database (unchanged). Debezium connects as a *replica* of the database, reading the transaction log, and streams each committed change to a Kafka topic (`dbserver.public.orders` — one topic per table). New consumers subscribe and react — the legacy system is now an event producer with zero code changes.

## The Events Debezium Emits

```json
{
  "payload": {
    "op": "c",                      // operation: c=create, u=update, d=delete
    "ts_ms": 1738431000000,         // commit time
    "source": { "table": "orders", "db": "academy", "lsn": "..." },
    "before": null,                 // previous row (null for inserts)
    "after": {                      // the new row
      "id": 9001, "customer_id": 42, "total": 99.50, "status": "PLACED"
    }
  }
}
```

**The valuable parts:** `op` (what happened), `after` (the new state — `before` for updates, so you know the change), and `source` (which table, which log position). The event carries *the row's full content* — a consumer can rebuild a read model, trigger downstream logic, or feed a search index without querying the database.

## The CDC Advantages

1. **Zero application changes** — the killer feature. Legacy systems become producers by configuration.
2. **True atomicity with the transaction** — the event is *the transaction* (the log entry commits atomically with the change). No dual-write window: if the row committed, the event exists.
3. **No polling** — log-based capture is push, near-real-time (sub-second), with none of the latency/load of timestamp-based polling.
4. **Every change, reliably** — inserts, updates, deletes, even schema changes — captured in order, at-least-once.

## The Operational Realities

CDC is a production tool with sharp edges — the ones to respect:

1. **The log is a lease.** The transaction log is retained *briefly* (Postgres WAL segments are recycled; MySQL binlog expires). If Debezium falls too far behind (an outage, a slow consumer), the log position it needs is gone — it must **re-snapshot** (a full initial load) to recover. This is why CDC needs monitoring: lag is the health metric.
2. **Initial snapshot.** On first connect, Debezium takes a full snapshot of the tables (the "from the beginning" baseline) before streaming changes — a large table means a large initial load; plan the window.
3. **Schema changes flow through.** `ALTER TABLE` events are captured too — consumers must tolerate them (Debezium's schema history handles the tracking, but your consumers should be schema-aware).
4. **At-least-once + ordering per table.** The stream is ordered per table (per log), but duplicates are possible on restart — consumers stay idempotent.
5. **Database privileges.** Debezium needs *replication access* (a user with `REPLICATION` privileges, `pgoutput` plugin) — a real security surface to scope tightly.

## The Two Big Uses

**Use 1 — Legacy integration:** a monolith's database becomes the event source. New microservices subscribe to the monolith's tables' changes and build their own read models — the stepping stone that lets a monolith decompose without a big-bang rewrite.

**Use 2 — The outbox relay (the modern pairing):** the outbox pattern's `outbox_events` table *is* a table — Debezium reads it and publishes each committed outbox row as the event. No polling job, no app code: the outbox table's WAL entries *are* the event stream. This is the production-grade relay discussed in the outbox lesson, and it's the standard architecture:

```text
business transaction (order + outbox row, one commit)
   └── WAL ──▶ Debezium ──▶ Kafka "orders" topic ──▶ consumers
```

## CDC vs the Outbox vs Application Events

| | Application events (in code) | Outbox (in-transaction table + relay) | CDC (transaction log) |
|---|---|---|---|
| Atomic with the change | no (dual-write) | **yes** (same transaction) | **yes** (the log IS the transaction) |
| Application changes | yes (publish in code) | yes (write outbox row) | **none** |
| Works for legacy apps | no | no | **yes** |
| The event is domain-shaped | yes | yes | row-level (before/after) |

**The rule of thumb:** new code with clean transactions → outbox (domain events, your vocabulary). Existing code you can't touch → CDC (row events, their vocabulary). The combination is common: CDC as the outbox relay, giving both.

## Recap

Change Data Capture reads the database's transaction log (WAL/binlog) and publishes every committed change as an event — making *any* database-backed system an event producer with zero application changes. The events carry operation, before/after data, and source — perfect for read models, search indexing, and downstream reactions. The operational realities are real: the log is a lease (falling behind forces a re-snapshot), initial loads are heavy, and at-least-once means idempotent consumers. The two canonical uses: **legacy integration** (a monolith's DB becomes an event source) and **the outbox relay** (Debezium publishing the outbox table — the modern production pattern). CDC is the bridge that lets event-driven architecture grow out of systems that were never built for it.
