---
title: Aggregates in Practice
module: ddd-architecture
order: 2
minutes: 25
topics: ["aggregate design", "consistency boundary", "transaction scope", "aggregate size", "JPA mapping", "domain events"]
docs:
  - title: "Aggregates"
    url: "https://martinfowler.com/bliki/DDD_Aggregate.html"
summary: The aggregate is DDD's most consequential (and most misused) idea: it defines the consistency boundary — the set of objects that change together at...
---

# Aggregates in Practice

The aggregate is DDD's most consequential (and most misused) idea: it defines the **consistency boundary** — the set of objects that change together atomically. Getting aggregate size right is a design decision with direct performance and correctness consequences.

## What an Aggregate Really Is

An aggregate is a cluster of domain objects treated as one unit:

```
        Order (ROOT)
        ├── id, status, total
        ├── OrderLine ×N        (part of the aggregate)
        └── ShippingAddress     (value object)
```

- The **root** is the only object outside code may reference
- Inner objects are reached *through* the root
- **One transaction per aggregate** — the aggregate is the atomicity unit
- References *between* aggregates use ids, not object references

## The Reference Rule

```java
// ✅ Correct: cross-aggregate references are by ID
public class Order {
    private Long customerId;      // NOT a Customer object!
    private Long productId;       // NOT a Product object!
}

// ❌ Anti-pattern: holding object references to other aggregates
public class Order {
    private Customer customer;    // loads the whole customer into the order's tx
    private Product product;      // widens the consistency boundary
}
```

Cross-aggregate references by id keep aggregates small and transactions short. Load the customer separately when you need it.

## The Size Trade-Off

| Too small | Too large |
|-----------|-----------|
| Invariants span aggregates | One transaction touches too much |
| Distributed consistency problems | Lock contention, long transactions |
| Every rule needs a saga | Slow writes, big snapshots |

**Example — the invoice aggregate:**

- Too small: `InvoiceLine` as its own aggregate → the "lines must sum to total" invariant can't be enforced atomically
- Correct: `Invoice` root with `InvoiceLine`s inside → total invariant enforced in one transaction
- Too large: `Customer` with all their invoices as one aggregate → every invoice write locks the customer

## The Invariant Test

Ask: *can this rule be violated if two parts change in different transactions?*

```java
// If lines and total could change separately, the invariant breaks:
public class Invoice {
    private List<InvoiceLine> lines;
    private Money total;          // MUST be consistent with lines
    // → lines and total must be in the SAME aggregate
}
```

```java
// If customer email and order status are independent, they can be separate:
// Customer.email — its own aggregate
// Order.status — its own aggregate
// (no invariant spans them)
```

## Designing the Root: Guard Everything

```java
public class Order {
    private OrderStatus status = OrderStatus.DRAFT;
    private final List<OrderLine> lines = new ArrayList<>();

    public void addLine(Product product, int quantity) {
        if (quantity <= 0) throw new IllegalArgumentException("quantity must be positive");
        if (status != OrderStatus.DRAFT) throw new IllegalStateException("order locked");
        lines.add(new OrderLine(product.id(), quantity, product.price()));
    }

    public void confirm() {
        if (lines.isEmpty()) throw new IllegalStateException("empty order");
        this.status = OrderStatus.PLACED;
    }

    public void cancel() {
        if (status == OrderStatus.SHIPPED) throw new IllegalStateException("already shipped");
        this.status = OrderStatus.CANCELLED;
    }

    // No setters that bypass the rules. The root IS the API.
}
```

## The Transaction Rule

```java
// ONE aggregate per transaction
@Transactional
public void placeOrder(Long orderId) {
    Order order = orderRepository.findById(orderId).orElseThrow();
    order.confirm();
    orderRepository.save(order);
    // don't ALSO update the Customer aggregate in this tx
}
```

When two aggregates must change together, the options are: domain events (eventual consistency) or a saga — never one fat transaction.

## Domain Events: Aggregate → Aggregate Communication

```java
public class Order {

    private final List<Object> domainEvents = new ArrayList<>();

    public void confirm() {
        if (lines.isEmpty()) throw new IllegalStateException("empty order");
        this.status = OrderStatus.PLACED;
        domainEvents.add(new OrderConfirmedEvent(id, total()));
    }

    public List<Object> pullDomainEvents() {
        List<Object> events = List.copyOf(domainEvents);
        domainEvents.clear();
        return events;
    }
}
```

```java
@Transactional
public void placeOrder(Long orderId) {
    Order order = orderRepository.findById(orderId).orElseThrow();
    order.confirm();
    orderRepository.save(order);

    // Publish AFTER commit — other aggregates react eventually
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                order.pullDomainEvents().forEach(eventPublisher::publishEvent);
            }
        });
}
```

The customer aggregate (loyalty points, notifications) reacts to the event — its own transaction, its own aggregate.

## JPA Mapping of Aggregates

```java
@Entity
public class OrderEntity {                  // aggregate root entity

    @Id @GeneratedValue private Long id;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderLineEntity> lines = new ArrayList<>();

    @Embedded
    private MoneyValue total;               // value object embedded
}
```

- `cascade = ALL` — inner entities live and die with the root
- `orphanRemoval = true` — removed lines are deleted
- Value objects as `@Embedded`

## Repository Scope

```java
public interface OrderRepository extends JpaRepository<OrderEntity, Long> {
    // One repository per aggregate root
    // NO OrderLineRepository — lines are inside Order
}
```

## Aggregate Rules Checklist

- ✅ Root is the only entry point
- ✅ Invariants enforced by the root
- ✅ Inner objects have no public API to the outside
- ✅ Cross-aggregate references by id
- ✅ One transaction per aggregate
- ✅ One repository per root
- ✅ Aggregate changes announced via domain events
- ✅ Inner entities have no repository

## Summary

| Decision | Rule |
|----------|------|
| What's inside | Everything that must change atomically |
| What's outside | Referenced by id, changed in its own tx |
| Who guards | The root — no bypass setters |
| How they communicate | Domain events after commit |
| Transaction scope | One aggregate |
| Persistence | Repository per root, cascade inner |

The aggregate is where DDD meets the database: size it by *invariant*, reference by *id*, communicate by *events*, and transact by *one*. Teams that respect the boundary get clean concurrency and testable domain logic; teams that blur it get fat transactions and lock contention.
