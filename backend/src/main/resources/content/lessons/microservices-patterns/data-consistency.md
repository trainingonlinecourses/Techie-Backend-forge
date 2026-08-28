---
title: Distributed Data Consistency — The Complete Guide
summary: Choosing a consistency model — ACID within a service, eventual consistency between them, and the idempotency + reconciliation toolkit. Beginner-friendly with line-by-line code.
order: 5
minutes: 25
topics: [eventual consistency, idempotency, reconciliation, cap theorem, distributed data, saga, distributed lock, versioned state]
docs:
  - https://microservices.io/patterns/data/index.html
  - https://martinfowler.com/articles/patterns-of-distributed-systems/
---

# Distributed Data Consistency — The Complete Guide

## What is Distributed Data Consistency? (From Zero)

In a single database, you get **ACID** guarantees — when you write data, every subsequent read sees that write immediately. This is called **strong consistency**.

But in a microservices architecture, each service has its **own database**. When Service A writes to its database, Service B won't see it immediately — there's a delay. This is **eventual consistency**: given enough time, all services will have the same data.

The big question is: **how do you make this safe?**

### The Consistency Menu

| Model | What it means | When to use |
|---|---|---|
| **Strong** | A read sees every prior write immediately | Single database, critical financial ops |
| **Read-your-writes** | The writer sees its own writes | Session handling (you see your own post immediately) |
| **Eventual** | Reads converge to the same value, eventually | Most microservice data (search indexes, caches, dashboards) |
| **Causal** | Events in a causal chain appear in order | "Reply after comment" in a social feed |

### CAP Theorem (Simplified)

In a distributed system, you can only have **two out of three**:
- **C**onsistency (every read gets the latest write)
- **A**vailability (every request gets a response)
- **P**artition tolerance (the system works despite network failures)

Since network failures are inevitable, you **must** have partition tolerance. So the real choice is: **CP** (consistent but might reject requests) or **AP** (available but might serve stale data). Most microservices choose **AP** with eventual consistency.

---

## The Toolkit — Making Eventual Consistency Safe

### 1. Idempotency Keys (Retries Become Harmless)

When a payment fails due to a timeout, the client retries. Without idempotency, the customer gets charged twice. With an idempotency key, the retry returns the same result.

```java
@RestController
public class PaymentController {

    private final PaymentService paymentService;

    @PostMapping("/payments/charge")
    public ResponseEntity<PaymentResult> charge(
            @RequestBody PaymentRequest request,
            @RequestHeader("Idempotency-Key") String idempotencyKey  // Client sends a unique key
    ) {
        // Check if we've already processed this exact request
        Optional<PaymentResult> previous = paymentStore.findByKey(idempotencyKey);
        if (previous.isPresent()) {
            return ResponseEntity.ok(previous.get());   // Return cached result — no duplicate charge
        }

        // First time seeing this key — process the payment
        PaymentResult result = paymentService.process(request);

        // Cache the result with the key — next retry hits this
        paymentStore.save(idempotencyKey, result, Duration.ofHours(24));

        return ResponseEntity.ok(result);
    }
}
```

**Line-by-line explained:**
- `@RequestHeader("Idempotency-Key")` — The client (e.g., frontend, mobile app) generates a UUID for each logical operation and sends it as a header.
- `paymentStore.findByKey(idempotencyKey)` — We check if this exact request was already processed. If yes, return the cached result.
- `paymentService.process(request)` — Only called if this is a NEW request. The actual payment logic runs once.
- `paymentStore.save(idempotencyKey, result, Duration.ofHours(24))` — Store the result with a TTL (24 hours). After that, the key expires and a retry would be processed again (but by then, the retry window has passed).

### 2. Optimistic Locking (Concurrent Updates Don't Corrupt Data)

```java
@Entity
public class Order {
    @Id
    private String id;

    @Version                                          // JPA optimistic lock
    private Long version;                              // Incremented on every save

    private String status;                             // PENDING, PAID, SHIPPED
    private BigDecimal total;
}

@Service
public class OrderService {
    @Transactional
    public Order shipOrder(String orderId) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new NotFoundException("Order not found"));

        if (!"PAID".equals(order.getStatus())) {
            throw new IllegalStateException("Can't ship unpaid order");  // Business rule
        }

        order.setStatus("SHIPPED");                   // Change the state

        try {
            orderRepository.save(order);              // JPA checks @Version — if another
        } catch (OptimisticConcurrencyException e) {  // thread saved first, this fails
            throw new ConflictException("Order was modified by another user — retry");
        }
    }
}
```

**Line-by-line explained:**
- `@Version private Long version` — JPA automatically increments this on every save. If two threads read version=5 and both try to save, only one succeeds (version becomes 6). The other fails because the database now has version=6, but it tried to save with version=5.
- The catch block handles the conflict gracefully — tell the user to retry instead of silently overwriting.

### 3. The Reconciliation Job (The Safety Net)

