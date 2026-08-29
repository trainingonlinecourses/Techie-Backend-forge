---
title: Non-Web Spring Boot Applications — CLI, Batch, and Background Services
summary: Building Spring Boot apps that don't serve HTTP — command-line runners, application runners, scheduled services, and when to use a web server vs a standalone process.
order: 19
minutes: 18
topics: [non-web, commandline-runner, application-runner, spring-boot-cli, background-service, headless]
docs:
  - https://docs.spring.io/spring-boot/reference/using/application-arguments.html
  - https://docs.spring.io/spring-boot/reference/io/scheduling.html
---

# Non-Web Spring Boot Applications — CLI, Batch, and Background Services

## The Concept, From Zero

Most Spring Boot tutorials show you a web server — an app that listens on a port and responds to HTTP requests. But Spring Boot can also run **without any web server at all**. Think of:

- A **batch processor** that reads CSV files every night and loads them into a database
- A **CLI tool** that takes command-line arguments and produces output
- A **background service** that watches a queue and processes messages
- A **migration runner** that executes database changes and exits

These apps start up, do their work, and either keep running (background service) or exit (batch job). No HTTP port, no web server, no REST endpoints.

**The mental model:** A web Spring Boot app is like a restaurant — it starts the kitchen and waits for customers (requests). A non-web Spring Boot app is like a food truck — it starts up, does its work, and either drives to the next location or stays parked processing orders.

## How to Disable the Web Server

The simplest way: tell Spring Boot not to start a web server.

```java
@SpringBootApplication
public class BatchApplication {
    public static void main(String[] args) {
        SpringApplication app = new SpringApplication(BatchApplication.class);
        app.setWebApplicationType(WebApplicationType.NONE);  // Line 1: no web server
        app.run(args);                                        // Line 2: start and run
    }
}
```

**Line-by-line walkthrough:**

1. **`setWebApplicationType(WebApplicationType.NONE)`** — This tells Spring Boot "don't start Tomcat, Jetty, or Netty. Don't even load web-related auto-configuration." The app starts faster, uses less memory, and has no ports open.

2. **`app.run(args)`** — Same as `@SpringBootApplication`'s main, but with the web type overridden. The app starts, creates all beans, runs any runners, and if there's nothing keeping it alive (like a scheduled task or a long-running thread), it exits.

**Alternative (application.yml):**
```yaml
spring:
  main:
    web-application-type: none
```

**Another alternative (for pure batch):**
```java
@SpringBootApplication(exclude = {
    DataSourceAutoConfiguration.class,  // if you don't need a database yet
    HibernateJpaAutoConfiguration.class
})
```

## CommandLineRunner: Run Once at Startup

`CommandLineRunner` is a bean that runs **exactly once** after the application context is fully loaded. It receives the raw command-line arguments:

```java
@Component
public class DataMigrationRunner implements CommandLineRunner {

    private final DataSource dataSource;

    public DataMigrationRunner(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) throws Exception {
        // This runs once, after ALL beans are created
        System.out.println("Arguments received: " + Arrays.toString(args));

        if (args.length > 0 && "migrate".equals(args[0])) {
            System.out.println("Starting data migration...");
            migrateData();
        } else {
            System.out.println("No migration flag. Skipping.");
        }
    }

    private void migrateData() {
        // Read old format, transform, write new format
        System.out.println("Migration complete!");
    }
}
```

**Run it:**
```bash
java -jar myapp.jar migrate              # triggers the migration
java -jar myapp.jar                      # skips it
```

**Line-by-line walkthrough:**

1. **`implements CommandLineRunner`** — Spring Boot detects this interface and adds the bean to the runner list.

2. **`run(String... args)`** — Called once after context refresh. `args` are the command-line arguments (not Spring properties — the raw strings from the terminal).

3. **`if ("migrate".equals(args[0]))`** — You can branch based on arguments. This is how CLI tools decide what action to perform.

**Multiple runners:** If you have multiple `CommandLineRunner` beans, they run in order of `@Order` or registration order. Each runs exactly once.

## ApplicationRunner: Same Thing, Parsed Arguments

`ApplicationRunner` is identical to `CommandLineRunner` but wraps the arguments in an `ApplicationArguments` object that parses `--key=value` flags:

```java
@Component
public class ReportGenerator implements ApplicationRunner {

    @Override
    public void run(ApplicationArguments args) throws Exception {
        // Get non-option args (positional arguments)
        List<String> files = args.getNonOptionArgs();
        System.out.println("Files to process: " + files);

        // Get option args (--format=pdf becomes key="format", values=["pdf"])
        if (args.containsOption("format")) {
            String format = args.getOptionValues("format").get(0);
            System.out.println("Output format: " + format);
        }

        // Process each file
        for (String file : files) {
            generateReport(file);
        }
    }
}
```

