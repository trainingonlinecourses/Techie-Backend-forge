---
title: Distributed Locks
module: distributed-systems
order: 4
minutes: 25
topics: ["distributed locks", "Redis SET NX", "lease", "fencing tokens", "ShedLock", "lock expiry"]
docs:
  - title: "Distributed locks with Redis"
    url: "https://redis.io/docs/latest/develop/use/patterns/distributed-locks/"
summary: A distributed lock coordinates work across nodes — exactly one instance runs the job, exactly one consumer drains the queue. But distributed locks ...
---

# Distributed Locks

A distributed lock coordinates work across nodes — exactly one instance runs the job, exactly one consumer drains the queue. But distributed locks are *harder than they look*: the naive "SET key" pattern fails under partitions and crashes. This lesson covers the correct pattern, the expiry trap, and the fencing-token defense.

## The Naive Pattern (and Why It Fails)

```java
// ❌ set + expire in two steps — crash between them = lock without TTL = forever
redis.set("job:lock", nodeId);
redis.expire("job:lock", 30);

// ❌ get + delete race — deletes someone else's lock
if (redis.get("job:lock").equals(nodeId)) {
    redis.del("job:lock");     // lock may have EXPIRED and been RE-ACQUIRED
}
```

## The Correct Pattern: SET NX EX

```java
// Atomic: set only if absent, with a TTL — ONE command
String result = redis.set("job:lock", nodeId, Duration.ofSeconds(30), SetOption.SET_IF_ABSENT);

if ("OK".equals(result)) {
    try {
        runJob();
    } finally {
        // Delete only if we still own it (compare-and-delete via Lua)
        String script = "if redis.call('get', KEYS[1]) == ARGV[1] then " +
                        "return redis.call('del', KEYS[1]) else return 0 end";
        redis.execute(script, List.of("job:lock"), List.of(nodeId));
    }
}
```

Three non-negotiables:

1. **SET with NX + EX atomically** (one command, never two)
2. **A TTL (lease)** — a crashed holder's lock expires
3. **Compare-and-delete** — only the holder releases its own lock

## The Lease Trap: When the Lock Outlives the Job

```
t=0    Node A acquires lock (TTL 30s), starts a 60s job
t=30   Lock expires — Node B acquires it
t=60   Node A finishes and releases... Node B's lock!
       → Both nodes ran the job — the lock FAILED
```

```java
// ❌ Long job + short TTL = lock lost mid-job
redis.set("job:lock", nodeId, Duration.ofSeconds(30));   // job takes 60s!

// ✅ TTL must exceed the worst-case job duration
redis.set("job:lock", nodeId, Duration.ofMinutes(10));

// ✅ Or RENEW the lease (heartbeat) — a watchdog thread extends the TTL
scheduler.scheduleAtFixedRate(() ->
    redis.set("job:lock", nodeId, Duration.ofMinutes(2), SetOption.SET_IF_PRESENT), 
    1, 1, TimeUnit.MINUTES);
```

The renewal/watchdog pattern is what ShedLock and etcd leases do — the lock dies with the holder, not with the job.

## The Fencing Token: The Real Fix

Even with TTLs, there's a window: Node A's lock expires, Node B takes over, Node A's *delayed* work still mutates state. The industry fix is the **fencing token** (Martin Kleppmann's analysis):

```
Every lock acquisition gets a monotonically increasing token.
The protected resource only accepts writes with a token >= the last one.

Node A: token 21 → writes accepted (token 21)
Lock expires, Node B: token 22 → writes accepted
Node A finishes, writes with token 21 → REJECTED (22 > 21)
```

```java
// The protected service checks the token before mutating
@PostMapping("/inventory")
public ResponseEntity<Void> adjust(@RequestBody AdjustRequest req) {
    Long currentToken = tokenStore.get();       // monotonic counter
    if (req.fencingToken() < currentToken) {
        return ResponseEntity.status(409).build();   // stale holder!
    }
    tokenStore.set(req.fencingToken());
    inventoryService.adjust(req);
    return ResponseEntity.noContent().build();
}
```

The fencing token turns "the lock might have expired" from a silent bug into a detectable rejection.

## ShedLock: The Battle-Tested Implementation

```java
@Scheduled(cron = "0 0 3 * * *")
@SchedulerLock(name = "nightly-report", lockAtMostFor = "30m", lockAtLeastFor = "5m")
public void runNightly() { ... }
```

- `lockAtMostFor` — the lease; must exceed the worst-case run
- `lockAtLeastFor` — minimum hold; stops fast jobs from thrashing
- Providers: JDBC, Redis, ZooKeeper, etcd — all implement the NX+TTL pattern

## Redis vs. ZooKeeper/etcd Locks

| | Redis | ZooKeeper / etcd |
|--|-------|------------------|
| Pattern | SET NX EX + TTL | Lease + fencing token |
| Safety | Weaker (failover can lose the lock) | Strong (quorum + revisions) |
| Speed | Fastest | Slower (quorum writes) |
| Use for | Job dedup, rate limits | Critical coordination |
| Consensus | None | Raft/ZAB |

**Redlock** (Redis's multi-node lock) has a famous critique — it's not as safe as consensus-based locks. For *critical* coordination (leader election, split-brain-sensitive work), use etcd/ZooKeeper; for job dedup, Redis is fine.

## The Decision Checklist

| Question | Answer |
|----------|--------|
| Is concurrent execution *harmful* or just wasteful? | Wasteful → lock is enough; harmful → add fencing tokens |
| Can the job outlive the TTL? | Yes → renew the lease or over-provision the TTL |
| Must the release be safe under crashes? | Yes → compare-and-delete |
| Is this critical coordination? | Yes → etcd/ZooKeeper over Redis |
| Is idempotency possible instead? | Yes → prefer idempotency (survives everything) |

## Summary

| Element | Pattern |
|---------|---------|
| Acquire | `SET key nodeId NX EX ttl` — atomic |
| Release | Compare-and-delete (Lua): only the owner |
| Crash safety | TTL lease expires |
| Long jobs | Lease renewal (watchdog) |
| Stale holders | Fencing tokens — the resource rejects |
| Production | ShedLock (JDBC/Redis) or etcd/ZooKeeper |

Distributed locks are a lease, not a guarantee: TTLs make them crash-safe, renewals keep long jobs covered, and fencing tokens make stale holders harmless. For job scheduling, use ShedLock; for critical coordination, use a consensus system — and when you can, prefer idempotency, which makes the lock's failure mode irrelevant.
