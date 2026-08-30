---
title: Custom Actuator Endpoints — Exposing Your Own Health and Metrics
summary: How to create custom @Endpoint, @ReadOperation, @WriteOperation, and @DeleteOperation beans that plug into Spring Boot Actuator, with real-world organizational examples.
order: 2
minutes: 25
topics: ["@Endpoint", "@ReadOperation", "@WriteOperation", "@DeleteOperation", "custom health indicators", "custom metrics"]
docs:
  - url: "https://docs.spring.io/spring-boot/reference/actuator/endpoints.html"
    title: "Custom Endpoints"
---

## The Concept, From Zero

Spring Boot Actuator ships with standard endpoints like `/actuator/health` and `/actuator/info`. But every organization has its own health signals — "is the message queue backlog too high?", "are we within our API rate limit?", "how many users are currently online?".

**Custom Actuator endpoints** let you expose these as HTTP URLs that follow the exact same security model, serialization, and configuration as built-in endpoints. Operations teams can then monitor them with the same tools (Prometheus, Grafana, UptimeRobot) without any extra work.

Think of it like this: Spring provides the "frame" (the `/actuator/` URL space, the security, the JSON serialization). You provide the "picture" (your business-specific health checks and metrics).

**When organizations use this:**
- A fintech company exposes `/actuator/paymentGateway` showing Stripe/PayPal status, average latency, and error rate
- An e-commerce platform exposes `/actuator/inventory` showing stock levels per warehouse
- A SaaS company exposes `/actuator/subscription` showing active trial count, churn rate, MRR
- A media company exposes `/actuator/encoding` showing video transcoding queue depth

---

## How It Works — The Building Blocks

### The Three Annotations

Every custom endpoint is a Spring bean annotated with `@Endpoint`. Inside it, you write methods annotated with one of three operations:

| Annotation | HTTP Method | Purpose | Example |
|-----------|-------------|---------|---------|
| `@ReadOperation` | GET | Read data | Show current queue depth |
| `@WriteOperation` | POST | Change state | Clear a cache |
| `@DeleteOperation` | DELETE | Remove data | Purge expired sessions |

### Full Working Example — Queue Health Endpoint

Let's build an endpoint that monitors a message queue:

```java
package com.example.actuator;

import org.springframework.boot.actuate.endpoint.annotation.Endpoint;
import org.springframework.boot.actuate.endpoint.annotation.ReadOperation;
import org.springframework.boot.actuate.endpoint.annotation.WriteOperation;
import org.springframework.boot.actuate.endpoint.annotation.DeleteOperation;
import org.springframework.boot.actuate.endpoint.annotation.Selector;
import org.springframework.stereotype.Component;
import java.util.Map;

/**
 * Custom Actuator endpoint at /actuator/queueHealth
 * 
 * Shows queue depth, consumer lag, and error rate
 * for every message queue in the system.
 */
@Component
@Endpoint(id = "queueHealth")  // This becomes /actuator/queueHealth
public class QueueHealthEndpoint {

    private final QueueMonitor monitor;

    public QueueHealthEndpoint(QueueMonitor monitor) {
        this.monitor = monitor;
    }

    /**
     * GET /actuator/queueHealth
     * 
     * Returns a map of queue names to their health data.
     * The @ReadOperation means this is a GET endpoint.
     * Return type Map<String, Object> is auto-serialized to JSON.
     */
    @ReadOperation
    public Map<String, Object> getAllQueues() {
        return Map.of(
            "orders", Map.of(
                "depth", monitor.getDepth("orders"),
                "lag", monitor.getConsumerLag("orders"),
                "status", monitor.getDepth("orders") > 1000 ? "DEGRADED" : "UP"
            ),
            "notifications", Map.of(
                "depth", monitor.getDepth("notifications"),
                "lag", monitor.getConsumerLag("notifications"),
                "status", "UP"
            )
        );
    }

    /**
     * GET /actuator/queueHealth/{queueName}
     * 
     * The @Selector parameter maps to the path variable.
     * This lets you drill into a specific queue.
     */
    @ReadOperation
    public Map<String, Object> getQueueHealth(
            @Selector String queueName) {
        int depth = monitor.getDepth(queueName);
        long lag = monitor.getConsumerLag(queueName);
        return Map.of(
            "queue", queueName,
            "depth", depth,
            "consumerLag", lag,
            "status", depth > 1000 ? "DEGRADED" : "UP",
            "timestamp", System.currentTimeMillis()
        );
    }

    /**
     * POST /actuator/queueHealth/{queueName}/pause
     * 
     * @WriteOperation — changes state.
     * Returns true if the pause succeeded.
     */
    @WriteOperation
    public boolean pauseQueue(@Selector String queueName) {
        return monitor.pause(queueName);
    }

    /**
     * DELETE /actuator/queueHealth/{queueName}
     * 
     * @DeleteOperation — removes data (e.g., clears the queue).
     */
    @DeleteOperation
    public boolean purgeQueue(@Selector String queueName) {
        return monitor.purge(queueName);
    }
}
```

### Line-by-Line Breakdown

