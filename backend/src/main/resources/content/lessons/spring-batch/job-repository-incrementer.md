---
title: Job Repository & Incrementer — Tracking Batch State
summary: How Spring Batch tracks job execution, job parameters, restart ability, and using incrementers to run jobs with evolving parameters.
order: 9
minutes: 16
topics: [job-repository, job-execution, restart, incrementer, batch-metadata, job-parameters]
docs:
  - https://docs.spring.io/spring-batch/docs/current/reference/html/job.html
  - https://docs.spring.io/spring-batch/docs/current/reference/html/job.html#jobincrementer
---

# Job Repository & Incrementer — Tracking Batch State

## What Is the Job Repository?

The **Job Repository** is where Spring Batch stores **metadata** about every job execution. It tracks:
- When jobs started and finished
- Which parameters were used
- How many records were read/written/failed
- Whether a job succeeded or failed
- Whether a failed job can be restarted

**Think of it like**: a flight recorder for your batch jobs — it remembers everything that happened.

---

## Job Execution Flow

```
Job Instance (definition) → Job Execution (run) → Step Execution (unit of work)
```

1. **Job Instance**: The "template" — `processOrders job with date=2024-01-15`
2. **Job Execution**: One specific run — `started at 2am, finished at 3am, SUCCESS`
3. **Step Execution**: Each step's result — `read 1000, wrote 999, skipped 1`

---

## Job Parameters

```java
// Parameters define WHAT to process
JobParameters params = new JobParametersBuilder()
    .addString("input.file", "/data/orders-2024-01-15.csv")
    .addDate("process.date", LocalDate.now())
    .addLong("run.id", System.currentTimeMillis())  // Unique run identifier
    .toJobParameters();

// Launch the job
JobExecution execution = jobLauncher.run(processOrdersJob, params);
```

### Parameter Types

```java
JobParameters params = new JobParametersBuilder()
    .addString("environment", "production")        // String
    .addDate("reportDate", LocalDate.now())        // Date
    .addLong("batchSize", 1000L)                   // Long
    .addDouble("threshold", 0.95)                  // Double
    .addString("region", "us-east-1")              // String
    .toJobParameters();
```

---

## Incrementers

**Problem**: If you run the same job with the same parameters, Spring Batch says "this job already ran" and refuses to start it again. But sometimes you WANT to run the same job multiple times with different parameters (e.g., daily reports).

**Solution**: An **incrementer** automatically modifies parameters to make each run unique.

### RunIdIncrementer (Most Common)

```java
@Bean
public Job processOrdersJob(JobRepository jobRepository, Step processStep) {
    return new JobBuilder("processOrders", jobRepository)
        .start(processStep)
        .incrementer(new RunIdIncrementer())  // Adds unique run.id parameter
        .build();
}
```

Each run gets a different `run.id`:
```
Run 1: {input.file: "orders.csv", run.id: 1}
Run 2: {input.file: "orders.csv", run.id: 2}
Run 3: {input.file: "orders.csv", run.id: 3}
```

### Custom Incrementer

```java
@Component
public class DailyDateIncrementer implements JobParametersIncrementer {

    @Override
    public JobParameters getNext(JobParameters parameters) {
        LocalDate today = LocalDate.now();

        return new JobParametersBuilder()
            .addDate("processDate", today)
            .addLong("run.id", System.currentTimeMillis())
            .toJobParameters();
    }
}
```

---

## Restart Capability

```java
// If a job fails, you can restart it from where it stopped
JobExecution lastExecution = jobRepository.getLastJobExecution(
    jobInstance, jobParameters);

if (lastExecution != null && lastExecution.getStatus() == BatchStatus.FAILED) {
    // Spring Batch remembers which items were processed
    // It will restart from the last successful chunk
    jobLauncher.run(failedJob, jobParameters);
}
```

### Controlling Restart

```java
@Bean
public Step processStep(JobRepository jobRepository, PlatformTransactionManager txManager) {
    return new StepBuilder("processStep", jobRepository)
        .<Order, ProcessedOrder>chunk(100, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .allowStartIfComplete(false)  // Don't restart completed steps
        .startLimit(3)                 // Max 3 attempts total
        .build();
}
```

---

## In an Organization

### Scenario 1: Daily Report Job

```java
@Component
public class DailyReportJobConfig {

    @Bean
    public Job dailyReportJob(JobRepository jobRepository, Step reportStep) {
        return new JobBuilder("dailyReport", jobRepository)
            .start(reportStep)
            .incrementer(new RunIdIncrementer())  // Allow re-runs
            .preventRestart()                     // Don't restart failed reports
            .build();
    }

    @Bean
    public Step reportStep(JobRepository jobRepository, PlatformTransactionManager txManager) {
        return new StepBuilder("reportStep", jobRepository)
            .<SalesData, Report>chunk(500, txManager)
            .reader(salesDataReader())
            .processor(reportProcessor())
            .writer(reportWriter())
            .build();
    }
}
```

### Scenario 2: Restartable Data Migration

```java
@Component
public class DataMigrationConfig {

    @Bean
    public Job migrationJob(JobRepository jobRepository, Step migrateStep) {
        return new JobBuilder("dataMigration", jobRepository)
            .start(migrateStep)
            .incrementer(new RunIdIncrementer())
            .build();  // Can restart if it fails mid-migration
    }

    @Bean
    public Step migrateStep(JobRepository jobRepository, PlatformTransactionManager txManager) {
        return new StepBuilder("migrateStep", jobRepository)
            .<LegacyUser, ModernUser>chunk(200, txManager)
            .reader(legacyUserReader())
            .processor(userConverter())
            .writer(modernUserWriter())
            .faultTolerant()
            .retry(DatabaseAccessException.class)
            .skip(MigrationException.class)
            .skipLimit(100)
            .startLimit(5)  // Allow up to 5 restart attempts
            .build();
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Not using incrementer | Can't re-run same job | Use `RunIdIncrementer` for repeatable jobs |
| Restarting completed jobs | Unintended duplicate processing | Check `BatchStatus` before restarting |
| Missing `startLimit` | Infinite restart attempts | Set reasonable `startLimit` |
| Not checking job status | Can't tell if job succeeded | Query `JobRepository` for execution status |
| Using same parameters for different jobs | Confusing job instances | Use incrementer to differentiate runs |
| Not monitoring job repository | Can't debug failures | Query metadata tables for execution history |
