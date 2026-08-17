---
title: Event Sourcing
summary: The event log as the source of truth — commands become facts, state is a projection, and every question is answerable from history.
order: 3
minutes: 15
topics: [event sourcing, event log, projections, replay, audit trail]
docs:
  - https://martinfowler.com/eaaDev/EventSourcing.html
  - https://microservices.io/patterns/data/event-sourcing.html
---

# Event Sourcing

## The inversion

Normal persistence stores **state**: `Account(balance=100)`. Event sourcing stores **facts**: `AccountOpened(0) → Deposited(50) → Withdrawn(20) → Deposited(70)`. The current state (balance=100) is a **projection** — fold the events in order. The event log is the source of truth; the state is derived and disposable.

```java
// Commands validate and emit facts — never mutate state directly:
public void withdraw(AccountId id, Money amount) {
    Account a = load(id);                       // rebuild from its event stream
    a.assertSufficient(amount);                 // invariant check
    eventStore.append(new Withdrawn(id, amount, now()));   // append-only
}

// State = fold of the stream:
Account account = events.of(id)
    .fold(new Account(), Account::apply);       // apply each event in order
```

Append-only. Immutable events. **The log is the database.** State can be rebuilt, replayed, or thrown away — the log never lies.

## The parts

1. **Event store** — append-only, ordered per aggregate (by aggregate id + sequence). Postgres (an `events` table), Kafka (log topic), or a dedicated store. The write path is trivial (append); all the complexity moves to the read side.
2. **Aggregate with `apply`** — the domain object is a pure function of its events: `apply(Deposited e)` adds to balance; `apply(Withdrawn e)` subtracts. **Event application must be total** (handle every event type) and pure (no I/O, no side effects) — that's what makes replay safe.
3. **Projections** — read models built from the log (the CQRS lesson): the account summary, the dashboard, the audit report. Rebuilding = replay from the start (or from a snapshot).
4. **Snapshots** — replaying 10 years of events to answer one query is slow; snapshot the state every N events and replay from the snapshot.

## What event sourcing buys you

- **The audit trail is free** — every fact that ever happened, in order, immutable. Regulators love it; debugging loves it ("what exactly did the user do?" is a query, not forensics).
- **Replay and repair** — a bug in a projection doesn't corrupt data; fix the projector, replay, done. (Contrast: a bug in a mutable update has already overwritten the truth.)
- **Temporal queries** — "what was the balance on March 3?" is a fold up to that date. No `updated_at` archaeology.
- **Escape from UPDATE** — no lost-update races on the write model; the event append is the only write, and it's naturally ordered per aggregate.

## The costs (why it's not the default)

| Cost | Reality |
|---|---|
| Eventual consistency everywhere | state is behind the log; reads see the projection, not the write |
| Schema evolution of events | an event shape change means versioning (`v1`/`v2`), upcasting, migrations — the schema-evolution lesson, for events instead of tables |
| Projection drift | every consumer re-implements state; projection bugs are silent until queried |
| The mental model | "the current state" is a lie; you must think in facts |
| Team maturity | event sourcing without the discipline (mutable events, mixed persistence) is worse than a normal database |

The honest guidance: **event sourcing is a specialty tool**, not a default. It earns its keep where history is the product (banking, audit, compliance, supply-chain, collaborative editing) — not where "update the row" is the natural model.

## Event sourcing vs. the outbox (the confusion)

- **Outbox** (Kafka module): the business DB is the truth; the outbox *mirrors changes as events* for delivery. Events are a side effect of state.
- **Event sourcing**: the log is the truth; state is derived. Events *are* the state.

They compose (an event-sourced system still publishes through reliable delivery), but they answer different questions: "how do I publish state changes reliably?" vs. "what if the changes themselves were the record?"

## A pragmatic hybrid

Full event sourcing is a big bet. The widely-used middle ground:

- **Keep the normal write model** for current state (fast, transactional).
- **Also append the event log** (same transaction — this is literally the outbox pattern).
- Rebuild projections/audit from the log; keep the DB row as the source of truth for "now".

You get the audit trail and replay without betting the system on event-derived state. **Most teams that "want event sourcing" actually want this hybrid.**

## Key takeaways

- The event log is the source of truth; state is a disposable projection (fold of events).
- Commands validate and append facts; aggregates are pure functions of their events (`apply`).
- The wins: free audit trail, replay/repair, temporal queries. The costs: eventual consistency, event schema evolution, projection drift.
- It's a specialty tool for history-centric domains — and the outbox-hybrid gives most of the benefit without the bet.

Official docs: [Event Sourcing (Fowler)](https://martinfowler.com/eaaDev/EventSourcing.html) · [Event Sourcing (microservices.io)](https://microservices.io/patterns/data/event-sourcing.html)
