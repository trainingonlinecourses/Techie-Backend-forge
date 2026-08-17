---
title: Error Handling — Skip, Retry & Rollback
summary: Making batch jobs resilient — skip policies for bad records, retry with backoff for transient failures, rollback rules, and writing to a failure log.
order: 5
minutes: 14
topics: [skip, retry, rollback, fault tolerance, batch listeners]
docs:
  - https://docs.spring.io/spring-batch/reference/step/fault-tolerant.html
---

# Error Handling — Skip, Retry & Rollback

## The three levers

Batch jobs fail in two flavors: **poison records** (this row is bad, always will be) and **transient failures** (DB down for 2 seconds, will recover). Spring Batch gives you a different lever for each:

| Lever | For | Effect |
|---|---|---|
| **Skip** | poison records | record is counted and skipped; job continues |
| **Retry** | transient failures | same item retried with backoff, then fails or skips |
| **Rollback** | anything not caught | chunk transaction rolls back, restart resumes there |

```java
.<Transaction, Statement>chunk(1000, tx)
    .faultTolerant()
    .skip(FlatFileParseException.class).skipLimit(100)   // bad CSV lines
    .retry(DataAccessResourceFailureException.class).retryLimit(3)
    .retryBackOffPolicy(new FixedBackOffPolicy())         // configure delay
    .noRollback(ValidationException.class)                // don't waste a rollback
    .build();
```

## Skip: poison records must not kill the job

```java
.faultTolerant()
.skip(FlatFileParseException.class)  // malformed line
.skipLimit(100)                      // but give up after 100 skips
```

- Each skipped item is counted (`skipCount`) and recorded in the `StepExecution`.
- Exceed `skipLimit` → the step fails with `SkipLimitExceededException`.
- **Log skipped items** with a `SkipListener` so they can be reprocessed later:

```java
@Bean
SkipListener<Transaction, Statement> skipListener() {
    return new SkipListener<>() {
        public void onSkipInRead(Throwable t) { log.warn("skipped read: {}", t.getMessage()); }
        public void onSkipInProcess(Transaction item, Throwable t) { log.warn("skipped {}", item, t); }
        public void onSkipInWrite(Statement item, Throwable t) { log.warn("skipped write {}", item, t); }
    };
}
```

The classic skip use-case: an ETL where a vendor sends one malformed row per file — fail the whole night run, or skip 3 bad rows and alert? Skip + alert.

## Retry: transient failures deserve a second chance

```java
.retry(DataAccessResourceFailureException.class)  // e.g. connection blips
.retryLimit(3)
.retryBackOffPolicy(new ExponentialBackOffPolicy()); // 1s, 2s, 4s…
```

- Retry is **per item**: the same item is re-processed (re-read from the reader's buffer for chunk restart) up to `retryLimit` times.
- **Rollback happens on retry exhaustion** unless the exception is in `noRollback(...)`.
- **Never retry permanent errors** (bad data, validation) — retry only transient infrastructure failures, and pair the two: `retry(transient)` + `skip(permanent)`.

## Rollback rules and the transaction boundary

By default **any** exception rolls back the chunk. Refine with `noRollback`:

```java
.noRollback(ValidationException.class)  // a validation failure doesn't need the whole chunk rolled back
```

But remember the chunk contract: a rollback means **the whole chunk's items are re-read and re-processed** on restart — hence processors must be idempotent. If you absolutely need partial progress on poison chunks, split work into smaller chunks so the blast radius of a rollback is smaller.

## The failure log (poison-queue pattern)

Production batch jobs pair skip with a **failure sink**: skipped items are written (by a listener or a second writer) to a `failed_records` table or file. Then a follow-up job (or a human) reconciles them — exactly the DLQ discipline from the Kafka module: never silently drop, always park + alert.

## Testing the resilience

```java
// With the test harness: an ItemProcessor that throws on the 5th item
// asserts the job COMPLETED with skipCount == 1 — not FAILED.
```

Assert on `jobExecution.getExitStatus()` and `stepExecution.getSkipCount()` — the skip/retry configuration is behavior worth locking in a test.

## Key takeaways

- Skip poison records (`skipLimit` guards runaway skipping), retry transient failures with backoff, roll back the rest.
- Log/record every skipped item — skip is "park and alert", not "drop silently".
- Rollbacks re-run the whole chunk: keep processors idempotent and chunks modest.
- Never retry permanent errors; never skip transient ones without a limit.

Official docs: [Fault Tolerance](https://docs.spring.io/spring-batch/reference/step/fault-tolerant.html)
