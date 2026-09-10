---
title: Reactive Error Handling — Graceful Failures in WebFlux
summary: Error handling in reactive streams — onErrorResume, onErrorReturn, retry patterns, global error handlers, and the patterns that prevent cascading failures. Beginner-friendly with line-by-line code.
order: 6
minutes: 22
topics: [error handling, onErrorResume, onErrorReturn, retry, global error handler, reactive exceptions, fallback, circuit breaker]
docs:
  - https://projectreactor.io/docs/core/release/reference/#error-handling
  - https://docs.spring.io/spring-framework/reference/web/webflux-webfn.html
---

# Reactive Error Handling — Graceful Failures in WebFlux

## Why Error Handling is Different in Reactive (From Zero)

In traditional imperative code, you use try-catch:

// Traditional (imperative):
try {
    User user = userService.findById(id);
    return ResponseEntity.ok(user);
} catch (NotFoundException e) {
    return ResponseEntity.notFound().build();
}

In reactive code, errors travel **through the stream** — they propagate downstream until handled. An unhandled error kills the entire stream. You need to handle errors **reactively**.

// Reactive:
userService.findById(id)                    // Mono<User>
    .map(user -> ResponseEntity.ok(user))   // This NEVER runs if findById fails
    .onErrorResume(e ->                      // Handle the error in the stream
        Mono.just(ResponseEntity.notFound().build())
    );

### Error Propagation Rules

1. An error **terminates** the stream — no more items are emitted.
2. The error travels downstream until **someone handles it**.
3. If no one handles it, the subscriber gets the error (HTTP 500 in WebFlux).
4. You can handle errors at **any point** in the chain.

---

## The Code — Line by Line

### 1. Basic Error Handling Operators


**What this code does — step by step:**

1. onErrorReturn: return a default value when an error occurs
2. `.onErrorReturn(User.anonymous());` — Return anonymous user on ANY error
3. onErrorReturn with condition: only handle specific errors
4. `EmptyResultDataAccessException.class,` — Only handle this error type
5. `Course.notFound()` — Default value
6. onErrorResume: switch to a fallback stream
7. `return createDefaultUser(id);` — Create a default user
8. `return Mono.error(e);` — Re-throw other errors
9. onErrorMap: transform one exception type to another
10. `DataAccessException.class,` — Catch this
11. `e -> new OrderNotFoundException("Order not found: " + id)` — Throw this instead
12. doOnError: log the error without changing the stream
13. Error still propagates — we just logged it

The same code, clean:

```java
@Service
public class ErrorHandlingBasics {

    public Mono<User> findUserSafe(String id) {
        return userRepository.findById(id)
            .onErrorReturn(User.anonymous());
    }

    public Mono<Course> findCourseSafe(String id) {
        return courseRepository.findById(id)
            .onErrorReturn(
                EmptyResultDataAccessException.class,
                Course.notFound()
            );
    }

    public Mono<User> findUserWithFallback(String id) {
        return userRepository.findById(id)
            .onErrorResume(e -> {
                if (e instanceof EmptyResultDataAccessException) {
                    return createDefaultUser(id);
                }
                return Mono.error(e);
            });
    }

    public Mono<Order> findOrderOrNotFound(String id) {
        return orderRepository.findById(id)
            .onErrorMap(
                DataAccessException.class,
                e -> new OrderNotFoundException("Order not found: " + id)
            );
    }

    public Mono<User> findUserWithLogging(String id) {
        return userRepository.findById(id)
            .doOnError(e -> log.error("Failed to find user {}: {}", id, e.getMessage()));
    }
}
```

**Line-by-line explained:**
- `onErrorReturn(value)` — When an error occurs, emit this default value and complete the stream normally.
- `onErrorReturn(ExceptionClass.class, value)` — Only catch specific exception types. Other errors propagate.
- `onErrorResume(e -> ...)` — Switch to a different stream on error. You can create a new Mono/Flux to replace the failed one.
- `onErrorMap(from, to)` — Transform one exception type to another. Useful for converting technical exceptions to business exceptions.
- `doOnError(log)` — Side effect: log the error. The error still propagates downstream.

