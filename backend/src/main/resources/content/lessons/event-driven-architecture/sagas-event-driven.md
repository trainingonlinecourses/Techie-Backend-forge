---
title: Sagas in Event-Driven Systems — Compensating the Long Journey
module: event-driven-architecture
order: 5
minutes: 27
topics: ["sagas", "compensation", "event-driven transactions", "choreography", "orchestration", "eventual consistency"]
docs:
  - title: "Saga Pattern (microservices.io)"
    url: "https://microservices.io/patterns/data/saga.html"
  - title: "Saga (Microsoft Azure Architecture)"
    url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/saga/saga"
---

# Sagas in Event-Driven Systems — Compensating the Long Journey

## The Concept: Transactions That Span Services

A business operation often spans several services: place an order (order service), reserve stock (inventory), charge the card (payment), schedule shipping (shipping). A *distributed transaction* across all of them — the classic ACID transaction — is precisely what microservices gave up: no single database, no global lock, no rollback across services. **The saga pattern** is the industry's answer: the operation is a *sequence of local transactions*, each with its own database, and if one fails, **compensating transactions** undo the ones before it.

**The mental model:** a saga is a long road trip with hotel bookings. Each leg (booking a hotel) is a local, independent transaction. If a later leg fails (the next hotel is full), you don't "roll back" the whole trip — you *compensate*: cancel the earlier hotels (each with its own cancellation). The trip as a whole either completes or unwinds — but the unwinding is a series of deliberate *undo actions*, not an atomic rollback. There's no global transaction manager; the participants cooperate through events.

**The critical distinction:** compensation is **not** rollback. Rollback restores the *previous state* (atomic, instant). Compensation performs *new actions* that undo the *effect*: "CancelPayment" refunds the charge; "ReleaseStock" returns reserved units. A compensation can fail, take time, and is itself a real business operation — which is why sagas are designed with eventual consistency and compensating steps in mind from the start.

## Choreography: The Event-Driven Saga

**Choreographed sagas** are pure event-driven architecture: each service does its local transaction and *publishes an event*; the next service reacts to the event; failures publish *failure events* that trigger compensations:

```text
OrderPlaced ──▶ InventoryService: reserve stock
                      │
                      ├─ StockReserved ──▶ PaymentService: charge card
                      │                          │
                      │                          ├─ PaymentCharged ──▶ ShippingService: schedule
                      │                          │                          │
                      │                          │                          └─ ShipmentScheduled → SAGA COMPLETE
                      │                          │
                      │                          └─ PaymentFailed ──▶ InventoryService:
                      │                                              ReleaseStock (COMPENSATION)
                      │
                      └─ StockUnavailable ──▶ OrderService: MarkOrderCancelled (COMPENSATION)
```

```java
// Each participant is a saga step — an event listener doing its local
// transaction, then publishing the next event:
@Service
public class InventorySagaStep {

    @KafkaListener(topics = "orders")
    public void onOrderPlaced(OrderPlaced event) {
        try {
            inventory.reserve(event.items());               // local transaction 1
            kafka.send("inventory", event.orderId(),
                       new StockReserved(event.orderId(), event.items()));
        } catch (StockUnavailableException ex) {
            // The failure path publishes a FAILURE event — the
            // compensation chain starts here:
            kafka.send("inventory", event.orderId(),
                       new StockUnavailable(event.orderId()));
        }
    }

    // THE COMPENSATION — triggered by a later step's failure:
    @KafkaListener(topics = "payments")
    public void onPaymentFailed(PaymentFailed event) {
        inventory.release(event.orderId(), event.items());   // undo the reserve
    }
}
```

**The choreography pros:** zero central coordinator, pure events, each service independent. **The cons:** the flow is *implicit* — scattered across listeners — and hard to see or debug; adding a step means wiring new events; loops are possible. For short, simple sagas, choreography is the natural fit — it's just event-driven programming with compensations.

## Orchestration: The Central Conductor

