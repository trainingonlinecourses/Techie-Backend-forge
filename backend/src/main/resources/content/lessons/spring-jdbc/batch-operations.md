---
title: Batch Operations at Scale
module: spring-jdbc
order: 5
minutes: 22
topics: ["batchUpdate", "JdbcBatchItemWriter", "chunking", "rewriteBatchedStatements", "performance tuning"]
docs:
  - title: "JDBC batch operations"
    url: "https://docs.spring.io/spring-framework/reference/data-access/jdbc.html#jdbc-advanced-jdbc-template-batch-operations"
---

# Batch Operations at Scale

Inserting one row at a time over JDBC is the single biggest performance mistake in data-heavy Spring apps. This lesson covers the batch patterns, the Postgres-specific switch that makes them 10× faster, and the chunking strategy for millions of rows.

## The Problem With One-By-One

```
10,000 rows × (round-trip + parse + execute + fsync)
= 10,000 round-trips ≈ 30–60 seconds
```

```
One batch of 10,000 = 1 round-trip ≈ 1–3 seconds
```

Batch processing is not an optimization — it's the difference between an import that fits in a request and one that times out.

## JdbcTemplate.batchUpdate

```java
public void insertCourses(List<Course> courses) {
    jdbcTemplate.batchUpdate(
        "INSERT INTO courses (title, level, minutes) VALUES (?, ?, ?)",
        courses,
        500,                                    // chunk size
        (ps, course) -> {
            ps.setString(1, course.getTitle());
            ps.setString(2, course.getLevel());
            ps.setInt(3, course.getMinutes());
        });
}
```

The 3-arg `batchUpdate(sql, collection, batchSize, setter)` form is the modern API — Spring chunks the collection into `batchSize` groups automatically.

## NamedParameter Batch

```java
public void insertCourses(List<Course> courses) {
    SqlParameterSource[] batch = courses.stream()
        .map(BeanPropertySqlParameterSource::new)
        .toArray(SqlParameterSource[]::new);
    namedJdbc.batchUpdate("""
        INSERT INTO courses (title, level, minutes)
        VALUES (:title, :level, :minutes)
        """, batch);
}
```

## The Postgres Secret: rewriteBatchedStatements

Postgres JDBC by default **sends each statement in a batch separately** — you get no speedup unless you enable:

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/app?rewriteBatchedStatements=true
```

With `rewriteBatchedStatements=true`, the driver rewrites `INSERT ... VALUES (?,?)` × N into a single multi-row `INSERT ... VALUES (?,?),(?,?)...`. Result: **10–30× faster batch inserts**. Without it, batchUpdate is barely faster than a loop. This one flag is the most impactful JDBC setting in the Postgres world.

## Batching Updates and Deletes

```java
public void updateLevels(Map<Long, String> idToLevel) {
    jdbcTemplate.batchUpdate(
        "UPDATE courses SET level = ?, updated_at = now() WHERE id = ?",
        idToLevel.entrySet(),
        500,
        (ps, entry) -> {
            ps.setString(1, entry.getValue());
            ps.setLong(2, entry.getKey());
        });
}
```

Batching isn't only for inserts — bulk updates and deletes benefit identically.

## Chunking: The Memory/Transaction Balance

Batch size is a trade:

| Too small | Too large |
|-----------|-----------|
| Many round-trips | Big memory spike (PreparedStatement buffers) |
| Slow | Long transaction (lock held longer) |

Sweet spot: **100–1000 rows per chunk**, tuned by row size and DB. For millions of rows, chunk + transaction-per-chunk:

```java
@Transactional
public void importAll(Stream<Course> courses) {
    // one transaction per 500 rows — a failure rolls back only that chunk
    ChunkedBatching.chunk(courses, 500).forEach(chunk ->
        jdbcTemplate.batchUpdate(INSERT_SQL, chunk, 500, setter));
}
```

## JdbcBatchItemWriter: Batch + Spring Batch

In a Spring Batch job, `JdbcBatchItemWriter` is the standard write step:

```java
@Bean
public JdbcBatchItemWriter<Course> courseWriter(DataSource dataSource) {
    return new JdbcBatchItemWriterBuilder<Course>()
        .dataSource(dataSource)
        .sql("INSERT INTO courses (title, level, minutes) VALUES (:title, :level, :minutes)")
        .beanMapped()
        .assertUpdates(true)      // fail if a row wasn't written
        .build();
}
```

Configured inside a `Step` with `commit-interval` (chunk size) controlling the transaction boundary:

```java
@Bean
public Step importStep(JdbcBatchItemWriter<Course> writer) {
    return new StepBuilder("importStep", jobRepository)
        .<Course, Course>chunk(500, platformTransactionManager)
        .reader(courseReader())
        .writer(writer)
        .build();
}
```

The writer + commit-interval pair is the production answer for million-row ETL: streaming reads, batched writes, transactional chunks.

## Measuring the Win

```java
// Before: one-by-one
long start = System.nanoTime();
courses.forEach(c -> jdbcTemplate.update(INSERT_SQL, c.getTitle(), c.getLevel(), c.getMinutes()));
log.info("One-by-one: {} ms", TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start));

// After: batched
start = System.nanoTime();
jdbcTemplate.batchUpdate(INSERT_SQL, courses, 500, setter);
log.info("Batched: {} ms", TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start));
```

Typical: 100k rows, one-by-one ≈ 40s → batched ≈ 1.5s (with `rewriteBatchedStatements`). Always measure — the numbers justify the pattern.

## Error Handling in Batches

Batch failures can be partial. Handle per-chunk with a decision:

```java
public void importWithSkip(List<Course> courses) {
    List<Course> failed = new ArrayList<>();
    for (List<Course> chunk : partition(courses, 500)) {
        try {
            jdbcTemplate.batchUpdate(INSERT_SQL, chunk, 500, setter);
        } catch (DuplicateKeyException e) {
            failed.addAll(insertIndividuallySkippingDuplicates(chunk));
        }
    }
    if (!failed.isEmpty()) {
        log.warn("Skipped {} duplicates", failed.size());
    }
}
```

## Summary

| Concern | Answer |
|---------|--------|
| Bulk inserts | `batchUpdate` with chunking |
| Postgres speed | `rewriteBatchedStatements=true` |
| Named params | `namedJdbc.batchUpdate` |
| Chunk size | 100–1000, transaction per chunk |
| Spring Batch | `JdbcBatchItemWriter` + commit-interval |
| Partial failure | Per-chunk try/catch, skip-and-log |
| Verification | Measure before/after |

Batch operations are the difference between an import that works and one that melts the database. Chunk the data, batch the statements, flip `rewriteBatchedStatements`, and measure — 10× is the baseline, not the ceiling.
