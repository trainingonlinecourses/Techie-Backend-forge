---
title: Retry & Skip Policies — Fault Tolerance
summary: Handle transient failures with retry, skip bad records without stopping the batch, and configure exception-based policies for production robustness.
order: 8
minutes: 18
topics: [retry, skip, fault-tolerance, exception-handling, batch-reliability, dead-letter]
docs:
  - https://docs.spring.io/spring-batch/docs/current/reference/html/step.html#retrying
  - https://docs.spring.io/spring-batch/docs/current/reference/html/step.html#skipping
---

# Retry & Skip Policies — Fault Tolerance

## Why Retry and Skip?

In batch processing, things **will** fail:
- A network call to an external service times out
- A database is temporarily unavailable
- One record in 10 million is malformed

**Retry** handles transient failures — try again a few times before giving up.
**Skip** handles bad records — skip the problematic record and continue processing the rest.

---

## Retry Policy

### Basic Retry

```java
@Bean
public Step processStep(JobRepository jobRepository, PlatformTransactionManager txManager) {
    return new StepBuilder("processStep", jobRepository)
        .<InputRecord, OutputRecord>chunk(100, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .faultTolerant()
        .retry(Exception.class)               // Retry on ANY exception
        .retryLimit(3)                         // Try up to 3 times
        .build();
}
```

### Retry Specific Exceptions

```java
@Bean
public Step processStep(JobRepository jobRepository, PlatformTransactionManager txManager) {
    return new StepBuilder("processStep", jobRepository)
        .<InputRecord, OutputRecord>chunk(100, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .faultTolerant()
        .retry(ConnectTimeoutException.class)      // Retry network timeouts
        .retry(DatabaseAccessException.class)       // Retry DB issues
        .retryLimit(5)                              // 5 attempts total
        .build();
}
```

### Custom Retry with Backoff

```java
@Bean
public RetryPolicy retryPolicy() {
    SimpleRetryPolicy policy = new SimpleRetryPolicy();
    policy.setMaxAttempts(5);
    policy.setExceptionsToRetry(Set.of(
        ConnectTimeoutException.class,
        DatabaseAccessException.class
    ));
    return policy;
}

@Bean
public BackOffPolicy backOffPolicy() {
    ExponentialBackOffPolicy policy = new ExponentialBackOffPolicy();
    policy.setInitialInterval(1000L);    // Start with 1 second
    policy.setMultiplier(2.0);           // Double each time
    policy.setMaxInterval(30000L);       // Cap at 30 seconds
    return policy;
}

@Bean
public Step processStep(JobRepository jobRepository, PlatformTransactionManager txManager) {
    return new StepBuilder("processStep", jobRepository)
        .<InputRecord, OutputRecord>chunk(100, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .faultTolerant()
        .retryPolicy(retryPolicy())
        .backOffPolicy(backOffPolicy())
        .build();
}
```

---

## Skip Policy

### Basic Skip

```java
@Bean
public Step processStep(JobRepository jobRepository, PlatformTransactionManager txManager) {
    return new StepBuilder("processStep", jobRepository)
        .<InputRecord, OutputRecord>chunk(100, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .faultTolerant()
        .skip(Exception.class)               // Skip on ANY exception
        .skipLimit(50)                        // Skip up to 50 records
        .build();
}
```

### Skip Specific Exceptions

```java
@Bean
public Step processStep(JobRepository jobRepository, PlatformTransactionManager txManager) {
    return new StepBuilder("processStep", jobRepository)
        .<InputRecord, OutputRecord>chunk(100, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .faultTolerant()
        .skip(ValidationException.class)          // Skip validation errors
        .skip(DatabaseAccessException.class)      // Skip DB errors
        .noSkip(FileNotFoundException.class)      // NEVER skip file not found
        .skipLimit(100)                            // Allow up to 100 skips
        .build();
}
```

### Skip Listener (Log Skipped Records)