**Orchestrated sagas** put a **saga orchestrator** (a dedicated component — a state machine) in charge: it *commands* each participant ("reserve stock", "charge card"), waits for the result, and decides the next step or the compensation path:

```java
// The orchestrator — a state machine driving the saga:
@Service
public class OrderSagaOrchestrator {

    // States: PENDING -> STOCK_RESERVED -> PAYMENT_CHARGED -> SHIPPING_SCHEDULED
    //         -> any step failed -> COMPENSATING -> CANCELLED

    // Step 1 — command the inventory service:
    public void start(OrderPlaced order) {
        inventoryClient.reserveStock(order);      // a COMMAND, not an event
    }

    // Called by the inventory service's reply:
    public void onStockReserved(StockReserved result) {
        paymentClient.charge(result.orderId());   // step 2
    }

    public void onPaymentFailed(PaymentFailed failure) {
        inventoryClient.releaseStock(failure.orderId());  // COMPENSATION
        orderClient.cancelOrder(failure.orderId());       // COMPENSATION
    }
}
```

**The orchestration pros:** the flow is *explicit* — one component, a visible state machine, easy to trace and test; failure handling is centralized. **The cons:** the orchestrator is a single point of coupling (and, if poorly built, a bottleneck) — a "smart" component that must itself be reliable.

**The choice:** **choreography** for short, naturally event-driven flows; **orchestration** when the saga is long, failure paths are complex, or the flow must be visible and audited (which is most real business sagas).

## The Saga Reliability Requirements

A saga is reliable only if its parts are:

1. **Each step is a local transaction** (its own database, ACID within itself) — the only atomicity in the system.
2. **Each step is idempotent** — a retried command must not double-reserve or double-charge (event ids, unique constraints).
3. **Each failure has a compensation** — *designed in advance*: for every step, "if the journey stops here, what undoes what I did?"
4. **The saga state survives crashes** — the orchestrator persists its state (a saga table: order_id, current_step, status); a crash resumes from the last persisted step. Choreographed sagas get this from the event log itself (the events are the state).
5. **Compensations are themselves reliable** — they're real operations (a refund can fail; it gets retried) — hence "saga failure = retry the compensation," not "hope."

## The Two Kinds of Failure

**Technical failures** (a service is down, a timeout): handled by retries and timeouts within the saga framework — the step is retried, or the saga fails over to compensation after N attempts.

**Business failures** (stock is actually unavailable): *not* a retry situation — the saga must compensate what's done and stop. Distinguishing the two ("retry this; compensate that") is a core saga design decision, and it's why saga frameworks distinguish "retryable" from "terminal" errors.

## Sagas vs the Alternatives

| Pattern | Mechanism | Use for |
|---|---|---|
| **Saga** | local transactions + compensation | multi-service business flows (the standard) |
| Distributed transaction (2PC) | global coordinator, locks | legacy/small-scale only — the coupling and lock-holding don't scale |
| Outbox + events | atomic local change + event | the *transport* layer under sagas (each saga step publishes via outbox) |
| Event sourcing | events as state | audit-heavy cores; complementary to sagas (the saga state can be event-sourced) |

The layering to notice: sagas are built *on* the event-driven fundamentals — each step's event publication should go through the outbox, consumers must be idempotent, and the ordering guarantees come from Kafka's per-key ordering (key saga events by `orderId`).

## Recap

Sagas are the distributed-transaction substitute for multi-service business operations: a sequence of local transactions, each in its own database, with **compensating actions** that unwind the completed steps when a later one fails. **Choreographed sagas** are pure events (each step publishes, failures cascade compensations — simple but implicit); **orchestrated sagas** use a central state-machine coordinator (explicit, traceable, better for complex flows). The reliability requirements are strict: local transactions per step, idempotency everywhere, compensations designed in advance, persistent saga state, and retryable-vs-terminal failure distinction. Sagas aren't magic — they're the disciplined acceptance that cross-service operations are eventually consistent and deliberately unwindable, and that's the honest, production-grade answer to the question ACID can't answer across services.