```java
@Component
public class OrderPaymentReconciler {

    @Scheduled(cron = "0 0 2 * * ?")   // Run at 2 AM daily
    @Transactional
    public void reconcile() {
        // Find orders marked as PAID but with no matching payment record
        List<Order> orphaned = jdbc.query(
            "SELECT o.* FROM orders o " +
            "LEFT JOIN payments p ON o.id = p.order_id " +
            "WHERE o.status = 'PAID' AND p.id IS NULL",
            orderRowMapper
        );

        for (Order order : orphaned) {
            log.warn("Order {} marked PAID but no payment found — investigating", order.getId());
            // Option 1: Check payment service directly
            // Option 2: Re-trigger the payment flow
            // Option 3: Flag for manual review
            alertService.send("Reconciliation: Order " + order.getId() + " needs review");
        }

        // Find payments with no matching order
        List<Payment> orphanedPayments = jdbc.query(
            "SELECT p.* FROM payments p " +
            "LEFT JOIN orders o ON p.order_id = o.id " +
            "WHERE o.id IS NULL",
            paymentRowMapper
        );

        for (Payment payment : orphanedPayments) {
            log.warn("Payment {} has no matching order — possible refund needed", payment.getId());
        }
    }
}
```

**Line-by-line explained:**
- `@Scheduled(cron = "0 0 2 * * ?")` — Runs daily at 2 AM. This is the heartbeat of eventual consistency — it catches any drift.
- The SQL finds **orphaned records** — orders that say "paid" but have no payment, or payments with no order. These indicate drift between services.
- For each mismatch, we either auto-fix or alert for manual review. This is what makes eventual consistency **safe** — you have a safety net.

---

## Real-World Scenarios

### Scenario 1: E-Commerce Order Flow

```
1. Customer places order → Order Service saves order (status=PENDING)
2. Payment Service charges card → Payment saved
3. Order Service marks order as PAID (eventually, after notification)
4. Inventory Service reduces stock (eventually, after event)
```

**The risk:** What if step 3 fails? The payment was taken but the order still says PENDING.

**The fix:** A reconciliation job catches "paid but not marked" orders and fixes them. Plus, the Payment Service sends events via the outbox pattern so notifications are reliable.

### Scenario 2: User Updates Profile

User changes their email. The profile service saves it, but the search index takes 5 seconds to update.

- For 5 seconds, searching by the new email won't find the user — this is acceptable (eventual consistency).
- The user themselves sees their new email immediately (read-your-writes).

```java
// The profile service guarantees read-your-writes by reading from its own DB
// for the next few seconds, and falling back to the search index after
public User findByEmail(String email) {
    // First check the primary DB (always up to date)
    return profileRepository.findByEmail(email)
        .orElseGet(() -> searchIndex.findByEmail(email));   // Fall back to eventual index
}
```

### Scenario 3: Distributed Lock for Critical Operations

```java
@Service
public class InventoryService {

    private final RedissonClient redisson;    // Distributed lock via Redis

    @Transactional
    public void reserveStock(String productId, int quantity) {
        RLock lock = redisson.getLock("inventory:" + productId);

        try {
            lock.lock(5, TimeUnit.SECONDS);   // Wait up to 5s, auto-release after 5s

            Product product = productRepository.findById(productId).orElseThrow();
            if (product.getStock() < quantity) {
                throw new OutOfStockException(productId);
            }
            product.setStock(product.getStock() - quantity);
            productRepository.save(product);

        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();                 // Always release in finally
            }
        }
    }
}
```

**Line-by-line explained:**
- `redisson.getLock("inventory:" + productId)` — Creates a distributed lock for this specific product. Only one service instance can hold it at a time.
- `lock.lock(5, TimeUnit.SECONDS)` — Wait up to 5 seconds to acquire the lock. If another instance holds it, we wait. After 5s, we fail fast.
- The actual inventory check and update happens inside the lock — preventing two simultaneous orders from overselling the same product.
- `lock.unlock()` in `finally` — Always release, even if an exception occurs. A stuck lock blocks all other instances.

---

## Design Pattern: The Consistency Decision Table

Every cross-service flow should have a consistency decision table:

```java
// Part of the design review document:
//
// Flow: Place Order → Charge Payment → Ship
//
// Step              | Consistency   | Max Skew  | Reconciliation
// ------------------|---------------|-----------|----------------
// Order + Outbox    | Atomic        | 0ms       | None (same TX)
// Payment charge    | Idempotent    | 30s       | PaymentReconciler
// Mark order PAID   | Eventual      | 5min      | OrderReconciler
// Ship item         | Eventual      | 15min     | InventoryReconciler
// Send email        | Best-effort   | 1hr       | DeadLetterHandler
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| No idempotency keys | Retries cause duplicate charges/orders | Every mutating endpoint needs an idempotency key |
| No reconciliation job | Silent data drift between services goes undetected | Add a daily reconciler per consistency boundary |
| Cross-service reads for decisions | Stale reads lead to wrong decisions | Move the decision into the owning service, or make it idempotent |
| Assuming strong consistency across services | Network delays make this impossible | Accept eventual consistency and design for it |
| No version/optimistic lock | Lost updates when two users edit simultaneously | Add `@Version` to shared entities |
| Ignoring max skew | "Eventually" without a bound means "maybe never" | State the max acceptable skew and alert if exceeded |

---

## Key Takeaways

- **Within a service:** use ACID (strong consistency). **Between services:** use eventual consistency + idempotency + reconciliation.
- **Idempotency keys** make retries safe. **Reconciliation jobs** catch silent drift. Together, they make eventual consistency reliable.
- **Never make cross-service decisions from stale reads** — move the decision to the owning service or make it conditional.
- **State the max skew** per flow and who reconciles it. If you can't state the max skew, you haven't designed the consistency.
- Most "distributed consistency" incidents are **missing idempotency and reconciliation**, not missing theoretical guarantees.

Official docs: [Data patterns (microservices.io)](https://microservices.io/patterns/data/index.html) · [Patterns of Distributed Systems (Fowler)](https://martinfowler.com/articles/patterns-of-distributed-systems/)
