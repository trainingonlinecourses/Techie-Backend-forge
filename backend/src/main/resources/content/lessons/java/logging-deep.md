---
title: Java Logging Deep — SLF4J, Logback and Structured Logging
summary: The logging facade pattern, SLF4J and Logback setup, log levels in production, MDC for request context, structured JSON logs, and the logging patterns that make debugging production issues possible.
order: 52
minutes: 22
topics: [logging, slf4j, logback, mdc, structured-logging, log-levels, correlation-id]
docs:
  - https://www.slf4j.org/manual.html
  - https://logback.qos.ch/manual/index.html
---

# Java Logging Deep — SLF4J, Logback and Structured Logging

## The concept

Logging is the process of recording what your application does at runtime. It is the single most important debugging tool for production systems. A well-placed log line can save hours of investigation when something breaks at 3 AM.

Java has a layered logging architecture:

1. **SLF4J** (Simple Logging Facade for Java) — An API/interface. Your code calls SLF4J methods. You never import the actual logging implementation.
2. **Logback** (or Log4j2) — The implementation. SLF4J delegates to whichever implementation is on the classpath.

This separation means you can swap Logback for Log4j2 without changing a single line of application code.

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class OrderService {
    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    public void processOrder(Order order) {
        log.info("Processing order {} for customer {}", order.getId(), order.getCustomerId());
        // ...
        log.warn("Order {} exceeds credit limit by ${}", order.getId(), order.getOverage());
        // ...
        log.error("Failed to process order {}", order.getId(), exception);
    }
}
```

## Log levels — when to use each

| Level | When to use | Example |
|---|---|---|
| `ERROR` | Something broke and needs immediate attention | Database connection failed, payment gateway timeout |
| `WARN` | Something unexpected but the system continues | Retry succeeded, credit limit exceeded |
| `INFO` | Normal business events worth recording | Order created, user logged in, report generated |
| `DEBUG` | Detailed diagnostic info for developers | SQL query executed, cache hit/miss, request parameters |
| `TRACE` | Extremely detailed, per-request stepping | Method entry/exit, variable values at each step |

**Production rule:** Set the root level to INFO. Set your application package to DEBUG only when investigating an issue. Never use DEBUG in production long-term — it generates too much data and can mask real problems.

## How we use it in organizations

### Scenario 1: MDC for request tracing

**MDC** (Mapped Diagnostic Context) lets you attach key-value pairs to the current thread's log output. Every log line within that request automatically includes the request ID:

```java
@Component
public class RequestContextFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        try {
            String requestId = UUID.randomUUID().toString().substring(0, 8);
            MDC.put("requestId", requestId);
            MDC.put("userId", getCurrentUserId(request));
            MDC.put("remoteAddr", request.getRemoteAddr());

            chain.doFilter(request, response);
        } finally {
            MDC.clear();  // always clear — thread pool reuse means stale data
        }
    }
}
```

```xml
<!-- logback-spring.xml: include MDC fields in every log line -->
<pattern>%d{HH:mm:ss.SSS} [%thread] [%X{requestId}] [%X{userId}] %-5level %logger{36} - %msg%n</pattern>
```

Output:
```
14:23:01.234 [http-nio-8080-exec-5] [a3f2b1c9] [user-42] INFO  OrderService - Processing order ORD-123
14:23:01.456 [http-nio-8080-exec-5] [a3f2b1c9] [user-42] DEBUG OrderService - SQL: SELECT * FROM orders WHERE id = ?
14:23:01.789 [http-nio-8080-exec-5] [a3f2b1c9] [user-42] INFO  OrderService - Order ORD-123 completed
```

When an error occurs, you grep by `requestId` and see the entire request lifecycle.

### Scenario 2: Structured JSON logs for log aggregation

In production with ELK (Elasticsearch + Logstash + Kibana) or Datadog, you want machine-parseable logs:

```xml
<!-- logback-spring.xml -->
<appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
    <encoder class="net.logstash.logback.encoder.LogstashEncoder">
        <includeMdcKeyName>requestId</includeMdcKeyName>
        <includeMdcKeyName>userId</includeMdcKeyName>
        <fieldNames>
            <timestamp>[ignore]</timestamp>
            <message>msg</message>
        </fieldNames>
    </encoder>
