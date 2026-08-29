---
title: Advanced Reactive Operators — The Complete Toolkit
summary: Advanced Reactor operators — transform, filter, combine, window, buffer, groupBy, retry, and the operator decision tree for choosing the right one. Beginner-friendly with line-by-line code.
order: 12
minutes: 25
topics: [reactive operators, transform, filter, combine, window, buffer, groupBy, retry, timeout, operator selection]
docs:
  - https://projectreactor.io/docs/core/release/reference/#which-operator
  - https://projectreactor.io/docs/core/release/reference/#producing
---

# Advanced Reactive Operators — The Complete Toolkit

## Why Advanced Operators Matter (From Zero)

You already know `map`, `flatMap`, and `filter`. But real-world applications need more: combining multiple streams, batching data, retrying failed operations, grouping results, and transforming data in complex ways. This lesson covers the operators you'll actually use in production.

### The Operator Decision Tree

```
Need to transform each item?          → map, flatMap
Need to filter items?                  → filter, distinct, take, skip
Need to combine two streams?           → zip, merge, concat
Need to batch items?                   → buffer, window, collectList
Need to group items?                   → groupBy
Need to handle errors?                 → onErrorReturn, retry, timeout
Need to delay or schedule?             → delayElements, subscribeOn, publishOn
```

---

## The Code — Line by Line

### 1. Transformation Operators

```java
@Service
public class TransformOperators {

    // flatMap: one-to-many transformation (async)
    public Flux<CourseSummary> getCoursesForUser(String userId) {
        return userRepository.findById(userId)                    // Mono<User>
            .flatMapMany(user ->                                  // Mono → Flux
                courseRepository.findByUserId(user.getId())       // Flux<Course>
            )
            .map(course -> new CourseSummary(                     // Transform each course
                course.getTitle(),
                course.getProgress(),
                course.getLastAccessed()
            ));
    }

    // flatMapSequential: maintain order while doing async work
    public Flux<LessonContent> loadLessonsInOrder(List<String> lessonIds) {
        return Flux.fromIterable(lessonIds)
            .flatMapSequential(                                   // Preserves original order!
                id -> lessonService.loadContent(id),              // Async load each lesson
                4                                                 // Max 4 concurrent loads
            );
    }

    // cast: change the element type (when you know the type)
    public Mono<Object> getGeneric(String id) {
        return repository.findById(id)
            .cast(Object.class);                                  // Convert Entity → Object
    }

    // index: add the position to each element
    public Flux<IndexedItem<String>> withPosition(Flux<String> items) {
        return items.index();                                     // Flux<(index, item)>
        // Returns: (0, "first"), (1, "second"), (2, "third")
    }
}
```

**Line-by-line explained:**
- `flatMapMany(user -> ...)` — Converts a `Mono<User>` into a `Flux<Course>`. The flatMap returns a Publisher, and flatMapMany unwraps it.
- `flatMapSequential(lesson -> ..., 4)` — Like flatMap, but preserves the original order. Max 4 concurrent operations. Essential when order matters.
- `items.index()` — Pairs each element with its position (0-based). Useful for numbered lists or pagination.

### 2. Filtering Operators

```java
@Service
public class FilterOperators {

    // distinct: remove duplicates
    public Flux<String> uniqueTags(Flux<String> tags) {
        return tags.distinct();                                   // Removes duplicate tags
    }

    // take: limit the number of elements
    public Mono<Course> getTopCourse(String userId) {
        return courseRepository.findByUserId(userId)
            .take(1)                                              // Only the first element
            .next();                                              // Convert Flux<Course> → Mono<Course>
    }

    // skip: skip the first N elements (pagination)
    public Flux<Course> getPage(String userId, int page, int size) {
        return courseRepository.findByUserId(userId)
            .skip((long) page * size)                             // Skip previous pages
            .take(size);                                          // Take only this page's items
    }

    // filter with complex predicates
    public Flux<Course> getActiveCourses(String userId) {
        return courseRepository.findByUserId(userId)
            .filter(course ->
                course.getStatus() == CourseStatus.ACTIVE &&      // Must be active
                course.getLastAccessed().isAfter(                  // Accessed in last 30 days
                    Instant.now().minus(Duration.ofDays(30))
                )
            );
    }

    // takeWhile: take elements until condition is false
    public Flux<Order> getRecentUnprocessed(Flux<Order> orders) {
        return orders
            .takeWhile(order ->                                   // Take while orders are recent
                order.getCreatedAt().isAfter(Instant.now().minus(Duration.ofHours(1)))
            );
    }

    // skipUntil: skip elements until condition is true
    public Flux<Event> skipToTimestamp(Flux<Event> events, Instant startTime) {
        return events
            .skipUntil(event ->                                   // Skip until we reach startTime
                event.getTimestamp().isAfter(startTime)
            );
    }
}
```

