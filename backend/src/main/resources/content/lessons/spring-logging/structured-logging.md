---
title: Structured Logging — Machine-Readable Logs
summary: JSON log format, log aggregation with ELK/Datadog, key-value logging, and why structured logs are essential for production observability.
order: 4
minutes: 15
topics: [structured-logging, json, elk, datadog, log-aggregation, key-value]
docs:
  - https://docs.spring.io/spring-boot/reference/features/logging.html
---

## The Concept, From Zero

Structured logging outputs logs as JSON instead of plain text. This makes them machine-parseable for searching, filtering, and alerting in tools like ELK, Datadog, or CloudWatch.

```json
{"timestamp":"2024-01-15T14:30:15.123Z","level":"INFO","thread":"http-nio-8080-exec-1","logger":"c.e.OrderService","message":"Order created","orderId":"ORD-123","userId":"42","requestId":"abc-123"}
```

vs plain text:

```
14:30:15.123 INFO [http-nio-8080-exec-1] c.e.OrderService - Order created orderId=ORD-123 userId=42
```

---

## JSON Layout in Logback

```xml
<!-- logback-spring.xml -->
<configuration>
    <appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
        <encoder class="net.logstash.logback.encoder.LogstashEncoder">
            <includeMdcKeyName>requestId</includeMdcKeyName>
            <includeMdcKeyName>userId</includeMdcKeyName>
            <fieldNames>
                <timestamp>[ignore]</timestamp>
                <version>[ignore]</version>
            </fieldNames>
        </encoder>
    </appender>

    <root level="INFO">
        <appender-ref ref="JSON" />
    </root>
</configuration>
```

Dependency:

```xml
<dependency>
    <groupId>net.logstash.logback</groupId>
    <artifactId>logstash-logback-encoder</artifactId>
    <version>7.4</version>
</dependency>
```

---

## Line-by-Line Walkthrough

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

public class StructuredLoggingDemo {

    private static final Logger log = LoggerFactory.getLogger(StructuredLoggingDemo.class);

    public static void main(String[] args) {
        // 1. Basic structured fields
        MDC.put("requestId", "req-001");
        MDC.put("userId", "user-42");

        // Log with structured data
        log.info("Order created");

        // 2. Adding fields via argument array
        log.info("Payment processed orderId={} amount={} currency={}",
            "ORD-123", 99.99, "USD");

        // 3. Exception with stack trace
        try {
            throw new RuntimeException("Payment failed");
        } catch (Exception e) {
            log.error("Payment error orderId={}", "ORD-123", e);
            // Stack trace is included as "stack_trace" field in JSON
        }

        MDC.clear();
    }
}
```

---

## Real-World Scenarios

### Scenario 1: ELK stack integration

```yaml
# docker-compose.yml for log aggregation
services:
  elasticsearch:
    image: elasticsearch:8.11.0
  kibana:
    image: kibana:8.11.0
  logstash:
    image: logstash:8.11.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
```

### Scenario 2: Custom log fields

```java
// Add custom fields to every log line
@Component
public class RequestContextFilter implements Filter {
    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpReq = (HttpServletRequest) req;
        MDC.put("requestId", UUID.randomUUID().toString().substring(0, 8));
        MDC.put("method", httpReq.getMethod());
        MDC.put("path", httpReq.getRequestURI());
        MDC.put("clientIp", httpReq.getRemoteAddr());
        try {
            chain.doFilter(req, res);
        } finally {
            MDC.clear();
        }
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using plain text in production | Can't search/filter logs | Use JSON structured logging |
| Logging sensitive data in structured fields | Security risk in log aggregation | Mask PII, use @JsonIgnore |
| Not including request ID | Can't trace requests across services | Always add requestId to MDC |
| Forgetting to clear MDC | Memory leak, wrong context | Always clear in finally |
