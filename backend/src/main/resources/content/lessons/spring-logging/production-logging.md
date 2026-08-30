---
title: Production Logging — From Dev to Production
summary: Log levels, file rotation, externalized logging config, log shipping, and production debugging patterns.
order: 5
minutes: 15
topics: [production, log-levels, rotation, externalize, shipping, debugging]
docs:
  - https://docs.spring.io/spring-boot/reference/features/logging.html
---

## The Concept, From Zero

Production logging is different from dev logging: you need rotation (so logs don't fill disk), appropriate levels (not DEBUG in prod), and shipping (to central log aggregation).

```yaml
# Production logging config
logging:
  level:
    root: WARN
    com.example: INFO
    org.springframework: WARN
  file:
    name: /var/log/myapp/app.log
  logback:
    rollingpolicy:
      max-file-size: 100MB
      max-history: 30
      total-size-cap: 3GB
```

---

## Line-by-Line Walkthrough

```yaml
# application-prod.yml — production logging
logging:
  level:
    root: WARN
    com.example: INFO
    org.springframework.security: WARN
    org.hibernate.SQL: WARN
  file:
    name: /var/log/app/app.log
  logback:
    rollingpolicy:
      max-file-size: 100MB
      max-history: 30
      total-size-cap: 3GB
      clean-history-on-start: false
  pattern:
    file: "%d{yyyy-MM-dd HH:mm:ss.SSS} %-5level [%thread] [%X{requestId:-}] %logger{50} - %msg%n"
```

### Externalized Logback Config

```xml
<!-- logback-spring.xml in src/main/resources -->
<springProfile name="dev">
    <root level="DEBUG">
        <appender-ref ref="CONSOLE" />
    </root>
</springProfile>

<springProfile name="prod">
    <root level="WARN">
        <appender-ref ref="CONSOLE" />
        <appender-ref ref="FILE" />
    </root>
</springProfile>
```

---

## Real-World Scenarios

### Scenario 1: Dynamic log level changes

```java
// Actuator endpoint to change log levels at runtime
// POST /actuator/loggers/com.example.MyService
// {"configuredLevel": "DEBUG"}

// Or programmatically:
LoggerContext ctx = (LoggerContext) LoggerFactory.getILoggerFactory();
Logger logger = ctx.getLogger("com.example.MyService");
logger.setLevel(Level.DEBUG);
```

### Scenario 2: Log shipping to ELK

```xml
<!-- logback.xml for logstash -->
<appender name="LOGSTASH" class="net.logstash.logback.appender.LogstashTcpSocketAppender">
    <destination>logstash:5000</destination>
    <encoder class="net.logstash.logback.encoder.LogstashEncoder" />
</appender>
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| DEBUG level in production | Performance + disk space | Use INFO or WARN |
| No log rotation | Disk fills up | Configure max-file-size + max-history |
| Logging to /dev/stdout only | Lost on restart | Also log to file |
| Not monitoring log volume | Unexpected costs in cloud | Set up log volume alerts |
