---
title: Advanced Reactive Operators — The Complete Toolkit
summary: Advanced Reactor operators — transform, filter, combine, window, buffer, groupBy, retry, and the operator decision tree for choosing the right one. Beginner-friendly with line-by-line code.
order: 1
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


**What this code does — step by step:**

1. flatMap: one-to-many transformation (async)
2. `return userRepository.findById(userId)` — Mono<User>
3. `.flatMapMany(user ->` — Mono → Flux
4. `courseRepository.findByUserId(user.getId())` — Flux<Course>
5. `.map(course -> new CourseSummary(` — Transform each course
6. flatMapSequential: maintain order while doing async work
7. `.flatMapSequential(` — Preserves original order!
8. `id -> lessonService.loadContent(id),` — Async load each lesson
9. `4` — Max 4 concurrent loads
10. cast: change the element type (when you know the type)
11. `.cast(Object.class);` — Convert Entity → Object
12. index: add the position to each element
13. `return items.index();` — Flux<(index, item)>. Returns: (0, "first"), (1, "second"), (2, "third")

The same code, clean:

```java
@Service
public class TransformOperators {

    public Flux<CourseSummary> getCoursesForUser(String userId) {
        return userRepository.findById(userId)
            .flatMapMany(user ->
                courseRepository.findByUserId(user.getId())
            )
            .map(course -> new CourseSummary(
                course.getTitle(),
                course.getProgress(),
                course.getLastAccessed()
            ));
    }

    public Flux<LessonContent> loadLessonsInOrder(List<String> lessonIds) {
        return Flux.fromIterable(lessonIds)
            .flatMapSequential(
                id -> lessonService.loadContent(id),
                4
            );
    }

    public Mono<Object> getGeneric(String id) {
        return repository.findById(id)
            .cast(Object.class);
    }

    public Flux<IndexedItem<String>> withPosition(Flux<String> items) {
        return items.index();
    }
}
```

**Line-by-line explained:**
- `flatMapMany(user -> ...)` — Converts a `Mono<User>` into a `Flux<Course>`. The flatMap returns a Publisher, and flatMapMany unwraps it.
- `flatMapSequential(lesson -> ..., 4)` — Like flatMap, but preserves the original order. Max 4 concurrent operations. Essential when order matters.
- `items.index()` — Pairs each element with its position (0-based). Useful for numbered lists or pagination.

### 2. Filtering Operators


**What this code does — step by step:**

1. distinct: remove duplicates
2. `return tags.distinct();` — Removes duplicate tags
3. take: limit the number of elements
4. `.take(1)` — Only the first element
5. `.next();` — Convert Flux<Course> → Mono<Course>
6. skip: skip the first N elements (pagination)
7. `.skip((long) page * size)` — Skip previous pages
8. `.take(size);` — Take only this page's items
9. filter with complex predicates
10. `course.getStatus() == CourseStatus.ACTIVE &&` — Must be active
11. `course.getLastAccessed().isAfter(` — Accessed in last 30 days
12. takeWhile: take elements until condition is false
13. `.takeWhile(order ->` — Take while orders are recent
14. skipUntil: skip elements until condition is true
15. `.skipUntil(event ->` — Skip until we reach startTime

The same code, clean:

```java
@Service
public class FilterOperators {

    public Flux<String> uniqueTags(Flux<String> tags) {
        return tags.distinct();
    }

    public Mono<Course> getTopCourse(String userId) {
        return courseRepository.findByUserId(userId)
            .take(1)
            .next();
    }

    public Flux<Course> getPage(String userId, int page, int size) {
        return courseRepository.findByUserId(userId)
            .skip((long) page * size)
            .take(size);
    }

    public Flux<Course> getActiveCourses(String userId) {
        return courseRepository.findByUserId(userId)
            .filter(course ->
                course.getStatus() == CourseStatus.ACTIVE &&
                course.getLastAccessed().isAfter(
                    Instant.now().minus(Duration.ofDays(30))
                )
            );
    }

    public Flux<Order> getRecentUnprocessed(Flux<Order> orders) {
        return orders
            .takeWhile(order ->
                order.getCreatedAt().isAfter(Instant.now().minus(Duration.ofHours(1)))
            );
    }

    public Flux<Event> skipToTimestamp(Flux<Event> events, Instant startTime) {
        return events
            .skipUntil(event ->
                event.getTimestamp().isAfter(startTime)
            );
    }
}
```