### 2. Retry Patterns


**What this code does — step by step:**

1. Simple retry: try N times
2. `.retry(3)` — Retry up to 3 times total
3. `.timeout(Duration.ofSeconds(5));` — Combined with timeout
4. Retry with exponential backoff
5. `Retry.backoff(3, Duration.ofMillis(100))` — 3 retries, 100ms base delay
6. `.maxBackoff(Duration.ofSeconds(5))` — Cap at 5s between retries
7. Retry only on specific exceptions
8. Only retry on 5xx errors (server errors). Don't retry on 4xx (client errors) — those won't fix themselves
9. Retry with fallback after all retries exhausted
10. `.onErrorResume(e ->` — After 3 retries, use fallback

The same code, clean:

```java
@Service
public class RetryPatterns {

    public Mono<Order> getOrderWithRetry(String id) {
        return orderRepository.findById(id)
            .retry(3)
            .timeout(Duration.ofSeconds(5));
    }

    public Flux<DataPoint> fetchWithBackoff() {
        return dataClient.stream()
            .retryWhen(
                Retry.backoff(3, Duration.ofMillis(100))
                    .maxBackoff(Duration.ofSeconds(5))
                    .doBeforeRetry(retry -> log.info("Retry attempt #{}", retry.retryNumber()))
            );
    }

    public Mono<String> callExternalService(String endpoint) {
        return webClient.get()
            .uri(endpoint)
            .retrieve()
            .bodyToMono(String.class)
            .retryWhen(
                Retry.backoff(3, Duration.ofSeconds(1))
                    .filter(e -> e instanceof WebClientResponseException
                               && ((WebClientResponseException) e).getStatusCode().is5xxServerError())
            );
    }

    public Mono<String> callWithFallback(String endpoint) {
        return webClient.get()
            .uri(endpoint)
            .retrieve()
            .bodyToMono(String.class)
            .retryWhen(Retry.backoff(3, Duration.ofSeconds(1)))
            .onErrorResume(e ->
                Mono.just(cachedResponse.get(endpoint))
            );
    }
}
```

### 3. Global Error Handler

@Component
@RestControllerAdvice                          // Works with WebFlux too
public class ReactiveGlobalErrorHandler {

    // Handle specific exception types:
    @ExceptionHandler(OrderNotFoundException.class)
    public Mono<ResponseEntity<ErrorResponse>> handleOrderNotFound(OrderNotFoundException e) {
        return Mono.just(ResponseEntity
            .status(HttpStatus.NOT_FOUND)
            .body(new ErrorResponse(404, e.getMessage())));
    }

    @ExceptionHandler(PaymentDeclinedException.class)
    public Mono<ResponseEntity<ErrorResponse>> handlePaymentDeclined(PaymentDeclinedException e) {
        return Mono.just(ResponseEntity
            .status(HttpStatus.PAYMENT_REQUIRED)
            .body(new ErrorResponse(402, "Payment declined: " + e.getReason())));
    }

    // Catch-all handler:
    @ExceptionHandler(Exception.class)
    public Mono<ResponseEntity<ErrorResponse>> handleGeneric(Exception e) {
        log.error("Unhandled exception", e);
        return Mono.just(ResponseEntity
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(new ErrorResponse(500, "Something went wrong")));
    }
}

public record ErrorResponse(int status, String message) {}

### 4. Error Handling in WebFilter

@Component
public class ErrorLoggingFilter implements WebFilter {

    private static final Logger log = LoggerFactory.getLogger(ErrorLoggingFilter.class);

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        return chain.filter(exchange)
            .doOnError(e -> {
                log.error("Request failed: {} {} → {}",
                    exchange.getRequest().getMethod(),
                    exchange.getRequest().getPath(),
                    e.getMessage());
                exchange.getResponse().setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR);
            });
    }
}

---

## Real-World Scenarios

### Scenario 1: Graceful Degradation


**What this code does — step by step:**

