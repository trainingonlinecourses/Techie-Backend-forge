---
title: Prometheus & Micrometer Metrics — Observability at Scale
summary: How Micrometer bridges Spring Boot to Prometheus, Grafana, and every monitoring backend, with custom metrics, histograms, and real organizational dashboards.
order: 3
minutes: 30
topics: ["micrometer", "prometheus", "counter", "timer", "gauge", "histogram", "meter registry"]
docs:
  - url: "https://docs.spring.io/spring-boot/reference/actuator/metrics.html"
    title: "Metrics with Micrometer"
---

## The Concept, From Zero

When your application runs in production, you need answers to questions like: "How many requests per second?", "What's the 95th percentile response time?", "How many users hit a 500 error in the last hour?".

**Micrometer** is Spring Boot's metrics facade — it gives you a simple API to record metrics, and then you plug in the "backend" (Prometheus, Datadog, CloudWatch, etc.) without changing your code. Think of it like SLF4J but for metrics instead of logs.

**The data flow:**
```
Your Code → Micrometer API → MeterRegistry → Prometheus → Grafana Dashboard
```

**When organizations use this:**
- E-commerce: Track add-to-cart rate, checkout conversion, payment failures per minute
- SaaS: Monitor active users, API calls per tenant, feature adoption
- FinOps: Count API calls per customer for billing, track cost per request
- SRE: Alert when error rate exceeds 1% or p99 latency exceeds 500ms

---

## The Three Core Metric Types

| Type | What It Measures | Example |
|------|-----------------|---------|
| **Counter** | Something that only goes up | Total requests, total errors, total signups |
| **Gauge** | Something that goes up AND down | Queue depth, active threads, CPU usage |
| **Timer** | Duration of operations | Request latency, DB query time, cache lookup |

---

## Counter — Counting Things

```java
package com.example.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Service;

@Service
public class OrderService {

    private final Counter orderCounter;
    private final Counter failedOrderCounter;

    public OrderService(MeterRegistry registry) {
        // Create a counter named "orders.created"
        // Tags add dimensions: "region=us-east", "plan=premium"
        this.orderCounter = Counter.builder("orders.created")
            .description("Total orders created")
            .tag("version", "v2")
            .register(registry);

        this.failedOrderCounter = Counter.builder("orders.failed")
            .description("Total failed orders")
            .register(registry);
    }

    public Order createOrder(CreateOrderRequest request) {
        try {
            Order order = processOrder(request);
            orderCounter.increment();  // count goes from 0 → 1 → 2 → 3...
            return order;
        } catch (Exception e) {
            failedOrderCounter.increment();
            throw new OrderException("Failed to create order", e);
        }
    }
}
```

### Line-by-Line Breakdown

```java
this.orderCounter = Counter.builder("orders.created")
    .description("Total orders created")
    .tag("version", "v2")
    .register(registry);
```
- `Counter.builder("orders.created")` — Names the metric. In Prometheus this becomes `orders_created_total`
- `.description(...)` — Human-readable description that appears in the metrics endpoint
- `.tag("version", "v2")` — A dimension label. You can filter by this in Grafana. Every unique tag combination is a separate time series
- `.register(registry)` — Connects the counter to the Micrometer registry (which talks to Prometheus)

```java
orderCounter.increment();  // The counter goes up by 1
orderCounter.increment(5); // The counter goes up by 5 (bulk increment)
```

**Prometheus output:**
```
# HELP orders_created_total Total orders created
# TYPE orders_created_total counter
orders_created_total{version="v2",} 142.0
```

---

## Gauge — Measuring Current State

```java
@Service
public class QueueHealthService {

    private final AtomicLong queueDepth = new AtomicLong(0);
    private final AtomicInteger activeConsumers = new AtomicInteger(0);

    public QueueHealthService(MeterRegistry registry) {
        // Gauge: reads the current value of queueDepth
        Gauge.builder("queue.depth", queueDepth, AtomicLong::get)
            .description("Current message queue depth")
            .register(registry);

        // Gauge with tags: one gauge per queue
        Gauge.builder("queue.depth.byQueue", queueDepth, AtomicLong::get)
            .tag("queue", "orders")
            .register(registry);

        // Gauge from a lambda
        Gauge.builder("queue.consumers", activeConsumers, AtomicInteger::get)
            .register(registry);
    }

    public void onMessageReceived() {
        queueDepth.incrementAndGet();  // Gauge goes up
    }

    public void onMessageProcessed() {
        queueDepth.decrementAndGet();  // Gauge goes down
    }
}
```

**Key difference from Counter:** Gauges can go DOWN. Counters only go UP. If you need to measure something that decreases, use a Gauge.

**Prometheus output:**
```
queue_depth 47.0
queue_consumers 3.0
```

---

## Timer — Measuring Duration

