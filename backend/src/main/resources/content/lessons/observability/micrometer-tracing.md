---
title: Distributed Tracing with Micrometer Tracing
module: observability
order: 4
minutes: 25
topics: ["traces", "spans", "Micrometer Tracing", "Brave", "Zipkin", "trace context propagation", "W3C"]
docs:
  - title: "Tracing"
    url: "https://docs.spring.io/spring-boot/reference/actuator/tracing.html"
summary: Logs say what happened on one node. Traces say what happened across the whole request — every service, every database call, every queue hop. Microm...
---

# Distributed Tracing with Micrometer Tracing

Logs say *what happened on one node*. Traces say *what happened across the whole request* — every service, every database call, every queue hop. Micrometer Tracing (the successor to Spring Cloud Sleuth) makes distributed tracing a dependency and two properties.

## Core Concepts

- **Trace** — the end-to-end path of one request, identified by a 128-bit `traceId`.
- **Span** — one unit of work inside the trace (an HTTP call, a DB query), identified by a `spanId`.
- **Parent/child** — spans nest; the trace is the tree.
- **Baggage** — key/value pairs that ride along (tenant id, user id).
- **Propagation** — passing the trace context across service boundaries via headers.

```
trace 4bf92f3577b34da6a3ce929d0e0e4736
├─ span /api/orders (Gateway)            ─┐
│   └─ span OrderService.create          │ propagation via
│       └─ span INSERT INTO orders       │ traceparent header
└─ span /api/orders (Order Service)    ──┘
```

## Setup: Zipkin + Brave

```xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-brave</artifactId>
</dependency>
<dependency>
    <groupId>io.zipkin.reporter2</groupId>
    <artifactId>zipkin-reporter-brave</artifactId>
</dependency>
```

```yaml
management:
  tracing:
    sampling:
      probability: 0.1          # 10% sample — enough signal, cheap
  zipkin:
    tracing:
      endpoint: ${ZIPKIN_URL:http://localhost:9411/api/v2/spans}
```

That's it. Spring Boot now:
- Creates a `Tracer` for your code
- Auto-instruments `RestClient`, `WebClient`, JDBC, JPA, Kafka, and more
- Propagates `traceparent`/`b3` headers across HTTP calls
- Reports spans to Zipkin

## Sampling: The Cost Control

100% tracing on a high-traffic API is expensive (CPU + storage). Production defaults: 1–10%. Increase during incidents:

```yaml
management:
  tracing:
    sampling:
      probability: 0.05
```

Or dynamically per-request with a `Sampler`:

```java
@Bean
public Sampler sampler() {
    return Sampler.ALWAYS_SAMPLE;   // demo only
}
```

## Adding Custom Spans

Wrap the parts that matter — an external call, a heavy computation:

```java
@Service
public class RecommendationService {

    private final Tracer tracer;
    private final RecommendationClient client;

    @SpanName("recommendations.fetch")
    public List<Recommendation> fetch(String userId) {
        Span span = tracer.nextSpan().name("recommendations.rank").start();
        try (Tracer.SpanInScope ws = tracer.withSpan(span)) {
            span.tag("user.id", userId);           // searchable attribute
            span.event("ranking-started");          // timestamped event
            return client.fetch(userId);
        } finally {
            span.end();
        }
    }
}
```

Or declaratively with `@Observed` (Micrometer Observation):

```java
@Configuration
public class ObservationConfig {
    @Bean
    public ObservedAspect observedAspect(ObservationRegistry registry) {
        return new ObservedAspect(registry);
    }
}
```

```java
@Observed(name = "recommendations.fetch")
public List<Recommendation> fetch(String userId) { ... }
```

`@Observed` is the modern approach — it produces **both** metrics and traces from one annotation, because an Observation is metrics + tracing + logging together.

## Propagation Across Services

Micrometer Tracing propagates the W3C `traceparent` header automatically:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
              │  │           │                      │             │
              │  │           │                      │             └─ flags (sampled)
              │  │           │                      └─ span id
              │  │           └─ trace id (128-bit)
              │  └─ version
              └─ version
```

Service B receives it, continues the same trace, and its spans attach to the same tree. This works across RestClient, WebClient, Kafka, JDBC, and messaging — automatically.

## Correlating Logs With Traces

The magic: inject the trace id into your logs so one query finds every line of a request:

```yaml
logging:
  pattern:
    level: "%5p [${spring.application.name:},%X{traceId:-},%X{spanId:-}]"
```

```
2026-08-18 10:00:00.123 INFO [order-service,4bf92f3577b34da6a3ce929d0e0e4736,00f067aa0ba902b7] Order created
```

Now in your log system, search `traceId=4bf92f...` and see every service's log line for that one request. This single feature is why tracing pays for itself on the first incident.

## Baggage: User Context Across Services

Pass business context without threading it through every method:

```java
// Add baggage to outgoing requests
Span.current().baggage().update("tenant.id", tenantId);
```

```java
// Read it in another service
String tenant = Span.current().baggage().get("tenant.id");
```

Configure baggage fields to propagate:

```yaml
management:
  tracing:
    baggage:
      remote-fields: tenant.id,user.id
```

Use baggage for *routing context* (tenant, region), not for data — it rides on every request.

## Choosing a Backend

| Backend | Notes |
|---------|-------|
| Zipkin | Self-hosted, battle-tested, simple |
| Jaeger | CNCF project, good UI, storage options |
| Tempo (Grafana) | Integrates with Prometheus/Loki ecosystem |
| Datadog / New Relic | Managed, SaaS |

The Micrometer facade means switching backends = changing one dependency + endpoint. Your code never changes.

## Testing Traces

```java
@SpringBootTest
class TracingTest {

    @Autowired Tracer tracer;

    @Test
    void customSpanRecordsTags() {
        Span span = tracer.nextSpan().name("test.span").start();
        span.tag("key", "value");
        span.end();
        assertEquals("value", span.context().traceId() != null ? "value" : null);
    }
}
```

Better: assert spans reached a test Zipkin receiver, or use `TestObservationRegistry` for `@Observed` methods.

## Summary

| Concept | In Spring |
|---------|-----------|
| Tracer | `io.micrometer.tracing.Tracer` bean |
| Custom spans | `tracer.nextSpan()` or `@Observed` / `@SpanName` |
| Auto-instrumentation | RestClient, WebClient, JDBC, Kafka, JPA |
| Propagation | W3C `traceparent` automatically |
| Log correlation | `%X{traceId:-}` in log pattern |
| Sampling | `management.tracing.sampling.probability` |
| Backend | Zipkin/Jaeger/Tempo — swappable |

Distributed tracing turns "the API is slow" from a mystery into a tree you can read: which hop added 900ms, which DB query blew the budget, which service dropped the context. It's the third pillar that makes the other two (logs, metrics) actually connectable.
