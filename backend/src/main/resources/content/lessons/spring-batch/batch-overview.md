---
title: Spring Batch — Overview & Job Model
summary: Why batch processing exists, the Job → Step → ItemReader/Processor/Writer model, JobRepository metadata and when batch beats request/response.
order: 1
minutes: 14
topics: [spring batch, job, step, jobrepository, batch processing]
docs:
  - https://docs.spring.io/spring-batch/reference/
  - https://docs.spring.io/spring-boot/reference/features/batch.html
---

# Spring Batch — Overview & Job Model

## Why batch processing exists

Some workloads can't (or shouldn't) run in a request: nightly payroll runs, migrating a million records, rebuilding a search index, generating end-of-day statements. These are **offline, data-intensive, repeatable** jobs — and Spring Batch exists to make them reliable, restartable and observable instead of a fragile `for` loop over JDBC.

## The mental model

A **Job** is a sequence of **Steps**; each Step processes data through the classic pipeline:

```
ItemReader ──▶ ItemProcessor ──▶ ItemWriter
   (read one)      (transform)      (write one chunk)
```

- **Job** — the whole run ("monthly statement generation").
- **Step** — one stage; can be *chunk-oriented* (read/process/write) or *tasklet* (single unit of work, e.g. "clean temp dir").
- **JobRepository** — persists job/step state to a database, which is what makes **restartability** possible.

```java
@Configuration
public class StatementJobConfig {

    @Bean
    Job statementJob(JobRepository repo, Step step, JobExecutionListener listener) {
        return new JobBuilder("statementJob", repo)
            .start(step)
            .listener(listener)
            .build();
    }

    @Bean
    Step step(JobRepository repo, PlatformTransactionManager tx,
              ItemReader<Transaction> reader, ItemProcessor<Transaction, Statement> proc,
              ItemWriter<Statement> writer) {
        return new StepBuilder("extract-transform-load", repo)
            .<Transaction, Statement>chunk(1000, tx)   // 1000 items per transaction
            .reader(reader)
            .processor(proc)
            .writer(writer)
            .build();
    }
}
```

`chunk(1000, tx)` is the heart: **1000 items are read, processed, and written inside one database transaction**. A failure mid-chunk rolls back only that chunk, not the whole job.

## Why Spring Batch instead of a loop

| Problem with a naive loop | Spring Batch answer |
|---|---|
| Crashes at record 900k → rerun from scratch | **Restartability** — resumes from the last completed chunk (`JobExecution`/`StepExecution` in the repo) |
| No visibility into progress | `JobExecution` metrics, listeners, Actuator `batch` endpoints |
| No transactional guarantees | chunk-scoped transactions |
| No skip policy | declarative `skip`/`retry` per exception |
| No way to re-run or handle partial failure | `JobParameters` + restart/abort semantics |

The price: batch needs a database for the `JobRepository` (Boot autoconfigures one from your `DataSource` — `BATCH_JOB_INSTANCE`, `BATCH_JOB_EXECUTION` etc. are created automatically).

## The Job lifecycle

```
JobInstance (logical job) → JobExecution (one run) → StepExecution (per step) → Chunk
```

- A **JobInstance** is identified by its `JobParameters` — running "the same job with the same parameters" resumes or is rejected (`JobInstanceAlreadyCompleteException`), which is how you prevent double-processing of the same input file.
- `JobExecution` carries status (`STARTED`, `COMPLETED`, `FAILED`, `STOPPED`), start/end time, and exit status.
- Listeners (`JobExecutionListener`, `StepExecutionListener`, `ItemReadListener`...) hook into every transition — the place for metrics, alerts and cleanup.

## Running a job

Jobs run on `ApplicationRunner` at startup by default (`spring.batch.job.enabled=false` to disable), or on demand — via `JobLauncher.run(job, params)`, from a controller, or scheduled:

```java
JobExecution ex = jobLauncher.run(statementJob,
    new JobParametersBuilder().addLong("runId", System.currentTimeMillis()).toJobParameters());
```

## When NOT to use batch

- Single-record operations (a REST call) — batch is for *volumes*, not convenience.
- Streams that should be incremental — consider Kafka consumers (this curriculum's Spring Kafka module) for event-driven processing.
- If a job must run mid-request and the user waits — offload to a schedule or an outbox.

## Key takeaways

- Job → Steps → chunk (reader/processor/writer) with a transaction per chunk.
- The JobRepository (in your DB) is what buys restartability and observability.
- JobParameters distinguish runs and prevent duplicate processing.
- Use it for offline, repeatable, high-volume work; use events for incremental work.

Official docs: [Spring Batch Reference](https://docs.spring.io/spring-batch/reference/) · [Spring Boot Batch](https://docs.spring.io/spring-boot/reference/features/batch.html)
