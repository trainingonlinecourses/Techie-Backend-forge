---
title: ItemReaders & ItemWriters
summary: The built-in readers and writers for files, databases and messages — flat files, CSV, JSON, multi-line records, and the decorators that compose them.
order: 3
minutes: 14
topics: [itemreader, itemwriter, flat file, csv, json, file processing]
docs:
  - https://docs.spring.io/spring-batch/reference/readers-and-writers.html
---

# ItemReaders & ItemWriters

## The built-in catalog

Spring Batch ships production-grade readers and writers for the common cases — you compose, not reinvent:

| Kind | Reader | Writer |
|---|---|---|
| Flat file (CSV/TSV) | `FlatFileItemReader` | `FlatFileItemWriter` |
| Fixed-width / multi-line | `PatternMatchingCompositeLineMapper` / `MultiResourceItemReader` | — |
| JSON | `JsonItemReader` (Jackson) | `JsonFileItemWriter` |
| Database | `JdbcCursorItemReader`, `JdbcPagingItemReader`, `JpaPagingItemReader` | `JdbcBatchItemWriter`, `JpaItemWriter` |
| Messages | `AmqpItemReader`, `KafkaItemReader` | `AmqpItemWriter`, `KafkaItemWriter` |
| Multi-resource | `MultiResourceItemReader` (all `*.csv` in a dir) | — |

## Flat files: the classic

```java
@Bean
FlatFileItemReader<Order> reader() {
    return new FlatFileItemReaderBuilder<Order>()
        .name("orderReader")
        .resource(new ClassPathResource("data/orders.csv"))
        .delimited()                          // CSV
        .names("id", "customer", "amount")    // header mapping
        .fieldSetMapper(fs -> new Order(fs.readLong("id"), fs.readString("customer"),
                                        fs.readBigDecimal("amount")))
        .linesToSkip(1)                       // skip the header
        .build();
}
```

The `FieldSet` mapper is the workhorse: `readString`, `readLong`, `readBigDecimal`, `readDate`, defaults for missing columns (`fs.readString("x", "unknown")`). For fixed-width input use `.fixedLength().columns(new Range(1, 10), new Range(11, 20))`.

## Writing flat files

```java
new FlatFileItemWriterBuilder<Order>()
    .name("orderWriter")
    .resource(new FileSystemResource("/data/out/orders.csv"))
    .delimited().delimiter(",")
    .names("id", "customer", "amount")
    .headerCallback(w -> w.write("id,customer,amount"))
    .shouldDeleteIfEmpty(true)
    .build();
```

Write to a **staging name first, then rename** (`.transactional` + append-to-target patterns exist for this) — a half-written target file on a crashed run is the classic flat-file writer failure.

## JSON and multi-resource

```java
new JsonItemReaderBuilder<Order>()
    .name("jsonReader")
    .resource(new FileSystemResource("/data/orders.json"))
    .jsonObjectReader(new JacksonJsonObjectReader<>(Order.class))
    .build();

// Process every file in an FTP drop directory:
new MultiResourceItemReaderBuilder<Order>()
    .name("allFiles")
    .resources(fileSystemResources)   // Resource[] — use a pattern like /drop/*.csv
    .delegate(singleFileReader())     // the per-file reader
    .build();
```

`MultiResourceItemReader` feeds each resource through the delegate sequentially — the pattern for directory-based ingestion.

## Writers: batching and idempotency

- `JdbcBatchItemWriter` uses JDBC batch (addBatch/executeBatch) — the fastest path to a DB; give it a named-parameter SQL (`:id`, `:amount`).
- `JpaItemWriter` calls `merge`/`persist` per item through the entity manager — slower but works with entities and cascades.
- **Stale-data protection**: add an `ORDER BY` guarantee or an optimistic-lock version column if the same records could be written by concurrent jobs.

## Composition: processors with state

Some jobs need header/footer records (a total line). Use **state in the processor + a `CompositeItemWriter`**, or simpler: `ClassifierCompositeItemWriter` routes items by type, and a `FlatFileFooterCallback` writes the trailer after the last chunk:

```java
new FlatFileItemWriterBuilder<Order>()
    .footerCallback(w -> w.write("total," + totalService.sum()))
    .build();
```

## Key takeaways

- Reader/writer catalog covers flat, JSON, DB and messaging — compose with builders, don't hand-roll parsing.
- CSV: `delimited()` + `names(...)` + `FieldSetMapper`; skip headers with `linesToSkip`.
- Write atomically (staging + rename) and use `MultiResourceItemReader` for directory drops.
- Prefer `JdbcBatchItemWriter` for DB volume; keep side-effect writers transactional-aware.

Official docs: [Readers & Writers](https://docs.spring.io/spring-batch/reference/readers-and-writers.html)
