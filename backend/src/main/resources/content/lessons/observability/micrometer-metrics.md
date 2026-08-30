---
title: Micrometer Metrics Fundamentals
module: observability
order: 1
minutes: 25
topics: ["MeterRegistry", "Counter", "Timer", "Gauge", "DistributionSummary", "Actuator metrics"]
docs:
  - title: "Metrics"
    url: "https://docs.spring.io/spring-boot/reference/actuator/metrics.html"
summary: Observability has three pillars: metrics (numbers), logs (events), and traces (request paths). Micrometer is Spring Boot's metrics facade — a vendo...
---

# Micrometer Metrics Fundamentals

Observability has three pillars: **metrics** (numbers), **logs** (events), and **traces** (request paths). Micrometer is Spring Boot's metrics facade — a vendor-neutral API that can emit to Prometheus, Datadog, Graphite, or any other backend with a one-line configuration change.

## Why Micrometer

Your code should not know where metrics go. Micrometer gives you primitives (`Counter`, `Timer`, `Gauge`) and registry implementations for every backend:

```xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
```

Hit `/actuator/prometheus` and you get the full metric set in Prometheus text format — no code written yet. Spring Boot auto-instruments HTTP, JDBC, JVM, and more.

## The Four Primitives

### Counter — monotonically increasing

```java
@Service
public class PaymentService {

    private final Counter paymentsCounter;

    public PaymentService(MeterRegistry registry) {
        this.paymentsCounter = Counter.builder("payments.total")
            .description("Total payments processed")
            .tag("currency", "USD")
            .register(registry);
    }

    public void charge() {
        paymentsCounter.increment();
    }
}
```

Prometheus: `payments_total{currency="USD"} 42`.

### Timer — durations

```java
private final Timer paymentLatency;

public PaymentService(MeterRegistry registry) {
    this.paymentLatency = Timer.builder("payments.latency")
        .description("Payment processing time")
        .publishPercentileHistogram()
        .register(registry);
}

public void charge() {
    paymentLatency.record(() -> gateway.charge(...));
    // or: long start = System.nanoTime(); ...; paymentLatency.record(
    //      Duration.ofNanos(System.nanoTime() - start));
}
```

Timers give count, sum, max, and (with `publishPercentileHistogram`) percentiles like p50/p95/p99 — the numbers that reveal real user experience.

### Gauge — current value (can go down)

```java
Gauge.builder("queue.size", queue, BlockingQueue::size)
    .description("Pending tasks in queue")
    .register(registry);

// For cached values, use a supplier:
Gauge.builder("cache.hit.ratio", this, CacheMetrics::hitRatio)
    .register(registry);
```

### DistributionSummary — sizes of things

```java
DistributionSummary summary = DistributionSummary.builder("order.amount")
    .description("Order amounts")
    .baseUnit("USD")
    .publishPercentileHistogram()
    .register(registry);

summary.record(order.getTotal());
```

## Tags: The Dimension That Makes Metrics Usable

Tags are **dimensions** — one metric, many slices. Always tag the stable, low-cardinality dimensions (region, status, type), never high-cardinality ones (user id, request id — those explode cardinality and kill your backend):

```java
Counter.builder("api.requests")
    .tag("endpoint", "/api/courses")
    .tag("method", "GET")
    .tag("status", "404")
    .register(registry);
```

The same counter, sliced by any tag at query time. A metric without tags is a number; a metric with tags is a dashboard.

## Naming Conventions

Micrometer normalizes names: dots become underscores for Prometheus (`payments.total` → `payments_total`). Follow the convention:

- `{domain}.{subsystem}.{action}` — `http.server.requests`, `jvm.memory.used`, `db.query.time`
- Namespace by component so queries can group.

## Built-in Metrics You Get Free

Spring Boot auto-registers:

- `jvm.memory.used` / `jvm.memory.max` — heap/non-heap
- `jvm.gc.pause` — GC pause times
- `jvm.threads.live` / `jvm.threads.peak`
- `http.server.requests` — every request, tagged with uri/method/status
- `jdbc.connections.active` / `jdbc.connections.max`
- `logback.events` — log volume by level
- `hikaricp.connections.*`

You get a production dashboard baseline **before writing a single metric** — instrument your domain, and rely on the auto-instrumentation for the platform.

## Timers Around External Calls

The most valuable custom metrics wrap dependencies:

```java
@Service
public class ExternalApiClient {

    private final Timer calls;
    private final Counter errors;

    public ExternalApiClient(MeterRegistry registry) {
        this.calls = Timer.builder("external.api.latency")
            .tag("provider", "payments-gateway")
            .publishPercentileHistogram()
            .register(registry);
        this.errors = Counter.builder("external.api.errors")
            .tag("provider", "payments-gateway")
            .register(registry);
    }

    public String fetch(String path) {
        return calls.record(() -> {
            try {
                return restClient.get().uri(path).retrieve().body(String.class);
            } catch (Exception e) {
                errors.increment();
                throw e;
            }
        });
    }
}
```

## Testing Metrics

```java
@SpringBootTest
class MetricsTest {

    @Autowired MeterRegistry registry;

    @BeforeEach
    void clear() { registry.clear(); }

    @Test
    void paymentIncrementsCounter() {
        paymentService.charge();

        Counter counter = registry.find("payments.total").counter();
        assertNotNull(counter);
        assertEquals(1, counter.count());
    }
}
```

Or assert against the Prometheus endpoint:

```java
@Test
void prometheusEndpointExposesMetrics() throws Exception {
    mockMvc.perform(get("/actuator/prometheus"))
        .andExpect(status().isOk())
        .andExpect(content().string(containsString("payments_total")));
}
```

## Summary

| Primitive | What it measures | Example |
|-----------|------------------|---------|
| Counter | Increasing count | requests, errors, events |
| Timer | Durations | latency, GC pauses, DB calls |
| Gauge | Current value | queue depth, connection pool |
| DistributionSummary | Distribution of sizes | order amounts, payload sizes |

Metrics answer *"what's happening right now, at scale"* — is latency creeping up, are errors spiking, is the queue growing? The next lessons cover health indicators, custom metrics wiring, dashboards, and distributed tracing.
