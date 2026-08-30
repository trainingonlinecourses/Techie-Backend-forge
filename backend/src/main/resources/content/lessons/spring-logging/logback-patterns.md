---
title: Logback Patterns — Structuring Your Logs
summary: Logback pattern syntax, common conversion words, custom patterns, colorized output, and production-ready log formats.
order: 2
minutes: 15
topics: [logback, pattern, conversion, layout, color, timestamp]
docs:
  - https://docs.spring.io/spring-boot/reference/features/logging.html
---

## The Concept, From Zero

Logback patterns control what your log lines look like. They use conversion words like `%d` (date), `%level` (log level), `%logger` (class name), and `%msg` (message).

```yaml
# application.yml
logging:
  pattern:
    console: "%d{HH:mm:ss.SSS} %-5level [%thread] %logger{36} - %msg%n"
```

Output: `14:30:15.123 INFO  [main] c.e.MyService - Processing request`

---

## Common Conversion Words

| Word | Meaning | Example |
|------|---------|---------|
| `%d` | Date/time | `%d{yyyy-MM-dd HH:mm:ss}` |
| `%level` | Log level | `INFO`, `DEBUG`, `ERROR` |
| `%logger` | Logger name | `com.example.MyService` |
| `%logger{36}` | Abbreviated logger | `c.e.MyService` |
| `%thread` | Thread name | `main`, `http-nio-8080-exec-1` |
| `%msg` | Log message | `Processing request` |
| `%n` | Newline | Platform-specific line break |
| `%mdc{key}` | MDC value | Custom context data |
| `%highlight` | Color | `%highlight(%-5level)` |

---

## Line-by-Line Walkthrough

```yaml
# application.yml — production-ready patterns
logging:
  pattern:
    # Console: colored, compact
    console: "%d{HH:mm:ss.SSS} %highlight(%-5level) [%thread] %cyan(%logger{36}) - %msg%n"

    # File: no colors, full info
    file: "%d{yyyy-MM-dd HH:mm:ss.SSS} %-5level [%thread] %logger{50} - %msg%n"

    # JSON (for log aggregation)
    json: "%d{ISO8601} %level %thread %logger %msg %mdc{requestId}%n"
```

### Custom Pattern in logback-spring.xml

```xml
<configuration>
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{HH:mm:ss.SSS} %highlight(%-5level) [%thread] %cyan(%logger{36}) - %msg%n</pattern>
        </encoder>
    </appender>

    <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>logs/app.log</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.TimeBasedRollingPolicy">
            <fileNamePattern>logs/app.%d{yyyy-MM-dd}.log</fileNamePattern>
            <maxHistory>30</maxHistory>
        </rollingPolicy>
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} %-5level [%thread] %logger{50} - %msg%n</pattern>
        </encoder>
    </appender>

    <root level="INFO">
        <appender-ref ref="CONSOLE" />
        <appender-ref ref="FILE" />
    </root>
</configuration>
```

---

## Real-World Scenarios

### Scenario 1: Request tracing with MDC

```java
@Component
public class MdcFilter implements Filter {
    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        String requestId = UUID.randomUUID().toString().substring(0, 8);
        MDC.put("requestId", requestId);
        try {
            chain.doFilter(req, res);
        } finally {
            MDC.clear();
        }
    }
}
```

Pattern: `%d{HH:mm:ss.SSS} %-5level [%thread] [%X{requestId}] %logger - %msg%n`

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Missing `%n` | Lines run together | Always end with `%n` |
| Using `%d` without format | Default format is too verbose | Specify: `%d{yyyy-MM-dd HH:mm:ss}` |
| Not abbreviating logger | Lines too long | Use `%logger{36}` |
| Colors in file appender | ANSI codes in log file | Only use colors in CONSOLE |
