---
title: Redis Persistence — RDB Snapshots and AOF
module: redis-deep
order: 4
minutes: 25
topics: ["RDB", "AOF", "persistence", "durability", "Redis config", "data loss"]
summary: Redis is inmemory — its entire dataset lives in RAM, and RAM is volatile: power loss, crash, or restart wipes it. For a cache, that's often fine (a...
docs:
  - title: "Redis Persistence (redis.io)"
    url: "https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/"
  - title: "Redis Durability and Safety (redis.io)"
    url: "https://redis.io/docs/latest/operate/oss_and_stack/management/security/"
---

# Redis Persistence — RDB Snapshots and AOF

## The Concept: What Happens When Redis Restarts?

Redis is *in-memory* — its entire dataset lives in RAM, and RAM is volatile: power loss, crash, or restart wipes it. For a cache, that's often fine (a cold cache rebuilds itself from the database). But for session data, leaderboards, queues, or any Redis data you'd hate to lose, you need **persistence**: a mechanism that saves the dataset to disk so Redis can recover it after a restart.

**The mental model:** think of a spreadsheet you're editing. RDB persistence is like periodically saving a full copy of the file (snapshot). AOF persistence is like keeping an *append-only transaction log* — every change is written to a journal as it happens. The snapshot gives you a consistent point-in-time copy; the journal lets you replay *every* change. Each has different costs, and Redis lets you run both, neither, or one.

## RDB: Point-in-Time Snapshots

**RDB** saves the entire dataset to a compressed binary file (`dump.rdb`) at scheduled moments. Configuration in `redis.conf`:

```conf
# Save if at least 900 seconds passed AND at least 1 key changed:
save 900 1
# ...or 300s with 10 changes:
save 300 10
# ...or 60s with 10000 changes:
save 60 10000

# Where the snapshot lives:
dbfilename dump.rdb
dir /var/lib/redis/
```

**How it works:** when a save condition triggers, Redis **forks** — creates a child process — and the child writes the snapshot while the parent keeps serving. The fork's copy-on-write memory means the snapshot is a consistent view even while writes continue. You can also trigger snapshots manually: `SAVE` (blocking) or `BGSAVE` (background, non-blocking).

**The trade-offs:** RDB is compact (compressed binary) and loads *very fast* on startup — the file is a single consistent image. But the snapshot cadence means **changes since the last snapshot are lost** on a crash. With `save 60 10000`, a crash could lose up to 60 seconds of writes. RDB is the right choice when you tolerate some loss (pure caching) or want the fastest restarts.

## AOF: The Append-Only Journal

**AOF (Append-Only File)** records *every write command* to a log file (`appendonly.aof`) as it executes. On restart, Redis *replays* the log to rebuild the dataset. Configuration:

```conf
appendonly yes
appendfilename "appendonly.aof"

# How often to fsync (flush to disk):
#   always   — fsync on every write: safest, slowest
#   everysec — fsync once per second: good balance (default)
#   no       — let the OS decide: fastest, least safe
appendfsync everysec
```

**The fsync question is the durability dial:** `always` means a committed write is on disk before Redis acknowledges it (lose at most one write); `everysec` means at most ~1 second of writes can be lost but throughput stays high — the standard production choice; `no` leaves flushing to the OS, risking more loss but maximum speed.

**AOF grows forever** — every command accumulates. Redis handles this with **rewrites**: `BGREWRITEAOF` compacts the log to the minimal commands needed to reproduce the current state (Redis auto-triggers rewrites via `auto-aof-rewrite-percentage`). After a rewrite, the AOF is a compact representation of the dataset, like an RDB expressed as commands.

## RDB + AOF: The Best of Both

Modern Redis (7+) defaults to **RDB + AOF together**: AOF for fine-grained durability, RDB for fast recovery. On startup Redis loads the AOF (the more complete record). The combination means: a crash loses only the window defined by `appendfsync`, and restarts replay from a log that stays compact via rewrites. This is the recommended production configuration for data you care about.

## What NOT to Expect From Redis Persistence

It's crucial to understand what persistence does *not* give you:

1. **Not a replacement for a database.** Redis is not ACID-transactional in the database sense, and its persistence protects against *restart* — not against bugs that write wrong data. The authoritative copy of your data should remain in Postgres; Redis persists its *working set*.
2. **Replication is separate from persistence.** A Redis replica (replication) protects against *node* failure by copying data to another machine; persistence protects against *restart* on the same machine. Run both for real availability — replication alone doesn't survive a power outage on all nodes.
3. **`FLUSHALL` is instant and permanent.** A destructive command is applied to RDB/AOF too (or in AOF, replayed). Persistence doesn't undo mistakes — backups (periodic copies of `dump.rdb`/AOF to another location) are your undo button.

## Monitoring and Recovery in Practice

```bash
# Trigger a snapshot manually (background):
redis-cli BGSAVE
# Check last successful save:
redis-cli LASTSAVE
# Trigger AOF rewrite:
redis-cli BGREWRITEAOF
# Check config at runtime:
redis-cli CONFIG GET save
redis-cli CONFIG GET appendonly
```

On a corrupted AOF, Redis 7 auto-repairs via the truncated-tail heuristic (you can also run `redis-check-aof`). On restart, Redis logs which persistence it loaded: `DB loaded from disk` or `Loading RDB produced by version` — the log is where you confirm recovery worked.

## Choosing Your Persistence Strategy

| Scenario | Recommendation |
|---|---|
| Pure cache (loss tolerable) | RDB only, or none — rebuild from DB |
| Sessions, queues, counters you care about | AOF `everysec` |
| Best durability per write | AOF `always` (or `everysec` + replication) |
| Fastest restarts + decent durability | RDB + AOF together |
| Critical data | RDB + AOF + replication + external backups |

## Recap

Redis persistence answers "what survives a restart?" RDB saves full point-in-time snapshots — compact, fast to load, but loses writes since the last snapshot. AOF journals every command — fine-grained durability dialed by `appendfsync` (`everysec` is the production default), kept compact by rewrites. Running both gives the best of each. But persistence is not a database replacement: keep the authoritative copy in Postgres, add replication for node failures, and back up externally for disasters. Know your loss window — it's the number-one Redis production question — and configure it deliberately.
