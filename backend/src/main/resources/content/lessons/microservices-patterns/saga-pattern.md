---
title: The Saga Pattern
summary: Distributed transactions without distributed locks — choreographed and orchestrated sagas, compensation, and the failure scenarios that define the design.
order: 1
minutes: 15
topics: [saga, distributed transactions, compensation, choreography, orchestration]
docs:
  - https://microservices.io/patterns/data/saga.html
  - https://microservices.io/patterns/data/saga.html#solution
---

# The Saga Pattern

## The problem: a transaction across services

In one database, `BEGIN/COMMIT` is atomic. In a microservices world, an "order" touches the order service, the payment service and the inventory service — three databases. **Two-phase commit (2PC) across services is a distributed lock with a deadlock problem**: a coordinator holding locks while a participant is down brings the whole transaction to a halt. The saga pattern replaces "all or nothing" with **a sequence of local transactions + compensation**:

```
Saga: place order → reserve inventory → charge payment → ship
       (each step: its own local transaction, its own database)

On failure at step 3:
       compensate: refund payment (if already charged) → release inventory → mark order failed
```

Each step commits **permanently**; the saga's job is to run the compensating steps when a later step fails. Eventually consistent by design — the saga's "atomicity" is *eventual*, not instantaneous.

## Choreography: events, no central brain

Each service publishes an event when its step completes; the next service reacts:

```
OrderService:  creates order, publishes OrderCreated
InventoryService: reserves stock, publishes StockReserved
PaymentService: charges card, publishes PaymentCharged
ShippingService: ships, publishes OrderShipped
  ── any failure publishes OrderFailed / PaymentFailed → each listener compensates its step
```

- **Pros**: no coordinator, natural fit with the outbox + event-driven stack.
- **Cons**: the flow is implicit — tracing "why did this order die?" means walking event history; a new participant changes the flow; each service must know its compensation.

The Kafka/outbox infrastructure from the curriculum is exactly the transport: outbox for atomic publication, consumer groups for exactly-one-ish delivery, DLQs for poison events.

## Orchestration: a saga coordinator

A dedicated **orchestrator** (a service or a state machine) issues commands and tracks state:

```
OrderSaga (orchestrator):
  1. call InventoryService.reserve(orderId)
  2. call PaymentService.charge(orderId)
  3. call ShippingService.ship(orderId)
  on failure at step 2 → call InventoryService.release(orderId); mark order FAILED
```

- **Pros**: the flow is visible in one place; adding a step is editing the saga; easy to test the state machine.
- **Cons**: the orchestrator is a single point of coupling (though it's stateless-ish if it persists saga state — see below).

**The default recommendation: orchestration.** Choreography's "no central brain" is charming until a business analyst asks why an order failed — the orchestrator's persisted state *is* the answer.

## The state that makes it reliable

A saga without persisted state is a saga that forgets. Production sagas persist:

```java
// saga state in the orchestrator's own DB (each saga instance is a row):
@Entity class SagaState {
    @Id String sagaId;         // correlation id — same id in every service call/event
    String step;               // which step is next / waiting
    String status;             // RUNNING | COMPLETED | FAILED | COMPENSATING
    String payloadJson;        // the order context to resume with
}
```

- **Correlation id** (`sagaId`) is how every step, event and compensation finds its saga.
- **Retry**: transient failures are retried (with idempotency keys) before any compensation starts — a saga that compensates on the first timeout is a saga that cancels healthy orders.
- **Idempotency everywhere**: every step must tolerate being called twice (the order of the reservation, the charge) — the retry/outbox discipline from the Kafka module applies verbatim.

## The failure matrix (design by failure)

| Failure | Correct response |
|---|---|
| Step times out (transient) | retry with backoff; only then compensate |
| Step definitively fails | compensate completed steps, in reverse order |
| Compensating step fails | retry compensation; escalate to the DLQ/reconcile job — compensation must eventually succeed |
| Orchestrator crashes mid-saga | restart from persisted state — never "forget" a running saga |
| Duplicate step invocation | idempotency key per step — the charge happens once |

The rule that separates good sagas: **every failure mode above is designed before implementation** — a saga spec is a table of "if X fails, do Y", reviewed like a security threat model.

## Saga vs. 2PC vs. outbox-only

| Approach | Atomicity | Consistency window | Best for |
|---|---|---|---|
| 2PC across services | strong, at lock cost | immediate, with distributed locks | rarely — only tiny, low-contention flows |
| **Saga** | eventual via compensation | seconds-to-minutes | business transactions across services (orders, bookings) |
| Outbox (single-writer) | atomic *publication* | n/a — it's a delivery mechanism | the reliable event transport sagas run on |

Sagas don't replace the outbox — **they run on top of it**: the outbox guarantees the step's event/publish is atomic with its DB write; the saga guarantees the multi-step flow reaches a consistent end state.

## Key takeaways

- Saga = sequence of local transactions + reverse compensation; eventual consistency, designed by failure.
- Choreography (events) vs orchestration (coordinator) — orchestration with persisted state is the safer default.
- Persist saga state, correlate with a saga id, retry before compensating, make every step idempotent.
- Design the failure matrix up front; run sagas on outbox-grade reliable events.

Official docs: [Saga (microservices.io)](https://microservices.io/patterns/data/saga.html)