### 3. Combining Operators


**What this code does — step by step:**

1. zip: combine two streams (pair elements by position)
2. `return Flux.zip(orders, stats,` — Combine order + stats
3. `(order, stat) -> new OrderSummary(` — Merge into one object
4. merge: interleave two streams (no ordering guarantee)
5. `return Flux.merge(userEvents, systemEvents);` — Interleave as they arrive
6. concat: sequential merge (first stream completes, then second)
7. `return Flux.concat(free, premium);` — Free courses first, then premium
8. startWith: prepend items to a stream
9. `.startWith("Home", "Profile", "Settings");` — Add items at the beginning
10. switchIfEmpty: provide fallback when stream is empty
11. `.switchIfEmpty(Flux.just(` — If no courses found
12. `Course.defaultCourse()` — Return a default

The same code, clean:

```java
@Service
public class CombineOperators {

    public Flux<OrderSummary> getOrderSummaries(String userId) {
        Flux<Order> orders = orderRepository.findByUserId(userId);
        Flux<UserStats> stats = statsService.getUserStats(userId);

        return Flux.zip(orders, stats,
            (order, stat) -> new OrderSummary(
                order.getId(),
                order.getTotal(),
                stat.getAverageOrderValue(),
                stat.getOrderCount()
            )
        );
    }

    public Flux<Event> mergeEvents(String userId) {
        Flux<Event> userEvents = eventService.getUserEvents(userId);
        Flux<Event> systemEvents = eventService.getSystemEvents();

        return Flux.merge(userEvents, systemEvents);
    }

    public Flux<Course> getFreeThenPremium(String userId) {
        Flux<Course> free = courseRepository.findByUserIdAndFree(userId, true);
        Flux<Course> premium = courseRepository.findByUserIdAndFree(userId, false);

        return Flux.concat(free, premium);
    }

    public Flux<String> getMenuItems(Flux<String> dbItems) {
        return dbItems
            .startWith("Home", "Profile", "Settings");
    }

    public Flux<Course> getCoursesOrFallback(String userId) {
        return courseRepository.findByUserId(userId)
            .switchIfEmpty(Flux.just(
                Course.defaultCourse()
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


**What this code does — step by step:**

1. buffer: collect N items into a list
2. `return orders.buffer(100);` — Collect 100 orders per batch. Returns: Flux<List<Order>> where each list has up to 100 orders
3. buffer with time window
4. `return events.buffer(Duration.ofSeconds(5));` — Collect events in 5-second windows
5. buffer with size AND time (whichever comes first)
6. `return logs.buffer(1000, Duration.ofSeconds(10));` — 1000 items OR 10 seconds
7. window: like buffer, but returns Flux<Flux<T>> (stream of substreams)
8. `return orders.window(50);` — Windows of 50 orders. Each window is a separate Flux you can process independently
9. collectList: collect ALL items into one list
10. `.collectList();` — Flux<Course> → Mono<List<Course>>
11. reduce: aggregate all items into one value
12. `.map(Order::getTotal)` — Extract the total from each order
13. `.reduce(BigDecimal.ZERO, BigDecimal::add);` — Sum all totals

The same code, clean:

```java
@Service
public class BatchOperators {

    public Flux<List<Order>> batchOrders(Flux<Order> orders) {
        return orders.buffer(100);
    }

    public Flux<List<Event>> batchByTime(Flux<Event> events) {
        return events.buffer(Duration.ofSeconds(5));
    }

    public Flux<List<LogEntry>> batchLogs(Flux<LogEntry> logs) {
        return logs.buffer(1000, Duration.ofSeconds(10));
    }

    public Flux<Flux<Order>> windowOrders(Flux<Order> orders) {
        return orders.window(50);
    }

    public Mono<List<Course>> allCourses(String userId) {
        return courseRepository.findByUserId(userId)
            .collectList();
    }