```java
@Component
public class SkipLogger implements SkipListener<InputRecord, OutputRecord> {

    private static final Logger log = LoggerFactory.getLogger(SkipLogger.class);
    private final JdbcTemplate jdbc;

    @Override
    public void onSkipInRead(Throwable t) {
        log.warn("Skipping record in READ: {}", t.getMessage());
    }

    @Override
    public void onSkipInProcess(InputRecord item, Throwable t) {
        log.warn("Skipping record in PROCESS: id={}, error={}", item.getId(), t.getMessage());
        // Save to dead letter table for later review
        jdbc.update(
            "INSERT INTO dead_letter (record_id, error_message, failed_at) VALUES (?, ?, ?)",
            item.getId(), t.getMessage(), LocalDateTime.now()
        );
    }

    @Override
    public void onSkipInWrite(OutputRecord item, Throwable t) {
        log.warn("Skipping record in WRITE: id={}, error={}", item.getId(), t.getMessage());
    }
}
```

---

## Combined Retry + Skip

```java
@Bean
public Step robustStep(JobRepository jobRepository, PlatformTransactionManager txManager) {
    return new StepBuilder("robustStep", jobRepository)
        .<InputRecord, OutputRecord>chunk(100, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .faultTolerant()
        // Retry network/DB errors 3 times with exponential backoff
        .retry(ConnectTimeoutException.class)
        .retry(DatabaseAccessException.class)
        .retryLimit(3)
        .backOffPolicy(exponentialBackOffPolicy())
        // After 3 retries exhausted, skip validation errors
        .skip(ValidationException.class)
        .skip(MalformedRecordException.class)
        .skipLimit(50)
        // NEVER skip critical errors
        .noSkip(DatabaseCorruptionException.class)
        .listener(skipLogger())
        .build();
}
```

---

## In an Organization

### Scenario 1: API Integration with Rate Limits

```java
@Component
public class ExternalApiProcessor implements ItemProcessor<Order, ProcessedOrder> {

    private final ExternalApiClient apiClient;
    private final MeterRegistry metrics;

    @Override
    public ProcessedOrder process(Order order) throws Exception {
        // This may throw ConnectTimeoutException or RateLimitException
        // Retry policy handles retries, skip policy handles permanent failures
        ApiResult result = apiClient.submitOrder(order);

        metrics.counter("api.success").increment();
        return new ProcessedOrder(order, result.getTransactionId());
    }
}
```

### Scenario 2: File Import with Bad Records

```java
@Component
public class CsvImportProcessor implements ItemProcessor<String, Customer> {

    private final CustomerValidator validator;

    @Override
    public Customer process(String line) throws Exception {
        try {
            String[] fields = line.split(",");
            Customer customer = new Customer(
                fields[0],           // name
                fields[1],           // email
                Integer.parseInt(fields[2])  // age
            );

            validator.validate(customer);  // Throws ValidationException if invalid
            return customer;

        } catch (ArrayIndexOutOfBoundsException e) {
            throw new MalformedRecordException("Missing fields: " + line, e);
        }
    }
}
```

### Scenario 3: Database Write with Dead Letter

```java
@Component
public class OrderWriter implements ItemWriter<ProcessedOrder> {

    private final JdbcTemplate jdbc;
    private final DeadLetterService deadLetterService;

    @Override
    public void write(Chunk<? extends ProcessedOrder> chunk) {
        for (ProcessedOrder order : chunk.getItems()) {
            try {
                jdbc.update(
                    "INSERT INTO processed_orders (order_id, transaction_id) VALUES (?, ?)",
                    order.getOrderId(), order.getTransactionId());
            } catch (DataIntegrityViolationException e) {
                // Duplicate order — send to dead letter for review
                deadLetterService.sendToDeadLetter(order, "Duplicate order ID");
                log.warn("Order {} already exists — sent to dead letter", order.getOrderId());
            }
        }
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Retrying non-transient exceptions | Infinite retry loops | Only retry network/DB timeouts |
| Skipping without logging | Lost data with no trace | Always use SkipListener |
| Skip limit too high | Hides systemic problems | Set reasonable limits, alert on high skip counts |
| No dead letter queue | Skipped records lost forever | Save skipped records for later review |
| Retrying in writer without transaction | Partial writes | Ensure writer handles transactions properly |
| Not testing fault tolerance | Failures only found in production | Test with fault injection |
