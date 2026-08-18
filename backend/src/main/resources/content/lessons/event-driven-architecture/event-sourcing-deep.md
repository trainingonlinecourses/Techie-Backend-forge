---
title: Event Sourcing — The Events Are the State
module: event-driven-architecture
order: 3
minutes: 27
topics: ["event sourcing", "event store", "aggregates", "replay", "snapshots", "projections", "CQRS"]
docs:
  - title: "Event Sourcing (Martin Fowler)"
    url: "https://martinfowler.com/eaaDev/EventSourcing.html"
  - title: "Event Sourcing Pattern (Microsoft)"
    url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing"
---

# Event Sourcing — The Events Are the State

## The Concept: Stop Storing the Answer, Store the Story

Conventional persistence stores the *current state*: an account row says `balance = 500`. **Event sourcing** stores the *history*: a ledger of every event — `Opened(0)`, `Deposited(200)`, `Withdrew(50)`, `Deposited(350)`. The current balance is not stored; it's **derived by replaying the events**. The events are the source of truth; the current state is just a *projection* of them.

**The mental model:** a bank statement vs a ledger. The statement (current-state model) tells you the balance *now* — but not *why*, and you can't reconstruct the past. The ledger (event sourcing) records every transaction — the balance is whatever you get by adding them up, *at any point in time*. The ledger can't be "edited" (only appended to), it answers "what happened and when," and you can rebuild any historical balance. That's event sourcing: **append-only events as the system of record.**

**Why this is radical and powerful:** the event log is the *complete, immutable, auditable history* — perfect for compliance ("show every change to this order"), debugging ("what exactly happened?"), temporal queries ("the balance on March 3"), and — the killer feature — **the events are already the integration events**: the same `OrderPlaced` you persist is the event you publish. No dual-write, no outbox: the state and the event stream are the same thing.

## The Core Mechanics

```java
// 1. THE EVENT — an immutable fact:
public record MoneyDeposited(String accountId, BigDecimal amount, Instant when) { }

// 2. THE AGGREGATE — applies events to produce state:
public class Account {
    private String id;
    private BigDecimal balance = BigDecimal.ZERO;
    private boolean closed;

    // RECONSTRUCTION — the aggregate is built by replaying its events:
    public static Account replay(List<Object> events) {
        Account a = new Account();
        for (Object e : events) a.apply(e);   // replay, in order
        return a;
    }

    private void apply(Object event) {
        if (event instanceof MoneyDeposited d) balance = balance.add(d.amount());
        if (event instanceof MoneyWithdrawn w) balance = balance.subtract(w.amount());
        if (event instanceof AccountClosed c)  closed = true;
    }

    // COMMAND -> VALIDATION -> EVENTS:
    public List<Object> deposit(BigDecimal amount) {
        if (closed) throw new IllegalStateException("account is closed");
        return List.of(new MoneyDeposited(id, amount, Instant.now()));
        // The method RETURNS events; it does NOT mutate state directly.
    }

    public List<Object> withdraw(BigDecimal amount) {
        if (balance.compareTo(amount) < 0)
            throw new InsufficientFundsException(id);
        return List.of(new MoneyWithdrawn(id, amount, Instant.now()));
    }
}
```

**Walking through the two-phase model:**

- **Commands** (business operations: `deposit`, `withdraw`) *validate* the current state and *return events* — they never write state. `withdraw` checks the balance (derived from replayed events) and produces a `MoneyWithdrawn` — or throws, producing nothing.
- **Events** are appended to the **event store** (an append-only table/stream). The aggregate's state is always *reconstructed* by `replay(events)` → `apply(event)`.

```java
// 3. THE STORE — append-only:
//    An "events" table: aggregate_id, version, event_type, payload, timestamp.
//    Or Kafka as the event store (events ARE the topic log).

// 4. THE USAGE — the repository reads events and replays:
public class AccountRepository {
    public Account findById(String id) {
        return Account.replay(eventStore.load(id));   // load ALL events, replay
    }
    public void save(Account a, List<Object> newEvents) {
        eventStore.append(id, nextVersion, newEvents);  // append only
    }
}
```

