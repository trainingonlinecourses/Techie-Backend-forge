---
title: CompletableFuture Composition
module: java-concurrency-deep
order: 3
minutes: 28
topics: ["CompletableFuture", "thenApply", "thenCompose", "allOf", "exceptionally", "async pipelines"]
docs:
  - title: "CompletableFuture"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/CompletableFuture.html"
summary: Future.get() blocks; CompletableFuture composes. It's the difference between waiting for each step and wiring the pipeline — parallel calls joined,...
---

# CompletableFuture Composition

`Future.get()` blocks; `CompletableFuture` composes. It's the difference between waiting for each step and *wiring the pipeline* — parallel calls joined, failures recovered, results transformed — without blocking a thread. This is the modern way to orchestrate async work in Java.

## From Future to CompletableFuture

```java
// Future: blocking, one result, no composition
Future<Order> f = pool.submit(() -> fetchOrder(id));
Order order = f.get(5, TimeUnit.SECONDS);   // thread blocked

// CompletableFuture: non-blocking composition
CompletableFuture<Order> cf = CompletableFuture
    .supplyAsync(() -> fetchOrder(id), pool);
cf.thenAccept(order -> process(order));      // runs when ready — no block
```

## Creating Futures

```java
// Already-completed
CompletableFuture.completedFuture(value);
CompletableFuture.failedFuture(new IOException("down"));   // Java 9+

// From a task
CompletableFuture.supplyAsync(() -> expensiveCall());       // common pool
CompletableFuture.supplyAsync(() -> expensiveCall(), pool); // YOUR pool — always

// From a Runnable
CompletableFuture.runAsync(() -> fireAndForget());
```

**Always pass your executor** — the no-arg versions use the shared ForkJoin common pool (same starvation trap as parallel streams).

## Transforming: thenApply

```java
CompletableFuture<Course> courseFuture = loadCourse(id);

CompletableFuture<String> titleFuture = courseFuture
    .thenApply(Course::title)            // Course → String (synchronous mapping)
    .thenApply(String::toUpperCase);
```

Each stage receives the previous result and returns a new future — a dependency chain, computed as results arrive.

## Composing: thenCompose

```java
// thenApply with a future-returning function gives Future<Future<T>> — WRONG
CompletableFuture<CompletableFuture<Lesson>> bad = courseFuture
    .thenApply(course -> loadLessons(course));    // nested!

// thenCompose FLATTENS: Future<Lesson>
CompletableFuture<Lesson> good = courseFuture
    .thenCompose(course -> loadLessons(course));
```

**`thenApply`** = map (sync transform). **`thenCompose`** = flatMap (async dependency). Mixing them up is the most common CompletableFuture bug.

## Parallel Composition: allOf

```java
CompletableFuture<Order> order = loadOrder(id);
CompletableFuture<Customer> customer = loadCustomer(id);
CompletableFuture<Inventory> inventory = checkInventory(id);

// Run all three in parallel, wait for ALL, combine
CompletableFuture<OrderDetail> detail = CompletableFuture
    .allOf(order, customer, inventory)
    .thenApply(v -> new OrderDetail(
        order.join(),      // all completed — join() is safe now
        customer.join(),
        inventory.join()));
```

`allOf` takes varargs futures → completes when all complete → then combine with `join()`. Three sequential calls (~300ms) become one parallel batch (~100ms).

### anyOf: First to Complete

```java
// Fastest provider wins
CompletableFuture<Quote> fastest = CompletableFuture.anyOf(
    fetchQuote("provider-a"), fetchQuote("provider-b"))
    .thenApply(q -> (Quote) q);   // cast needed
```

## Error Handling

```java
// exceptionally: recover from a failure
CompletableFuture<Course> safe = loadCourse(id)
    .exceptionally(ex -> {
        log.warn("Load failed: {}", ex.getMessage());
        return defaultCourse();
    });

// handle: always runs (success or failure)
CompletableFuture<String> result = loadCourse(id)
    .handle((course, ex) ->
        ex != null ? "error: " + ex.getMessage() : course.title());

// whenComplete: observe, don't change
loadCourse(id).whenComplete((course, ex) -> {
    if (ex != null) metrics.recordFailure();
    else metrics.recordSuccess();
});
```

