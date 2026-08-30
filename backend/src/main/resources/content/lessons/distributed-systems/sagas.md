---
title: Sagas: Choreography and Orchestration
module: distributed-systems
order: 5
minutes: 28
topics: ["saga pattern", "choreography", "orchestration", "compensating transactions", "saga state machine"]
summary: A transaction spanning multiple services cannot use a database rollback — each service commits independently. The saga pattern is the distributed a...
docs:
  - title: "Saga pattern"
    url: "https://microservices.io/patterns/data/saga.html"
---

# Sagas: Choreography and Orchestration

A transaction spanning multiple services cannot use a database rollback — each service commits independently. The **saga pattern** is the distributed alternative: a sequence of local transactions with **compensating actions** that undo completed steps when a later step fails. This lesson covers both saga styles and how to implement them.

## The Problem

```java
// A single logical operation across services:
// 1. Create order (Order service)
// 2. Charge card (Payment service)
// 3. Reserve inventory (Inventory service)
// 4. Ship (Shipping service)

// If step 3 fails, steps 1-2 already committed. No global rollback exists.
```

## The Saga Structure

```
Order       Payment     Inventory    Shipping
create ──▶ charge ──▶ reserve ──▶ ship
              │          │
              ▼          ▼
          (compensate) (compensate)
           refund      unreserve
```

Every step has a **compensating action**:

| Step | Compensation |
|------|--------------|
| Create order | Cancel order |
| Charge card | Refund |
| Reserve inventory | Unreserve |
| Ship | Return (rarely — handle earlier) |

## Style 1: Choreography (Events)

Each service reacts to events and emits the next — no central coordinator:

```java
// Order service — emits events after commit
@TransactionalEventListener(phase = AFTER_COMMIT)
public void onOrderCreated(OrderCreated event) {
    paymentClient.charge(event.orderId(), event.amount());   // step 2
}

// Payment service
@TransactionalEventListener(phase = AFTER_COMMIT)
public void onPaymentAuthorized(PaymentAuthorized event) {
    inventoryClient.reserve(event.orderId(), event.items());  // step 3
}

// Inventory service — on failure, emit the compensation path
@TransactionalEventListener(phase = AFTER_COMMIT)
public void onInventoryReserved(InventoryReserved event) {
    shippingClient.ship(event.orderId());
}

@TransactionalEventListener(phase = AFTER_COMMIT)
public void onInventoryFailed(InventoryFailed event) {
    paymentClient.refund(event.orderId());        // compensate step 2
    orderClient.cancel(event.orderId());          // compensate step 1
}
```

**Pros**: no coordinator, simple wiring. **Cons**: the flow is scattered across services — hard to see, hard to trace, and an added step touches many listeners.

## Style 2: Orchestration (Central Coordinator)

A **saga orchestrator** runs the flow and knows the full state machine:

```java
@Component
public class OrderSaga {

    private final PaymentClient payments;
    private final InventoryClient inventory;
    private final ShippingClient shipping;

    // Each step is a command to a service; each response advances the saga
    public void run(Order order) {
        try {
            payments.charge(order);              // step 1
            inventory.reserve(order);            // step 2
            shipping.ship(order);                // step 3
        } catch (InventoryUnavailableException e) {
            payments.refund(order);              // compensate 1
            orderRepository.cancel(order.getId());
            throw e;
        }
    }
}
```

Better — persistent, resumable:

```java
@Entity
public class SagaState {
    @Id private String sagaId;
    private String step;          // current step
    private String status;        // RUNNING / COMPLETED / COMPENSATING
    @Lob private String context;  // order data for resumption
}
```

**Pros**: the whole flow in one place, resumable, testable. **Cons**: the orchestrator is a coupling point and a potential bottleneck.

## Choreography vs. Orchestration

