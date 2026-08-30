---
title: Distributed Scheduling & Leader Election
module: spring-scheduling-async
order: 5
minutes: 24
topics: ["ShedLock", "leader election", "database locks", "idempotency", "cluster safety"]
docs:
  - title: "ShedLock"
    url: "https://github.com/lukas-krecan/ShedLock"
summary: Every scheduled task in this module so far assumes a single instance. The moment you run two replicas (or a blue/green deploy overlaps), every @Sch...
---

# Distributed Scheduling & Leader Election

Every scheduled task in this module so far assumes a **single instance**. The moment you run two replicas (or a blue/green deploy overlaps), every `@Scheduled` method fires on **every node**. A nightly report runs twice, a payment reconciliation runs twice, a cache purge runs twice. Distributed scheduling solves this by ensuring only one node runs each job at a time.

## The Problem

```java
@Scheduled(cron = "0 0 3 * * *")
public void reconcile() {
    // runs on EVERY replica in a cluster ❌
}
```

With 3 replicas, the job runs 3×. For idempotent jobs that's wasteful; for most jobs it's a correctness bug.

## Approaches

| Approach | Mechanism | Maturity |
|----------|-----------|----------|
| **ShedLock** | DB row lock with expiry | Battle-tested, lightweight |
| **Quartz clustering** | DB-backed job store, misfire handling | Full-featured, heavyweight |
| **Kubernetes leader election** | Lease API object | Native in K8s |
| **Redis lock** | SET NX with TTL | Fast, needs Redis |
| **Database `SELECT ... FOR UPDATE`** | Row lock | Simplest, uses existing DB |

## ShedLock: Database-Based Locking

ShedLock acquires a row in a lock table with an expiry, runs the job, and releases. If the node dies mid-job, the lock **expires** automatically, so the job isn't stuck forever.

### 1. Add the dependency

```xml
<dependency>
    <groupId>net.javacrumbs.shedlock</groupId>
    <artifactId>shedlock-spring</artifactId>
    <version>5.16.0</version>
</dependency>
<dependency>
    <groupId>net.javacrumbs.shedlock</groupId>
    <artifactId>shedlock-provider-jdbc-template</artifactId>
    <version>5.16.0</version>
</dependency>
```

### 2. Create the lock table

```sql
CREATE TABLE shedlock (
    name VARCHAR(64) NOT NULL,
    lock_until TIMESTAMP(3) NOT NULL,
    locked_at TIMESTAMP(3) NOT NULL,
    locked_by VARCHAR(255) NOT NULL,
    PRIMARY KEY (name)
);
```

### 3. Configure the lock provider

```java
@Configuration
@EnableSchedulerLock(defaultLockAtMostFor = "15m")
public class ShedLockConfig {

    @Bean
    public LockProvider lockProvider(DataSource dataSource) {
        return new JdbcTemplateLockProvider(dataSource);
    }
}
```

### 4. Annotate jobs

```java
@Service
public class NightlyJobs {

    @Scheduled(cron = "0 0 3 * * *")
    @SchedulerLock(name = "nightly-reconcile", lockAtMostFor = "30m", lockAtLeastFor = "5m")
    public void reconcile() {
        // runs on exactly ONE node
    }
}
```

- `lockAtMostFor` — how long the lock may be held in the worst case (node crash). Must be longer than the longest possible run.
- `lockAtLeastFor` — minimum hold time, prevents a fast job from re-firing immediately after completion.

## Why lockAtMostFor Matters

If a node grabs the lock and dies, ShedLock waits `lockAtMostFor` before letting another node take over. Set it too short and overlapping runs sneak in (two nodes process the same data). Set it too long and a dead node's job stalls for a long time. There is no perfect value — pick the max realistic runtime and add headroom.

## Leader Election With ShedLock

Beyond locking individual jobs, you can elect a single **leader** for the whole application — useful when only the leader should consume from a queue or refresh a shared cache:

```java
@Service
public class LeaderService {

    private volatile boolean isLeader = false;

    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    @SchedulerLock(name = "leader-election", lockAtMostFor = "2m", lockAtLeastFor = "1m")
    public void electLeader() {
        // this method runs on exactly one node, so...
        isLeader = true;
        // ...and the losers never get here. But stale losers need resetting:
    }

    // Better: re-check leadership each run
    public boolean isLeader() { return isLeader; }
}
```

Careful: the node that holds the lock *this minute* may lose it *next minute*. Use leadership to gate short tasks, not to hold long-lived state.

## Kubernetes-Native: Lease API

If you're on Kubernetes, the `coordination.k8s.io` Lease API is the idiomatic leader election:

```yaml
apiVersion: coordination.k8s.io/v1
kind: Lease
metadata:
  name: my-app-leader
spec:
  holderIdentity: pod-abc123
  leaseDurationSeconds: 15
  renewTime: "..."
```

The official Kubernetes client library (`io.kubernetes:client-java`) provides `LeaderElectorBuilder`. On startup, pods compete to become leader; the leader renews every `renewDeadline`; if it dies, another pod takes over within `leaseDuration`. This avoids the database entirely.

## Idempotency as the Second Line of Defense

Distributed locks reduce duplicate runs — they don't eliminate them (clock skew, expired locks, split brain). Every scheduled job that touches shared state should also be **idempotent**: running it twice must produce the same result as running it once.

```java
public void reconcile() {
    // Process only invoices in state PENDING and flip them to PROCESSED atomically
    int updated = invoiceRepository.markPendingAsProcessing();
    if (updated == 0) {
        log.info("Nothing to reconcile — another run got here first");
        return;
    }
    // ...only THIS run processes the claimed rows
}
```

The atomic `UPDATE ... WHERE status='PENDING' RETURNING` claim pattern makes even an unlocked double-run safe.

## Monitoring Distributed Jobs

Whatever mechanism you choose, track:

- **Fired vs. executed** — was the job attempted on each node?
- **Lock waits** — how long did a node wait to acquire?
- **Misfires** — job scheduled but not run (node down, lock stuck)
- **Duration & outcome** — per job, per node

A simple Micrometer counter on job outcomes pays for itself the first time a job silently doubles:

```java
@SchedulerLock(name = "nightly-reconcile", lockAtMostFor = "30m")
public void reconcile() {
    try {
        reconcileService.run();
        metrics.counter("jobs.reconcile", "result", "success").increment();
    } catch (Exception e) {
        metrics.counter("jobs.reconcile", "result", "failure").increment();
        throw e;
    }
}
```

## Summary

| Mechanism | When to use |
|-----------|-------------|
| ShedLock (JDBC) | Standard choice — any app with a DB |
| ShedLock (Redis) | Already have Redis, want sub-second lock ops |
| Quartz cluster | Need misfire policies, persistent job definitions, calendars |
| K8s Lease | Native leader election on Kubernetes |
| Claim-based idempotency | The pattern every job should have anyway |

Distributed scheduling is one lock, one expiry, and one idempotency guarantee away from safe. Start with ShedLock + claim-based processing; graduate to Quartz or K8s leader election only when the requirements actually demand them.