```java
@Component
@Endpoint(id = "queueHealth")  // The "id" becomes the URL path segment
public class QueueHealthEndpoint {
```
- `@Component` — Registers this as a Spring bean so it gets picked up automatically
- `@Endpoint(id = "queueHealth")` — Tells Actuator this is a custom endpoint. The `id` becomes the URL: `/actuator/queueHealth`

```java
    private final QueueMonitor monitor;

    public QueueHealthEndpoint(QueueMonitor monitor) {
        this.monitor = monitor;
    }
```
- Constructor injection of your `QueueMonitor` service. This is how your endpoint accesses real application data.

```java
    @ReadOperation
    public Map<String, Object> getAllQueues() {
```
- `@ReadOperation` — Maps to HTTP GET. Actuator will call this method when someone hits `GET /actuator/queueHealth`
- Return type `Map<String, Object>` — Actuator serializes this to JSON automatically

```java
    @ReadOperation
    public Map<String, Object> getQueueHealth(@Selector String queueName) {
```
- `@Selector` — Binds a path segment to the method parameter. `GET /actuator/queueHealth/orders` → `queueName = "orders"`

```java
    @WriteOperation
    public boolean pauseQueue(@Selector String queueName) {
```
- `@WriteOperation` — Maps to HTTP POST. Use for actions that change state.
- Returns `boolean` — Actuator serializes `{"paused": true}` or `{"paused": false}`

---

## Enabling Your Custom Endpoint

By default, custom endpoints are **exposed over HTTP but sensitive**. To make them fully accessible:

```yaml
# application.yml
management:
  endpoints:
    web:
      exposure:
        include: health,info,queueHealth,metrics  # Add your endpoint ID
  endpoint:
    queueHealth:
      enabled: true
      show-details: always  # Show full details, not just UP/DOWN
```

### The Same Endpoint for Multiple Queues

A common pattern is using `@Selector` with path variables:

```java
/**
 * Hierarchical endpoint:
 *   GET /actuator/queueHealth              → all queues
 *   GET /actuator/queueHealth/orders       → orders queue
 *   GET /actuator/queueHealth/orders/latency → specific metric
 */
@Endpoint(id = "queueHealth")
@Component
public class QueueHealthEndpoint {

    @ReadOperation
    public Map<String, Object> all() { ... }

    @ReadOperation
    public Map<String, Object> byName(@Selector String name) { ... }

    @ReadOperation
    public Map<String, Object> metric(
            @Selector String name,
            @Selector String metric) { ... }
}
```

---

## Real-World Scenario — API Rate Limiter Endpoint

A company needs to expose their API rate limiter status:

```java
@Component
@Endpoint(id = "rateLimiter")
public class RateLimiterEndpoint {

    private final RateLimiterService limiter;

    public RateLimiterEndpoint(RateLimiterService limiter) {
        this.limiter = limiter;
    }

    @ReadOperation
    public Map<String, Object> status() {
        return Map.of(
            "requestsPerMinute", limiter.getLimit(),
            "currentUsage", limiter.getCurrentCount(),
            "remaining", limiter.getRemaining(),
            "resetAt", limiter.getResetTime().toString(),
            "topClients", limiter.getTopClients(5)
        );
    }

    @ReadOperation
    public Map<String, Object> clientStatus(@Selector String clientId) {
        return Map.of(
            "clientId", clientId,
            "used", limiter.getClientUsage(clientId),
            "limit", limiter.getClientLimit(clientId),
            "throttled", limiter.isThrottled(clientId)
        );
    }

    @WriteOperation
    public boolean resetClient(@Selector String clientId) {
        return limiter.resetClient(clientId);
    }
}
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---------|--------------|-----|
| Forgetting `@Endpoint` on the class | Bean exists but Actuator ignores it | Add `@Endpoint(id = "...")` |
| Using `@RestController` instead of `@Endpoint` | Becomes a normal REST endpoint, not an Actuator endpoint | Use `@Endpoint` + `@ReadOperation` |
| Not enabling in `management.endpoints.web.exposure.include` | Endpoint returns 404 | Add your endpoint ID to the include list |
| Returning `void` from `@ReadOperation` | Actuator can't serialize nothing | Return a Map, POJO, or String |
| Making endpoints do heavy computation | Monitoring tools poll frequently, causing performance issues | Keep reads cheap, use caching |
| Exposing sensitive data without security | Anyone on the internet can see your internals | Use `management.endpoint.<id>.access` |

---

## Testing Custom Endpoints

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class QueueHealthEndpointTest {

    @LocalServerPort
    private int port;

    @Test
    void shouldReturnQueueHealth() {
        given()
            .baseUri("http://localhost:" + port)
            .accept(ContentType.JSON)
        .when()
            .get("/actuator/queueHealth")
        .then()
            .statusCode(200)
            .body("orders.status", notNullValue())
            .body("notifications.depth", greaterThanOrEqualTo(0));
    }

    @Test
    void shouldReturnSingleQueueHealth() {
        given()
            .baseUri("http://localhost:" + port)
        .when()
            .get("/actuator/queueHealth/orders")
        .then()
            .statusCode(200)
            .body("queue", equalTo("orders"));
    }
}
```