### 3. Combining Operators

```java
@Service
public class CombineOperators {

    // zip: combine two streams (pair elements by position)
    public Flux<OrderSummary> getOrderSummaries(String userId) {
        Flux<Order> orders = orderRepository.findByUserId(userId);
        Flux<UserStats> stats = statsService.getUserStats(userId);

        return Flux.zip(orders, stats,                            // Combine order + stats
            (order, stat) -> new OrderSummary(                    // Merge into one object
                order.getId(),
                order.getTotal(),
                stat.getAverageOrderValue(),
                stat.getOrderCount()
            )
        );
    }

    // merge: interleave two streams (no ordering guarantee)
    public Flux<Event> mergeEvents(String userId) {
        Flux<Event> userEvents = eventService.getUserEvents(userId);
        Flux<Event> systemEvents = eventService.getSystemEvents();

        return Flux.merge(userEvents, systemEvents);              // Interleave as they arrive
    }

    // concat: sequential merge (first stream completes, then second)
    public Flux<Course> getFreeThenPremium(String userId) {
        Flux<Course> free = courseRepository.findByUserIdAndFree(userId, true);
        Flux<Course> premium = courseRepository.findByUserIdAndFree(userId, false);

        return Flux.concat(free, premium);                        // Free courses first, then premium
    }

    // startWith: prepend items to a stream
    public Flux<String> getMenuItems(Flux<String> dbItems) {
        return dbItems
            .startWith("Home", "Profile", "Settings");           // Add items at the beginning
    }

    // switchIfEmpty: provide fallback when stream is empty
    public Flux<Course> getCoursesOrFallback(String userId) {
        return courseRepository.findByUserId(userId)
            .switchIfEmpty(Flux.just(                              // If no courses found
                Course.defaultCourse()                             // Return a default
            ));
    }
}
```

**Line-by-line explained:**
- `Flux.zip(orders, stats, combiner)` — Pairs the first element of orders with the first element of stats, second with second, etc. Stream ends when the shorter one ends.
- `Flux.merge(a, b)` — Interleaves elements as they arrive. No ordering guarantee — whichever stream produces data first.
- `Flux.concat(a, b)` — Processes stream `a` completely, then processes `b`. Ordering guaranteed.
- `switchIfEmpty` — Provides a fallback stream when the original is empty.

### 4. Batching Operators

```java
@Service
public class BatchOperators {

    // buffer: collect N items into a list
    public Flux<List<Order>> batchOrders(Flux<Order> orders) {
        return orders.buffer(100);                                // Collect 100 orders per batch
        // Returns: Flux<List<Order>> where each list has up to 100 orders
    }

    // buffer with time window
    public Flux<List<Event>> batchByTime(Flux<Event> events) {
        return events.buffer(Duration.ofSeconds(5));              // Collect events in 5-second windows
    }

    // buffer with size AND time (whichever comes first)
    public Flux<List<LogEntry>> batchLogs(Flux<LogEntry> logs) {
        return logs.buffer(1000, Duration.ofSeconds(10));         // 1000 items OR 10 seconds
    }

    // window: like buffer, but returns Flux<Flux<T>> (stream of substreams)
    public Flux<Flux<Order>> windowOrders(Flux<Order> orders) {
        return orders.window(50);                                 // Windows of 50 orders
        // Each window is a separate Flux you can process independently
    }

    // collectList: collect ALL items into one list
    public Mono<List<Course>> allCourses(String userId) {
        return courseRepository.findByUserId(userId)
            .collectList();                                       // Flux<Course> → Mono<List<Course>>
    }

    // reduce: aggregate all items into one value
    public Mono<BigDecimal> totalRevenue(Flux<Order> orders) {
        return orders
            .map(Order::getTotal)                                 // Extract the total from each order
            .reduce(BigDecimal.ZERO, BigDecimal::add);            // Sum all totals
    }
}
```

### 5. Error Handling Operators