    public Mono<BigDecimal> totalRevenue(Flux<Order> orders) {
        return orders
            .map(Order::getTotal)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
```

### 5. Error Handling Operators


**What this code does — step by step:**

1. onErrorReturn: return a default value on error
2. `.onErrorReturn(Course.emptyCourse());` — Return empty course on error
3. onErrorResume: switch to a fallback stream
4. `.onErrorResume(e -> {` — On error, try the cache
5. `return cacheService.getCourses(userId);` — Fallback stream
6. retry: retry the operation
7. `.retry(3)` — Retry up to 3 times
8. `.timeout(Duration.ofSeconds(5));` — Fail after 5 seconds
9. retryWhen: retry with backoff
10. `.retryWhen(Retry.backoff(3, Duration.ofSeconds(1))` — 3 retries, 1s base delay
11. `.maxBackoff(Duration.ofSeconds(10))` — Max 10s between retries
12. `.filter(e -> e instanceof IOException)` — Only retry on IO errors

The same code, clean:

```java
@Service
public class ErrorOperators {

    public Flux<Course> getCoursesSafe(String userId) {
        return courseRepository.findByUserId(userId)
            .onErrorReturn(Course.emptyCourse());
    }

    public Flux<Course> getCoursesWithFallback(String userId) {
        return courseRepository.findByUserId(userId)
            .onErrorResume(e -> {
                log.warn("DB error, falling back to cache: {}", e.getMessage());
                return cacheService.getCourses(userId);
            });
    }

    public Mono<Order> getOrderReliable(String orderId) {
        return orderRepository.findById(orderId)
            .retry(3)
            .timeout(Duration.ofSeconds(5));
    }

    public Flux<DataPoint> fetchDataWithBackoff() {
        return dataService.streamData()
            .retryWhen(Retry.backoff(3, Duration.ofSeconds(1))
                .maxBackoff(Duration.ofSeconds(10))
                .filter(e -> e instanceof IOException)
            );
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Real-Time Dashboard Aggregation


**What this code does — step by step:**

1. Stream 1: Course progress updates (every 5 seconds)
2. Stream 2: Notification events (real-time)
3. Stream 3: Achievement unlocks (real-time)
4. `.distinct()` — Remove duplicate events
5. `.timeout(Duration.ofMinutes(30));` — Auto-disconnect after 30 min

The same code, clean:

```java
@Service
public class DashboardService {

    public Flux<DashboardUpdate> streamDashboard(String userId) {
        return Flux.merge(
            courseProgressService.streamUpdates(userId)
                .buffer(Duration.ofSeconds(5))
                .map(this::aggregateProgress),

            notificationService.streamNotifications(userId),

            achievementService.streamUnlocks(userId)
        )
        .distinct()
        .timeout(Duration.ofMinutes(30));
    }
}
```

### Scenario 2: Batch Processing with Backpressure


**What this code does — step by step:**

1. `.buffer(500)` — Batch 500 items
2. `batch -> processBatch(batch),` — Process each batch
3. `4` — Max 4 concurrent batches
4. `return Flux.empty();` — Skip failed batches
5. `.parallel(4)` — 4 parallel threads
6. `.sequential()` — Merge back to single stream

The same code, clean:

```java
@Service
public class BatchProcessor {

    public Flux<ProcessResult> processInBatches(Flux<RawData> rawData) {
        return rawData
            .buffer(500)
            .flatMap(
                batch -> processBatch(batch),
                4
            )
            .onErrorResume(e -> {
                log.error("Batch processing error: {}", e.getMessage());
                return Flux.empty();
            });
    }

    private Flux<ProcessResult> processBatch(List<RawData> batch) {
        return Flux.fromIterable(batch)
            .parallel(4)
            .runOn(Schedulers.parallel())
            .map(this::transformItem)
            .sequential()
            .collectList()
            .map(results -> new ProcessResult(batch.size(), results));
    }
}
```

### Scenario 3: Circuit Breaker with Reactive

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

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [docs.spring.io/spring-framework/reference/web/webflux.html](https://docs.spring.io/spring-framework/reference/web/webflux.html)