## The Async Variants

```java
// thenApplyAsync: run the transform on ANOTHER thread
future.thenApplyAsync(x -> transform(x), pool);

// Why it matters: by default, stages run on the thread that completed the previous stage
// — for blocking work inside a stage, use the Async variant with your pool
```

**Rule of thumb**: if a stage does blocking work (I/O, DB), use `thenApplyAsync`/`thenComposeAsync` with your pool; if it's pure computation, the sync variant is fine (and cheaper).

## Timeouts (Java 9+)

```java
CompletableFuture<Quote> withTimeout = fetchQuote(provider)
    .completeOnTimeout(defaultQuote(), 3, TimeUnit.SECONDS)  // value on timeout
    .orTimeout(5, TimeUnit.SECONDS);                          // exceptionallyComplete

// orTimeout: fails the future after N — handle with exceptionally
fetchQuote(provider)
    .orTimeout(3, TimeUnit.SECONDS)
    .exceptionally(ex -> { log.warn("timed out"); return fallback(); });
```

Every async pipeline needs a timeout — an unbounded wait is a leaked resource.

## The Orchestration Pattern

```java
public CompletableFuture<OrderDetail> getOrderDetail(String orderId) {
    return loadOrder(orderId)
        .thenCompose(order ->
            CompletableFuture.allOf(
                    loadCustomer(order.customerId()),
                    loadShipment(order.id()))
                .thenApply(v -> new OrderDetail(order,
                    customerCache.get(order.customerId()),   // or capture via join
                    shipmentCache.get(order.id()))))
        .exceptionally(ex -> {
            log.error("Order detail failed", ex);
            throw new OrderDetailException(orderId, ex);
        });
}
```

Better — capture results without touching shared caches:

```java
public CompletableFuture<OrderDetail> getOrderDetail(String orderId) {
    CompletableFuture<Order> orderF = loadOrder(orderId);
    CompletableFuture<Customer> customerF = orderF.thenCompose(
        o -> loadCustomer(o.customerId()));
    CompletableFuture<Shipment> shipmentF = orderF.thenCompose(
        o -> loadShipment(o.id()));

    return CompletableFuture.allOf(orderF, customerF, shipmentF)
        .thenApply(v -> new OrderDetail(orderF.join(), customerF.join(), shipmentF.join()));
}
```

## Spring Integration

```java
@Service
public class OrderService {

    @Async("reportExecutor")
    public CompletableFuture<Report> generateReport(Long id) {
        return CompletableFuture.completedFuture(reportGenerator.generate(id));
    }
}
```

`@Async` + `CompletableFuture` return: Spring completes the future on success, completes it exceptionally on throw — the composition patterns above work transparently on async service methods.

## Testing CompletableFutures

```java
@Test
void composesResults() {
    CompletableFuture<String> f = CompletableFuture
        .completedFuture("spring")
        .thenApply(String::toUpperCase);

    assertEquals("SPRING", f.join());
}

@Test
void recoversFromFailure() {
    CompletableFuture<String> f = CompletableFuture
        .failedFuture(new RuntimeException("boom"))
        .exceptionally(ex -> "recovered");

    assertEquals("recovered", f.join());
}

@Test
void parallelJoin() {
    CompletableFuture<Integer> a = CompletableFuture.supplyAsync(() -> 1);
    CompletableFuture<Integer> b = CompletableFuture.supplyAsync(() -> 2);
    int sum = CompletableFuture.allOf(a, b)
        .thenApply(v -> a.join() + b.join()).join();
    assertEquals(3, sum);
}
```

## Summary

| Operation | Meaning |
|-----------|---------|
| `supplyAsync` | Start async work |
| `thenApply` | Map the result (sync) |
| `thenCompose` | Chain an async step (flatMap) |
| `allOf` | Wait for all, then combine |
| `anyOf` | First to complete wins |
| `exceptionally` | Recover from failure |
| `handle` | Transform success or failure |
| `orTimeout` / `completeOnTimeout` | Bound the wait |

CompletableFuture is the composition layer: parallel fetches, dependent pipelines, failure recovery, and timeouts — all without blocking threads. Use `thenCompose` for async dependencies, `allOf` for parallel fan-out, always pass your executor, and always bound with timeouts.
