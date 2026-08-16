---
title: Distributed Tracing with Micrometer Tracing
summary: Trace ids across services, W3C propagation, Zipkin/OTel exporters, and debugging a request end to end.
order: 6
minutes: 18
topics: [tracing, micrometer, opentelemetry, zipkin, trace-id]
docs:
  - https://docs.spring.io/spring-boot/reference/actuator/tracing.html
  - https://micrometer.io/docs/tracing
  - https://opentelemetry.io/docs/
---

# Distributed Tracing with Micrometer Tracing

## The problem

A request now crosses gateway → order-service → inventory-service. When it fails, which hop failed? With only per-service logs you get 3 log files, 3 timestamps, 3 request ids — and no way to connect them.

**Distributed tracing** gives every request a **trace id**, propagates it across every hop, and records a **span** per operation:

```
traceId = 4bf92f3577b34da6a3ce929d0e0e4736
  span: gateway /api/orders/42            ├── 12ms
  span: order-service /api/orders/42      │   ├── 9ms
  span: order-service inventory:getStock  │   │   ├── 7ms
  span: inventory-service /api/inventory  │   │   │   └── 6ms
```

## The modern stack (Sleuth is retired)

| Layer | Job |
|---|---|
| **Micrometer Tracing** | The API: `Tracer`, spans, propagation (in Boot 3) |
| **Bridge** | Brave or OpenTelemetry — the actual instrumentation |
| **Exporter** | Zipkin, Tempo, Jaeger, Datadog, Cloud traces |
| **Backend UI** | Search by trace id, waterfall view, service map |

## 1. Dependencies

```xml
<!-- Tracing bridge: Brave (Boot manages the version) -->
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-brave</artifactId>
</dependency>
<!-- Optional: report spans to a Zipkin server -->
<dependency>
    <groupId>io.zipkin.reporter2</groupId>
    <artifactId>zipkin-reporter-brave</artifactId>
</dependency>
```

(For OpenTelemetry instead: `micrometer-tracing-bridge-otel` + `io.opentelemetry:opentelemetry-exporter-otlp`.)

## 2. Configuration (every service)

```yaml
management:
  tracing:
    sampling:
      probability: 1.0            # 1.0 = trace everything (0.1 typical in prod)
  zipkin:
    tracing:
      endpoint: http://localhost:9411/api/v2/spans
```

Add this to *every* service — that's it. HTTP clients (RestClient, WebClient, Feign, Gateway routing) are instrumented automatically.

## 3. Propagation: how the trace id travels

Micrometer propagates **W3C `traceparent`** by default: each service reads the incoming header, adds its span, and passes the same trace id on:

```
client:  traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
gateway ─▶ order-service ─▶ inventory-service   (same trace id, new span id per hop)
```

You'll see this header in your own logs if you log it. Which leads to…

## 4. Correlation: logs joined to traces

The whole point: **your log lines carry the trace id** so you can jump from a log message to the waterfall and back.

```yaml
logging:
  pattern:
    level: '%5p [${spring.application.name:},%X{traceId:-},%X{spanId:-}]'   # MDC fields
```

```java
@RestController
public class OrderController {

    private final Tracer tracer;

    @GetMapping("/api/orders/{id}")
    public Order order(@PathVariable String id) {
        log.info("fetching order id={}", id);
        // log output: [order-service,4bf92f3577b34da6a3ce929d0e0e4736,00f067aa0ba902b7] ...
        ...
    }
}
```

Now any log aggregator (ELK, Loki, CloudWatch) can filter **by trace id** and rebuild the whole request across all services.

## 5. Adding custom spans

Instrumentation is automatic for HTTP; add spans for meaningful boundaries (DB queries, cache, business steps):

```java
Span span = tracer.nextSpan().name("cache.lookup").start();
try (Tracer.SpanInScope ws = tracer.withSpan(span)) {
    Order order = cache.get(id);
} finally {
    span.end();
}
```

Keep custom spans minimal — automatic HTTP/DB spans cover 90% of debugging.

## 6. Running a tracing backend

```bash
docker run -d -p 9411:9411 openzipkin/zipkin
# alternatives: Grafana Tempo (with Loki/Prometheus), Jaeger, cloud vendors
```

Then: make a request through the gateway → open Zipkin → search the trace id (or just the service name) → see the waterfall with timings per service.

## The three observability pillars, together

| Pillar | Answers | Tooling |
|---|---|---|
| **Metrics** | Is it slow? How many errors? (p99, error rate) | Micrometer + Prometheus + Grafana |
| **Logs** | What exactly happened? (with trace ids) | Structured logs + aggregator |
| **Traces** | Which service/hop caused it? | Micrometer Tracing + Zipkin/Tempo |

A trace id is the *join key*: alert on metrics → read logs with that trace id → open the trace waterfall.

> **Why it matters (organizational view)** — "Which service is slow?" is answered in 30 seconds with tracing, or in 3 hours without it. The org standard: every service ships tracing (W3C propagation, 1.0 sampling in dev / ~0.1 in prod), every log line carries the trace id, and one trace backend (Tempo or Zipkin) is part of the platform. Trace ids in error responses make support tickets actionable: *"here's trace `abc…`"*.

## Key takeaways

- Micrometer Tracing + a bridge (Zipkin/OTel) + one exporter config per service.
- `traceparent` propagates the id across all hops automatically.
- Put `%X{traceId:-}` in the log pattern — logs join traces.
- Metrics alert, logs explain, traces locate — one trace id connects them.

**Official docs:** [Boot tracing](https://docs.spring.io/spring-boot/reference/actuator/tracing.html) · [Micrometer Tracing](https://micrometer.io/docs/tracing) · [OpenTelemetry](https://opentelemetry.io/docs/)
