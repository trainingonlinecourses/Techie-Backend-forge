---
title: Async Methods in Spring Boot — @Async, Thread Pools and Error Handling
summary: How @Async works under the hood, configuring task executors, exception handling for async methods, and the patterns that prevent thread starvation.
order: 31
minutes: 20
topics: [@Async, TaskExecutor, thread pool, CompletableFuture, error handling, async patterns]
docs:
  - https://docs.spring.io/spring-framework/reference/integration/scheduling.html#scheduling-task-executor
  - https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#features.task-execution-and-scheduling
---

# Async Methods in Spring Boot — @Async, Thread Pools and Error Handling

## The concept: fire-and-forget or compose results asynchronously

`@Async` runs a method on a separate thread, freeing the caller to continue. Use it for email sending, report generation, audit logging — any work that doesn't need to block the response. Spring wraps the call in a proxy, so the async behavior only works when the method is called from *outside* the class (the self-invocation trap).

## Basic @Async usage

```java
@Service
public class NotificationService {

    @Async
    public void sendWelcomeEmail(User user) {
        // Runs on a thread pool thread — caller doesn't wait
        emailClient.send(user.email(), "Welcome!", "Hello " + user.name());
    }

    @Async
    public CompletableFuture<OrderStatus> processOrderAsync(Order order) {
        // Returns a result via CompletableFuture
        OrderStatus status = orderProcessor.process(order);
        return CompletableFuture.completedFuture(status);
    }
}
```

**The self-invocation trap:** `@Async` works through AOP proxies. If you call `this.sendWelcomeEmail()` from the same class, the proxy is bypassed — it runs synchronously on the calling thread:

```java
@Service
public class UserService {
    @Autowired private NotificationService notifications;

    // WRONG: direct call from the same bean — proxy is NOT involved
    public void register(User user) {
        save(user);
        this.sendWelcomeEmail(user);  // runs synchronously — BUG
    }

    // RIGHT: inject the proxy-wrapped bean
    public void register(User user) {
        save(user);
        notifications.sendWelcomeEmail(user);  // runs async
    }
}
```

## Configuring the thread pool

```java
@Configuration
@EnableAsync
public class AsyncConfig implements AsyncConfigurer {

    @Override
    public Executor getAsyncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);             // always running threads
        executor.setMaxPoolSize(16);             // max under load
        executor.setQueueCapacity(200);          // queued tasks before rejecting
        executor.setThreadNamePrefix("async-");  // easier debugging
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }

    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        return (ex, method, params) -> {
            log.error("Async method {} failed", method.getName(), ex);
            alertService.alert("Async failure: " + ex.getMessage());
        };
    }
}
```

## Exception handling in @Async

`@Async` exceptions are swallowed by default. You must handle them:

```java
@Service
public class ReportService {

    @Async
    public CompletableFuture<Report> generateReportAsync(ReportRequest request) {
        try {
            Report report = reportGenerator.generate(request);
            return CompletableFuture.completedFuture(report);
        } catch (Exception e) {
            return CompletableFuture.failedFuture(e);
        }
    }
}

// Caller handles the failure
public void handleRequest(ReportRequest request) {
    reportService.generateReportAsync(request)
        .thenAccept(report -> emailService.send(report))  // success
        .exceptionally(ex -> {
            log.error("Report generation failed", ex);
            alertService.notifyAdmin(ex.getMessage());
            return null;
        });
}
```

## Scheduling @Async tasks

```java
@Service
public class CleanupService {

    @Async
    @Scheduled(fixedDelay = 3600000)  // every hour — but @Async and @Scheduled don't combine as you'd expect
    public void cleanupOldSessions() {
        // @Scheduled runs on the scheduler thread
        // @Async runs the body on the async executor
        sessionRepository.deleteOlderThan(Duration.ofDays(30));
    }
}
```

## org scenarios

**Email service:** async email sending so the HTTP response returns immediately:

```java
@Async
public void sendOrderConfirmation(Order order) {
    Email email = EmailBuilder.orderConfirmation(order).build();
    smtpTransport.send(email);
}
// Controller calls this and returns 200 — email sends in background
```

**Audit logging:** non-blocking audit trail writes:

```java
@Async
public void audit(User user, String action, Map<String, Object> details) {
    AuditEvent event = new AuditEvent(user.id(), action, details, Instant.now());
    auditRepository.save(event);
}
```

**Parallel task execution:** combine multiple @Async calls:

```java
CompletableFuture<User> userFuture = userService.getUserAsync(userId);
CompletableFuture<List<Order>> ordersFuture = orderService.getOrdersAsync(userId);
CompletableFuture<Stats> statsFuture = analyticsService.getStatsAsync(userId);

// All three run in parallel — combine when ready
CompletableFuture.allOf(userFuture, ordersFuture, statsFuture).join();

UserProfile profile = new UserProfile(
    userFuture.join(), ordersFuture.join(), statsFuture.join()
);
```

## Key takeaways

- `@Async` runs the method on a thread from the executor — the caller continues immediately.
- The proxy is bypassed for self-invocation — always call `@Async` methods from another bean.
- Configure the thread pool via `AsyncConfigurer` — set core/max sizes, queue capacity, and rejection policy.
- `@Async` exceptions are swallowed — return `CompletableFuture` and handle failures in the caller.
- Use `CallerRunsPolicy` for backpressure — when the pool is full, the caller thread runs the task.
