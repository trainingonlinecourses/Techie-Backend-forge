---
title: Tasklet Steps — Simple Batch Operations
summary: When to use Tasklet instead of chunk processing, file operations, system commands, and database maintenance in Spring Batch.
order: 7
minutes: 14
topics: [tasklet, batch-steps, simple-operations, file-management, system-commands]
docs:
  - https://docs.spring.io/spring-batch/docs/current/reference/html/step.html#taskletStep
  - https://docs.spring.io/spring-batch/docs/current/reference/html/index.html
---

# Tasklet Steps — Simple Batch Operations

## What Is a Tasklet?

In Spring Batch, a **Step** is a unit of work. Most steps use **chunk processing** (read → process → write in batches). But some operations are simpler — you just need to do ONE thing and you're done. That's where **Tasklet** comes in.

**Think of it like**: Chunk processing is an assembly line (read 100 items, process each, write each). A Tasklet is a single action — "delete old files" or "run a SQL statement."

---

## When to Use Tasklet

| Use Tasklet When | Use Chunk When |
|-----------------|----------------|
| Single operation (file delete, SQL execute) | Processing many records |
| No input/output stream needed | Need read → process → write cycle |
| Simple file operations | Complex data transformations |
| System commands | Database record processing |

---

## Basic Tasklet

```java
@Component
public class CleanupTasklet implements Tasklet {

    private static final Logger log = LoggerFactory.getLogger(CleanupTasklet.class);

    @Override
    public RepeatStatus execute(StepContribution contribution, ChunkContext chunkContext) {
        // Your one-time operation here
        Path tempDir = Paths.get("/tmp/batch-processing");
        try {
            Files.walk(tempDir)
                .filter(Files::isRegularFile)
                .filter(p -> p.toString().endsWith(".tmp"))
                .forEach(path -> {
                    try {
                        Files.delete(path);
                        log.info("Deleted: {}", path);
                    } catch (IOException e) {
                        log.warn("Failed to delete: {}", path, e);
                    }
                });
        } catch (IOException e) {
            log.error("Failed to walk temp directory", e);
        }

        return RepeatStatus.FINISHED;  // FINISHED = done, CONTINUABLE = run again
    }
}
```

### Using Tasklet in a Step

```java
@Configuration
public class BatchConfig {

    @Bean
    public Step cleanupStep(JobRepository jobRepository, PlatformTransactionManager txManager) {
        return new StepBuilder("cleanupStep", jobRepository)
            .tasklet(cleanupTasklet, txManager)
            .build();
    }

    @Bean
    public Job cleanupJob(JobRepository jobRepository, Step cleanupStep) {
        return new JobBuilder("cleanupJob", jobRepository)
            .start(cleanupStep)
            .build();
    }
}
```

---

## Common Tasklet Patterns

### File Operations

```java
@Component
public class FileMoveTasklet implements Tasklet {

    private final Resource source;
    private final Resource destination;

    public FileMoveTasklet(
            @Value("${batch.input.dir}/processed") Resource source,
            @Value("${batch.archive.dir}") Resource destination) {
        this.source = source;
        this.destination = destination;
    }

    @Override
    public RepeatStatus execute(StepContribution contribution, ChunkContext context) {
        try {
            File srcFile = source.getFile();
            File destFile = new File(destination.getFile(), srcFile.getName());

            Files.move(srcFile.toPath(), destFile.toPath(),
                StandardCopyOption.REPLACE_EXISTING);

            log.info("Moved {} to {}", srcFile, destFile);
        } catch (IOException e) {
            throw new BatchRuntimeException("Failed to move file", e);
        }

        return RepeatStatus.FINISHED;
    }
}
```

### Database Maintenance

```java
@Component
public class DatabaseMaintenanceTasklet implements Tasklet {

    private final JdbcTemplate jdbcTemplate;

    public DatabaseMaintenanceTasklet(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public RepeatStatus execute(StepContribution contribution, ChunkContext context) {
        // Archive old records
        jdbcTemplate.update("""
            INSERT INTO orders_archive
            SELECT * FROM orders WHERE created_at < ?
            """, LocalDate.now().minusYears(1));

        // Delete archived records
        int deleted = jdbcTemplate.update("""
            DELETE FROM orders WHERE created_at < ?
            """, LocalDate.now().minusYears(1));

        log.info("Archived and deleted {} old orders", deleted);

        // Update statistics
        jdbcTemplate.execute("ANALYZE orders");

        return RepeatStatus.FINISHED;
    }
}
```

### System Command Execution

