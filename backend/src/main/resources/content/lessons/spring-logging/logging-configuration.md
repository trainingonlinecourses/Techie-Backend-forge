---
title: Spring Boot Logging — From SLF4J to Production
summary: What logging frameworks Spring Boot uses, configuring Logback, log levels, file rotation, structured logging, and how organizations manage logs at scale.
order: 1
minutes: 22
topics: [logging, slf4j, logback, log-levels, structured-logging, spring-boot]
docs:
  - https://docs.spring.io/spring-boot/reference/features/logging.html
---

## The Concept, From Zero

Spring Boot uses **SLF4J** (facade) + **Logback** (implementation) by default:

```java
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
```

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

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import java.util.UUID;

// Line 1: Logger creation
@Service
public class LoggingDemo {
    // Best practice: use class name
    private static final Logger log = LoggerFactory.getLogger(LoggingDemo.class);

    public void processRequest(String requestId) {
        // Line 2: MDC (Mapped Diagnostic Context) — per-request logging
        MDC.put("requestId", requestId);

        try {
            log.info("Processing request");
            log.debug("Request details: {}", requestId);
            log.warn("Slow query detected");
            log.error("Processing failed", new RuntimeException("boom"));
        } finally {
            MDC.clear();  // Always clean up!
        }
    }
}

// Line 3: application.yml logging configuration
// logging:
//   level:
//     root: INFO
//     com.acme: DEBUG
//     org.springframework: WARN
//   file:
//     name: logs/application.log
//   logback:
//     rollingpolicy:
//       max-file-size: 10MB
//       max-history: 30
//       total-size-cap: 1GB

// Line 4: Structured logging with keys
// log.info("Order created orderId={} customerId={} amount={}",
//     order.id(), order.customerId(), order.total());

// Line 5: Conditional logging
if (log.isDebugEnabled()) {
    log.debug("Expensive computation: {}", expensiveToString(data));
}

// Line 6: Profile-specific logging
// logging:
//   level:
//     com.acme: INFO
// ---
// spring:
//   config:
//     activate:
//       on-profile: dev
// logging:
//   level:
//     com.acme: DEBUG
```

---

## Real-World Scenarios

### Scenario 1: Request logging filter

```java
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
```

### Scenario 2: Audit logging

```java
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
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `System.out.println` | No levels, no formatting | Use SLF4J logger |
| String concatenation in log | Performance hit even if disabled | Use parameterized messages: `log.info("{}", variable)` |
| Not cleaning MDC | Memory leak, stale data | Always `MDC.clear()` in finally |
| Logging sensitive data | Security risk | Sanitize before logging |
| Too verbose in production | Disk fills up | Set WARN/ERROR for production |
