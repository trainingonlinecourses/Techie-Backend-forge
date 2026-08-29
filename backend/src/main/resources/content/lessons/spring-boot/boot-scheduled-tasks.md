---
title: Scheduled Tasks — @Scheduled, @Async, and Task Schedulers
summary: Cron expressions, fixed-rate vs fixed-delay, task scheduler configuration, distributed scheduling with ShedLock, thread pool sizing, and how organizations run background jobs without duplication.
order: 40
minutes: 20
topics: [scheduled, cron, fixed-rate, fixed-delay, task-scheduler, shedlock, async, thread-pool, distributed-lock]
docs:
  - https://docs.spring.io/spring-framework/reference/integration/scheduling.html
  - https://docs.spring.io/spring-boot/docs/current/reference/html/features.html#features.task-scheduling
---

# Scheduled Tasks — @Scheduled, @Async, and Task Schedulers

## The concept

Spring's `@Scheduled` annotation runs methods on a timer. Behind the scenes, a `TaskScheduler` thread pool executes the tasks. You configure timing with `cron` expressions, `fixedRate`, or `fixedDelay`.

**The production pitfall:** when you deploy 3 pods to Kubernetes, all 3 run the same `@Scheduled` method — triple execution. You need distributed locking (e.g., ShedLock) to prevent this.

## Configuration

```java
@Configuration
@EnableScheduling
@EnableAsync
public class SchedulingConfig implements SchedulingConfigurer {

    @Override
    public void configureSchedulers(TaskSchedulerRegistrar registrar) {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(4);
        scheduler.setThreadNamePrefix("scheduled-");
        scheduler.setErrorHandler(t -> log.error("Scheduled task failed", t));
        scheduler.setWaitForTasksToCompleteOnShutdown(true);
        scheduler.setAwaitTerminationSeconds(30);
        scheduler.initialize();
        registrar.setTaskScheduler(scheduler);
    }

    @Bean
    public TaskScheduler taskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(10);
        scheduler.setThreadNamePrefix("task-");
        return scheduler;
    }
}
```

## @Scheduled timing strategies

```java
@Component
public class ScheduledTasks {

    // Run every 5 seconds — timer starts after previous completion
    @Scheduled(fixedDelay = 5000)
    public void pollForUpdates() {
        List<Event> events = eventQueue.drain(100);
        events.forEach(this::processEvent);
    }

    // Run every 10 seconds — timer starts at fixed intervals regardless of completion
    @Scheduled(fixedRate = 10000)
    public void healthCheck() {
        externalService.ping();
    }

    // Run at 2 AM every day
    @Scheduled(cron = "0 0 2 * * ?")
    public void dailyReport() {
        Report report = reportService.generate();
        emailService.send(report);
    }

    // Run every Monday at 9 AM
    @Scheduled(cron = "0 0 9 ? * MON")
    public void weeklyDigest() {
        List<User> subscribers = userService.findAllSubscribed();
        subscribers.forEach(user -> emailService.sendDigest(user));
    }

    // Initial delay: wait 30 seconds after startup, then run every minute
    @Scheduled(initialDelay = 30000, fixedRate = 60000)
    public void cacheWarmer() {
        productCatalog.refreshCache();
    }
}
```

**fixedRate vs fixedDelay:**
- `fixedRate`: if the task takes 8 seconds and interval is 5 seconds, the next task starts immediately (overlap possible).
- `fixedDelay`: if the task takes 8 seconds and delay is 5 seconds, the next task starts 5 seconds after the previous finishes (no overlap).

## Cron expression syntax

```
┌─────────── second (0-59)
│ ┌─────────── minute (0-59)
│ │ ┌─────────── hour (0-23)
│ │ │ ┌─────────── day-of-month (1-31)
│ │ │ │ ┌─────────── month (1-12)
│ │ │ │ │ ┌─────────── day-of-week (1-7, SUN=1)
│ │ │ │ │ │
* * * * * *
```

