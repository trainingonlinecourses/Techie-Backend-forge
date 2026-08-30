---
title: Idempotency in Distributed Systems
module: distributed-systems
order: 3
minutes: 22
topics: ["idempotency keys", "at-least-once", "deduplication", "unique constraints", "retries", "distributed locks"]
docs:
  - title: "Idempotency patterns"
    url: "https://microservices.io/patterns/consumer-side.html"
summary: Retries are a fact of distributed life: timeouts, dead letter reprocessing, and consumer restarts all deliver the same request twice. Idempotency i...
---

# Idempotency in Distributed Systems

Retries are a fact of distributed life: timeouts, dead letter reprocessing, and consumer restarts all deliver the same request twice. **Idempotency** is the property that makes "twice" identical to "once." This lesson covers the four idempotency mechanisms and where each belongs.

## The Failure That Makes Retries Necessary

```
Client → POST /payments → (response lost) → Client retries
Server processed the first payment... and the retry charges again.
```

Without idempotency, *any* retry-able operation can execute twice: payments, order creation, email sends, inventory decrements.

## Mechanism 1: The Idempotency Key

```java
// Client sends a key on every retry of the same logical request
POST /api/payments
Idempotency-Key: 8f14e45f-ea1a-4c2e

@PostMapping("/payments")
public ResponseEntity<?> createPayment(
        @RequestHeader("Idempotency-Key") String key,
        @Valid @RequestBody PaymentRequest request) {

    PaymentResult cached = idempotencyService.find(key);
    if (cached != null) {
        return ResponseEntity.status(cached.statusCode()).body(cached.body());
    }

    // Claim the key atomically (unique constraint on the DB)
    if (!idempotencyService.claim(key, hash(request))) {
        throw new IdempotencyConflictException(key);
    }

    Payment payment = paymentService.charge(request);
    idempotencyService.complete(key, payment);
    return ResponseEntity.created(...).body(payment);
}
```

**The atomic claim is the whole trick** — the unique constraint on the key column makes two concurrent retries race safely (one inserts, the other reads the winner).

## Mechanism 2: Natural Idempotency

Some operations are *naturally* idempotent — running them twice changes nothing:

```java
// ✅ DELETE: deleting an already-deleted resource is a no-op
DELETE /api/courses/{id}    → 204 (even if already gone)

// ✅ PUT (full replace): same body twice = same result
PUT /api/courses/1
{ "title": "X" }            → twice = still { "title": "X" }

// ✅ Absolute updates: setting balance = 100 twice = 100
UPDATE accounts SET balance = 100 WHERE id = 1;

// ❌ Relative updates are NOT idempotent:
//    balance = balance - 10 run twice = 20 deducted!
UPDATE accounts SET balance = balance - 10 WHERE id = 1;
```

**The design rule**: prefer naturally-idempotent operations (PUT, DELETE, absolute updates) and reserve idempotency keys for POST-style operations that must create.

## Mechanism 3: Unique Constraint Dedup

The database's unique constraint is the ultimate deduplication:

```java
@Entity
public class Order {
    // The client-generated idempotency key as a unique business key
    @Column(unique = true)
    private UUID requestId;    // unique constraint → second insert fails
}
```

```java
@Transactional
public Order createOrder(CreateOrderCommand cmd) {
    try {
        return orderRepository.save(new Order(cmd.requestId(), ...));
    } catch (DataIntegrityViolationException e) {
        // The retry hit the unique constraint — fetch the existing order
        return orderRepository.findByRequestId(cmd.requestId()).orElseThrow();
    }
}
```

**This is the pattern the outbox relay uses**: the event id is a unique column; a redelivered event finds the existing row instead of double-processing.

## Mechanism 4: State-Machine Idempotency

Processes with states make duplicates harmless by *rejecting illegal transitions*:

```java
public enum OrderStatus { DRAFT, PLACED, PAID, CANCELLED }

public class Order {
    private OrderStatus status;

    public void pay() {
        // "Already paid" is a legal re-arrival — idempotent by state
        if (status == OrderStatus.PAID) return;
        if (status != OrderStatus.PLACED) {
            throw new IllegalStateException("cannot pay a " + status + " order");
        }
        this.status = OrderStatus.PAID;
    }
}
```

A duplicate "pay" event arrives → status is already PAID → no-op. The state machine *is* the deduplication.

## The At-Least-Once Combination

Real systems combine mechanisms:

```
Message broker (at-least-once) ──▶ Consumer
  ├─ Claim via unique key (DB unique constraint)     ← dedup
  ├─ Process
  └─ Idempotent side effects (state machine, PUTs)   ← safety net
```

```java
@RabbitListener(queues = "orders.new")
public void onOrderPlaced(OrderPlacedEvent event) {
    // Mechanism 3: unique claim
    if (!processedEvents.tryClaim(event.eventId())) {
        log.info("Duplicate event {} — skipping", event.eventId());
        return;
    }
    // Mechanism 4: state-machine processing
    orderStateMachine.apply(event);
    // Mechanism 2: natural idempotency for side effects (PUT to warehouse)
    warehouseClient.update(absoluteState);
}
```

## Distributed Locks vs. Idempotency

| | Distributed lock | Idempotency |
|--|------------------|-------------|
| Prevents | Concurrent execution | Duplicate effects |
| Scope | Before the operation | After the operation |
| Failure mode | Lock expiry → still runs | Duplicate → still safe |
| Guarantee | Mutual exclusion (best effort) | Exactly-once *effect* |

They're complementary: **locks prevent overlap, idempotency makes overlap harmless.** Prefer idempotency — it survives lock expiry, crashes, and replays.

## Testing Idempotency

```java
@Test
void retryReturnsSameResult() {
    // First call
    ResponseEntity<?> first = api.charge(key, request);

    // Retry with the same key
    ResponseEntity<?> retry = api.charge(key, request);

    assertEquals(first.getStatusCode(), retry.getStatusCode());
    assertEquals(first.getBody(), retry.getBody());
    assertEquals(1, paymentRepository.count());   // charged ONCE
}

@Test
void concurrentRetriesProcessOnce() throws Exception {
    ExecutorService pool = Executors.newFixedThreadPool(4);
    IntStream.range(0, 4).forEach(i ->
        pool.submit(() -> api.charge(sameKey, request)));

    assertEquals(1, paymentRepository.count());   // the unique key saved us
}
```

## Summary

| Mechanism | When | Example |
|-----------|------|---------|
| Idempotency key | POST operations | Payments, order creation |
| Natural idempotency | PUT/DELETE/absolute updates | Replace, delete |
| Unique constraint | Event processing | Outbox relay, consumers |
| State machine | Process flows | Order status, saga steps |
| Distributed lock | Prevent overlap | Leader election, job claims |

Idempotency is the distributed-system superpower: it turns retries from a hazard into a convenience. Design operations to be naturally idempotent, add keys where creation is involved, let unique constraints dedup, and let state machines absorb replays — then every retry, replay, and redelivery is a no-op instead of a bug.
