---
title: Chunk-Oriented Processing — Complete Beginner's Guide
summary: How Spring Batch processes data in chunks, the Reader-Processor-Writer pattern, and why chunking beats one-by-one processing.
order: 4
minutes: 20
topics: [chunk processing, reader, processor, writer, batch processing, commit interval]
docs:
  - https://docs.spring.io/spring-batch/reference/core/chunk-container.html
  - https://docs.spring.io/spring-batch/reference/core/itemreaders.html
---

# Chunk-Oriented Processing — Complete Beginner's Guide

## What is chunk processing?

Instead of processing records one by one (slow) or all at once (memory explosion), Spring Batch processes data in **chunks** — groups of records processed together.

```
One-by-one (slow):
  Record 1 → Read → Process → Write
  Record 2 → Read → Process → Write
  Record 3 → Read → Process → Write
  ... 1 million records = 1 million database writes!

Chunk processing (fast):
  Chunk 1: [Record 1, Record 2, ..., Record 100] → Read → Process → Write (1 batch write)
  Chunk 2: [Record 101, ..., Record 200] → Read → Process → Write (1 batch write)
  ... 1 million records = 10,000 database writes!
```

**The key insight:** Reading 100 records and writing them in one batch is MUCH faster than reading and writing one at a time. Database round-trips are expensive — chunking reduces them dramatically.

## The Reader-Processor-Writer pattern

```
┌──────────┐    ┌───────────┐    ┌──────────┐
│  READER  │ →  │ PROCESSOR │ →  │  WRITER  │
│ (reads   │    │ (transforms│    │ (writes  │
│  chunks) │    │  each item)│    │  chunks) │
└──────────┘    └───────────┘    └──────────┘
```

**Line-by-line code example:**


**What this code does — step by step:**

1. Step 1: Reader — reads chunks of data from a source
2. `return new FlatFileItemReaderBuilder<Order>()` — Line 1: Builder pattern
3. `.name("orderReader")` — Line 2: Name for logging
4. `.resource(new ClassPathResource("orders.csv"))` — Line 3: Input file
5. `.delimited()` — Line 4: CSV format
6. `.names("id", "customer", "total", "status")` — Line 5: Column names
7. `.fieldSetMapper(fieldSet -> new Order(` — Line 6: Map CSV to Java object
8. Step 2: Processor — transforms each item
9. Line 1: Validate the order
10. `return null;` — Line 2: Return null to skip invalid items
11. Line 3: Transform to the output format
12. `order.getCustomer().toUpperCase(),` — Line 4: Transform data
13. `Instant.now()` — Line 5: Add processing timestamp
14. Step 3: Writer — writes chunks to the destination
15. `.dataSource(dataSource)` — Line 1: Database connection
16. `"VALUES (:id, :customer, :total, :processedAt)")` — Line 2: SQL with named params
17. `.beanMapped()` — Line 3: Use bean properties for parameters

The same code, clean:

```java
@Bean
public FlatFileItemReader<Order> reader() {
    return new FlatFileItemReaderBuilder<Order>()
        .name("orderReader")
        .resource(new ClassPathResource("orders.csv"))
        .delimited()
        .names("id", "customer", "total", "status")
        .fieldSetMapper(fieldSet -> new Order(
            fieldSet.readLong("id"),
            fieldSet.readString("customer"),
            fieldSet.readBigDecimal("total"),
            fieldSet.readString("status")
        ))
        .build();
}

@Bean
public ItemProcessor<Order, ProcessedOrder> processor() {
    return order -> {
        if (order.getTotal().compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }
        return new ProcessedOrder(
            order.getId(),
            order.getCustomer().toUpperCase(),
            order.getTotal(),
            Instant.now()
        );
    };
}

@Bean
public JdbcBatchItemWriter<ProcessedOrder> writer(DataSource dataSource) {
    return new JdbcBatchItemWriterBuilder<ProcessedOrder>()
        .dataSource(dataSource)
        .sql("INSERT INTO processed_orders (id, customer, total, processed_at) " +
             "VALUES (:id, :customer, :total, :processedAt)")
        .beanMapped()
        .build();
}
```

## The complete job — putting it together


**What this code does — step by step:**

1. `return new JobBuilder("importOrders", jobRepository)` — Line 1: Create job
2. `.start(importStep)` — Line 2: Add the step
3. `return new StepBuilder("importStep", jobRepository)` — Line 1: Create step
4. `.<Order, ProcessedOrder>chunk(100, transactionManager)` — Line 2: Chunk size = 100
5. `.reader(reader)` — Line 3: Set the reader
6. `.processor(processor)` — Line 4: Set the processor
7. `.writer(writer)` — Line 5: Set the writer

The same code, clean:

```java
@Bean
public Job importOrdersJob(JobRepository jobRepository, 
                           Step importStep) {
    return new JobBuilder("importOrders", jobRepository)
        .start(importStep)
        .build();
}

@Bean
public Step importStep(JobRepository jobRepository,
                       PlatformTransactionManager transactionManager,
                       FlatFileItemReader<Order> reader,
                       ItemProcessor<Order, ProcessedOrder> processor,
                       JdbcBatchItemWriter<ProcessedOrder> writer) {
    return new StepBuilder("importStep", jobRepository)
        .<Order, ProcessedOrder>chunk(100, transactionManager)
        .reader(reader)
        .processor(processor)
        .writer(writer)
        .build();
}
```

**What happens at runtime:**
1. Job starts → Step starts
2. Reader reads 100 orders from CSV
3. Processor transforms each order (validate, enrich, convert)
4. Writer writes all 100 processed orders to database in one batch
5. Repeat until all records are processed
6. Step completes → Job completes

## Chunk size — tuning for performance


**What this code does — step by step:**

1. Small chunk (10) — more database round-trips, less memory
2. Large chunk (1000) — fewer round-trips, more memory
3. The sweet spot depends on: - Record size (small records → larger chunks). - Database performance (fast DB → larger chunks). - Memory available (limited memory → smaller chunks). - Transaction overhead (high overhead → larger chunks)

The same code, clean:

```java
.chunk(10, transactionManager)

.chunk(1000, transactionManager)
```

## Common mistakes

| Mistake | Why it's slow | Fix |
|---|---|---|
| Chunk size too small | Too many database round-trips | Increase to 100-500 |
| Chunk size too large | Out of memory | Decrease to 50-100 |
| Processing in writer | Skips processor | Process in the processor step |
| Not returning null to skip | Invalid items get written | Return null in processor |
| No transaction management | Partial writes on failure | Use `@Transactional` or chunk transaction |

## Key takeaways

- Chunk processing reads/writes in batches — fewer database round-trips
- Reader → Processor → Writer: each has a single responsibility
- Chunk size tunes performance: too small = slow, too large = OOM
- Return null from processor to skip invalid items
- Spring Batch handles transactions automatically per chunk

**Official docs:** [Chunk-Oriented Processing](https://docs.spring.io/spring-batch/reference/core/chunk-container.html) · [Item Readers](https://docs.spring.io/spring-batch/reference/core/itemreaders.html)

