---
title: DDD Building Blocks
module: ddd-architecture
order: 1
minutes: 30
topics: ["domain model", "entities", "value objects", "aggregates", "repositories", "domain services", "ubiquitous language"]
docs:
  - title: "DDD reference"
    url: "https://martinfowler.com/tags/domain%20driven%20design.html"
---

# DDD Building Blocks

Domain-Driven Design is about putting the **business rules in the code** — not in a service layer full of getters and setters. The building blocks (entity, value object, aggregate, repository, domain service) are the vocabulary for expressing those rules. This lesson covers each with Spring code.

## The Ubiquitous Language

The core practice: the business's words are the code's names. If the business says "an order is placed, then paid, then shipped," your code has `Order.place()`, `Order.pay()`, `Order.ship()` — not `setStatus("PAID")`. The language bridges business and code, so analysts and engineers can discuss the same model.

## Entity: Identity-Driven Object

An entity has an **identity that persists across changes** — two orders with the same id are the same order even if every field differs.

```java
@Entity
public class Order {

    @Id @GeneratedValue
    private Long id;               // identity — never changes

    private OrderStatus status;
    private Money total;
    private List<OrderLine> lines;

    // Business behavior lives on the entity — not in a service
    public void addLine(Product product, int quantity) {
        if (status != OrderStatus.DRAFT) {
            throw new IllegalStateException("Cannot modify a placed order");
        }
        lines.add(new OrderLine(product, quantity));
        recalculateTotal();
    }

    public void confirm() {
        if (lines.isEmpty()) {
            throw new IllegalStateException("Cannot confirm an empty order");
        }
        this.status = OrderStatus.PLACED;
    }

    private void recalculateTotal() {
        this.total = lines.stream()
            .map(OrderLine::lineTotal)
            .reduce(Money.ZERO, Money::add);
    }
}
```

**The rule**: entities protect their invariants. `addLine` refuses to modify a placed order; `confirm` refuses an empty one. The business rules live *here*, not in a service that mutates fields freely.

## Value Object: Equality by Content

A value object has no identity — two objects with the same values are interchangeable.

```java
public record Money(BigDecimal amount, Currency currency) {

    public Money {
        if (amount == null || currency == null) {
            throw new IllegalArgumentException("amount and currency are required");
        }
        if (amount.signum() < 0) throw new IllegalArgumentException("amount must be non-negative");
    }

    public Money add(Money other) {
        if (!currency.equals(other.currency)) {
            throw new IllegalArgumentException("currency mismatch");
        }
        return new Money(amount.add(other.amount), currency);
    }

    public Money multiply(int quantity) {
        return new Money(amount.multiply(BigDecimal.valueOf(quantity)), currency);
    }
}
```

**Value-object rules**:
- Immutable
- Equality by values, not identity
- Self-validating (cannot be constructed invalid)
- Operations return *new* instances

`Money` is the canonical example: it encodes the currency-mismatch rule so no caller can ever add dollars to euros silently.

## Aggregate: The Consistency Boundary

An aggregate is a **cluster of entities treated as one unit** — with one root that guards all invariants.

```java
@Entity
public class Order {                       // AGGREGATE ROOT

    @OneToMany(cascade = ALL, orphanRemoval = true)
    private List<OrderLine> lines = new ArrayList<>();   // part of the aggregate

    // Invariants enforced at the ROOT only
    public void addLine(Product product, int qty) {
        if (status != OrderStatus.DRAFT) throw new IllegalStateException(...);
        lines.add(new OrderLine(product, qty));
        recalculateTotal();
    }
}

// OrderLine is NOT a root — it's only reachable through Order
@Entity
public class OrderLine {
    // no repository for OrderLine — ever
}
```

**Aggregate rules**:
1. The root is the only entry point — no direct access to inner entities
2. Invariants are enforced by the root
3. Inner objects are not referenced from outside the aggregate
4. **A transaction touches exactly one aggregate** (the atomicity unit)

## Repository: Aggregate Storage

A repository per **aggregate root** — not per table, not per entity:

```java
public interface OrderRepository extends JpaRepository<Order, Long> {

    // Query methods return aggregates
    List<Order> findByCustomerIdAndStatus(Long customerId, OrderStatus status);
}
```

- One repository per aggregate root
- Returns whole aggregates (with their invariants intact)
- No repository for OrderLine — it's inside the Order aggregate

## Domain Service: Behavior With No Natural Home

When a rule involves multiple aggregates, it doesn't belong in any one — it becomes a **domain service** (not an application service):

```java
@Service
public class OrderPricingService {     // DOMAIN service — pure business logic

    public Money calculateTotal(Order order, DiscountPolicy policy) {
        Money base = order.lineTotal();
        Money discount = policy.applyTo(base, order.customerTier());
        return base.subtract(discount);
    }
}
```

## The Layers

```
Controller (HTTP) ──▶ Application Service (use cases, transactions)
                          │
                          ▼
                Domain (entities, VOs, aggregates, domain services)
                          │
                          ▼
                Repository (persistence of aggregates)
```

- **Application service**: orchestrates use cases, owns transactions — thin
- **Domain**: business rules — the meat
- **Repository**: persistence — one per aggregate

```java
// Application service — thin, transactional
@Service
public class OrderApplicationService {

    private final OrderRepository repository;

    @Transactional
    public void placeOrder(Long orderId) {
        Order order = repository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));
        order.confirm();                  // domain rule
        repository.save(order);           // persistence
    }
}
```

## Building a Domain Model: The Example

```java
// The full model in action
@Service
public class OrderApplicationService {

    @Transactional
    public Order placeOrder(CreateOrderCommand cmd) {
        Order order = new Order(cmd.customerId());
        cmd.items().forEach(item ->
            order.addLine(productRepository.findById(item.productId()).orElseThrow(),
                item.quantity()));
        order.confirm();
        return orderRepository.save(order);
    }
}
```

No status flags set directly, no business rules in the service — the order *is* the rules.

## Testing the Domain

```java
// Pure unit tests — no Spring needed for the domain
class OrderTest {

    @Test
    void cannotModifyPlacedOrder() {
        Order order = new Order(1L);
        order.addLine(product("P1"), 2);
        order.confirm();

        assertThrows(IllegalStateException.class,
            () -> order.addLine(product("P2"), 1));
    }

    @Test
    void cannotConfirmEmptyOrder() {
        Order order = new Order(1L);
        assertThrows(IllegalStateException.class, order::confirm);
    }
}
```

Domain tests run in milliseconds — no context, no DB — and they *are* the business rules documented as code.

## Summary

| Block | Identity? | Mutable? | Persisted? |
|-------|-----------|----------|------------|
| Entity | Yes | Yes (guarded) | Yes |
| Value Object | No | No | Embedded |
| Aggregate | Yes (root) | Via root only | Root via repository |
| Domain Service | No | Stateless | No |
| Repository | — | — | Per aggregate |

The building blocks are a discipline: entities guard their invariants, value objects validate themselves, aggregates bound consistency, repositories store aggregates, and services orchestrate. Put the rules in the domain and the service layer becomes a thin translation layer — which is exactly where it belongs.
