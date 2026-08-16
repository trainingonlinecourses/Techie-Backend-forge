---
title: Kafka in Production — Schemas, Monitoring & Sizing
summary: Schema Registry, consumer lag, metrics, partitioning strategy, security and sizing decisions.
order: 7
minutes: 20
topics: [kafka, schema-registry, monitoring, consumer-lag, security, production]
docs:
  - https://docs.confluent.io/platform/current/schema-registry/index.html
  - https://kafka.apache.org/documentation/#operations
---

# Kafka in Production — Schemas, Monitoring & Sizing

## 1. Schemas — stop events from drifting

JSON with type headers is fine for a small system; in production, teams standardize on a **Schema Registry** (Confluent) or Avro/Protobuf with a registry. Why:

- **Evolution control** — producers can add fields (backward-compatible), consumers keep working; breaking changes are rejected at the registry, not at 3am in production.
- **Wire compatibility** — consumers and producers agree on the schema *by reference*, not by copied classes.
- **Governance** — the registry is the org's "API contract" for events, with versioning and audit.

```yaml
spring:
  kafka:
    properties:
      schema.registry.url: ${SCHEMA_REGISTRY_URL:http://localhost:8081}
```

Spring Kafka supports Confluent's Avro/Protobuf serializers with `ConfluentSchemaRegistryClient`. The rule: **once you have multiple services or consumers you don't own, move events to a registry.**

## 2. Monitoring — the metrics that matter

Kafka is only healthy if you watch the right things. The top signals:

| Signal | Command / metric | Meaning |
|---|---|---|
| **Consumer lag** | `kafka-consumer-groups.sh --describe --group X` | How far behind the latest event each group is — **the #1 Kafka health metric** |
| Broker health | `kafka-broker-api-versions.sh`, JMX metrics | Under-replicated partitions, offline partitions |
| Producer errors | `request_latency`, `error_rate` | Events failing to publish |
| Outbox backlog | custom metric (age of unpublished rows) | The relay is stuck |
| DLT arrivals | count per DLT topic | Permanent failures need attention |

**Consumer lag is the one to alert on.** Define thresholds per group (e.g. lag > 10k or lag age > 5 min → page). Export via Micrometer + Prometheus (`spring-boot-starter-actuator` exposes Kafka consumer metrics like `kafka.consumer.fetch.manager.records.lag` when you add the Kafka metrics via `KafkaMetrics` / `Micrometer`).

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
```

## 3. Partitioning strategy — decide the key once

The key choice is the *ordering and scaling contract* of your topic:

- **Entity key** (`orderId`, `customerId`) → all events for the entity are ordered; scale limited by hot keys.
- **No key / round-robin** → max parallelism, no ordering.
- **Composite keys** (region + entity) → locality + order within region.

Rules of thumb: `partitions ≈ 3× your max expected consumer instances`; avoid changing partition count (breaks ordering); if you have a hot key, split the topic or design around it (e.g. per-tenant topics).

## 4. Security — this is production-grade authz

- **mTLS or SASL/SCRAM** for broker auth; never expose brokers publicly.
- **ACLs** — least privilege: each service can only produce to its topics and consume its groups. Kafka ACLs are the firewall of your event bus.
- Encrypt **at rest** (broker config) and in transit (TLS).
- Secrets (SASL passwords, schema registry credentials) via env/secret manager — never in `application.yml`.

## 5. Sizing & operations checklist

- **Replication factor 3** in production (topic-level setting); tolerate one broker loss.
- **Retention** — balance replay/audit needs vs storage: e.g. 7 days hot + long-term archive to object storage.
- **Idempotent producer** (`enable.idempotence=true`, default with `acks=all`) — no duplicate records from retries.
- **Graceful shutdown** — let consumers finish and commit before JVM exit (Spring handles this; don't force-kill).
- **Versioned config** — bootstrap servers, group ids, and schema URLs belong in config server/env, not hardcoded.

> **Why it matters (organizational view)** — Production Kafka is an *operated platform*, not a library. The org needs: a Schema Registry (event contracts), consumer-lag alerting per team, topic ownership (who may write/read what, who pays the storage), and a runbook for the top incidents (lag, DLT floods, rebalance storms). Decide these as a platform team so services don't each reinvent brokers, topics, and retry policies. The teams that skip this get: drifting events, silent lag, and one person paged at 3am for a topic nobody owns.

## Key takeaways

- Schema Registry = versioned, governed event contracts; move to it as soon as multiple teams are involved.
- Monitor **consumer lag** first — it's the signal that downstream is falling behind; alert per group.
- Keys decide ordering + scaling; partition count is effectively permanent.
- Secure with SASL/mTLS + ACLs; encrypt in transit and at rest.
- Replication 3, retention sized to replay needs, graceful shutdown, versioned config.

## Official docs

- [Confluent Schema Registry](https://docs.confluent.io/platform/current/schema-registry/index.html)
- [Apache Kafka Operations](https://kafka.apache.org/documentation/#operations)
- [Spring Boot — Prometheus & Micrometer](https://docs.spring.io/spring-boot/reference/actuator/metrics.html)
