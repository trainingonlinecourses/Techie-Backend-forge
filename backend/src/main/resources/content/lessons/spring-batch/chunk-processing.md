---
title: Chunk-Oriented Processing
summary: The read-process-write pipeline in depth — chunk sizing, commit intervals, transactions per chunk, and how restartability works at the chunk level.
order: 2
minutes: 13
topics: [chunk processing, commit interval, transactions, restartability, step execution]
docs:
  - https://docs.spring.io/spring-batch/reference/step/chunk-oriented-processing.html
---

# Chunk-Oriented Processing

## The chunk loop

Every chunk-oriented step runs a tight loop driven by the chunk size:

```
1. reader.read()          → one item
2. processor.process()    → one output (may return null to skip)
3. repeat until `chunkSize` items are buffered
4. writer.write(chunk)    → one transaction commits them all
5. repeat until reader returns null (end of data)
```

```java
.<Transaction, Statement>chunk(1000, tx)
```

- The **commit interval** = chunk size: 1000 items per database transaction.
- A **commit point is recorded** in the StepExecution after each chunk — that's the restart checkpoint.
- A failure inside a chunk rolls back *that chunk only*; the next restart resumes from the last successful commit point.

## Choosing the chunk size

It's a throughput-vs-memory-and-latency trade-off:

| Size | Effect |
|---|---|
| too small (10) | many small transactions — DB commit overhead dominates |
| too large (100k) | big transaction, big memory buffer, long-held locks, long rollback |
| sweet spot | 500–5,000 typically; tune by measuring, not guessing |

The buffered items sit in memory — with heavy objects, chunk size directly bounds heap usage. For "write everything at the end" needs, Spring Batch has **multi-resource writers** and an **item-writer adapter** to an in-memory collection, but a moderate chunk size usually beats the all-or-nothing approach on both memory and restart behavior.

## Readers: cursor vs. paging

The two read strategies for databases differ in memory profile:

- **Cursor** (`JdbcCursorItemReader`) — a single streaming `ResultSet` with one open connection; constant memory, but the connection stays open for the whole step.
- **Paging** (`JdbcPagingItemReader`) — fetches `pageSize` rows per query; bounded memory per page, each query re-establishes state, but needs a well-defined sort order (pagination without `ORDER BY` is broken).

```java
new JdbcCursorItemReaderBuilder<Transaction>()
    .dataSource(ds)
    .sql("SELECT id, amount FROM tx WHERE date = ? ORDER BY id")
    .rowMapper((rs, i) -> new Transaction(rs.getLong("id"), rs.getBigDecimal("amount")))
    .build();
```

Rule: **cursor for flat scans, paging for large/filtered datasets** and when the connection must not be held.

## Processors: transform, filter, enrich

- Return the transformed item → written.
- Return `null` → **silently skipped** (no write, not counted as failure) — the idiomatic way to filter.
- Throw → counted against skip policy (see the error-handling lesson).

```java
public Statement process(Transaction t) {
    if (!t.amount().signum() > 0) return null;      // filter
    return new Statement(t.id(), t.amount().multiply(TARIFF)); // transform
}
```

## Commit-point and restart mechanics

The restart contract lives in the JobRepository:

- `StepExecution.readCount / writeCount / skipCount / commitCount` track progress.
- On restart, the step **starts again from the last committed chunk** — items in the uncommitted chunk are re-read and re-processed. That means **processors must be idempotent** (no side effects outside the transaction), because a chunk can run twice.
- `JobInstanceAlreadyCompleteException` blocks re-running a completed job with identical parameters — pass a unique parameter (run id / file hash / date) to legitimately re-run.

## The classic chunk pitfalls

1. **Processor with external side effects** (email, API call) — if the chunk rolls back, the side effect already happened. Move side effects to a listener that fires only on commit (`ChunkListener.afterChunk` with `ChunkContext.isComplete()`), or write "to-send" records and let another job send them.
2. **Reader returning null early** — null means "end of input", not "skip this item"; skipping is the processor's job.
3. **Huge chunk sizes** — memory spikes and long lock windows; measure before raising.
4. **No `ORDER BY` in a paging reader** — rows repeat or vanish across page boundaries.

## Key takeaways

- Chunk = one transaction; commit interval = chunk size; restart resumes at the last commit point.
- Cursor readers stream (constant memory), paging readers bound memory per page.
- Processor returning null filters; returning an item writes it within the chunk transaction.
- Keep processors free of external side effects so re-running a chunk is safe.

Official docs: [Chunk-Oriented Processing](https://docs.spring.io/spring-batch/reference/step/chunk-oriented-processing.html)
