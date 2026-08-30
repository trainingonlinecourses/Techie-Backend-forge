---
title: Domain Events and Event-Driven DDD
module: ddd-architecture
order: 5
minutes: 25
topics: ["domain events", "event storming", "event sourcing intro", "CQRS intro", "eventual consistency"]
summary: Domain events turn aggregates from objects that change into objects that announce changes. They're the bridge between DDD's consistency boundaries ...
docs:
  - title: "Domain events"
    url: "https://martinfowler.com/eaaDev/DomainEvent.html"
---

# Domain Events and Event-Driven DDD

Domain events turn aggregates from objects that change into objects that *announce* changes. They're the bridge between DDD's consistency boundaries and the event-driven patterns (event sourcing, CQRS) that scale beyond a single database. This lesson covers the event model, delivery, and where the patterns take over.

## What a Domain Event Is

A domain event is a **fact in the past tense** — something that happened, captured as data:

```java
public record OrderPlaced(
    OrderId orderId,
    Long customerId,
    Money total,
    Instant occurredAt
) {}
```

Events are immutable facts: they describe *what happened*, not what to do. Whoever receives them decides.

## When to Emit

Emit an event when **the business cares**:

- Order placed, payment authorized, shipment dispatched
- NOT "row updated", "setter called" — those are implementation details

```java
public class Order {

    public void confirm() {
        if (lines.isEmpty()) throw new IllegalStateException("empty order");
        this.status = OrderStatus.PLACED;
        registerEvent(new OrderPlaced(orderId, customerId, total(), Instant.now()));
    }

    private final List<Object> events = new ArrayList<>();
    private void registerEvent(Object event) { events.add(event); }
    public List<Object> drainEvents() {
        var drained = List.copyOf(events);
        events.clear();
        return drained;
    }
}
```

## Publishing After Commit

The critical rule: **publish after the transaction commits** — otherwise listeners see phantom state.

```java
@Transactional
public OrderId placeOrder(PlaceOrderCommand cmd) {
    Order order = new Order(customerId);
    cmd.lines().forEach(l -> order.addLine(productRepository.findByCode(l.productCode()), l.quantity()));
    order.confirm();

    OrderId id = orderRepository.save(order);

    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                order.drainEvents().forEach(eventPublisher::publishEvent);
            }
        });
    return id;
}
```

Or declaratively with Spring:

```java
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
public void onOrderPlaced(OrderPlaced event) {
    loyaltyService.awardPoints(event.customerId(), event.total());
}
```

## The Event Handlers

```java
@Component
public class OrderEventHandlers {

    // Each handler is a SEPARATE use case reacting to a fact
    @TransactionalEventListener(phase = AFTER_COMMIT)
    @Async
    public void sendConfirmation(OrderPlaced event) {
        emailService.sendConfirmation(event.customerId(), event.orderId());
    }

    @TransactionalEventListener(phase = AFTER_COMMIT)
    public void reserveInventory(OrderPlaced event) {
        inventoryService.reserve(event.orderId(), ...);
    }

    @TransactionalEventListener(phase = AFTER_COMMIT)
    public void notifyFraudTeam(OrderPlaced event) {
        fraudService.evaluate(event.orderId());
    }
}
```

Each handler is independent — one failing doesn't stop the others (async + after-commit).

## Event Sourcing: The Event Is the State

In event sourcing, you **never store the current state** — you store the sequence of events and *replay* them to derive state:

```
Order 123: [OrderPlaced, PaymentAuthorized, ItemShipped]
Current state = fold(events) = SHIPPED
```

```java
public class Order {
    private OrderStatus status;
    private final List<Object> applied = new ArrayList<>();

    public static Order replay(List<Object> events) {
        Order order = new Order();
        events.forEach(order::apply);
        return order;
    }

    public void apply(Object event) {
        switch (event) {
            case OrderPlaced e -> this.status = OrderStatus.PLACED;
            case PaymentAuthorized e -> this.status = OrderStatus.PAID;
            case OrderShipped e -> this.status = OrderStatus.SHIPPED;
            default -> throw new IllegalStateException("unknown event");
        }
    }
}
```

### The Trade-Offs

| Pro | Con |
|-----|-----|
| Full audit history (every change) | Event store complexity |
| Time travel (replay to any point) | Replay at scale needs snapshots |
| The events ARE the integration | Read model must be projected |
| No UPDATE statements | Event schema versioning |

## CQRS: Separate Read From Write

Event sourcing naturally pairs with **CQRS** — different models for writes and reads:

```
Write side: Command → Aggregate → Domain Events → Event Store
                                                 ↓ (projection)
Read side:  Read Model (denormalized tables, ES indexes) → Queries
```

```java
// Write side — commands mutate the aggregate
public void placeOrder(PlaceOrderCommand cmd) { ... }

// Read side — queries hit optimized read models
public record OrderSummary(Long orderId, String status, int lineCount) {}

public List<OrderSummary> recentOrders(Long customerId) {
    return readModelRepository.findByCustomerIdOrderByPlacedAtDesc(customerId);
}
```

The read model is denormalized for queries — no joins, no locking, no aggregate rules. Projections rebuild it from the event stream.

## Event Storming: Finding the Events

The workshop technique: domain experts + engineers post **orange sticky notes (events)** on a timeline, then group them into aggregates, then find the commands and queries. It surfaces the ubiquitous language and the event inventory in one session — the fastest way to discover the aggregates.

## Event Versioning

Events outlive code. Version them:

```java
public record OrderPlacedV2(OrderId orderId, Long customerId, Money total,
                            String currency, Instant occurredAt) {}
```

Or add `eventVersion` and keep the parser tolerant — consumers must handle old versions during rollout.

## Choosing Event-Driven or Not

| Use events when | Skip events when |
|-----------------|------------------|
| Multiple bounded contexts react to one change | Single context, simple CRUD |
| Audit/history is a requirement | State is disposable |
| Eventually consistent is acceptable | Strict synchronous consistency |
| You need to integrate many systems | One database, one service |
| You want replay/time-travel | Query complexity is low |

## Summary

| Concept | Definition |
|---------|------------|
| Domain event | Immutable fact: "X happened" |
| Publish timing | After commit — never inside the tx |
| Handlers | Independent reactions, async |
| Event sourcing | Events as the source of truth |
| CQRS | Separate read/write models via projections |
| Event storming | Workshop to discover the events |

Domain events are the connective tissue of DDD: aggregates stay small and consistent while the rest of the system reacts to what happened. When the events themselves become the storage (event sourcing) and the queries split off (CQRS), you've graduated from event-driven DDD to a full event-driven architecture — powerful, and worth it only when the requirements demand the audit trail, replay, or read/write separation.
