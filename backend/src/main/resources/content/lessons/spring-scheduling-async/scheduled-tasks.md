---
title: Scheduled Tasks with @Scheduled
module: spring-scheduling-async
order: 1
minutes: 20
topics: ["@Scheduled", "fixedDelay", "cron", "TaskScheduler", "thread pools"]
docs:
  - title: "Task Execution and Scheduling"
    url: "https://docs.spring.io/spring-framework/reference/integration/scheduling.html"
summary: Scheduling is how Spring applications run logic at fixed intervals, after fixed delays, or at cronaligned times. The @Scheduled annotation turns an...
---

# Scheduled Tasks with @Scheduled

Scheduling is how Spring applications run logic at fixed intervals, after fixed delays, or at cron-aligned times. The `@Scheduled` annotation turns any bean method into a scheduled task with a single line of configuration.

## Enabling Scheduling

Scheduling is opt-in. Annotate any configuration class with `@EnableScheduling`:

```java
@Configuration
@EnableScheduling
public class SchedulerConfig {
}
```

Once enabled, every `@Scheduled` method in the context becomes a task. Spring Boot applications can also set `spring.task.scheduling.enabled=true` (the default) — disabling it is useful in tests to prevent background work from running during test suites.

## The Three Scheduling Modes

### fixedRate

Runs at a fixed interval measured from the **start** of the previous invocation. If the task takes longer than the rate, executions queue up (single-threaded by default) or overlap (with a pool).

```java
@Service
public class HeartbeatTask {

    @Scheduled(fixedRate = 30_000)  // every 30s, measured start-to-start
    public void sendHeartbeat() {
        monitoringClient.ping();
    }
}
```

### fixedDelay

Runs after a fixed delay measured from the **completion** of the previous invocation. This guarantees no overlap: the next run starts `fixedDelay` ms after the previous one finishes.

```java
@Scheduled(fixedDelay = 10_000)
public void reconcileLedger() {
    // long-running job — next run waits until this completes + 10s
    billingService.reconcile();
}
```

### cron

Runs at calendar-aligned times using a six-field cron expression: `second minute hour day-of-month month day-of-week`. Spring adds the leading seconds field (Unix cron has five).

```java
@Scheduled(cron = "0 0 3 * * MON-FRI")   // 3:00 AM, weekdays
public void nightlyReport() { ... }

@Scheduled(cron = "0 */15 * * * *")      // every 15 minutes
public void refreshCache() { ... }

@Scheduled(cron = "0 0 9 ? * MON")       // every Monday 9 AM
public void weeklyDigest() { ... }
```

The `?` means "no specific value" — required when both day-of-month and day-of-week would conflict. `L` (last), `W` (nearest weekday), and `#` (nth weekday) are also supported.

## Initial Delay

All three modes accept `initialDelay` (and `initialDelayString` for property-driven config):

```java
@Scheduled(fixedDelay = 60_000, initialDelay = 15_000)
public void warmUpThenRun() { ... }
```

This is vital when the scheduled method depends on resources (caches, connections) that take time to initialize at startup.

## Properties From Configuration

Hard-coding intervals is inflexible. Pull values from `application.yml` with SpEL:

```java
@Scheduled(fixedDelayString = "${app.jobs.reconcile-delay-ms}")
public void reconcile() { ... }

@Scheduled(cron = "${app.jobs.nightly-cron}")
public void nightly() { ... }
```

```yaml
app:
  jobs:
    reconcile-delay-ms: 30000
    nightly-cron: "0 0 3 * * *"
```

## How Scheduling Works Under the Hood

`@EnableScheduling` registers a `ScheduledAnnotationBeanPostProcessor`. At startup it scans all beans for `@Scheduled` methods, wraps each in a `ScheduledTask`, and registers it with a `TaskScheduler`. The default scheduler is a single-threaded `ThreadPoolTaskScheduler` with a pool size of 1.

**This is the #1 production surprise**: with the default single thread, one slow task blocks every other scheduled task in the application. If you have three `@Scheduled` methods and one takes 5 minutes, the other two don't run until it finishes.

### Configuring a Proper Pool

```java
@Configuration
@EnableScheduling
public class SchedulerConfig {

    @Bean
    public TaskScheduler taskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(4);
        scheduler.setThreadNamePrefix("sched-");
        scheduler.setWaitForTasksToCompleteOnShutdown(true);
        scheduler.setAwaitTerminationSeconds(30);
        return scheduler;
    }
}
```

Or purely with properties:

```yaml
spring:
  task:
    scheduling:
      pool:
        size: 4
      thread-name-prefix: "sched-"
      shutdown:
        await-termination: true
        await-termination-period: 30s
```

`await-termination` matters in production: without it, the JVM may kill in-flight scheduled work during a graceful shutdown, losing the tail of a long job.

## Conditional Scheduling

Don't run a job in every environment:

```java
@Scheduled(fixedDelayString = "${app.jobs.cache-refresh-ms}")
@ConditionalOnProperty(name = "app.jobs.cache-refresh-enabled", havingValue = "true")
public void refreshCache() { ... }
```

In tests, either flip the property off or disable scheduling entirely with `@SpringBootTest(properties = "spring.task.scheduling.enabled=false")`.

## Common Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| Single-threaded default | Tasks queue behind slow jobs | Configure pool size > 1 |
| Long tasks with `fixedRate` | Backlog builds up | Use `fixedDelay` or reject policy |
| `fixedRate` overlapping runs | Concurrent mutation | Add `@Lock` or use `fixedDelay` |
| Cron on seconds field only | Tasks fire at wrong time | Remember Spring's 6-field format |
| Schedule in a cluster | Every node runs the job | Distributed lock (see lesson 5) |
| Method not public | Never invoked | Keep methods package-private/public |

## Practical Example: Health-Check Scheduler

```java
@Service
public class DependencyHealthTask {

    private final List<DependencyProbe> probes;
    private final HealthStore store;

    public DependencyHealthTask(List<DependencyProbe> probes, HealthStore store) {
        this.probes = probes;
        this.store = store;
    }

    @Scheduled(fixedDelay = 45_000, initialDelay = 10_000)
    public void probeAllDependencies() {
        for (DependencyProbe probe : probes) {
            try {
                boolean healthy = probe.check();
                store.record(probe.name(), healthy, Instant.now());
            } catch (Exception e) {
                store.record(probe.name(), false, Instant.now());
            }
        }
    }
}
```

## Summary

`@Scheduled` gives you three timing models — `fixedRate` (start-to-start), `fixedDelay` (finish-to-start, no overlap), and `cron` (calendar-aligned). The defaults are deliberately minimal; production systems must configure a thread pool, use property-driven intervals, handle graceful shutdown, and coordinate across cluster nodes. That last concern — distributed scheduling — is covered in depth in the final lesson of this module.
