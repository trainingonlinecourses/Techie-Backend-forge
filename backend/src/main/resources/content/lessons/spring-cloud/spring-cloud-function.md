---
title: Spring Cloud Function
summary: Business logic as portable functions — the same Function/Supplier/Consumer deployed as a REST endpoint, a Kafka/Rabbit consumer, or a serverless function.
order: 10
minutes: 14
topics: [spring cloud function, functions, serverless, portability, function composition]
docs:
  - https://docs.spring.io/spring-cloud-function/reference/
---

# Spring Cloud Function

## The idea

Spring Cloud Function separates **business logic** from its **transport**. You write a plain `Function<T, R>`; the framework exposes it as whatever the deployment needs — a REST endpoint, a Kafka/Rabbit/Stream consumer, a serverless function (AWS Lambda, Azure). Same jar, different bindings, zero business-code changes.

```java
@Configuration
public class OrderFunctions {

    // The business logic — pure, portable, unit-testable:
    @Bean
    Function<OrderCreated, ShippingInstruction> planShipping() {
        return event -> shippingService.plan(event.orderId(), event.destination());
    }

    @Bean
    Consumer<PaymentFailed> alertFraud() {
        return event -> alertService.ping(event.orderId(), "payment-failed");
    }

    @Bean
    Supplier<Report> dailyReport() {
        return () -> reportService.generate();          // produces on demand / on schedule
    }
}
```

No controllers, no listeners — just functions with typed input/output.

## The transport is configuration

The same `planShipping` function deploys three ways:

```yaml
# 1. As a REST endpoint — exposed at /planShipping (POST):
spring.cloud.function.definition: planShipping

# 2. As a Spring Cloud Stream consumer (Kafka/Rabbit) — event-driven:
spring.cloud.function.definition: planShipping
spring.cloud.stream.bindings.planShipping-in-0.destination: orders.created

# 3. As a serverless function (AWS Lambda) — via the adapter dependency;
#    the handler maps the event source (API Gateway, SQS, S3) to the function.
```

The binding name rule is the same as Spring Cloud Stream: `<functionName>-in-0` / `-out-0`. **The function doesn't know or care** — that's the portability bet.

## Composition and routing

Functions compose the way they should — with `|`:

```yaml
spring.cloud.function.definition: validateOrder|planShipping
```

```java
@Bean
Function<OrderCreated, OrderCreated> validateOrder() {
    return o -> { if (!o.valid()) throw new IllegalArgumentException(); return o; };
}
// validateOrder|planShipping = the pipeline, declared in config, reorderable without code
```

**Routing** picks a function at runtime by a header/payload key:

```yaml
spring.cloud.function.routing.enabled: true
# the consumer inspects the routingKey header → dispatches to the named function
```

This is the "one app, many entry points" pattern — the function catalog is a registry, the definition is the wiring.

## Typed I/O and the function model

- **Types**: input/output can be `Message<T>` (to access headers — routing keys, correlation ids) or plain `T` (payload only). The framework converts JSON automatically.
- **Multiple functions**: `spring.cloud.function.definition: a;b;c` runs them as separate endpoints/bindings from one app.
- **Composition with different types**: `Function<A, B> | Function<B, C>` — the framework type-checks and chains; `Consumer<C>` ends the pipeline.

## When to use it

| Use Spring Cloud Function | Don't |
|---|---|
| The same logic must serve multiple transports (REST + events + serverless) | A plain REST API with one transport — controllers are clearer |
| Event-driven pipeline where each stage is a function | Complex, stateful flows — a full service/state machine is honest |
| Serverless target (Lambda) with Spring-style DI | Functions as a style guideline for every bean — it's a deployment abstraction, not an architecture |

The honest guidance: it's a **deployment portability layer**, not an application architecture. Business logic as `Function`s pays off when the transports genuinely vary (API + Kafka + Lambda); for a single REST service, a controller + service is simpler and debuggable.

## Testing

The portability pays for itself in tests — the function is a plain Java call:

```java
@Test
void plansShipping() {
    ShippingInstruction result = functions.planShipping().apply(new OrderCreated("42", "berlin"));
    assertThat(result.destination()).isEqualTo("berlin");
}
```

The integration test replaces the transport: call the function, or use the Spring Cloud Stream test binder (`spring-cloud-stream-test-binder`) to assert it emits onto its binding — the same test-binder discipline as the Stream lesson.

## Key takeaways

- Write `Function`/`Supplier`/`Consumer` beans; the transport (REST, Kafka, Lambda) is configuration.
- Compose pipelines in config (`a|b|c`); route by header; bind via `<name>-in-0`/`-out-0`.
- It's a deployment portability layer — use it when transports genuinely vary, not as a universal style.
- Functions are plain Java: unit tests are trivial, and the test binder covers the transport.

Official docs: [Spring Cloud Function](https://docs.spring.io/spring-cloud-function/reference/)