```java
@Scheduled(cron = "0 30 8 * * MON-FRI")   // 8:30 AM weekdays
@Scheduled(cron = "0 0 */2 * * ?")         // every 2 hours
@Scheduled(cron = "0 0 0 1 * ?")           // first day of month
@Scheduled(cron = "0 * * * * ?")           // every minute
```

## Distributed scheduling with ShedLock

```xml
<dependency>
    <groupId>net.javacrumbs.shedlock</groupId>
    <artifactId>shedlock-spring</artifactId>
    <version>5.16.0</version>
</dependency>
<dependency>
    <groupId>net.javacrumbs.shedlock</groupId>
    <artifactId>shedlock-provider-jdbc-template</artifactId>
    <version>5.16.0</version>
</dependency>
```

```java
@Scheduled(cron = "0 0 2 * * ?")
@SchedulerLock(name = "dailyReport",
    lockAtLeastFor = "PT5M",       // minimum lock duration
    lockAtMostFor = "PT30M")       // maximum lock duration
public void dailyReport() {
    // Only one pod executes this — ShedLock ensures mutual exclusion
    Report report = reportService.generate();
    emailService.send(report);
}
```

ShedLock uses a database table (`shedlock`) to coordinate. When pod A acquires the lock, pod B sees it's already locked and skips.

## @Async for parallel execution

```java
@Component
public class AsyncTasks {

    @Async("taskExecutor")
    public CompletableFuture<Result> processAsync(Data data) {
        Result result = heavyComputation(data);
        return CompletableFuture.completedFuture(result);
    }

    @Async("taskExecutor")
    public void sendEmailAsync(EmailRequest request) {
        emailService.send(request);
    }
}

@Bean("taskExecutor")
public Executor taskExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(4);
    executor.setMaxPoolSize(8);
    executor.setQueueCapacity(100);
    executor.setThreadNamePrefix("async-");
    executor.initialize();
    return executor;
}
```

## How we use it in organizations

### Scenario 1: cache refresh every 5 minutes

```java
@Component
@Primary
public class CacheRefreshScheduler {

    private final ProductCatalog catalog;

    @Scheduled(fixedRate = 300000)  // every 5 minutes
    @SchedulerLock(name = "cacheRefresh", lockAtMostFor = "PT4M")
    public void refreshCatalog() {
        log.info("Refreshing product catalog cache...");
        catalog.refresh();
        log.info("Cache refreshed: {} products", catalog.size());
    }
}
```

### Scenario 2: retry failed jobs every 30 minutes

```java
@Component
public class FailedJobRetryScheduler {

    @Scheduled(fixedRate = 1800000)  // every 30 minutes
    @SchedulerLock(name = "retryFailedJobs", lockAtMostFor = "PT25M")
    public void retryFailedJobs() {
        List<FailedJob> failedJobs = jobRepository.findRetryable(LocalDateTime.now().minusHours(1));

        for (FailedJob job : failedJobs) {
            try {
                jobProcessor.process(job);
                jobRepository.markSuccess(job.id());
            } catch (Exception e) {
                jobRepository.incrementRetryCount(job.id());
            }
        }
    }
}
```

### Scenario 3: database cleanup

```java
@Component
public class CleanupScheduler {

    @Scheduled(cron = "0 0 3 * * ?")  // 3 AM daily
    @SchedulerLock(name = "cleanupExpiredSessions", lockAtMostFor = "PT1H")
    public void cleanupExpiredSessions() {
        int deleted = sessionRepository.deleteExpiredBefore(LocalDateTime.now().minusDays(30));
        log.info("Cleaned up {} expired sessions", deleted);
    }
}
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| No distributed lock in multi-pod deploy | Same job runs N times |
| `fixedRate` with overlapping tasks | Thread pool exhaustion |
| Cron expression timezone wrong | Jobs run at wrong time |
| No error handling in scheduled tasks | One failure stops the scheduler thread |
| Doing I/O in scheduler thread pool | Blocks other scheduled tasks |
| Forgetting `@EnableScheduling` | `@Scheduled` silently ignored |