</appender>
```

Output (one JSON object per line):
```json
{
  "@timestamp": "2024-01-15T14:23:01.234Z",
  "level": "INFO",
  "logger_name": "com.backendforge.OrderService",
  "msg": "Processing order ORD-123",
  "requestId": "a3f2b1c9",
  "userId": "user-42",
  "thread_name": "http-nio-8080-exec-5",
  "stack_trace": null
}
```

### Scenario 3: Sensitive data filtering

Never log passwords, credit card numbers, or API keys. Use a logback converter to mask sensitive fields:

```java
public class MaskingConverter extends ClassicConverter {
    private static final Pattern SENSITIVE = Pattern.compile(
        "(password|token|secret|ssn|creditCard)[\"\\s:=]+([^,\\s\"}]+)",
        Pattern.CASE_INSENSITIVE
    );

    @Override
    public String convert(ILoggingEvent event) {
        String msg = event.getFormattedMessage();
        if (msg == null) return msg;
        Matcher m = SENSITIVE.matcher(msg);
        return m.replaceAll("$1=***REDACTED***");
    }
}
```

```xml
<conversionRule conversionWord="maskedMsg" converterClass="com.backendforge.MaskingConverter" />
<appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
    <encoder>
        <pattern>%d %maskedMsg%n</pattern>
    </encoder>
</appender>
```

### Scenario 4: Async appender for performance

Logging synchronously blocks the request thread. In high-throughput systems, use an async appender:

```xml
<appender name="ASYNC" class="ch.qos.logback.classic.AsyncAppender">
    <appender-ref ref="FILE" />
    <queueSize>8192</queueSize>
    <discardingThreshold>0</discardingThreshold>  <!-- never drop WARN/ERROR -->
</appender>
```

**Key settings:**
- `queueSize` — Buffer size for log events (default 256, increase for high throughput)
- `discardingThreshold` — When the queue has fewer entries than this, discard DEBUG/TRACE (0 = never discard)
- `neverBlock` — If true, never block the calling thread; just drop events if the queue is full

### Scenario 5: Conditional logging with lambda

Avoid expensive string concatenation when the log level is disabled:

```java
// BAD — always concatenates the string, even when DEBUG is disabled
log.debug("User details: " + user.toString());

// GOOD — only evaluates when DEBUG is enabled
log.debug("User details: {}", user.toString());

// BEST — the lambda is not evaluated at all if DEBUG is disabled
log.atDebug().log(() -> "User details: " + expensiveToJson(user));
```

## Logback configuration hierarchy

```xml
<configuration>
    <!-- Root logger: applies to all packages unless overridden -->
    <root level="INFO">
        <appender-ref ref="CONSOLE" />
        <appender-ref ref="ASYNC" />
    </root>

    <!-- Package-specific overrides -->
    <logger name="com.backendforge" level="DEBUG" />
    <logger name="org.hibernate.SQL" level="DEBUG" />
    <logger name="org.springframework" level="WARN" />

    <!-- Spring Boot profile-aware configuration -->
    <springProfile name="prod">
        <root level="WARN">
            <appender-ref ref="JSON" />
        </root>
    </springProfile>
</configuration>
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Using `System.out.println` | No levels, no timestamps, no rotation, not searchable |
| String concatenation in log calls | Wasted CPU even when level is disabled |
| Logging sensitive data | Security breach, compliance violation |
| Not clearing MDC in finally | Stale data on thread pool reuse |
| Synchronous logging in hot path | Thread blocks on I/O, throughput drops |
| Too many DEBUG logs in production | Disk fills, performance degrades, signal lost in noise |
| Catching exceptions and not logging them | Silent failures, impossible to debug |
