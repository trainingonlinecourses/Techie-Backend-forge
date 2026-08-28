---
title: Reactive Error Handling — Graceful Failures in WebFlux
summary: Error handling in reactive streams — onErrorResume, onErrorReturn, retry patterns, global error handlers, and the patterns that prevent cascading failures. Beginner-friendly with line-by-line code.
order: 12
minutes: 22
topics: [error handling, onErrorResume, onErrorReturn, retry, global error handler, reactive exceptions, fallback, circuit breaker]
docs:
  - https://projectreactor.io/docs/core/release/reference/#error-handling
  - https://docs.spring.io/spring-framework/reference/web/webflux-webfn.html
---

# Reactive Error Handling — Graceful Failures in WebFlux

## Why Error Handling is Different in Reactive (From Zero)

In traditional imperative code, you use try-catch:

```java
// Traditional (imperative):
try {
    User user = userService.findById(id);
    return ResponseEntity.ok(user);
} catch (NotFoundException e) {
    return ResponseEntity.notFound().build();
}
```

In reactive code, errors travel **through the stream** — they propagate downstream until handled. An unhandled error kills the entire stream. You need to handle errors **reactively**.

```java
// Reactive:
userService.findById(id)                    // Mono<User>
    .map(user -> ResponseEntity.ok(user))   // This NEVER runs if findById fails
    .onErrorResume(e ->                      // Handle the error in the stream
        Mono.just(ResponseEntity.notFound().build())
    );
```

### Error Propagation Rules

1. An error **terminates** the stream — no more items are emitted.
2. The error travels downstream until **someone handles it**.
3. If no one handles it, the subscriber gets the error (HTTP 500 in WebFlux).
4. You can handle errors at **any point** in the chain.

---

## The Code — Line by Line

### 1. Basic Error Handling Operators

```java
@Service
public class ErrorHandlingBasics {

    // onErrorReturn: return a default value when an error occurs
    public Mono<User> findUserSafe(String id) {
        return userRepository.findById(id)
            .onErrorReturn(User.anonymous());                     // Return anonymous user on ANY error
    }

    // onErrorReturn with condition: only handle specific errors
    public Mono<Course> findCourseSafe(String id) {
        return courseRepository.findById(id)
            .onErrorReturn(
                EmptyResultDataAccessException.class,             // Only handle this error type
                Course.notFound()                                  // Default value
            );
    }

    // onErrorResume: switch to a fallback stream
    public Mono<User> findUserWithFallback(String id) {
        return userRepository.findById(id)
            .onErrorResume(e -> {
                if (e instanceof EmptyResultDataAccessException) {
                    return createDefaultUser(id);                 // Create a default user
                }
                return Mono.error(e);                             // Re-throw other errors
            });
    }

    // onErrorMap: transform one exception type to another
    public Mono<Order> findOrderOrNotFound(String id) {
        return orderRepository.findById(id)
            .onErrorMap(
                DataAccessException.class,                        // Catch this
                e -> new OrderNotFoundException("Order not found: " + id)  // Throw this instead
            );
    }

    // doOnError: log the error without changing the stream
    public Mono<User> findUserWithLogging(String id) {
        return userRepository.findById(id)
            .doOnError(e -> log.error("Failed to find user {}: {}", id, e.getMessage()));
        // Error still propagates — we just logged it
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

```java
@Service
public class RetryPatterns {

    // Simple retry: try N times
    public Mono<Order> getOrderWithRetry(String id) {
        return orderRepository.findById(id)
            .retry(3)                                             // Retry up to 3 times total
            .timeout(Duration.ofSeconds(5));                      // Combined with timeout
    }

    // Retry with exponential backoff
    public Flux<DataPoint> fetchWithBackoff() {
        return dataClient.stream()
            .retryWhen(
                Retry.backoff(3, Duration.ofMillis(100))          // 3 retries, 100ms base delay
                    .maxBackoff(Duration.ofSeconds(5))            // Cap at 5s between retries
                    .doBeforeRetry(retry -> log.info("Retry attempt #{}", retry.retryNumber()))
            );
    }

    // Retry only on specific exceptions
    public Mono<String> callExternalService(String endpoint) {
        return webClient.get()
            .uri(endpoint)
            .retrieve()
            .bodyToMono(String.class)
            .retryWhen(
                Retry.backoff(3, Duration.ofSeconds(1))
                    .filter(e -> e instanceof WebClientResponseException
                               && ((WebClientResponseException) e).getStatusCode().is5xxServerError())
                    // Only retry on 5xx errors (server errors)
                    // Don't retry on 4xx (client errors) — those won't fix themselves
            );
    }

    // Retry with fallback after all retries exhausted
    public Mono<String> callWithFallback(String endpoint) {
        return webClient.get()
            .uri(endpoint)
            .retrieve()
            .bodyToMono(String.class)
            .retryWhen(Retry.backoff(3, Duration.ofSeconds(1)))
            .onErrorResume(e ->                                  // After 3 retries, use fallback
                Mono.just(cachedResponse.get(endpoint))
            );
    }
}
```

### 3. Global Error Handler

```java
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
```

### 4. Error Handling in WebFilter

```java
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
```

---

## Real-World Scenarios

### Scenario 1: Graceful Degradation

```java
@Service
public class ResilientContentService {

    private final ContentRepository contentRepo;
    private final CacheService cache;
    private final CircuitBreaker cb;

    public Mono<Content> getContent(String id) {
        return contentRepo.findById(id)
            .transformDeferred(CircuitBreakerOperator.of(cb))    // Circuit breaker
            .timeout(Duration.ofSeconds(3))                       // Timeout
            .retryWhen(Retry.backoff(2, Duration.ofSeconds(1)))  // Retry
            .doOnNext(content -> cache.set(id, content))         // Cache on success
            .onErrorResume(e ->                                  // Fallback to cache
                cache.get(id)
                    .switchIfEmpty(Mono.error(new ContentNotFoundException(id)))
            );
    }
}
```

### Scenario 2: Parallel Calls with Error Isolation

```java
@Service
public class AggregationService {

    public Mono<Dashboard> getDashboard(String userId) {
        // If ONE service fails, don't fail the whole dashboard
        Mono<UserProfile> profile = profileService.getProfile(userId)
            .onErrorReturn(UserProfile.defaultProfile());         // Fallback: default profile

        Mono<List<Course>> courses = courseService.getCourses(userId)
            .onErrorReturn(List.of());                           // Fallback: empty list

        Mono<UserStats> stats = statsService.getStats(userId)
            .onErrorReturn(new UserStats(0, 0, 0));              // Fallback: zeros

        return Mono.zip(profile, courses, stats)
            .map(tuple -> new Dashboard(
                tuple.getT1(),                                    // profile
                tuple.getT2(),                                    // courses
                tuple.getT3()                                     // stats
            ));
    }
}
```

### Scenario 3: Error Events in Streams

```java
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
```

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
