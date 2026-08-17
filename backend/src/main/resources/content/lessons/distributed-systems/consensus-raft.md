---
title: Consensus: Raft and Quorum
module: distributed-systems
order: 2
minutes: 30
topics: ["Raft", "leader election", "log replication", "quorum", "majority", "ZooKeeper", "etcd"]
docs:
  - title: "Raft paper"
    url: "https://raft.github.io/"
---

# Consensus: Raft and Quorum

When multiple nodes must agree on one value — who is the leader, what is the committed log — you need **consensus**. Raft is the algorithm behind etcd and ZooKeeper (ZAB): it elects a leader, replicates a log, and commits only when a **majority** acknowledges. This lesson is the mechanism, the quorum math, and where consensus lives in your stack.

## The Problem

Two nodes both think they're the leader. Two payments both "committed" with one node each. Distributed systems need an agreement primitive:

```
Node A: "I am leader, commit write X"
Node B: "I am leader, commit write Y"
Who wins? Consensus says: exactly one, and everyone agrees.
```

## Raft in Three Parts

### 1. Leader Election

```
All nodes start as FOLLOWERS with a random election timeout (150–300ms).

Follower hears nothing → becomes CANDIDATE → votes for itself → asks peers
Candidate gets a MAJORITY of votes → becomes LEADER
Leader sends heartbeats → followers reset their timers
```

- Only one leader per **term** (a numbered epoch)
- Stale leaders detect a newer term and step down
- **Split vote**: two candidates split the vote → no leader this term → new election with new random timeouts

### 2. Log Replication

```
Client → Leader: "commit write X"
Leader appends to its log
Leader sends AppendEntries to followers
Followers append + acknowledge
Leader commits when a MAJORITY (leader + followers) have the entry
Leader replies to the client
```

### 3. Safety

- A leader never overwrites its log
- Followers with longer logs win elections (the "most complete log" rule)
- A committed entry is never lost — it's on a majority

## The Quorum Math

A **majority quorum** is `floor(n/2) + 1`:

| Nodes | Quorum | Tolerated failures |
|-------|--------|--------------------|
| 1 | 1 | 0 |
| 3 | 2 | 1 |
| 5 | 3 | 2 |
| 7 | 4 | 3 |

**The magic**: any two quorums overlap by at least one node — that's why a majority commit can't be lost and two leaders can't both be elected in the same term.

```
3 nodes: quorum = 2
  Node A + B acknowledge → committed
  Node C can be down — the write survives (A or B has it)
5 nodes: quorum = 3 — tolerate 2 failures
```

**Why not 2 nodes?** Quorum would be 2 (both) — one failure = no quorum = system stops. Odd numbers matter: 3 nodes > 2 nodes for fault tolerance.

## The Leader Lease / Heartbeat

```
Leader ──heartbeat──▶ Follower (every 50–500ms)
Follower resets its election timer on each heartbeat
Leader misses the deadline → follower calls an election

The lease: followers accept writes only while the leader's heartbeat is fresh
```

This is the mechanism that prevents two leaders in a network partition: the minority side's followers time out, call an election, can't get a majority, and step down — while the majority side keeps its leader.

## Where Consensus Lives in Your Stack

| System | Consensus algorithm | Used for |
|--------|--------------------|----------|
| **etcd** | Raft | Kubernetes control plane, locks, config |
| **ZooKeeper** | ZAB (ZooKeeper Atomic Broadcast) | Leader election, config, coordination |
| **Consul** | Raft | Service discovery, KV, leader election |
| **Kafka** | KRaft (Raft) | Broker leadership (since 3.x) |
| **Redis** | Sentinel (gossip-based, weaker) | Failover |

## Using Consensus From Spring

```java
// etcd — distributed lock / leader election
@Component
public class LeaderElector {

    private final EtcdClient client;

    public boolean tryBecomeLeader(String nodeId) {
        try {
            client.put(ByteSequence.from("leader"), ByteSequence.from(nodeId))
                .withPrevKey(ByteSequence.EMPTY)   // only if absent — atomic
                .get();
            return true;
        } catch (EtcdException e) {
            return false;   // someone else holds it
        }
    }
}
```

The leader election pattern behind ShedLock's Redis/etcd providers — the consensus system is what makes "exactly one node runs the job" true even across partitions.

## The ZooKeeper Quorum

```
ZooKeeper ensemble (odd number, 3 or 5)
  ├─ Leader (elected via ZAB)
  ├─ Follower
  └─ Follower

Client writes must reach a quorum → acknowledged
Client reads from any node (may be slightly stale) unless sync read
```

## The Costs of Consensus

| Cost | Detail |
|------|--------|
| Latency | Every committed write = quorum round-trips (leader → followers → ack) |
| Throughput | Limited by the slowest quorum member |
| Availability | Losing the quorum = system stops (CP by design) |
| Complexity | Raft is ~2000 lines to implement — never hand-roll it |

**The rule**: use a *proven* consensus system (etcd/ZooKeeper/Consul), never build your own. Consensus is the hardest distributed-systems problem — libraries exist for a reason.

## Testing Quorum Behavior

```java
@Test
void writeFailsWithoutQuorum() {
    // With a 3-node etcd where one node is down:
    // quorum = 2, still available (2 of 3 up)
    // with TWO nodes down: writes fail with "etcdserver: no leader"
    assertThrows(EtcdException.class,
        () -> client.put(KEY, VALUE).get());
}
```

## Summary

| Concept | Key fact |
|---------|----------|
| Consensus | Agreement despite failures — one leader, one log |
| Raft | Leader election + log replication + safety |
| Quorum | Majority: floor(n/2)+1 — 2 of 3, 3 of 5 |
| Overlap | Any two quorums intersect — commits survive |
| Heartbeat | The lease that prevents dual leaders |
| Systems | etcd, ZooKeeper, Consul, KRaft |
| Rule | Never implement consensus yourself |

Consensus is how distributed systems get a single source of truth: a leader, a replicated log, and a majority rule that survives partitions and failures. Use etcd or ZooKeeper for leadership, locks, and config — and remember every consensus write costs a quorum round-trip, which is the price of the guarantee.
