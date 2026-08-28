---
title: Awaitility — Testing Asynchronous Code
summary: Why Thread.sleep is wrong, how Awaitility polls conditions, and the patterns for testing async operations, message queues, and event-driven systems. Beginner-friendly with line-by-line code.
order: 7
minutes: 18
topics: [Awaitility, async testing, polling, condition, eventual consistency, Thread.sleep, asynchronous assertions]
docs:
  - https://www.awaitility.org/
  - https://www.awaitility.org/documentation.html
---

# Awaitility — Testing Asynchronous Code

## Why Not Thread.sleep? (From Zero)

When testing async operations (message listeners, scheduled tasks, event processing), you need to wait for the result. The naive approach:

```java
// ❌ THE WRONG WAY:
orderService.processPayment(orderId);
Thread.sleep(5000);                                    // Wait 5 seconds
Order order = orderRepository.findById(orderId).orElseThrow();
assertThat(order.getStatus()).isEqualTo(OrderStatus.PAID);   // Check result
```

**Problems with Thread.sleep:**
1. **Too short**: If the operation takes 6 seconds, the test fails (flaky!)
2. **Too long**: If the operation takes 100ms, you waste 4.9 seconds per test (slow CI!)
3. **No signal**: You don't know WHEN the condition becomes true — you just guess and wait

**Awaitility** fixes this: it **polls** the condition repeatedly until it's true (or times out). You get fast, reliable tests.

---

## The Code — Line by Line

### Basic Awaitility Pattern

```java
import org.awaitility.Awaitility;
import java.time.Duration;

@Test
void shouldProcessPayment() {
    // Arrange
    String orderId = orderService.createOrder(List.of(item1));

    // Act
    orderService.processPayment(orderId);

    // Assert: poll until the condition is true (max 10 seconds)
    Awaitility.await()
        .atMost(Duration.ofSeconds(10))         // Give up after 10 seconds
        .until(() -> {                          // Poll this condition
            Order order = orderRepository.findById(orderId).orElseThrow();
            return order.getStatus() == OrderStatus.PAID;
        });
}
```

**Line-by-line explained:**
- `Awaitility.await()` — Start building an assertion that polls.
- `.atMost(Duration.ofSeconds(10))` — Maximum wait time. If the condition isn't met in 10 seconds, the test fails.
- `.until(() -> ...)` — The condition to check. Awaitility calls this repeatedly (default: every 100ms) until it returns `true`.
- **No Thread.sleep needed** — if the operation finishes in 200ms, the test passes in 200ms + 100ms polling = 300ms.

### Polling Configuration

```java
Awaitility.await()
    .atMost(Duration.ofSeconds(30))             // Max wait: 30 seconds
    .pollInterval(Duration.ofSeconds(2))         // Check every 2 seconds (instead of default 100ms)
    .pollDelay(Duration.ofSeconds(1))            // Wait 1 second before first check
    .untilAsserted(() -> {                       // Run assertions inside the polling loop
        List<Order> orders = orderRepository.findByStatus(OrderStatus.PROCESSING);
        assertThat(orders).isEmpty();            // No orders should be processing
    });
```

**Line-by-line explained:**
- `pollInterval(Duration.ofSeconds(2))` — Check every 2 seconds instead of every 100ms. Good for operations that take a while to settle.
- `pollDelay(Duration.ofSeconds(1))` — Wait 1 second before the first check. Useful when the operation needs time to start.
- `untilAsserted(() -> ...)` — Instead of returning a boolean, run assertion methods. If any assertion fails, the poll continues. When all pass, the test passes.

### Testing Message Queue Consumers

```java
@Test
void shouldProcessOrderEvent() {
    // Send a message to the queue
    kafkaTemplate.send("order-events", new OrderCreatedEvent("order-123"));

    // Wait for the consumer to process it
    Awaitility.await()
        .atMost(Duration.ofSeconds(10))
        .until(() -> {
            Optional<Order> order = orderRepository.findById("order-123");
            return order.isPresent() &&
                   order.get().getStatus() == OrderStatus.CONFIRMED &&
                   order.get().getConfirmationEmailSent();
        });
}
```

### Testing Scheduled Tasks

```java
@Test
void shouldRunDailyCleanup() {
    // Create old orders that should be cleaned up
    orderRepository.save(createOldOrder(90));    // 90 days old
    orderRepository.save(createOldOrder(30));    // 30 days old (should NOT be cleaned)

    // Trigger the scheduled task
    cleanupTask.runDailyCleanup();

    // Verify old orders are deleted
    Awaitility.await()
        .atMost(Duration.ofSeconds(5))
        .untilAsserted(() -> {
            assertThat(orderRepository.findById("old-90")).isEmpty();     // Deleted
            assertThat(orderRepository.findById("old-30")).isPresent();  // Still exists
        });
}
```

---

## Real-World Scenarios

### Scenario 1: Event-Driven Architecture

```java
@Test
void shouldPropagateEventAcrossServices() {
    // User places an order
    String orderId = orderClient.placeOrder(new OrderRequest("user-1", items));

    // Wait for: order created → payment processed → inventory updated → confirmation sent
    Awaitility.await()
        .atMost(Duration.ofSeconds(30))
        .until(() -> {
            Order order = orderClient.getOrder(orderId);
            return order != null
                && order.getStatus() == OrderStatus.CONFIRMED
                && order.isPaymentProcessed()
                && order.isInventoryReserved()
                && order.isConfirmationSent();
        });
}
```

### Scenario 2: Cache Invalidation

```java
@Test
void shouldInvalidateCacheAfterUpdate() {
    // Cache has old data
    Product cached = cacheService.getProduct("prod-1");
    assertThat(cached.getName()).isEqualTo("Old Name");

    // Update the product
    productService.updateName("prod-1", "New Name");

    // Wait for cache to be invalidated and refreshed
    Awaitility.await()
        .atMost(Duration.ofSeconds(5))
        .until(() -> {
            Product fresh = cacheService.getProduct("prod-1");
            return "New Name".equals(fresh.getName());
        });
}
```

### Scenario 3: Database Replication Lag

```java
@Test
void shouldReadFromReplicaAfterWrite() {
    // Write to primary
    userRepository.save(new User("user-1", "Alice"));

    // Read from replica (might lag behind primary)
    Awaitility.await()
        .atMost(Duration.ofSeconds(5))
        .until(() -> userRepository.findByUsernameFromReplica("user-1").isPresent());
}
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Using Thread.sleep | Flaky (too short) or slow (too long) | Use Awaitility for async assertions |
| No timeout (await forever) | Test hangs if condition never becomes true | Always set `atMost()` |
| Polling too frequently | High CPU usage, may overwhelm the system | Use `pollInterval()` for heavy operations |
| Not cleaning up test data | Tests affect each other | Use `@BeforeEach` to reset state |
| Testing the wrong thing | Asserting on mocks instead of real state | Test the actual side effect (DB, cache, queue) |

---

## Key Takeaways

- **Never use Thread.sleep for testing** — use Awaitility instead.
- **`Awaitility.await().atMost(...).until(...)`** — the basic pattern: poll until condition is true.
- **`untilAsserted()`** — for more complex assertions inside the polling loop.
- **Configure `pollInterval()`** — for operations that take a while to settle.
- **Always set `atMost()`** — prevent tests from hanging forever.

Official docs: [Awaitility](https://www.awaitility.org/) · [Documentation](https://www.awaitility.org/documentation.html)
