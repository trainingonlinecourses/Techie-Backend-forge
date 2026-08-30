---
title: Aggregate Design — Choosing the Boundaries
module: spring-data-jdbc
order: 2
minutes: 25
topics: ["aggregates", "aggregate root", "boundaries", "value objects", "references"]
docs:
  - title: "Aggregate design in Spring Data JDBC"
    url: "https://docs.spring.io/spring-data/jdbc/reference/jdbc/entity-persistence.html"
summary: The central design decision in Spring Data JDBC is the aggregate: the cluster of objects that are loaded, saved, and deleted as one unit. The term ...
---

# Aggregate Design — Choosing the Boundaries

## The Concept: What Belongs Together Gets Stored Together

The central design decision in Spring Data JDBC is the **aggregate**: the cluster of objects that are loaded, saved, and deleted **as one unit**. The term comes from Domain-Driven Design: an aggregate is a consistency boundary — everything inside it changes together and is persisted together.

Think of a **shopping order**:

- The `Order` (root) contains `OrderLine`s (items + quantities) and an `Address`.
- You never load "just the lines" — you load the whole order, with everything attached.
- If a line changes, the order changed; if the order is deleted, the lines go with it.

The **aggregate root** (`Order`) is the only object with an identity that outsiders reference. Children (`OrderLine`, `Address`) have *no global identity* — they exist only within their aggregate.

## The Rules of Thumb

1. **Smaller is better** — an aggregate that loads five nested tables per access is slow and awkward. If your aggregate is deep, ask whether those children are really part of the same consistency unit.
2. **One aggregate root per repository** — you don't create repositories for children; you load them *through* the root.
3. **Cross-aggregate references are by id** — a `Customer` referenced by an `Order` is a *different aggregate*; the order stores the customer id, not the customer object. You never join across aggregates in Spring Data JDBC — you look the other aggregate up separately.
4. **Value objects are fine as children** — things with no identity (an `Address`, an `Amount`) belong inside an aggregate; they're just data.

## The Code Walkthrough

```java
import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;

import java.util.ArrayList;
import java.util.List;

// ---- Value objects: no identity, embedded in the aggregate ----
public record Money(java.math.BigDecimal amount, String currency) {}

// ---- Child entity: no own id, lives inside the order ----
public class OrderLine {
    private String productName;
    private int quantity;
    private Money price;

    // getters, constructors...
}

// ---- Aggregate root: THE object with identity ----
public class Order {
    @Id
    private Long id;                  // the only identity in this aggregate
    private Long customerId;          // reference to ANOTHER aggregate (by id only)
    private List<OrderLine> lines = new ArrayList<>();
    private Money total;

    public void addLine(String product, int qty, Money price) {
        lines.add(new OrderLine(product, qty, price));
        recomputeTotal();
    }

    private void recomputeTotal() {
        // consistency inside the aggregate is YOUR code's job
        this.total = new Money(
                lines.stream()
                        .map(l -> l.price().amount().multiply(java.math.BigDecimal.valueOf(l.quantity())))
                        .reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add),
                "USD");
    }

    // getters...
}

// ---- Repository: one per aggregate root ----
public interface OrderRepository extends CrudRepository<Order, Long> {
}
```

### Walking Through Each Part

**`Money` as a record** — a value object: immutable, no identity, defined by its data. It lives *inside* the aggregate as a column group. Spring Data JDBC stores records/immutable objects with constructor binding automatically.

**`OrderLine` as a child** — no `@Id`. It exists only within its order; stored in an `order_line` table with a foreign key back to the order. You can't fetch an `OrderLine` by itself — it's not a thing, it's *part* of the order.

**`customerId` as a reference** — the crucial boundary. The `Customer` is a *different aggregate*; the order stores just its id. If you stored the whole `Customer` object, Spring Data JDBC would treat it as a child and try to embed it (duplicating the customer in the order's tables). The rule: **only own what changes together; reference everything else by id.**

**`recomputeTotal` in the aggregate** — consistency rules live in the aggregate root, not scattered in services. When a line is added, the total recomputes — the aggregate guarantees its own invariants. Services call `order.addLine(...)`; they never reach into the lines and mutate them directly.

**One repository per root** — `OrderRepository` is the only data-access entry for the whole aggregate. The service layer loads an `Order`, mutates it through domain methods, and saves it — the whole aggregate persists atomically.

## Two Aggregates, Two Tables, One Workflow

```java
@Service
public class OrderService {

    private final OrderRepository orders;
    private final CustomerRepository customers;   // separate aggregate, separate repo

    @Transactional
    public Order placeOrder(long customerId, List<OrderLineRequest> lines) {
        Customer c = customers.findById(customerId).orElseThrow();

        Order order = new Order();
        order.setCustomerId(c.getId());            // reference by id, not object
        for (var l : lines) {
            order.addLine(l.product(), l.qty(), l.price());
        }
        return orders.save(order);
    }
}
```

`Order` and `Customer` evolve independently; each repository manages its own aggregate; the workflow composes them at the service layer.

## When the Boundaries Are Wrong

Signs your aggregate is mis-designed:

- **Slow loads** — every `findById` pulls four nested tables; the aggregate is too fat.
- **Awkward cross-aggregate logic** — if you keep wanting to query children directly, they're probably their own aggregate.
- **Concurrency pain** — two users updating different children of the same root fight over one row; splitting the aggregate reduces contention.
- **Repeated data** — the same object embedded in two aggregates gets stored twice; it should be its own aggregate referenced by id.

## Common Beginner Pitfalls

1. **Referencing another aggregate as an object field** — Spring Data JDBC embeds it; you get duplicated data. Store the id.
2. **A repository per child** — children are loaded through the root; child repositories confuse the model and break consistency guarantees.
3. **Giant aggregates** — load cost grows with every nested level; keep aggregates lean.
4. **Mutating children directly from services** — domain invariants (like `total`) break; expose domain methods on the root.
5. **Value objects with setters** — records/immutable VOs keep the model honest and the mapping simple.
6. **Assuming cross-aggregate joins** — Spring Data JDBC has no joins across aggregates; fetch the other aggregate by id (or denormalize deliberately).

## Key Takeaways

- An aggregate is a consistency boundary: saved/loaded/deleted as one unit.
- The aggregate root is the only identity; children are part of it.
- Cross-aggregate references are by id, never by embedded object.
- Value objects (records) make ideal children; domain rules live in the root.
- One repository per aggregate root — the service composes aggregates.
- Smaller aggregates load faster, contend less, and stay honest.
