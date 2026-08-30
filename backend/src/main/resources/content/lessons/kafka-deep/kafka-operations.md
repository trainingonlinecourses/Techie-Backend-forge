---
title: Kafka Operations — Admin, Monitoring, and Production Hardening
module: kafka-deep
order: 5
minutes: 26
topics: ["Kafka operations", "admin API", "monitoring", "JMX", "KRaft", "production config"]
docs:
  - title: "Kafka Operations (Kafka docs)"
    url: "https://kafka.apache.org/documentation/#operations"
  - title: "Kafka Monitoring (Kafka docs)"
    url: "https://kafka.apache.org/documentation/#monitoring"
summary: The client APIs are the easy part — the hard part is that Kafka is a distributed system you operate: brokers to configure, topics to create and siz...
---

# Kafka Operations — Admin, Monitoring, and Production Hardening

## The Concept: Kafka Is a System to Run, Not Just to Use

The client APIs are the easy part — the hard part is that Kafka is a *distributed system you operate*: brokers to configure, topics to create and size, metrics to watch, and failure modes (disk full, slow replica, dead broker) that appear only under production load. This lesson is the operations layer: the Admin API for programmatic control, the metrics that matter, and the configuration decisions that keep a cluster alive.

## The Admin API: Programmatic Cluster Control

The `AdminClient` is the operations tool in Java — create topics, check cluster state, describe groups, all from code (or from `kafka-topics.sh`, which uses it under the hood):

```java
import org.apache.kafka.clients.admin.*;
import org.apache.kafka.common.errors.TopicExistsException;
import java.util.*;
import java.util.concurrent.ExecutionException;

public class AdminDemo {
    public static void main(String[] args) throws Exception {
        Properties props = new Properties();
        props.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");

        try (AdminClient admin = AdminClient.create(props)) {
            // Create a topic: 3 partitions (parallelism), replication 3
            // (fault tolerance — 3 brokers), retention 7 days.
            NewTopic orders = new NewTopic("orders", 3, (short) 3)
                    .configs(Map.of("retention.ms", "604800000"));
            try {
                admin.createTopics(List.of(orders)).all().get();
                System.out.println("Topic 'orders' created");
            } catch (ExecutionException e) {
                if (e.getCause() instanceof TopicExistsException) {
                    System.out.println("Topic already exists — fine");
                } else throw e;
            }

            // Describe the cluster and the topic:
            admin.describeCluster().nodes().get()
                 .forEach(n -> System.out.println("Broker: " + n.host() + ":" + n.port()));
            admin.describeTopics(List.of("orders")).allTopicNames().get()
                 .forEach((name, desc) -> System.out.println(
                     name + " -> " + desc.partitions().size() + " partitions"));

            // List consumer groups and their lag:
            admin.listConsumerGroups().all().get()
                 .forEach(g -> System.out.println("Group: " + g.groupId()));
        }
    }
}
```

**Walking through it:** `createTopics` with `new NewTopic(name, partitions, replicationFactor)` is how topics are born with the *right* shape — partition count sized for parallelism, replication factor for durability. The `ExecutionException` unwrap is the async-API idiom: Kafka's admin calls return futures; the cause hides the real error (`TopicExistsException`). Describe calls (`describeCluster`, `describeTopics`, `listConsumerGroups`) give you the cluster's truth from code — the same data the CLI shows.

**The partition-count decision deserves thought:** more partitions = more parallelism (and more overhead). The rule of thumb: start with partitions ≈ expected throughput ÷ per-partition throughput, and remember you can *increase* partitions later (at the cost of breaking per-key ordering) but never decrease. Replication factor 3 is the production default for critical data.

## The Metrics That Matter

Kafka exposes rich metrics via JMX (and every monitoring stack — Prometheus exporters, Grafana dashboards, managed-service consoles — surfaces them). The ones that predict incidents:

