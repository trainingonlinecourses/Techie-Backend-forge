---
title: Custom Metrics That Matter
module: observability
order: 3
minutes: 22
topics: ["business metrics", "metric naming", "cardinality", "@Timed", "meter filters", "red metrics"]
summary: Platform metrics (JVM, HTTP, connection pools) come free. Business metrics — the numbers your product team asks about — must be added by you. This ...
docs:
  - title: "Metrics"
    url: "https://docs.spring.io/spring-boot/reference/actuator/metrics.html"
---

# Custom Metrics That Matter

Platform metrics (JVM, HTTP, connection pools) come free. **Business metrics** — the numbers your product team asks about — must be added by you. This lesson covers which metrics matter, how to name them, and how to avoid the cardinality trap that kills metric backends.

## The RED and USE Methods

Two mental models tell you what to measure:

**RED** (for services):
- **R**ate — requests per second
- **E**rrors — failed requests per second
- **D**uration — latency percentiles

**USE** (for resources):
- **U**tilization — how busy is it?
- **S**aturation — how much is queued/waiting?
- **E**rrors — what's failing?

Apply RED to every service you own; USE to every resource (DB, queue, thread pool).

## Business Metrics: The Product View

Instrument the numbers that answer "is the product working?":

```java
@Service
public class CheckoutService {

    private final Counter ordersPlaced;
    private final Counter checkoutsAbandoned;
    private final DistributionSummary orderValue;

    public CheckoutService(MeterRegistry registry) {
        this.ordersPlaced = Counter.builder("checkout.orders.placed").register(registry);
        this.checkoutsAbandoned = Counter.builder("checkout.abandoned")
            .tag("reason", "unknown").register(registry);
        this.orderValue = DistributionSummary.builder("checkout.order.value")
            .baseUnit("usd")
            .publishPercentileHistogram()
            .register(registry);
    }

    public Order placeOrder(Cart cart) {
        Order order = orderRepository.save(new Order(cart));
        ordersPlaced.increment();
        orderValue.record(order.getTotal());
        return order;
    }
}
```

These become the dashboard your stakeholders actually read: conversion, average order value, abandonment.

## The @Timed Annotation

Micrometer ships a Spring AOP integration — annotate instead of wrapping:

```xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-core</artifactId>
</dependency>
```

```java
@Configuration
public class MetricsConfig {
    @Bean
    public TimedAspect timedAspect(MeterRegistry registry) {
        return new TimedAspect(registry);
    }
}
```

```java
@Service
public class SearchService {

    @Timed(value = "search.latency", percentiles = {0.5, 0.95, 0.99})
    public List<Result> search(String query, String index) {
        return searchClient.query(query, index);
    }
}
```

`@Timed` produces count, sum, max, and percentiles for every invocation of the method — including failures (unless `@Timed(exception = ...)` filters).

## Metric Naming Conventions

Micrometer normalizes names per backend (Prometheus underscores). Choose names that read well in queries:

```
{domain}.{subsystem}.{action}
payment.authorize.latency
order.create.counter
search.query.count
```

Rules:
- Lowercase, dots as separators
- No spaces, no tags in the name
- Base unit suffixes (`_seconds`, `_bytes`) come from `.baseUnit(...)`, not the name

## The Cardinality Trap

**Never** tag with unbounded values:

```java
// ❌ Cardinality explosion: one series per user!
Counter.builder("api.requests")
    .tag("userId", userId)      // 1M users = 1M time series
    .register(registry);

// ❌ Same: request-scoped values
Counter.builder("api.requests")
    .tag("requestId", UUID.randomUUID().toString())
    .register(registry);
```

Every unique tag combination is a **time series**. Prometheus chokes past ~100k series per instance. Rule of thumb: tags should have < 100 stable values. `userId`, `requestId`, `email` are metrics poison.

## Meter Filters

Trim and rename metrics centrally with `MeterFilter`:

```java
@Bean
public MeterFilter meterFilter() {
    return MeterFilter.denyNameStartsWith("jvm.buffer");          // drop noisy
}
```

```java
@Bean
public MeterFilter renameFilter() {
    return MeterFilter.renameTag("http.server.requests", "uri", "endpoint");
}
```

```java
@Bean
public MeterFilter cardinalityGuard() {
    return MeterFilter.maximumAllowableTags("http.server.requests", "uri", 500,
        MeterFilter.deny());
}
```

The cardinality guard is a production lifesaver: unbounded URI tags (from user-supplied paths) get dropped past a threshold instead of flooding the backend.

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Tagging user/request ids | Use low-cardinality dimensions |
| Creating meters per call | Build once in constructor/`@PostConstruct` |
| Counting with `Gauge.increment` | Gauges are not counters — use Counter |
| Timing with `System.currentTimeMillis()` | Use Timer with `Duration` |
| Not setting base units | `_seconds`, `_bytes` for correct queries |
| Ignoring the free metrics | You already have JVM/HTTP metrics — use them |

## Testing Custom Metrics

```java
@Test
void placingOrderIncrementsBusinessMetric() {
    checkoutService.placeOrder(cart(100.00));

    Counter placed = registry.find("checkout.orders.placed").counter();
    assertEquals(1, placed.count());

    DistributionSummary value = registry.find("checkout.order.value").summary();
    assertEquals(100.0, value.takeSnapshot().max(), 0.001);
}
```

## Summary

| Layer | Metric set |
|-------|------------|
| Platform (free) | JVM memory/GC/threads, HTTP requests, connection pools |
| RED (service) | Rate, errors, duration per endpoint |
| USE (resource) | Utilization, saturation, errors per dependency |
| Business | Orders, conversions, AOV, signups — the product's pulse |

Custom metrics are how your operations team answers "is the new deploy actually better?" — instrument the business outcomes and the infrastructure, keep cardinality bounded, and your dashboards will tell the truth.