1. `.transformDeferred(CircuitBreakerOperator.of(cb))` — Circuit breaker
2. `.timeout(Duration.ofSeconds(3))` — Timeout
3. `.retryWhen(Retry.backoff(2, Duration.ofSeconds(1)))` — Retry
4. `.doOnNext(content -> cache.set(id, content))` — Cache on success
5. `.onErrorResume(e ->` — Fallback to cache

The same code, clean:

```java
@Service
public class ResilientContentService {

    private final ContentRepository contentRepo;
    private final CacheService cache;
    private final CircuitBreaker cb;

    public Mono<Content> getContent(String id) {
        return contentRepo.findById(id)
            .transformDeferred(CircuitBreakerOperator.of(cb))
            .timeout(Duration.ofSeconds(3))
            .retryWhen(Retry.backoff(2, Duration.ofSeconds(1)))
            .doOnNext(content -> cache.set(id, content))
            .onErrorResume(e ->
                cache.get(id)
                    .switchIfEmpty(Mono.error(new ContentNotFoundException(id)))
            );
    }
}
```

### Scenario 2: Parallel Calls with Error Isolation


**What this code does — step by step:**

1. If ONE service fails, don't fail the whole dashboard
2. `.onErrorReturn(UserProfile.defaultProfile());` — Fallback: default profile
3. `.onErrorReturn(List.of());` — Fallback: empty list
4. `.onErrorReturn(new UserStats(0, 0, 0));` — Fallback: zeros
5. `tuple.getT1(),` — profile
6. `tuple.getT2(),` — courses
7. `tuple.getT3()` — stats

The same code, clean:

```java
@Service
public class AggregationService {

    public Mono<Dashboard> getDashboard(String userId) {
        Mono<UserProfile> profile = profileService.getProfile(userId)
            .onErrorReturn(UserProfile.defaultProfile());

        Mono<List<Course>> courses = courseService.getCourses(userId)
            .onErrorReturn(List.of());

        Mono<UserStats> stats = statsService.getStats(userId)
            .onErrorReturn(new UserStats(0, 0, 0));

        return Mono.zip(profile, courses, stats)
            .map(tuple -> new Dashboard(
                tuple.getT1(),
                tuple.getT2(),
                tuple.getT3()
            ));
    }
}
```

### Scenario 3: Error Events in Streams

@Service
public class EventStreamService {

    public Flux<Event> streamEvents(String userId) {
        return eventService.getUserEvents(userId)
            .doOnNext(event -> log.debug("Event: {}", event))
            .doOnError(e -> log.error("Stream error for user {}: {}", userId, e.getMessage()))
            .doOnComplete(() -> log.info("Stream completed for user {}", userId))
            .onErrorResume(e -> {
                // Log the error, then emit a "stream interrupted" event
                return Flux.concat(
                    Flux.just(Event.streamInterrupted(userId, e.getMessage())),
                    Flux.empty()                                  // Then complete normally
                );
            });
    }
}

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| No error handling in reactive chains | One error kills the entire stream | Always add `onErrorReturn` or `onErrorResume` |
| Catching too broadly with `onErrorReturn(Exception.class, ...)` | Masks bugs by returning defaults for real errors | Catch specific exception types only |
| Retry without backoff | Overwhelms a failing service | Use `Retry.backoff()` with exponential delay |
| Swallowing errors silently | Bugs go undetected | Always log with `doOnError` before handling |
| Not isolating parallel calls | One failure fails the entire aggregation | Handle errors independently per stream |

---

## Key Takeaways

- **Errors propagate downstream** in reactive chains — handle them before they reach the subscriber.
- **`onErrorReturn`** for simple fallbacks, **`onErrorResume`** for complex recovery logic.
- **`Retry.backoff()`** for transient failures with exponential delay.
- **Circuit breaker + timeout + retry** = the resilience trifecta for external calls.
- **Isolate parallel calls** — one failing service shouldn't fail the entire response.

Official docs: [Error Handling (Reactor)](https://projectreactor.io/docs/core/release/reference/#error-handling) · [WebFlux (Spring)](https://docs.spring.io/spring-framework/reference/web/webflux-webfn.html)

