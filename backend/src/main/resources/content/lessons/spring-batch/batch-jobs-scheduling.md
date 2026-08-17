---
title: Running & Scheduling Batch Jobs
summary: JobLauncher, JobParameters, restart and rerun semantics, running jobs from controllers, and scheduling with cron or a coordinator.
order: 4
minutes: 13
topics: [joblauncher, jobparameters, scheduling, cron, job restart]
docs:
  - https://docs.spring.io/spring-batch/reference/batch-running.html
  - https://docs.spring.io/spring-boot/reference/io/scheduling.html
---

# Running & Scheduling Batch Jobs

## Launch paths

```java
// 1. At startup (default when a Job bean exists)
// 2. On demand, programmatically:
JobExecution ex = jobLauncher.run(job, new JobParametersBuilder()
    .addString("inputFile", "/data/orders-20260817.csv")
    .addLong("runId", System.currentTimeMillis())
    .toJobParameters());

// 3. From a REST endpoint (an "admin trigger"):
@PostMapping("/admin/jobs/statements")
public String runStatements() { ... jobLauncher.run(...); }
```

`spring.batch.job.enabled=false` turns off startup auto-run when jobs must be triggered explicitly (the common production setup). The **`JobLauncher` is async-safe** — wrap in an executor (`TaskExecutor`) so a web request isn't blocked, and guard with a running-instance check so two manual clicks don't launch the same job twice.

## JobParameters: the identity contract

`JobInstance` = `Job` + `JobParameters`. This drives the rerun rules:

```java
// Same params on an already-COMPLETED job → JobInstanceAlreadyCompleteException
// (protects against double-processing the same input!)
jobLauncher.run(job, new JobParametersBuilder().addString("inputFile", path).toJobParameters());

// Legit re-runs change identity: runId / timestamp / file hash
jobLauncher.run(job, new JobParametersBuilder()
    .addString("inputFile", path)
    .addLong("runId", System.currentTimeMillis())   // unique → new JobInstance
    .toJobParameters());
```

Parameters are **typed and logged** by the JobRepository — keep secrets out of them (no passwords in parameters; they're persisted in `BATCH_JOB_EXECUTION_PARAMS`).

## Restart vs. rerun semantics

| Situation | Behavior |
|---|---|
| FAILED job, same params | restartable → resumes from last commit point |
| COMPLETED job, same params | `JobInstanceAlreadyCompleteException` |
| COMPLETED job, different params | runs as a new instance |
| Job with `preventRestart()` | even a failed run cannot restart — manual intervention required |

A step-level `startLimit(n)` caps attempts; `allowStartIfComplete(true)` lets a completed step run again (useful for re-processing just one stage).

## Scheduling options

- **In-app cron** — `@Scheduled(cron = "0 0 2 * * *")` calls the launcher: simplest, but tied to the app's lifecycle and single instance (two replicas = double runs).
- **Coordinator/quartz** — `spring-boot-starter-quartz` with `@DisallowConcurrentExecution` for distributed, persistent schedules.
- **External scheduler** (k8s CronJob, Jenkins, Airflow) — the app exposes the job trigger via REST/CLI; the scheduler owns time and retries. This is the scale-out answer: jobs run where the scheduler says, not inside every replica.

For **distributed locking** (only one replica may run the job), Spring Integration has `JdbcLockRegistry`/`RedisLockRegistry` — the same lock primitive the outbox pattern uses.

## Observability

- `JobExecutionListener.afterJob(jobExecution)` — log duration, item counts, status; alert on `FAILED`.
- `StepExecutionListener` per step — read/write/skip counts.
- Actuator (`spring-boot-starter-actuator`) exposes job metrics; the JobRepository tables let ops query `BATCH_STEP_EXECUTION` directly: "how long did step 2 take last night?"

```java
@Bean
JobExecutionListener metrics() {
    return new JobExecutionListener() {
        public void afterJob(JobExecution je) {
            log.info("job {} status={} read={} written={}",
                je.getJobInstance().getJobName(), je.getStatus(),
                je.getStepExecutions().stream().mapToLong(StepExecution::getReadCount).sum(),
                je.getStepExecutions().stream().mapToLong(StepExecution::getWriteCount).sum());
        }
    };
}
```

## Key takeaways

- Launch via `JobLauncher` + `JobParameters`; disable auto-run and trigger explicitly in production.
- Parameters identify runs — unique param to re-run, and never put secrets in them.
- Failed jobs restart from the last commit point; completed jobs reject identical params.
- `@Scheduled` for single-instance, external scheduler + distributed lock for multi-replica.
- Attach listeners and use Actuator + JobRepository tables for ops visibility.

Official docs: [Running Batch Jobs](https://docs.spring.io/spring-batch/reference/batch-running.html) · [Spring Scheduling](https://docs.spring.io/spring-boot/reference/io/scheduling.html)
