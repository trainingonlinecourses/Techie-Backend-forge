---
title: Distributed Data Consistency
summary: Choosing a consistency model — ACID within a service, eventual consistency between them, and the idempotency + reconciliation toolkit.
order: 5
minutes: 14
topics: [eventual consistency, idempotency, reconciliation, cap theorem, distributed data]
docs:
  - https://microservices.io/patterns/data/index.html
  - https://martinfowler.com/articles/patterns-of-distributed-systems/
---

# Distributed Data Consistency

## The consistency menu

In one database, ACID gives you strong consistency for free. **Across services, you choose a model** — and the choice is the architecture:

| Model | Meaning | Example |
|---|---|---|
| **Strong** | a read sees every prior write (linearizable) | a single-DB transaction |
| **Read-your-writes** | the writer sees its own writes | session handling |
| **Eventual** | reads converge, in bounded time | projections, caches, search indexes, sagas |
| **Causal** | events in a causal chain appear in order | "reply after comment" in a feed |

The CAP framing: across services you get **availability and partition tolerance** (network failures happen), so consistency becomes a design decision per flow — and the honest default for cross-service data is **eventual, with idempotency and reconciliation**. Strong consistency across services is "don't split the data" (stay in one service, or one database) — usually the right answer for the 95% case.

## The toolkit: what makes eventual consistent *safe*

Eventual consistency isn't a shrug — it's a discipline:

1. **Idempotent operations** — every operation carries an idempotency key; retries are harmless:

```java
// The charge can be retried safely — the key dedupes:
POST /payments/charge
{ "idempotencyKey": "order-42-retry-1", "amount": 19.99 }
// the service stores key → result; a replay returns the stored result
```

2. **Eventual delivery** — the outbox pattern (atomic publish) + consumer retries + DLQ. "Eventually" means *bounded*: retries with backoff and an alert after N failures.

3. **Reconciliation** — the job that proves consistency: a scheduled sweep comparing the two sides and repairing drift ("orders marked paid but no payment record — investigate"). Reconciliation is the difference between "eventually consistent" and "eventually *forgotten*". The saga and outbox lessons both end at this step for a reason.

4. **Versioned state** — optimistic locking (`@Version`), so concurrent updates fail loudly instead of overwriting silently.

## The order of operations matters

```java
// The classic bug — check-then-act across services:
if (paymentService.isPaid(order)) {          // read  (service A)
    inventoryService.release(order);          // write (service B)
}
// A concurrent change between the read and the write makes the decision stale.

// The safe shape: make the DECISION inside the service that owns the write,
// or make the operation idempotent so a stale decision is harmless.
```

Rule: **never make a cross-service decision from a stale read.** Either move the check into the owning service (it re-validates atomically), or make the follow-up operation idempotent/conditional (a state machine: "release only if status == PAID").

## Design the consistency, per flow

```java
// A consistency decision table (part of the design review):
//   Flow: create order → charge → ship
//   - order row + outbox row:      atomic (one DB, one tx)
//   - charge:                      idempotent via key; retry 3x; then compensate
//   - shipment:                    eventually consistent; reconcile daily
//   - max acceptable skew:         5 minutes (stated, not vibes)
```

Every cross-service flow gets a row: what's atomic, what's idempotent, what's eventual, **what's the max skew**, and what reconciles it. If you can't state the max skew, you haven't designed the consistency — you've hoped for it.

## The two tools that fix most incidents

1. **Idempotency keys** on every mutating endpoint (kills duplicate charges, duplicate orders, double-processing — the retry/DLQ machinery from the Kafka module).
2. **A reconciliation job** per consistency boundary (kills silent drift — the difference between a system that converges and a system that rots).

Most "distributed consistency" pain in real systems is neither CAP nor Byzantine — it's **missing idempotency and missing reconciliation**. Add those two, and the eventual-consistency table gets dramatically smaller.

## Key takeaways

- Across services you choose a consistency model; the honest default is eventual + idempotency + reconciliation.
- Idempotency keys make retries safe; outbox + retries + DLQ make delivery bounded; reconciliation repairs drift.
- Never decide from a stale cross-service read — move the decision to the owner or make it conditional.
- State the max skew per flow and who reconciles it; most incidents are missing idempotency and reconciliation, not missing magic.

Official docs: [Data patterns (microservices.io)](https://microservices.io/patterns/data/index.html) · [Patterns of Distributed Systems (Fowler)](https://martinfowler.com/articles/patterns-of-distributed-systems/)
