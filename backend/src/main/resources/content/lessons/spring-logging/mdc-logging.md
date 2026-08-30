---
title: MDC Logging — Context Across Threads
summary: How the MDC (Mapped Diagnostic Context) works, adding request-scoped data to logs, thread propagation, and production logging patterns.
order: 3
minutes: 15
topics: [mdc, diagnostic-context, request-scoped, thread-local, logging-context]
docs:
  - https://www.slf4j.org/manual.html#mdc
---

## The Concept, From Zero

MDC (Mapped Diagnostic Context) lets you add key-value data to all log lines from the current thread. It's how you add request IDs, user IDs, and other context to logs without passing them everywhere.

```java
// Add context
MDC.put("requestId", "abc-123");
MDC.put("userId", "42");

log.info("Processing order");  // automatically includes requestId and userId

// Output: 14:30:15 INFO [http-nio-8080-exec-1] [requestId=abc-123, userId=42] MyService - Processing order
```

---

## Line-by-Line Walkthrough

```java
import org.slf4j.MDC;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.UUID;

@RestController
public class OrderController {

    private static final Logger log = LoggerFactory.getLogger(OrderController.class);

    // 1. Filter that sets MDC for every request
    @Component
    public static class MdcFilter implements Filter {
        @Override
        public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
                throws IOException, ServletException {
            String requestId = UUID.randomUUID().toString().substring(0, 8);
            MDC.put("requestId", requestId);
            try {
                chain.doFilter(req, res);
            } finally {
                MDC.clear();  // always clean up
            }
        }
    }

    // 2. Logs automatically include MDC context
    @PostMapping("/orders")
    public Order createOrder(@RequestBody CreateOrderRequest request) {
        log.info("Creating order for user {}", request.getUserId());  // has requestId
        Order order = orderService.create(request);
        log.info("Order created: {}", order.getId());  // same requestId
        return order;
    }

    // 3. Adding more context in service layer
    @Service
    public static class OrderService {
        private static final Logger log = LoggerFactory.getLogger(OrderService.class);

        public Order create(CreateOrderRequest request) {
            MDC.put("userId", String.valueOf(request.getUserId()));
            try {
                log.info("Processing payment");  // has requestId + userId
                // ... process payment
                return new Order(UUID.randomUUID().toString());
            } finally {
                MDC.remove("userId");  // remove, don't clear (other keys may exist)
            }
        }
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Log pattern with MDC

```yaml
logging:
  pattern:
    console: "%d{HH:mm:ss.SSS} %-5level [%thread] [%X{requestId:-?}] [%X{userId:-?}] %logger - %msg%n"
```

### Scenario 2: Async MDC propagation

```java
// MDC is ThreadLocal — doesn't propagate to async threads
// Use ContextCopyingDecorator for @Async methods
@Component
public class ContextCopyingDecorator implements TaskDecorator {
    @Override
    public Runnable decorate(Runnable runnable) {
        Map<String, String> contextMap = MDC.getCopyOfContextMap();
        return () -> {
            try {
                if (contextMap != null) MDC.setContextMap(contextMap);
                runnable.run();
            } finally {
                MDC.clear();
            }
        };
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Forgetting MDC.clear() | Memory leak, wrong context in next request | Always clear in finally block |
| MDC in async threads | Lost context | Use TaskDecorator to propagate |
| Using MDC.put() in loops | Performance overhead | Set once per request, not per iteration |
| Using MDC.remove() instead of clear() | Leftover keys from previous request | Use clear() in filter finally block |