**The version discipline:** each event carries a sequence number; appends must be *optimistically locked* (the version you loaded must match at append time) — otherwise two concurrent commands interleave events and the replay is corrupted. This is the event-sourced version of the lost-update problem.

## Snapshots: The Performance Escape Hatch

Replaying *every* event since genesis is slow for long-lived aggregates (10 years of deposits = 10,000 events replayed per read). **Snapshots** store the state *as of a point* and replay only the events after it:

```text
Account snapshot (balance=500, version=9000)   <- persisted periodically
        + replay events 9001..9042              <- only the new ones
        = current state (balance=510, version=9042)
```

A scheduled job (or an append-time trigger) snapshots aggregates every N events; reads load the nearest snapshot and replay the small remainder. Snapshots are a *cache* of the replay — they can be rebuilt from events at any time, which is the beauty: the events remain the truth, snapshots are disposable accelerators.

## Projections: The Read Side

The event log is a poor query model — "give me all accounts with balance > 1000" shouldn't replay every account. **Projections** (a.k.a. read models) are *derived* stores: consumers of the event stream build whatever query-friendly shapes they need:

```java
// A projection: consume events, update a denormalized read model:
// (with Spring's EventListener / @TransactionalEventListener)
@EventListener
public void on(MoneyDeposited e) {
    // upsert the read model: accounts_summary.updated_at, total deposits...
    summaryRepo.incrementDeposits(e.accountId(), e.amount());
}

// The read model answers queries directly:
//   "top accounts by deposits" -> SELECT ... FROM accounts_summary ORDER BY ...
//   (no replay needed at query time)
```

**This is where CQRS enters:** **C**ommand **Q**uery **R**esponsibility **S**egregation — the write side (commands → events, the aggregate) and the read side (projections, the query models) are *separate models and often separate stores*. Event sourcing naturally produces CQRS: the event store is the write model; projections are the read models. The query that "doesn't fit the events" becomes a projection built from them.

## The Guarantees and the Costs

**What you gain:**
- **Complete audit trail** — every state change, forever, immutable. Compliance and debugging solved.
- **Temporal queries** — state as of any time (replay up to that point).
- **No lost updates at the event level** — appends with versioning; the history is append-only.
- **The events are the integration** — publish what you persist; no dual-write.

**What it costs:**
- **Eventual consistency** — projections lag the events; a query may see slightly-old state.
- **Event store infrastructure** — a specialized store (or disciplined Kafka/Database usage), versioning, snapshots, replay jobs.
- **Schema evolution is harder** — events are forever; changing `MoneyDeposited`'s shape means handling old versions (upcasting: read old events, apply migrations).
- **Complexity** — aggregates, replay, snapshots, projections, idempotent consumers: a real learning curve and a real operational surface.

## When to Choose Event Sourcing

**Choose it when:** audit/compliance is a hard requirement (finance, healthcare, ledgers); temporal queries matter ("state as of X"); the domain is naturally eventful (banking, logistics, order lifecycles); you need the events for integration anyway.

**Don't choose it when:** you need simple CRUD with immediate consistency (a user-profile service — the complexity buys nothing); the team is new to distributed patterns (learn the outbox + events first); the domain has no meaningful history (a config service).

**The pragmatic path:** event sourcing for the *ledger-like cores* (accounts, orders, inventory) inside a mostly-CRUD system — not the whole application. The pattern is surgical, not systemic.

## Recap

Event sourcing stores the history, not the state: commands validate and produce events, the event store appends them immutably, and aggregates reconstruct their state by replay. Snapshots accelerate long replays; projections (read models) make the events queryable — leading naturally to CQRS with the event store as the write side. The gains are profound — complete audit, temporal queries, no lost-update races, events-as-integration — and the costs are real: eventual consistency, event-store infrastructure, schema evolution via upcasting, and genuine complexity. Choose it for the ledger-like cores where history *is* the product, and keep the rest of the system conventionally simple.
