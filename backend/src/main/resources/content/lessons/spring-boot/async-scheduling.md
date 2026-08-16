---
title: @Async, @Scheduled & Background Work
summary: Running work off the request thread, scheduled jobs, and the pitfalls (proxy, executor tuning, missed runs).
order: 9
minutes: 14
topics: [async, scheduled, task-executor, background-jobs]
docs:
  - https://docs.spring.io/spring-framework/reference/integration/scheduling.html
---

# @Async, @Scheduled & Background Work

## @Async: offload work from the request thread

```java
@Configuration
@EnableAsync
public class AsyncConfig {

    @Bean("taskExecutor")
    public Executor taskExecutor() {
        ThreadPoolTaskExecutor exec = new ThreadPoolTaskExecutor();
        exec.setCorePoolSize(8);
        exec.setMaxPoolSize(32);
        exec.setQueueCapacity(200);
        exec.setThreadNamePrefix("async-");
        exec.initialize();
        return exec;
    }
}
```

```java
@Service
public class NotificationService {
    @Async("taskExecutor")
    public void sendWelcome(String email) {
        // runs on the async executor — caller returns immediately
    }
}
```

**The trap**: `@Async` works through the proxy — calling `this.sendWelcome(...)` from inside the same bean silently runs synchronously. Inject the bean (or use `ApplicationContext.getBean`) to go through the proxy (same story as `@Transactional`).

## @Scheduled: cron and fixed-rate jobs

```java
@Configuration
@EnableScheduling
public class SchedulingConfig {}

@Component
public class OutboxRelay {

    @Scheduled(fixedDelayString = "${app.outbox.interval-ms:5000}")
    public void relayOutbox() {
        // fixedDelay: runs after the PREVIOUS run finishes (no overlap)
    }

    @Scheduled(cron = "0 15 3 * * *")          // daily at 03:15 server time
    public void dailyReconciliation() { ... }
}
```

| Mode | Meaning |
|---|---|
| `fixedDelay` | Wait X after each run finishes — **no overlap** |
| `fixedRate` | Start every X ms regardless — overlaps if slow |
| `cron` | Calendar-based |

## Rules that keep background work safe

1. **Jobs must be idempotent** — a retried run must not double-charge/double-send. Use an outbox table + status column.
2. **Handle failures loudly** — log + alert; a silent `catch (Exception e) {}` in a job is how data goes missing.
3. **Don't run jobs on multiple instances** — use a lock (DB row lock, `ShedLock`, k8s leader election) or a dedicated job service.
4. **Bound the work** — rate-limit external calls, batch in sizes, and make jobs resumable (offset/checkpoint).
5. **Timezones matter** — cron uses the server's zone; pin `zone` explicitly if the business rule needs it.

## Outbox pattern (the production answer)

```java
@Transactional
public void createOrder(Order order) {
    orders.save(order);
    outbox.save(new OutboxEvent("order.created", order.getId()));  // same transaction
}
// OutboxRelay publishes committed events to the broker and marks them sent.
```

This is how you get "exactly-once-ish" side effects: write the side effect as data in the same transaction, then a job/broker consumer delivers it.

> **Why it matters (organizational view)** — Background work is where production data gets silently corrupted: overlapping cron runs, half-finished batch jobs, async calls that swallow errors. Org standards: idempotent jobs with checkpoints, outbox for event-emitting writes, ShedLock/locks for single-run guarantees, and alerts on every failed job.

## Key takeaways

- `@EnableAsync`/`@EnableScheduling` once; use proxies (no self-calls).
- `fixedDelay` over `fixedRate` unless you need overlap.
- Idempotency + loud failures + single-run guarantees.
- Outbox pattern: side effects as data in the same transaction.

**Official docs:** [Scheduling & async](https://docs.spring.io/spring-framework/reference/integration/scheduling.html)
