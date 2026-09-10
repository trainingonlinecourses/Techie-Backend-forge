---
title: Spring Boot Logging — From SLF4J to Production
summary: What logging frameworks Spring Boot uses, configuring Logback, log levels, file rotation, structured logging, and how organizations manage logs at scale.
order: 2
minutes: 22
topics: [logging, slf4j, logback, log-levels, structured-logging, spring-boot]
docs:
  - https://docs.spring.io/spring-boot/reference/features/logging.html
---

## The Concept, From Zero

Spring Boot uses **SLF4J** (facade) + **Logback** (implementation) by default:

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class OrderService {
    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    public void createOrder(Order order) {
        log.info("Creating order for customer: {}", order.customerId());
        try {
            orderRepository.save(order);
            log.debug("Order saved with ID: {}", order.id());
        } catch (Exception e) {
            log.error("Failed to create order: {}", order.customerId(), e);
            throw e;
        }
    }
}

---

## Log Levels

```
TRACE < DEBUG < INFO < WARN < ERROR
```

```yaml
# application.yml
logging:
  level:
    root: INFO
    com.acme: DEBUG
    com.acme.repository: TRACE
    org.springframework.web: WARN
    org.hibernate.SQL: DEBUG
```

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. Line 1: Logger creation
2. Best practice: use class name
3. Line 2: MDC (Mapped Diagnostic Context) — per-request logging
4. `MDC.clear();` — Always clean up!
5. Line 3: application.yml logging configuration. Logging: level: root: INFO. Com.acme: DEBUG. Org.springframework: WARN. File: name: logs/application.log. Logback: rollingpolicy: max-file-size: 10MB. Max-history: 30. Total-size-cap: 1GB
6. Line 4: Structured logging with keys. Log.info("Order created orderId={} customerId={} amount={}",. Order.id(), order.customerId(), order.total());
7. Line 5: Conditional logging
8. Line 6: Profile-specific logging. Logging: level: com.acme: INFO. ---. Spring: config: activate: on-profile: dev. Logging: level: com.acme: DEBUG

The same code, clean:

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import java.util.UUID;

@Service
public class LoggingDemo {
    private static final Logger log = LoggerFactory.getLogger(LoggingDemo.class);

    public void processRequest(String requestId) {
        MDC.put("requestId", requestId);

        try {
            log.info("Processing request");
            log.debug("Request details: {}", requestId);
            log.warn("Slow query detected");
            log.error("Processing failed", new RuntimeException("boom"));
        } finally {
            MDC.clear();
        }
    }
}



if (log.isDebugEnabled()) {
    log.debug("Expensive computation: {}", expensiveToString(data));
}
```

---

## Real-World Scenarios

### Scenario 1: Request logging filter

@Component
public class RequestLoggingFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RequestLoggingFilter.class);

    @Override
    protected void doFilterInternal(HttpServletRequest request,
            HttpServletResponse response, FilterChain chain) throws IOException, ServletException {

        String requestId = UUID.randomUUID().toString();
        MDC.put("requestId", requestId);
        MDC.put("userId", request.getHeader("X-User-Id"));

        long start = System.currentTimeMillis();
        try {
            chain.doFilter(request, response);
        } finally {
            long duration = System.currentTimeMillis() - start;
            log.info("method={} path={} status={} duration={}ms",
                request.getMethod(),
                request.getRequestURI(),
                response.getStatus(),
                duration);
            MDC.clear();
        }
    }
}

// logback-spring.xml pattern:
// %d{HH:mm:ss.SSS} [%thread] [%X{requestId}] %-5level %logger{36} - %msg%n

### Scenario 2: Audit logging

@Aspect
@Component
public class AuditLoggingAspect {
    private static final Logger auditLog = LoggerFactory.getLogger("AUDIT");

    @Around("@annotation(audited)")
    public Object audit(ProceedingJoinPoint joinPoint, Audited audited) throws Throwable {
        String user = SecurityContextHolder.getContext().getAuthentication().getName();
        String action = audited.action();

        auditLog.info("user={} action={} method={}",
            user, action, joinPoint.getSignature().getName());

        Object result = joinPoint.proceed();

        auditLog.info("user={} action={} status=SUCCESS", user, action);
        return result;
    }
}

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `System.out.println` | No levels, no formatting | Use SLF4J logger |
| String concatenation in log | Performance hit even if disabled | Use parameterized messages: `log.info("{}", variable)` |
| Not cleaning MDC | Memory leak, stale data | Always `MDC.clear()` in finally |
| Logging sensitive data | Security risk | Sanitize before logging |
| Too verbose in production | Disk fills up | Set WARN/ERROR for production |

## References

- [Learn Java Online — interactive exercises](https://www.learnjavaonline.org/)
- [docs.spring.io/spring-boot/reference/features/logging.html](https://docs.spring.io/spring-boot/reference/features/logging.html)