**Broker-level:**
- **Under-replicated partitions** — the health canary. Partitions whose replicas aren't keeping up with the leader. Persistently non-zero = a slow or failing broker, or misconfiguration.
- **Active controller count** — exactly one broker runs the controller (partition leadership management). More than one = a split-brain problem.
- **Request rate / request time** — throughput and latency of produce/fetch.
- **Network / disk I/O** — the physical limits; brokers are often disk-bound first.
- **Disk usage** — Kafka keeps `log.retention.bytes` worth of data; a full disk stops the broker *hard*. Monitor with alerting, not hindsight.

**Consumer-level (the ones that matter most to you):**
- **Consumer lag** — covered in the consumer-groups lesson: the distance between committed offsets and partition ends. **Lag is the single most important metric in a Kafka deployment** — it's the direct measure of whether your pipelines keep up.

```bash
# Quick lag check from the CLI:
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
    --group order-processor --describe
```

**The alerting philosophy:** alert on *lag thresholds* (a pipeline falling behind), *under-replicated partitions* (data at risk), and *disk usage* (hard failure incoming). Don't just alert on "is the process up" — a healthy-looking process with growing lag is a silent failure.

## Production Configuration Decisions

**Broker config (`server.properties`):**
- `log.retention.hours` / `log.retention.bytes` — how long events live. 7 days is the default; match to your replay needs (longer = more disk).
- `log.segment.bytes` — segment size; affects cleanup granularity.
- `num.partitions` — default partition count for auto-created topics (auto-creation is convenient for dev, *disable it in production* with `auto.create.topics.enable=false` — it hides typos and misconfiguration).
- `min.insync.replicas=2` — the producer's `acks=all` only means "all *in-sync* replicas"; this setting defines the minimum for "in sync." With replication 3 + min.insync 2, a single broker can die and writes continue.
- `unclean.leader.election.enable=false` — never let a lagging out-of-sync replica become leader (prevents data loss at the cost of availability during multi-broker failure). The production default.

**Client config (the ones already covered, recapped):** producers — `acks=all`, `enable.idempotence=true`, compression; consumers — manual offset control or auto-commit awareness, `max.poll.interval.ms` tuned to processing speed.

## KRaft: Kafka Without ZooKeeper

For most of Kafka's life, a ZooKeeper ensemble managed cluster metadata (broker registry, controller election) — a second distributed system to operate. **KRaft (KIP-500)** replaces ZooKeeper with Kafka's own internal metadata log — one less system to run, simpler operations, faster controller failover. KRaft is the modern deployment model (production-ready since Kafka 3.x, the default for new clusters in 4.x). If you're starting fresh, deploy KRaft; only legacy clusters still carry ZooKeeper.

## The Production Hardening Checklist

1. **Replication factor 3**, `min.insync.replicas=2`, producer `acks=all` — no acknowledged-write loss on single-broker failure.
2. **`unclean.leader.election.enable=false`** — prefer availability-with-lag over data loss.
3. **Disable topic auto-creation** in production.
4. **Size partitions for throughput** up front; increase only with full awareness of ordering effects.
5. **Monitor lag, under-replicated partitions, and disk** — with alerting, not hindsight.
6. **Secure the cluster**: TLS encryption in transit, SASL authentication, ACL authorization — Kafka by default assumes a trusted network; production must not.
7. **Plan for brokers as cattle**: a dead broker should be replaceable without manual intervention (managed services like Confluent Cloud / MSK automate this).
8. **Test failover**: kill a broker in staging, watch under-replicated partitions recover, verify producers/consumers reconnect — the drill that makes incidents boring.

## Recap

Operating Kafka means controlling it programmatically (the `AdminClient` for topic creation and cluster introspection), watching the metrics that predict failure (consumer **lag** first, then under-replicated partitions and disk), and setting the production configs that define your guarantees (replication 3 + `min.insync.replicas=2` + `acks=all` for durability; `unclean.leader.election.enable=false` against data loss; no auto-created topics). KRaft removes ZooKeeper from the stack, and security (TLS + SASL + ACLs) is non-negotiable outside trusted networks. The operational truth is the same as for any distributed system: the clients are easy, the running is the craft — and the lag metric is your honesty check.