```java
@Service
public class PaymentService {

    private final MeterRegistry registry;

    public PaymentService(MeterRegistry registry) {
        this.registry = registry;
    }

    public PaymentResult processPayment(PaymentRequest request) {
        // Method 1: Timer.Sample (most flexible)
        Timer.Sample sample = Timer.start(registry);
        try {
            PaymentResult result = gateway.charge(request);
            sample.stop(Timer.builder("payment.processing")
                .tag("status", "success")
                .tag("provider", request.getProvider())
                .register(registry));
            return result;
        } catch (PaymentException e) {
            sample.stop(Timer.builder("payment.processing")
                .tag("status", "failed")
                .register(registry));
            throw e;
        }
    }

    // Method 2: @Timed annotation (simplest)
    @Timed(value = "payment.validation", description = "Payment validation time")
    public void validate(PaymentRequest request) {
        // Micrometer times this method automatically
        validator.validate(request);
    }

    // Method 3: Timer.record() for lambda-style
    public void sendConfirmation(Order order) {
        Timer timer = registry.timer("payment.confirmation");
        timer.record(() -> emailService.send(order));
    }
}
```

### What Timer Records

A single Timer records **six** metrics automatically:

| Metric | What It Measures | Example Value |
|--------|-----------------|---------------|
| `payment.processing.count` | How many times | 1,420 |
| `payment.processing.sum` | Total time | 71.2 seconds |
| `payment.processing.mean` | Average time | 50.1 ms |
| `payment.processing.max` | Slowest time | 2,340 ms |
| `payment.processing.histogram` | Distribution | p50, p90, p95, p99 |
| `payment.processing.percentile` | Pre-computed percentiles | 50th=45ms, 99th=890ms |

---

## Publishing to Prometheus

Add the dependency:
```xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

Configuration:
```yaml
# application.yml
management:
  endpoints:
    web:
      exposure:
        include: prometheus,health,info,metrics
  metrics:
    export:
      prometheus:
        enabled: true
    tags:
      application: backendforge-academy  # Added to every metric
```

**Prometheus scrapes this URL:** `GET /actuator/prometheus`

**Sample output:**
```
# HELP http_server_requests_seconds Duration of HTTP requests
# TYPE http_server_requests_seconds summary
http_server_requests_seconds_count{method="GET",uri="/api/content/modules",status="200",} 1523.0
http_server_requests_seconds_sum{method="GET",uri="/api/content/modules",status="200",} 76.15
http_server_requests_seconds_max{method="GET",uri="/api/content/modules",status="200",} 0.892

# HELP payment_processing_seconds Duration of payment processing
# TYPE payment_processing_seconds histogram
payment_processing_seconds_bucket{provider="stripe",status="success",le="0.01",} 45.0
payment_processing_seconds_bucket{provider="stripe",status="success",le="0.05",} 230.0
payment_processing_seconds_bucket{provider="stripe",status="success",le="0.1",} 890.0
```

---

## Real-World Scenario — Multi-Tenant SaaS Metrics

```java
@Component
public class TenantMetrics {

    private final MeterRegistry registry;

    public TenantMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    public void recordRequest(String tenantId, String endpoint, int status) {
        Counter.builder("api.requests")
            .tag("tenant", tenantId)
            .tag("endpoint", endpoint)
            .tag("status", String.valueOf(status))
            .register(registry)
            .increment();
    }

    public void recordLatency(String tenantId, String operation, Duration duration) {
        Timer.builder("tenant.operation.latency")
            .tag("tenant", tenantId)
            .tag("operation", operation)
            .publishPercentiles(0.5, 0.95, 0.99)  // Publish percentiles
            .register(registry)
            .record(duration);
    }

    public void gaugeActiveUsers(String tenantId, AtomicInteger count) {
        Gauge.builder("tenant.active.users", count, AtomicInteger::get)
            .tag("tenant", tenantId)
            .register(registry);
    }
}
```

**This creates metrics like:**
```
api_requests_total{tenant="acme-corp",endpoint="/api/orders",status="200"} 1234
api_requests_total{tenant="acme-corp",endpoint="/api/orders",status="500"} 3
tenant_operation_latency_seconds{tenant="acme-corp",operation="checkout",quantile="0.99"} 2.1
tenant_active_users{tenant="acme-corp"} 47
```

**Grafana dashboard queries:**
- Requests per second: `rate(api_requests_total[5m])`
- Error rate: `sum(rate(api_requests_total{status="500"}[5m])) / sum(rate(api_requests_total[5m])) * 100`
- P99 latency: `histogram_quantile(0.99, rate(tenant_operation_latency_seconds_bucket[5m]))`

---

## Common Mistakes

| Mistake | Why It's Wrong | Fix |
|---------|---------------|-----|
| Creating new Counter/Timer in every request | Creates millions of time series, crashes Prometheus | Create once in constructor, reuse |
| Using counter for things that decrease | Counter can only go up — using it for queue depth gives wrong results | Use Gauge for things that decrease |
| Too many unique tag values | "userId" as a tag = millions of time series = Prometheus OOM | Use high-cardinality tags sparingly |
| Forgetting to publish percentiles | Timer only records count/sum/max, no percentiles | Add `.publishPercentiles(0.5, 0.95, 0.99)` |
| Not including error status codes | You can't see failures in dashboards | Always tag with status code |

---

## Common Organizations Using This Pattern

| Company | What They Monitor | Dashboard Tool |
|---------|------------------|----------------|
| Netflix | Request latency, error rates, per-device metrics | Grafana |
| Spotify | Feature adoption, playlist creation rate | Grafana + Datadog |
| Uber | Ride completion rate, driver availability | Prometheus + Grafana |
| Shopify | Cart conversion, checkout funnel | Datadog |
