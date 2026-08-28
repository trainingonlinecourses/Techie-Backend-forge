---
title: Modular Monolith vs Microservices — Complete Architecture Guide
summary: The architecture decision most teams get wrong — why a modular monolith is usually the right starting point, and the criteria that justify splitting.
order: 1
minutes: 20
topics: [modular monolith, microservices, architecture, bounded context, monolith first, conway's law]
docs:
  - https://docs.spring.io/spring-modulith/reference/
  - https://martinfowler.com/bliki/MonolithFirst.html
---

# Modular Monolith vs Microservices — Complete Architecture Guide

## The false choice

"Monolith vs microservices" is the wrong framing. The real spectrum is:

```
spaghetti monolith ──▶ modular monolith ──▶ microservices
   (one big ball)      (one deployable,      (many deployables,
                       many modules)          many teams)
```

Most teams jump from "spaghetti monolith" straight to "microservices" — skipping the crucial middle step. That's like going from a messy room to moving into 20 separate houses. You'd be better off organizing the room first.

## What is a modular monolith?

A **modular monolith** is one deployment unit whose *internals* are separated into modules with explicit boundaries and dependencies. Think of it like an apartment building: one structure, but each apartment (module) has its own rooms, its own furniture, and clear walls between neighbors.

```java
// A modular monolith has clear module boundaries:
// Order module → can see: OrderRepository, OrderService
//                cannot see: PaymentRepository (that's in Payment module)

// The Payment module exposes an API, not its internals:
public interface PaymentService {
    PaymentResult charge(PaymentRequest request);  // This is the public API
}

// The Order module depends on the Payment API, not the implementation:
@Service
public class OrderService {
    private final PaymentService paymentService;  // Depends on the INTERFACE
    
    public Order placeOrder(OrderRequest request) {
        Order order = createOrder(request);
        paymentService.charge(new PaymentRequest(order));  // Uses the public API
        return order;
    }
}
```

**Key principle:** Module A can use Module B's public API, but NOT its internal classes. This is enforced by Java packages and Spring Modulith's dependency rules.

## Why microservices fail when chosen first

Distributed systems are not "monoliths with extra steps" — they're a different category of difficulty:

| Cost of splitting | What it actually costs | Example |
|---|---|---|
| **Network is not a function call** | latency, partial failure, retries, timeouts | Order service calls Payment service — what if Payment is down? |
| **Distributed transactions die** | saga choreography, outbox, eventual consistency | Order + Payment + Inventory must all succeed — how? |
| **Data is split** | joins become API calls, consistency becomes a design | "Show me all orders with their payments" — two databases now |
| **Ops multiplies** | N deploys, N dashboards, N on-call surfaces | 20 services = 20 things to monitor, deploy, and debug |
| **Testing explodes** | cross-service tests need orchestration | Integration test needs all 20 services running |
| **Teams** | Conway's law: 2 services do NOT make 2 teams productive | 5 developers managing 20 services = chaos |

**The common failure pattern:**

```
Year 1: "Let's split into 20 microservices!" 
Year 2: Spent all year on distributed transaction bugs
Year 3: Consolidating back to 5 services
```

## When splitting is actually justified

A service earns its independence when it hits **at least two** of these criteria:

| Criterion | When it applies | Example |
|---|---|---|
| **Independent scaling** | One service needs 10x more instances | Payment service needs 20 replicas; reporting needs 1 |
| **Independent deployment** | Different release cadence or risk | Public API vs internal batch job |
| **Team autonomy** | 30+ engineers on one codebase | Team A and Team B have different priorities |
| **Isolation requirements** | Hard failure/conformance boundary | PCI-compliant payment handling |

**Absent those, the modular monolith gives you 80% of the architecture with 20% of the cost.**

## The bounded context is the unit

Whether monolithic or distributed, the analysis unit is the **bounded context** (from Domain-Driven Design):

```
An E-commerce system has these bounded contexts:
  ├── Order Context      (Order, OrderLine, OrderStatus)
  ├── Payment Context    (Payment, Refund, PaymentMethod)
  ├── Inventory Context  (Stock, Warehouse, Reservation)
  ├── Shipping Context   (Shipment, Carrier, TrackingNumber)
  └── User Context       (User, Address, Preferences)
```

**Rule:** `Order` in the *billing* context and `Order` in the *fulfillment* context are **different models**. Sharing one entity class across contexts is how monoliths become spaghetti.

```java
// WRONG — Order entity shared across all modules
@Entity
public class Order {
    private Payment payment;      // Payment fields leaked into Order
    private Shipment shipment;    // Shipping fields leaked into Order
    private Stock stock;          // Inventory fields leaked into Order
    // This is the "God Object" anti-pattern
}

// RIGHT — each module has its own model
// Order module:
@Entity
public class Order {
    private OrderId id;
    private List<OrderLine> lines;
    private OrderStatus status;
    // Only Order-relevant fields
}

// Payment module:
@Entity  
public class Payment {
    private PaymentId id;
    private OrderId orderId;  // Reference by ID, not by object
    private PaymentStatus status;
    // Only Payment-relevant fields
}
```

## Real-world scenario — starting a startup

**Month 1-6:** You're building an MVP. You have 3 developers. You need to move fast.

**Decision:** Modular monolith. One Spring Boot app, clear module boundaries, one database with separate schemas per module.

```
my-app/
├── order-module/
│   ├── Order.java
│   ├── OrderService.java
│   └── OrderRepository.java
├── payment-module/
│   ├── Payment.java
│   ├── PaymentService.java
│   └── PaymentRepository.java
└── shipping-module/
    ├── Shipment.java
    ├── ShippingService.java
    └── ShippingRepository.java
```

**Month 7-12:** You've grown to 15 developers. The payment module needs PCI compliance and a separate team.

**Decision:** Extract the payment module to its own service. The module boundary already exists — you're just changing the deployment topology.

```
Before (modular monolith):
  [Order Module] ──calls──▶ [Payment Module]  (same JVM)

After (microservice):
  [Order Service] ──HTTP──▶ [Payment Service]  (separate JVMs)
```

**The beautiful property:** Steps 1-3 (identify contexts, create modules, enforce boundaries) are exactly the work microservices need anyway. A well-modularized monolith splits surgically; a spaghetti monolith splits into "distributed spaghetti."

## The migration path

```
1. Identify the bounded contexts (module map)
2. Extract them into modules with a dependency rule
3. Remove illegal dependencies — the tooling verifies the boundary
4. When one module keeps demanding independence → extract to a service
```

## Common mistakes

| Mistake | Why it fails | Better approach |
|---|---|---|
| Jumping to microservices in year 1 | Teams spend all time on infrastructure, not features | Start modular monolith, extract when needed |
| Shared database across modules | Modules become coupled through the DB | Separate schemas or tables per module |
| Shared entity classes | God objects, cascade changes, tight coupling | Each module owns its own model |
| No dependency rules | Modules freely import each other's internals | Enforce via package structure + tooling |
| Extracting too early | Premature optimization, added complexity | Wait until scaling/team/isolation demands it |

## Key takeaways

- The spectrum is spaghetti → modular monolith → microservices; most teams should camp at modular monolith
- Distribution costs: latency, partial failure, consistency, ops, testing — paid before any benefit lands
- Split when scaling, cadence, team size, or isolation demand it — two of four, at minimum
- Bounded contexts are the unit of architecture; shared models across contexts are the root of coupling
- A modular monolith is the best preparation for (and alternative to) microservices

**Official docs:** [Spring Modulith](https://docs.spring.io/spring-modulith/reference/) · [MonolithFirst (Fowler)](https://martinfowler.com/bliki/MonolithFirst.html)
