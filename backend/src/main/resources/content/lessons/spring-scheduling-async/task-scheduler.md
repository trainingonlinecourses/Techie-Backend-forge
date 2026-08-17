---
title: The TaskScheduler Abstraction
module: spring-scheduling-async
order: 3
minutes: 18
topics: ["TaskScheduler", "ScheduledFuture", "Trigger", "programmatic scheduling", "periodic tasks"]
docs:
  - title: "TaskScheduler"
    url: "https://docs.spring.io/spring-framework/reference/integration/scheduling.html#scheduling-task-scheduler"
---

# The TaskScheduler Abstraction

`@Scheduled` is declarative — the schedule is baked into the method at compile time. But real systems sometimes need **dynamic** scheduling: schedules read from a database, tasks triggered at runtime, or rescheduling on the fly. That's what `TaskScheduler` and `Trigger` are for.

## TaskScheduler Interface

The `TaskScheduler` interface (implemented by `ThreadPoolTaskScheduler`) offers four families of methods:

```java
public interface TaskScheduler {

    ScheduledFuture<?> schedule(Runnable task, Trigger trigger);
    ScheduledFuture<?> schedule(Runnable task, Instant startTime);
    ScheduledFuture<?> scheduleAtFixedRate(Runnable task, Duration period);
    ScheduledFuture<?> scheduleWithFixedDelay(Runnable task, Duration delay);
}
```

The return value is a `ScheduledFuture` — cancel it to stop the task, or check `isDone()` to see if it terminated.

## Programmatic Fixed-Rate Scheduling

```java
@Service
public class DynamicJobService {

    private final TaskScheduler taskScheduler;
    private final Map<String, ScheduledFuture<?>> jobs = new ConcurrentHashMap<>();

    public DynamicJobService(TaskScheduler taskScheduler) {
        this.taskScheduler = taskScheduler;
    }

    public void startJob(String jobId, Runnable job, Duration interval) {
        ScheduledFuture<?> future = taskScheduler.scheduleAtFixedRate(job, interval);
        jobs.put(jobId, future);
    }

    public void stopJob(String jobId) {
        ScheduledFuture<?> future = jobs.remove(jobId);
        if (future != null) future.cancel(false);
    }

    public boolean isRunning(String jobId) {
        ScheduledFuture<?> future = jobs.get(jobId);
        return future != null && !future.isCancelled();
    }
}
```

This enables a management API:

```java
@RestController
@RequestMapping("/api/jobs")
public class JobController {

    private final DynamicJobService jobs;

    @PostMapping("/{id}/start")
    public void start(@PathVariable String id,
                      @RequestParam long intervalMs,
                      @RequestBody Runnable job) {
        jobs.startJob(id, job, Duration.ofMillis(intervalMs));
    }

    @DeleteMapping("/{id}")
    public void stop(@PathVariable String id) {
        jobs.stopJob(id);
    }
}
```

## Triggers: Schedules as Objects

A `Trigger` computes the *next* execution time from the current one. Spring ships two implementations:

### CronTrigger

```java
Trigger trigger = new CronTrigger("0 0/5 * * * *");   // every 5 min
ScheduledFuture<?> future = taskScheduler.schedule(task, trigger);
```

### PeriodicTrigger

```java
PeriodicTrigger trigger = new PeriodicTrigger(Duration.ofSeconds(30));
trigger.setFixedRate(true);            // default is fixed-delay

// Or with an initial delay
PeriodicTrigger trigger2 = new PeriodicTrigger(10_000, TimeUnit.MILLISECONDS);
```

### Custom Trigger

The interface is trivial — this one skips weekends:

```java
public class WeekdayTrigger implements Trigger {

    private final CronTrigger delegate = new CronTrigger("0 0 3 * * *");

    @Override
    public Instant nextExecution(TriggerContext triggerContext) {
        Instant next = delegate.nextExecution(triggerContext);
        while (isWeekend(next)) {
            // advance by one day and re-query
            next = delegate.nextExecution(
                new SimpleTriggerContext(null, next, null));
        }
        return next;
    }

    private boolean isWeekend(Instant instant) {
        DayOfWeek dow = instant.atZone(ZoneId.systemDefault()).getDayOfWeek();
        return dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY;
    }
}
```

## TriggerContext: What the Scheduler Remembers

The `TriggerContext` passed to `nextExecution` carries the last scheduled time, last actual start time, and last completion time — so a trigger can implement **missed-run compensation** (e.g., if the app slept through a run, run immediately on wake):

```java
public class CatchUpTrigger implements Trigger {

    @Override
    public Instant nextExecution(TriggerContext ctx) {
        Instant lastCompletion = ctx.lastCompletion();
        if (lastCompletion == null) return Instant.now();   // never ran
        // if the last run finished more than 1h ago, run now
        if (Duration.between(lastCompletion, Instant.now()).toMinutes() > 60) {
            return Instant.now();
        }
        return lastCompletion.plus(Duration.ofMinutes(5));
    }
}
```

## Scheduling From a Database

Combining `TaskScheduler` with a repository turns schedules into data:

```java
@Service
public class DatabaseDrivenScheduler {

    private final JobRepository jobs;
    private final TaskScheduler scheduler;
    private final Map<Long, ScheduledFuture<?>> running = new ConcurrentHashMap<>();

    @PostConstruct
    public void loadAllJobs() {
        jobs.findAllActive().forEach(job -> schedule(job));
    }

    public void schedule(ScheduledJob job) {
        ScheduledFuture<?> future = scheduler.schedule(
            () -> jobExecutor.execute(job),
            new CronTrigger(job.getCronExpression()));
        running.put(job.getId(), future);
    }

    public void reschedule(Long jobId, String newCron) {
        ScheduledFuture<?> old = running.remove(jobId);
        if (old != null) old.cancel(false);
        ScheduledJob job = jobs.findById(jobId).orElseThrow();
        job.setCronExpression(newCron);
        jobs.save(job);
        schedule(job);
    }
}
```

## Shutdown Behavior

`ThreadPoolTaskScheduler` integrates with Spring's lifecycle. Configure graceful shutdown:

```java
ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
scheduler.setWaitForTasksToCompleteOnShutdown(true);
scheduler.setAwaitTerminationSeconds(30);
scheduler.setPoolSize(4);
scheduler.setRemoveOnCancelPolicy(true);
```

`removeOnCancelPolicy(true)` is a small but real optimization: cancelled tasks are removed from the internal queue immediately, freeing memory for long-lived schedules.

## Summary

| API | Use for |
|-----|---------|
| `scheduleAtFixedRate` | Fixed start-to-start cadence, dynamic |
| `scheduleWithFixedDelay` | Non-overlapping runs, dynamic |
| `schedule(task, trigger)` | Calendar-aware or custom schedules |
| `CronTrigger` | Six-field cron as an object |
| `PeriodicTrigger` | Programmatic rate/delay with initial delay |
| `ScheduledFuture` | Cancel, check status, await completion |

`TaskScheduler` is the programmatic counterpart to `@Scheduled` — when schedules are data, not annotations, this abstraction is what keeps your application flexible and your scheduling logic testable.
