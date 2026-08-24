---
title: Spring Boot Events and Listeners — ApplicationEvent Deep Dive
summary: Custom events, @EventListener, @TransactionalEventListener for post-commit hooks, async events, event ordering, and the decoupled communication pattern that replaces tight service coupling.
order: 35
minutes: 20
topics: [application-event, event-listener, transactional-event, async-event, observer-pattern, event-decoupling]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/events.html
---

# Spring Spring Boot Events and Listeners — ApplicationEvent Deep Dive

## The concept

Spring's **event system** implements the **Observer pattern** — one part of your application publishes an event, and any number of listeners can react to it without the publisher knowing who's listening. This **decouples** your code: the order service doesn't need to know about the notification service, the audit service, or the analytics service.

```java
// Publisher: "I created an order, someone deal with it"
applicationEventPublisher.publishEvent(new OrderCreatedEvent(order));

// Listeners: multiple services independently react
@EventListener
void onOrderCreated(OrderCreatedEvent event) { /* send email */ }

@EventListener
void auditOrder(OrderCreatedEvent event) { /* record audit */ }

@EventListener
void updateInventory(OrderCreatedEvent event) { /* deduct stock */ }
```

**Why events over direct method calls?**
- Adding a new consumer doesn't change the publisher
- Listeners can run asynchronously (don't block the request)
- Transactions can be synchronized (run after commit)
- Multiple listeners can react to the same event

## How we use it in organizations

### Scenario 1: Order lifecycle events

The order service publishes events; other services react independently:

```java
// Event class — plain POJO with data
public class OrderCreatedEvent {
    private final String orderId;
    private final String customerId;
    private final BigDecimal totalAmount;
    private final Instant timestamp;

    public OrderCreatedEvent(String orderId, String customerId, BigDecimal totalAmount) {
        this.orderId = orderId;
        this.customerId = customerId;
        this.totalAmount = totalAmount;
        this.timestamp = Instant.now();
    }
    // getters...
}
```

```java
@Service
public class OrderService {
    private final ApplicationEventPublisher events;

    @Transactional
    public Order createOrder(CreateOrderRequest request) {
        Order order = orderRepository.save(new Order(request));
        // Publish AFTER save (but BEFORE commit if using @TransactionalEventListener)
        events.publishEvent(new OrderCreatedEvent(
            order.getId(), order.getCustomerId(), order.getTotalAmount()));
        return order;
    }
}
```

### Scenario 2: Transactional event listeners

**Critical pattern:** The event is published inside a transaction, but you want listeners to run AFTER the transaction commits. If a listener sends an email but the transaction rolls back, the email is already sent — data inconsistency.

`@TransactionalEventListener` solves this:

```java
@Component
public class OrderNotificationListener {

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onOrderCreated(OrderCreatedEvent event) {
        emailService.sendOrderConfirmation(event.getOrderId(), event.getCustomerId());
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_ROLLBACK)
    public void onOrderFailed(OrderCreatedEvent event) {
        log.warn("Order {} rolled back — skipping notification", event.getOrderId());
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMPLETION)
    public void onOrderComplete(OrderCreatedEvent event) {
        auditService.log("Order lifecycle complete: " + event.getOrderId());
    }
}
```

**Phases:**
- `AFTER_COMMIT` — Runs only if the transaction commits successfully (most common)
- `AFTER_ROLLBACK` — Runs only if the transaction rolls back
- `AFTER_COMPLETION` — Runs after commit or rollback (always)
- `BEFORE_COMMIT` — Runs before the transaction commits (can prevent commit by throwing exception)

### Scenario 3: Async event listeners

Non-critical listeners that should not block the request:

```java
@Component
public class AnalyticsListener {

    @Async
    @EventListener
    public void trackOrderCreated(OrderCreatedEvent event) {
        analyticsService.track("order_created", Map.of(
            "orderId", event.getOrderId(),
            "amount", event.getTotalAmount().toString()
        ));
    }
}
```

**Important:** `@Async` + `@EventListener` makes the listener run on a separate thread. This means:
- The event is serialized to JSON (so use Serializable event classes)
- Exceptions in the listener don't affect the publisher
- The listener runs after the current transaction commits (by default)
- If the async thread pool is full, events may be queued or rejected

### Scenario 4: Event ordering with @Order

When multiple listeners react to the same event and order matters:

```java
@Component
public class InventoryListener {
    @EventListener
    @Order(1)  // runs first
    public void deductStock(OrderCreatedEvent event) {
        inventoryService.deduct(event.getItems());
    }
}

@Component
public class PaymentListener {
    @EventListener
    @Order(2)  // runs after inventory
    public void chargePayment(OrderCreatedEvent event) {
        paymentService.charge(event.getPaymentMethod(), event.getTotalAmount());
    }
}

@Component
public class NotificationListener {
    @EventListener
    @Order(3)  // runs last
    public void sendConfirmation(OrderCreatedEvent event) {
        emailService.send(event.getCustomerId(), "Order confirmed");
    }
}
```

### Scenario 5: Conditional event listeners

Only listen when certain conditions are met:

```java
@Component
public class GoldCustomerListener {

    @EventListener(condition = "#event.totalAmount > 1000")
    public void onLargeOrder(OrderCreatedEvent event) {
        loyaltyService.awardBonusPoints(event.getCustomerId(),
            event.getTotalAmount().longValue() / 10);
    }
}
```

Spring Expression Language (SpEL) in the `condition` attribute evaluates against the event object. This avoids `if/else` in the listener.

### Scenario 6: Spring's built-in events

Spring publishes events automatically that you can listen to:

```java
@Component
public class ApplicationEventHandler {

    @EventListener
    public void onApplicationReady(ApplicationReadyEvent event) {
        log.info("Application started and ready to accept requests");
    }

    @EventListener
    public void onContextClosed(ContextClosedEvent event) {
        log.info("Application shutting down — flushing buffers");
        bufferService.flush();
    }

    @EventListener
    public void onSessionCreated(SessionCreatedEvent event) {
        metricsService.incrementActiveSessions();
    }
}
```

## Event pattern: Domain events

Use events as domain language, not technical plumbing:

```java
// Domain event (immutable, descriptive name)
public record OrderPlaced(String orderId, String customerId, BigDecimal total) {}

public record OrderCancelled(String orderId, String reason) {}

public record OrderShipped(String orderId, String trackingNumber) {}
```

```java
// Publisher — uses domain events as first-class concepts
@Service
public class OrderService {

    @Transactional
    public void placeOrder(CreateOrderRequest req) {
        Order order = Order.create(req);
        orderRepository.save(order);
        applicationEventPublisher.publishEvent(
            new OrderPlaced(order.getId(), order.getCustomerId(), order.getTotal()));
    }

    @Transactional
    public void cancelOrder(String orderId, String reason) {
        Order order = orderRepository.findById(orderId).orElseThrow();
        order.cancel(reason);
        applicationEventPublisher.publishEvent(new OrderCancelled(orderId, reason));
    }
}
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Using `@TransactionalEventListener` without `@Transactional` on publisher | Event never delivered |
| Publishing events in a listener that modifies data | Infinite loop or deadlock |
| Not using AFTER_COMMIT for side effects | Side effects happen on rollback too |
| Heavy logic in synchronous listeners | Blocks the request thread |
| Event classes with mutable state | Race conditions in async listeners |
| Circular event chains (A→B→A) | Stack overflow or infinite loop |