```java
@Service
public class ErrorOperators {

    // onErrorReturn: return a default value on error
    public Flux<Course> getCoursesSafe(String userId) {
        return courseRepository.findByUserId(userId)
            .onErrorReturn(Course.emptyCourse());                 // Return empty course on error
    }

    // onErrorResume: switch to a fallback stream
    public Flux<Course> getCoursesWithFallback(String userId) {
        return courseRepository.findByUserId(userId)
            .onErrorResume(e -> {                                 // On error, try the cache
                log.warn("DB error, falling back to cache: {}", e.getMessage());
                return cacheService.getCourses(userId);           // Fallback stream
            });
    }

    // retry: retry the operation
    public Mono<Order> getOrderReliable(String orderId) {
        return orderRepository.findById(orderId)
            .retry(3)                                             // Retry up to 3 times
            .timeout(Duration.ofSeconds(5));                      // Fail after 5 seconds
    }

    // retryWhen: retry with backoff
    public Flux<DataPoint> fetchDataWithBackoff() {
        return dataService.streamData()
            .retryWhen(Retry.backoff(3, Duration.ofSeconds(1))    // 3 retries, 1s base delay
                .maxBackoff(Duration.ofSeconds(10))               // Max 10s between retries
                .filter(e -> e instanceof IOException)            // Only retry on IO errors
            );
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Real-Time Dashboard Aggregation

```java
@Service
public class DashboardService {

    public Flux<DashboardUpdate> streamDashboard(String userId) {
        return Flux.merge(
            // Stream 1: Course progress updates (every 5 seconds)
            courseProgressService.streamUpdates(userId)
                .buffer(Duration.ofSeconds(5))
                .map(this::aggregateProgress),

            // Stream 2: Notification events (real-time)
            notificationService.streamNotifications(userId),

            // Stream 3: Achievement unlocks (real-time)
            achievementService.streamUnlocks(userId)
        )
        .distinct()                                               // Remove duplicate events
        .timeout(Duration.ofMinutes(30));                         // Auto-disconnect after 30 min
    }
}
```

### Scenario 2: Batch Processing with Backpressure

```java
@Service
public class BatchProcessor {

    public Flux<ProcessResult> processInBatches(Flux<RawData> rawData) {
        return rawData
            .buffer(500)                                          // Batch 500 items
            .flatMap(
                batch -> processBatch(batch),                    // Process each batch
                4                                                 // Max 4 concurrent batches
            )
            .onErrorResume(e -> {
                log.error("Batch processing error: {}", e.getMessage());
                return Flux.empty();                              // Skip failed batches
            });
    }

    private Flux<ProcessResult> processBatch(List<RawData> batch) {
        return Flux.fromIterable(batch)
            .parallel(4)                                          // 4 parallel threads
            .runOn(Schedulers.parallel())
            .map(this::transformItem)
            .sequential()                                         // Merge back to single stream
            .collectList()
            .map(results -> new ProcessResult(batch.size(), results));
    }
}
```

### Scenario 3: Circuit Breaker with Reactive

```java
@Service
public class ResilientService {

    private final CircuitBreaker circuitBreaker = CircuitBreaker.ofDefaults("ai-service");

    public Mono<String> callAIService(String prompt) {
        return aiClient.generate(prompt)
            .transformDeferred(CircuitBreakerOperator.of(circuitBreaker))  // Add circuit breaker
            .timeout(Duration.ofSeconds(30))                      // Timeout
            .retry(2)                                             // Retry on transient errors
            .onErrorResume(e ->                                   // Fallback when circuit is open
                Mono.just("AI service temporarily unavailable. Please try again later.")
            );
    }
}
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Using `block()` in reactive code | Defeats the purpose of reactive, can deadlock | Stay in the reactive chain, use `subscribe()` or `await()` |
| Not handling errors in reactive chains | Errors propagate and kill the entire stream | Use `onErrorReturn`, `onErrorResume`, or `retry` |
| Buffering without size limit | OutOfMemoryError from unbounded buffers | Always set a max size on `buffer()` |
| Using `flatMap` when order matters | Results arrive in arbitrary order | Use `flatMapSequential` to preserve order |
| Forgetting `timeout()` | Streams hang forever on slow上游 | Always add timeout to external calls |

---

## Key Takeaways

- **`flatMap`** for async one-to-many, **`flatMapSequential`** when order matters.
- **`zip`** combines streams by position, **`merge`** interleaves, **`concat`** sequences.
- **`buffer`** batches items, **`window`** creates sub-streams, **`collectList`** gathers everything.
- **Always handle errors** with `onErrorReturn`/`onErrorResume`/`retry`.
- **Never `block()` in reactive code** — it defeats the purpose and can cause deadlocks.

Official docs: [Operator Decision Tree](https://projectreactor.io/docs/core/release/reference/#which-operator) · [Reactor Core](https://projectreactor.io/docs/core/release/reference/#producing)