| | Choreography | Orchestration |
|--|--------------|---------------|
| Coordinator | None — events | Central saga service |
| Flow visibility | Scattered | One class |
| Coupling | Loose (events) | Tighter (commands) |
| Resumability | Hard | Natural (persist state) |
| Adding steps | Touch listeners | One state machine |
| Debugging | Harder | Easier |
| Failure isolation | Best | Coordinator is a SPOF (mitigate) |

**The rule**: choreography for simple, loosely-coupled flows; orchestration when the flow is complex, must be resumable, or needs a clear owner.

## The Saga State Machine

A robust saga is a **state machine** — every event advances it, every failure routes to compensation:

```java
public class OrderSagaMachine {

    private final Map<String, Action> transitions = Map.of(
        "CREATED",     new Action("CHARGING", payments::charge),
        "CHARGED",     new Action("RESERVING", inventory::reserve),
        "RESERVED",    new Action("SHIPPING", shipping::ship),
        "SHIPPED",     new Action(null, saga::complete)
    );

    private final Map<String, Action> compensations = Map.of(
        "CHARGING",    new Action(null, payments::refund),
        "RESERVING",   new Action(null, inventory::unreserve)
    );

    public void advance(String sagaId, String current, Object command) {
        try {
            Action next = transitions.get(current);
            next.execute();
            // persist: sagaId → next state
        } catch (Exception e) {
            compensate(sagaId, current);
        }
    }
}
```

The persisted state makes the saga **crash-safe**: after a restart, a job reads `RUNNING` sagas and resumes them from the recorded step.

## Compensation Design Rules

| Rule | Why |
|------|-----|
| Compensations must be idempotent | They run on retries and replays |
| Compensate in **reverse order** | Undo the latest first |
| Compensations can fail | Retry them; alert if they keep failing |
| No compensation for the last step | Design it to be the safe one |
| Log every step + compensation | The saga audit trail |
| Timeouts on every call | A hung step blocks the saga |

```java
public void compensate(String sagaId, String failedStep) {
    List<String> completed = getCompletedSteps(sagaId);   // reverse order
    for (String step : reverse(completed)) {
        try {
            compensateStep(step, sagaId);
            markCompensated(step, sagaId);
        } catch (Exception e) {
            // retry with backoff, then alert — don't give up silently
            retryQueue.enqueue(new CompensationJob(sagaId, step));
        }
    }
}
```

## The Outbox + Saga Combination

Sagas and the outbox pattern are natural partners:

```
Service → outbox (atomic with local write) → relay → broker
    → saga orchestrator consumes events
    → issues compensating commands (each through its own outbox)
```

Every step's command is atomic with its local state — the saga can never observe a half-applied step.

## Testing Sagas

```java
class OrderSagaTest {

    private final FakePaymentClient payments = new FakePaymentClient();
    private final FakeInventoryClient inventory = new FakeInventoryClient();
    private final OrderSaga saga = new OrderSaga(payments, inventory, shipping);

    @Test
    void inventoryFailureTriggersRefund() {
        inventory.failNextReservation();       // force step 2 to fail

        assertThrows(InventoryUnavailableException.class,
            () -> saga.run(order));

        assertTrue(payments.refunded(order.id()));    // compensation ran
        assertEquals("CANCELLED", orderRepository.find(order.id()).status());
    }

    @Test
    void happyPathCompletes() {
        saga.run(order);
        assertTrue(shipping.shipped(order.id()));
    }
}
```

## Summary

| Concern | Choreography | Orchestration |
|---------|--------------|---------------|
| Structure | Event chain | Central saga |
| Visibility | Scattered | One state machine |
| Crash recovery | Rebuild from events | Persisted saga state |
| Complexity cap | Simple flows | Complex, resumable flows |
| Compensation | Each service's handler | Coordinator issues commands |

A saga is a sequence of local transactions with compensating actions — the distributed replacement for the transaction you can't have. Start with choreography for simple flows, graduate to a persisted orchestrator when the flow gets complex, make every compensation idempotent, and pair it with the outbox for atomic step commands.