```java
@Component
public class SystemCommandTasklet implements Tasklet {

    @Override
    public RepeatStatus execute(StepContribution contribution, ChunkContext context) {
        try {
            ProcessBuilder pb = new ProcessBuilder("gzip", "/data/reports/report.csv");
            pb.redirectErrorStream(true);
            Process process = pb.start();

            String output = new String(process.getInputStream().readAllBytes());
            int exitCode = process.waitFor();

            if (exitCode != 0) {
                throw new BatchRuntimeException("gzip failed: " + output);
            }

            log.info("Compressed report.csv successfully");
        } catch (Exception e) {
            throw new BatchRuntimeException("System command failed", e);
        }

        return RepeatStatus.FINISHED;
    }
}
```

### Conditional Execution

```java
@Component
public class ConditionalTasklet implements Tasklet {

    private final DataSource dataSource;

    @Override
    public RepeatStatus execute(StepContribution contribution, ChunkContext context) {
        // Only run if table is empty
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM users", Integer.class);

        if (count > 0) {
            log.info("Table already has {} records — skipping seed", count);
            return RepeatStatus.FINISHED;  // Done, no need to run again
        }

        // Seed data
        jdbc.update("INSERT INTO users (name, email) VALUES ('Admin', 'admin@example.com')");
        log.info("Seeded admin user");

        return RepeatStatus.FINISHED;
    }
}
```

---

## Tasklet vs Chunk Processing

```java
// TASKLET: Simple, one-time operation
@Bean
public Step deleteOldFilesStep(JobRepository jobRepository, PlatformTransactionManager txManager) {
    return new StepBuilder("deleteOldFiles", jobRepository)
        .tasklet(deleteOldFilesTasklet, txManager)
        .build();
}

// CHUNK: Process many records in batches
@Bean
public Step processOrdersStep(JobRepository jobRepository, PlatformTransactionManager txManager) {
    return new StepBuilder("processOrders", jobRepository)
        .<Order, ProcessedOrder>chunk(100, txManager)
        .reader(orderReader(null))
        .processor(orderProcessor())
        .writer(orderWriter(null))
        .build();
}
```

---

## In an Organization

### Scenario 1: Nightly Data Cleanup

```java
@Component
@StepScope
public class NightlyCleanupTasklet implements Tasklet {

    private final JdbcTemplate jdbc;
    private final @Value("${retention.days:90}") int retentionDays;

    @Override
    public RepeatStatus execute(StepContribution contribution, ChunkContext context) {
        LocalDate cutoff = LocalDate.now().minusDays(retentionDays);

        // Delete expired sessions
        int sessions = jdbc.update(
            "DELETE FROM sessions WHERE last_access < ?", cutoff.atStartOfDay());

        // Delete expired tokens
        int tokens = jdbc.update(
            "DELETE FROM refresh_tokens WHERE expires_at < ?", LocalDateTime.now());

        // Vacuum old data (PostgreSQL)
        jdbc.execute("VACUUM ANALYZE sessions");
        jdbc.execute("VACUUM ANALYZE refresh_tokens");

        log.info("Cleaned {} sessions, {} tokens (cutoff: {})", sessions, tokens, cutoff);
        return RepeatStatus.FINISHED;
    }
}
```

### Scenario 2: File Sync Between Systems

```java
@Component
public class FileSyncTasklet implements Tasklet {

    private final S3Client s3Client;
    private final FileSystemResource localDir;

    @Override
    public RepeatStatus execute(StepContribution contribution, ChunkContext context) {
        // List files in S3
        ListObjectsV2Response response = s3Client.listObjectsV2(
            ListObjectsV2Request.builder().bucket("my-bucket").build());

        for (S3Object s3Obj : response.contents()) {
            Path localPath = localDir.getFile().toPath().resolve(s3Obj.key());
            Files.createDirectories(localPath.getParent());

            // Download if newer
            if (Files.notExists(localPath) ||
                Files.getLastModifiedTime(localPath).toInstant()
                    .isBefore(s3Obj.lastModified().toInstant())) {

                s3Client.getObject(
                    GetObjectRequest.builder().bucket("my-bucket").key(s3Obj.key()).build(),
                    localPath);
                log.info("Downloaded: {}", s3Obj.key());
            }
        }

        return RepeatStatus.FINISHED;
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using Tasklet for record processing | No chunking, no transaction management per batch | Use chunk processing for records |
| Returning `RepeatStatus.CONTINUABLE` without limit | Infinite loop | Always have a termination condition |
| Not logging progress | Can't monitor batch jobs | Log counts and key information |
| Blocking in Tasklet thread | Thread starvation | Use `@Async` or reactive if needed |
| Not handling exceptions | Job fails silently | Wrap in try-catch, log errors properly |
| Mixing Tasklet and Chunk in same step | Won't compile | Use separate steps |
