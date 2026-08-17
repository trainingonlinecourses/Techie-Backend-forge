---
title: Async Execution with @Async
module: spring-scheduling-async
order: 2
minutes: 22
topics: ["@Async", "Executor", "CompletableFuture", "async exceptions", "thread pools"]
docs:
  - title: "Async invocation"
    url: "https://docs.spring.io/spring-framework/reference/integration/scheduling.html#scheduling-annotation-support-async"
---

# Async Execution with @Async

`@Async` moves a method's execution onto a separate thread, freeing the caller immediately. It's the standard way to fire-and-forget side effects (notifications, cache warming, webhooks) and to parallelize independent work.

## Enabling Async

```java
@Configuration
@EnableAsync
public class AsyncConfig {
}
```

`@EnableAsync` registers an `AsyncAnnotationBeanPostProcessor` that detects `@Async` methods and routes them through an `Executor`. Without a custom executor, Spring falls back to `SimpleAsyncTaskExecutor` — which creates a **new thread per task** and never reuses them. That is a production anti-pattern.

## The Default Executor Problem

`SimpleAsyncTaskExecutor` has no queue, no pool, and no backpressure. A burst of 10,000 async calls creates 10,000 threads. The correct default is a bounded `ThreadPoolTaskExecutor`:

```java
@Configuration
@EnableAsync
public class AsyncConfig {

    @Bean(name = "taskExecutor")
    public Executor taskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(16);
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("async-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }
}
```

The `CallerRunsPolicy` is important: when the queue is full, the *calling* thread executes the task instead of throwing `RejectedExecutionException`, giving natural backpressure instead of dropped work.

## Fire-and-Forget

```java
@Service
public class NotificationService {

    @Async
    public void sendWelcomeEmail(String userId) {
        // runs on the async pool; caller returns immediately
        emailClient.send(userId, "welcome");
    }
}
```

```java
notificationService.sendWelcomeEmail(user.getId());
log.info("Request finished");  // may log BEFORE the email is sent
```

The caller never blocks and never sees the result. Exceptions thrown inside the async method do **not** propagate to the caller — they land in the `AsyncUncaughtExceptionHandler`.

## Capturing Results With CompletableFuture

```java
@Async
public CompletableFuture<Order> fetchOrderDetails(String orderId) {
    Order order = orderRepository.findByOrderId(orderId);
    return CompletableFuture.completedFuture(order);
}
```

Callers can then compose the futures:

```java
CompletableFuture<Order> orderFuture = orderService.fetchOrderDetails(id);
CompletableFuture<Customer> customerFuture = customerService.fetchCustomer(id);

Order order = orderFuture.get();           // blocks, or use join()
Customer customer = customerFuture.get();

CompletableFuture.allOf(orderFuture, customerFuture).join();
```

Important contract: when `@Async` returns a `CompletableFuture`, Spring's interceptor **completes** that future when the method returns, and **exceptional completion** when it throws. Only `CompletableFuture` (and its subclass) gets this special treatment — `Future` implementations also work, but plain `void` methods lose all error visibility.

## Why @Async Seems to Not Work

The proxy is the culprit. `@Async` (like `@Transactional`) works through a **proxy** — Spring wraps the bean and intercepts calls. A call from *inside the same class* bypasses the proxy:

```java
@Service
public class OrderService {

    public void placeOrder(OrderDto dto) {
        processPayment(dto);          // ❌ self-invocation: NOT async
    }

    @Async
    public void processPayment(OrderDto dto) { ... }
}
```

The fix: inject the bean into itself (`@Lazy` self-injection) or move the async method to another bean:

```java
@Service
public class OrderService {

    private final OrderService self;   // proxy injected

    public OrderService(@Lazy OrderService self) {
        this.self = self;
    }

    public void placeOrder(OrderDto dto) {
        self.processPayment(dto);      // ✅ goes through the proxy
    }
}
```

## Handling Async Exceptions

Since exceptions don't reach the caller, register a handler:

```java
@Configuration
@EnableAsync
public class AsyncConfig implements AsyncConfigurer {

    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        return (throwable, method, params) ->
            log.error("Async method {} threw", method.getName(), throwable);
    }
}
```

For `CompletableFuture` return types, the future carries the exception — `future.exceptionally(...)` handles it where the result is consumed, so the global handler only catches `void` methods.

## Combining Scheduling and Async

`@Async` and `@Scheduled` compose. A scheduled method that kicks off heavy work should hand off to the async pool rather than blocking the scheduler thread:

```java
@Component
public class NightlyJob {

    @Async
    @Scheduled(cron = "0 0 3 * * *")
    public void run() {
        reportService.generateAll();   // runs on async pool
    }
}
```

Now the single scheduler thread stays free to fire other jobs, while the report generation runs on the larger async pool.

## Best Practices

| Practice | Why |
|----------|-----|
| Always configure a bounded `ThreadPoolTaskExecutor` | `SimpleAsyncTaskExecutor` is unbounded |
| Use `CallerRunsPolicy` on saturation | Backpressure instead of dropped tasks |
| Return `CompletableFuture` when the caller needs the result | Composable, exception-aware |
| Never self-invoke `@Async` methods | Bypasses the proxy |
| Use `@Async("otherExecutor")` to pick a specific pool | Isolate CPU-heavy from I/O-heavy work |
| Propagate context (MDC, security) with a decorating executor | Threads don't inherit ThreadLocals |

## Summary

`@Async` is the simplest way to parallelize and decouple work in Spring — but only correct when paired with a bounded executor, proxy-aware call patterns, and an explicit exception strategy. Combined with `@Scheduled` it gives you the two core primitives of background processing: *when* to run and *where* to run.