**Run it:**
```bash
java -jar myapp.jar --format=pdf report1.csv report2.csv
```

**Line-by-line walkthrough:**

1. **`args.getNonOptionArgs()`** — Returns positional arguments: `["report1.csv", "report2.csv"]`

2. **`args.containsOption("format")`** — Checks if `--format` was passed. Spring parses `--key=value` into option maps automatically.

3. **`args.getOptionValues("format").get(0)`** — Gets the value `"pdf"`. Multiple values possible if the flag is repeated.

## Background Services: Keep Running After Startup

`CommandLineRunner` and `ApplicationRunner` run once and return. For services that need to keep running (processing queue messages, watching files, running scheduled tasks), you need something that keeps the JVM alive:

```java
@SpringBootApplication
public class QueueProcessorApplication {
    public static void main(String[] args) {
        SpringApplication.run(QueueProcessorApplication.class, args);
    }
}

@Component
public class MessageListener implements CommandLineRunner {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    public void run(String... args) throws Exception {
        System.out.println("Starting message listener...");

        // Start a background thread that keeps processing
        executor.submit(() -> {
            while (!Thread.currentThread().isInterrupted()) {
                try {
                    Message msg = pollQueue();  // blocks until a message arrives
                    processMessage(msg);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    System.out.println("Shutting down listener...");
                }
            }
        });
    }
}
```

**How it stays alive:** The `executor.submit()` starts a daemon thread. Spring Boot's main thread is blocked by `SpringApplication.run()` waiting for a shutdown signal (Ctrl+C / SIGTERM). The background thread processes messages until the app is stopped.

**For scheduled tasks (no background thread needed):**
```java
@Component
public class DailyReportJob {

    @Scheduled(cron = "0 0 2 * * *")  // 2 AM every day
    public void generateDailyReport() {
        System.out.println("Generating daily report...");
        // ... work ...
    }
}
```

The `@Scheduled` annotation keeps the Spring context alive (the task scheduler thread pool is a non-daemon thread). No manual thread management needed.

## Real-World Scenarios

**Scenario 1 — Nightly ETL job:** A non-web Spring Boot app reads CSV files from an S3 bucket, transforms the data, and loads it into PostgreSQL. It runs as a Kubernetes CronJob — starts at 2 AM, processes files, exits by 3 AM. No web server needed, no ports to expose, minimal memory footprint.

**Scenario 2 — CLI database tool:** A Spring Boot app with `CommandLineRunner` that takes arguments like `migrate --env=staging` or `seed --tables=users,orders`. Developers run it from the terminal: `java -jar dbtool.jar migrate --env=staging`. No HTTP, no browser — just a command-line tool with Spring's dependency injection.

**Scenario 3 — Microservice with a queue consumer:** A Spring Boot app that both serves REST endpoints AND processes Kafka messages. The web server handles HTTP requests, while a `CommandLineRunner` starts a Kafka consumer in a background thread. Both run in the same JVM, sharing the same Spring beans.

**Scenario 4 — GraalVM native image:** Non-web Spring Boot apps are ideal for native compilation — no web server means fewer classes to analyze, faster startup, and smaller binaries. A CLI tool compiled to a native binary starts in milliseconds, not seconds.

## Production Considerations

1. **Health checks:** Even non-web apps can expose health via Spring Boot Actuator on a separate management port:
   ```yaml
   management:
     server:
       port: 8081  # separate port for Actuator
   ```

2. **Graceful shutdown:** Implement `DisposableBean` or `@PreDestroy` to clean up resources (close database connections, finish in-flight work, flush logs).

3. **Exit codes:** Use `System.exit()` or Spring Boot's `ExitCodeGenerator` to signal success/failure to orchestrators (Kubernetes, systemd):
   ```java
   @Bean
   public ExitCodeGenerator exitCodeGenerator() {
       return () -> someCondition ? 0 : 1;
   }
   ```

4. **Logging:** Non-web apps should log to stdout (container convention) or a file, not the web server's access log.

5. **Configuration:** Use `--spring.profiles.active=production` on the command line or environment variables — no `application.yml` edits needed for deployment.

## Key Takeaways

- Spring Boot can run without a web server: `WebApplicationType.NONE`
- `CommandLineRunner` / `ApplicationRunner` run once at startup — great for CLI tools and one-shot jobs
- Background services use threads or `@Scheduled` to keep the JVM alive
- Non-web apps are ideal for batch processing, CLI tools, queue consumers, and native images
- Use Actuator on a separate port for health checks even without a main web server

Official docs: [Application Arguments](https://docs.spring.io/spring-boot/reference/using/application-arguments.html) · [Scheduling](https://docs.spring.io/spring-boot/reference/io/scheduling.html)
