---
title: "Structured Logging — Finding Needles in Haystacks"
summary: "SLF4J basics, Logback configuration, MDC for context, structured logging with key-value pairs, and how organizations debug production issues."
order: 2
minutes: 18
topics: [logging, slf4j, logback, mdc, structured-logging, log-levels, logback-spring]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/html/features.html#features.logging
  - https://logback.qos.ch/manual/index.html
---

## The Concept, From Zero

### Why Logging Matters

Without logging:
```java
public Order createOrder(OrderRequest request) {
    Order order = new Order(request);
    orderRepository.save(order);
    paymentService.charge(order);
    notificationService.sendConfirmation(order);
    return order;
    // Something fails in production — you have NO idea what happened
}
```

With logging:
```java
public Order createOrder(OrderRequest request) {
    log.info("Creating order for user={} items={}", request.userId(), request.items().size());
    Order order = new Order(request);
    orderRepository.save(order);
    log.debug("Order saved: id={}", order.getId());
    paymentService.charge(order);
    log.info("Payment charged: orderId={} amount={}", order.getId(), order.getTotal());
    notificationService.sendConfirmation(order);
    log.info("Confirmation sent: orderId={}", order.getId());
    return order;
    // You know EXACTLY what happened and when
}
```

### SLF4J Basics

Spring Boot uses **SLF4J** (Simple Logging Facade for Java) with **Logback** as the implementation:

```java
@RestController
public class ProductController {
    
    // Create a logger for this class
    private static final Logger log = LoggerFactory.getLogger(ProductController.class);
    
    @GetMapping("/products/{id}")
    public Product getProduct(@PathVariable Long id) {
        log.debug("Fetching product with id={}", id);
        // ↑ DEBUG level — only shown when debug logging is enabled
        
        Product product = productService.findById(id);
        
        if (product == null) {
            log.warn("Product not found: id={}", id);
            // ↑ WARN level — always shown, indicates potential problem
            throw new ProductNotFoundException(id);
        }
        
        log.debug("Found product: id={} name={}", id, product.getName());
        return product;
    }
}
```

### Log Levels

| Level | When to Use | Production Default |
|-------|-------------|-------------------|
| `TRACE` | Very detailed, diagnostic | OFF |
| `DEBUG` | Development debugging | OFF |
| `INFO` | Normal operations | ON |
| `WARN` | Unexpected but recoverable | ON |
| `ERROR` | Failures requiring attention | ON |

### Logback Configuration

```xml
<!-- logback-spring.xml -->
<configuration>
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <!-- Structured format: timestamp level logger message -->
            <pattern>%d{ISO8601} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>
    
    <!-- Profile-specific configuration -->
    <springProfile name="dev">
        <root level="DEBUG">
            <appender-ref ref="CONSOLE"/>
        </root>
    </springProfile>
    
    <springProfile name="prod">
        <root level="INFO">
            <appender-ref ref="CONSOLE"/>
        </root>
        <!-- Add file appender for production -->
    </springProfile>
</configuration>
```

### MDC (Mapped Diagnostic Context)

MDC adds context to every log line in the current thread:

```java
@Slf4j
@RestController
public class OrderController {
    
    @PostMapping("/orders")
    public Order createOrder(@RequestBody OrderRequest request) {
        // Add context to all logs in this request
        MDC.put("userId", request.userId().toString());
        MDC.put("requestId", UUID.randomUUID().toString());
        
        try {
            log.info("Creating order");  // Automatically includes userId and requestId
            Order order = orderService.create(request);
            log.info("Order created: orderId={}", order.getId());
            return order;
        } catch (Exception e) {
            log.error("Failed to create order", e);  // Stack trace included
            throw e;
        } finally {
            MDC.clear();  // Clean up — prevent memory leaks
        }
    }
}
```

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| String concatenation in log calls | Performance hit even when level is disabled | Use parameterized logging: `log.info("msg {}", var)` |
| Logging sensitive data | Security breach | Never log passwords, tokens, SSNs |
| Not using MDC | Can't correlate logs across a request | Add userId, requestId to MDC |
| Catching exceptions and not logging them | Silent failures | Always log the exception |
| Using System.out.println | No level control, no formatting | Use SLF4J logger |

### Key Takeaways

1. **Always use parameterized logging** — `log.info("msg {}", var)` not `log.info("msg " + var)`
2. **Use MDC** — add request context to every log line
3. **Match log levels to environments** — DEBUG in dev, INFO in prod
4. **Never log sensitive data** — passwords, tokens, SSNs
5. **Use `logback-spring.xml`** — profile-specific configuration
6. **Include stack traces** — `log.error("msg", exception)` for debugging

### Real-World Organization Scenario

A microservices platform processes 1M requests/day. When a customer reports "my order disappeared," support uses the `requestId` from MDC to trace the request across 8 services. Each service logs the same `requestId`, making it possible to reconstruct the entire flow in seconds. Without MDC, debugging would take hours of searching across different log files.
