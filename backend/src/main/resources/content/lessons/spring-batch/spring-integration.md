---
title: Spring Integration — Enterprise Integration Patterns
summary: Message channels, gateways, routers and transformers — wiring systems together with the Enterprise Integration Patterns, and when it beats hand-written glue.
order: 6
minutes: 15
topics: [spring integration, message channels, gateway, enterprise integration patterns, eip]
docs:
  - https://docs.spring.io/spring-integration/reference/
  - https://www.enterpriseintegrationpatterns.com/
---

# Spring Integration — Enterprise Integration Patterns

## What it is

Spring Integration implements the **Enterprise Integration Patterns** (EIP) — the canonical catalog of ways systems exchange data: message channels, routers, transformers, splitters, aggregators, gateways, adapters. Instead of hand-written glue code between a file drop, a database and an API, you declare a **message flow** of small, testable components.

```
file inbound adapter → transformer (parse) → router (by type) → jdbc outbound adapter
                                                          ↘ → mail adapter (alert)
```

## The core abstractions

- **`Message<T>`** — payload + headers (the unit of flow).
- **`MessageChannel`** — the pipe: `DirectChannel` (synchronous, same thread), `ExecutorChannel` (async via a pool), `QueueChannel` (bounded buffer), `PublishSubscribeChannel` (fan-out to N subscribers).
- **Endpoint** — anything at a channel's end: transformer, filter, router, splitter, aggregator, service activator, adapters.

A minimal flow in Java DSL:

```java
@Bean
IntegrationFlow fileFlow() {
    return IntegrationFlow
        .from(Files.inboundAdapter(new File("/drop"))
                  .patternFilter("*.csv"),
              e -> e.poller(Pollers.fixedDelay(5_000)))     // poll every 5s
        .transform(new FileToOrderTransformer())             // Message<File> → Message<Order>
        .filter(Order::isValid)                              // drop invalid silently
        .route(Order::kind, m -> m
            .channelMapping("standard", "orders.channel")
            .channelMapping("priority", "priority.channel"))
        .get();
}

@Bean
IntegrationFlow handlerFlow() {
    return IntegrationFlow.from("orders.channel")
        .handle("orderService", "handleOrder")               // service activator
        .get();
}
```

## Gateways: the synchronous face

A **gateway** hides messaging behind a plain interface — callers never see channels:

```java
public interface OrderSubmission {
    @Gateway(requestChannel = "orders.in", replyChannel = "orders.out")
    Confirmation submit(Order order);   // blocking request/reply
}

// Usage — ordinary method call:
Confirmation c = orderSubmission.submit(order);
```

With `@MessagingGateway` on the interface, Spring generates the implementation. Gateway + `QueueChannel` gives you async fire-and-forget; gateway + reply channel gives request/reply — all without exposing messaging in the business code.

## Routers, splitters and aggregators

- **Router** — sends each message to one of several channels based on a header or payload (`payloadTypeRouter`, `headerValueRouter`, or a SpEL/router bean).
- **Splitter** — one message → many (`order` → `orderLines`), each line flows independently.
- **Aggregator** — many → one; correlates by a key (e.g. order id) and releases when the group completes or times out:

```java
.aggregate(a -> a.correlationStrategy(m -> m.getHeaders().get("orderId"))
                 .releaseStrategy(group -> group.size() == expectedLines)
                 .expireGroupsUponTimeout(true))
```

- **Filter** — drops messages that don't match (with `throwExceptionOnRejection` as the alternative: route to error instead of dropping).

## Service activators and adapters

- **Service activator** — invokes a method on a bean for each message (`.handle("bean", "method")`).
- **Adapters** — the integration surface: inbound/outbound for files (`Files.inboundAdapter`), JDBC, JMS, AMQP, HTTP, mail, FTP/SFTP, and Kafka. The inbound side usually pairs with a **poller**.
- **Transformer** — converts payload or enriches headers; enrich a message with a lookup via `HeaderEnricher`.

## Error handling: error channels

Every flow can route failures to an error channel instead of failing silently:

```java
IntegrationFlow.from("orders.in")
    .handle("orderService", "handleOrder")
    .errorChannel("errors.in");         // or global: setDefaultErrorChannel

@Bean
IntegrationFlow errorFlow() {
    return IntegrationFlow.from("errors.in")
        .handle(m -> log.error("flow failed: {}", m.getPayload()))
        .get();
}
```

The error message carries the original message in its headers (`ErrorMessage` wraps the failed `Message`) — so the DLQ discipline works here too: park, alert, replay.

## When to use it (and when not)

**Use it** when the flow is genuinely *message-shaped*: file drops, multi-step routing, fan-out/split/aggregate, integrations with N external systems. The DSL is declarative, each component is unit-testable (`MessageChannel` + `MockIntegrationContext`), and flows can be stopped/started at runtime.

**Don't** wrap plain internal method calls in channels just to be "enterprise-y" — a direct service call is simpler, typed and debuggable. Spring Integration earns its keep at **boundaries**: where data crosses systems.

## Key takeaways

- Flows = channels + endpoints (transform/filter/route/split/aggregate/handle) implementing the EIP catalog.
- Gateways expose messaging as plain interfaces; adapters + pollers connect files/DB/HTTP/mail.
- Route to an error channel; park + alert on failures instead of dropping.
- Use it at system boundaries, not for internal calls.

Official docs: [Spring Integration Reference](https://docs.spring.io/spring-integration/reference/) · [EIP book](https://www.enterpriseintegrationpatterns.com/)
