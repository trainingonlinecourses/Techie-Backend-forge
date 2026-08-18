---
title: Messaging Gateways — Synchronous Facades Over Async Flows
module: spring-integration
order: 3
minutes: 25
topics: ["messaging gateways", "service interface", "@MessagingGateway", "request-reply", "GatewayProxyFactoryBean"]
docs:
  - title: "Messaging Gateways (Spring Integration Reference)"
    url: "https://docs.spring.io/spring-integration/reference/gateway.html"
  - title: "Service Activator (Spring Integration Reference)"
    url: "https://docs.spring.io/spring-integration/reference/service-activator.html"
---

# Messaging Gateways — Synchronous Facades Over Async Flows

## The Concept: The Best of Both Worlds

Here's the integration dilemma: the *internal* machinery of Spring Integration is message-based and asynchronous — but your *application code* wants plain method calls: `orderService.placeOrder(req)` returns a result, period. **Messaging gateways** are the bridge: a plain Java interface whose methods are *implemented by the integration flow*. Your code calls a method; the gateway converts the call into a message, sends it into a channel, waits for the reply message, and returns the result. The caller sees a synchronous method; underneath, the full messaging machinery runs.

**The mental model:** the gateway is the *front desk* of the messaging system. Your code walks up and asks "place this order, please" (a method call). The desk (the gateway proxy) writes a request form (message), routes it through the office (the flow), waits for the completed form (reply message), and hands you the result (the return value). You never see the internal mail system — you just got a normal method call. The framework's `GatewayProxyFactoryBean` creates the desk from a plain interface you define.

## The Gateway Interface

```java
// A plain interface — this is ALL the application code needs:
public interface OrderGateway {

    // A request-reply gateway method: Order -> OrderReceipt.
    OrderReceipt placeOrder(OrderRequest request);

    // A request-only method (fire and forget — no reply expected):
    void notifyCustomer(String email, String message);

    // Customizing the request via @Header/@Payload annotations:
    @Payload("new java.util.Date()")
    @Header("contentType", "application/json")
    void markProcessed(Long orderId);
}
```

**The magic:** this interface is never implemented by hand. Spring Integration *proxies* it (the dynamic-proxy mechanism from the reflection module) and connects each method to a channel:

```java
@Configuration
public class GatewayConfig {

    @Bean
    @MessagingGateway(name = "orderGateway")       // the annotation wires it up
    public interface OrderGatewayMarker { }        // (or use @MessagingGateway on the interface itself)

    // The FLOW behind the gateway method:
    @Bean
    public IntegrationFlow orderFlow() {
        return IntegrationFlow
                .from("orders.request")            // <-- the gateway's request channel
                .handle("orderService", "placeOrder")   // the real work
                .channel("orders.reply")           // <-- the reply channel
                .get();
    }
}
```

**The wiring:** the `@MessagingGateway` interface's method `placeOrder` maps to the *request channel* (`orders.request` — the flow's `from(...)`); the flow does the work; the reply channel carries the result back; the proxy blocks the calling thread until the reply arrives, then returns it. **The caller sees a synchronous method with a return value; the flow is fully message-based.** If the flow throws, the exception propagates through the gateway to the caller — the sync facade includes the error semantics.

## Request-Reply vs Fire-and-Forget

```java
// REQUEST-REPLY — the method waits for the flow's reply message:
OrderReceipt receipt = orderGateway.placeOrder(req);
// (a void method can still be request-reply — the reply is just discarded)

// FIRE-AND-FORGET — the method sends and returns immediately:
orderGateway.notifyCustomer(email, msg);
// The gateway must be told: the reply channel is a NULL channel
// (MessageChannels.nullChannel()), or the method is marked as void with
// no reply expectation.

// ASYNC via CompletableFuture — the best of both:
CompletableFuture<OrderReceipt> future = orderGateway.placeOrderAsync(req);
// Spring Integration supports CompletableFuture return types: the caller
// gets a future; the flow runs on its own threads; join() when needed.
```

**The three styles map to the integration's needs:** synchronous request-reply for "call me back with the answer" (an API facade over a messaging flow), fire-and-forget for "this side effect must happen, don't wait" (notifications, audit), and `CompletableFuture` when the caller wants *both* the async execution *and* the eventual result. The gateway interface's return type *is* the contract — `void` (fire-forget), `T` (sync reply), or `CompletableFuture<T>` (async reply).

## The Service Activator: Where the Work Happens

The gateway sends; the **service activator** receives and does the real work:

```java
// A plain Spring bean method as an endpoint:
@Service
public class OrderService {

    @ServiceActivator(inputChannel = "orders.request", outputChannel = "orders.reply")
    public OrderReceipt placeOrder(OrderRequest request) {
        // The payload arrives as the method parameter; the return value
        // becomes the reply message's payload.
        Order order = orderRepo.save(request.toEntity());
        return new OrderReceipt(order.getId(), order.getStatus());
    }
}
```

**The method contract:** the incoming message's payload is passed as the parameter; the return value becomes the outgoing message's payload (routed to `outputChannel` → the gateway's reply channel). The service activator is the bridge from *messaging* back to *normal Spring code* — the same bean-method pattern as `@KafkaListener`, just for channels. Method parameters can be `Message<T>` (full access to headers), the payload type, or annotated (`@Header`, `@Payload`).

## The Request-Reply in a Real Flow

```java
// The complete pattern: gateway -> flow with enrichment and routing -> reply.
@Bean
public IntegrationFlow enrichedOrderFlow() {
    return IntegrationFlow
            .from(OrderGateway.class)          // the gateway IS the entry point
            .enrich(e -> e.requestChannel("customer.lookup")  // enrich from DB
                           .propertyExpression("customerName", "payload.name"))
            .handle("orderService", "placeOrder")
            .transform("receiptFormatter", "format")    // shape the reply
            .get();
}
```

`from(OrderGateway.class)` — the gateway interface as the flow's source: the proxy, the channels, and the method mapping are all derived from the interface. The flow composes the EIP stations (enrich → handle → transform), and the reply travels back through the gateway. This is the full power: **application code against a plain interface; integration logic as a declarative flow; both testable independently.**

## The Error Handling Contract

```java
// What happens when the flow throws?
// 1. The exception propagates back through the gateway to the caller
//    (synchronous facade = synchronous errors). The caller's try/catch works.
// 2. Or route to an ERROR CHANNEL for centralized handling:
@Bean
public IntegrationFlow errorHandling() {
    return IntegrationFlow.from("errorChannel")
            .handle("errorLogger", "logAndRecover")
            .get();
}
```

The gateway's contract: errors in the flow surface to the caller (the method throws — same as any service call) *unless* the flow routes to an error channel. For request-reply, the exception is the reply. The discipline: gateway methods are the *API surface* — their exceptions should be domain-meaningful (wrap the messaging internals into your business exceptions at the service activator, or in an error-handling flow).

## When to Use Gateways

**Use them when:** application code must *call into* messaging flows synchronously (the 90% case — most integrations are "do this, give me the result"); you want the code to depend on a clean interface, not on channels; you need the async execution with a `CompletableFuture` facade.

**Don't use them when:** the caller genuinely doesn't care about the result (use fire-and-forget or `@Async` + events); the integration is purely reactive (a listener consuming events — gateways are the *producer* side's facade); you need request-reply *across* systems (that's a real broker's RPC pattern, e.g., Kafka reply topics — the gateway is the in-process facade).

## Recap

Messaging gateways give application code a plain synchronous (or `CompletableFuture`) interface over message-based flows: a `@MessagingGateway` interface is proxied so each method sends into a request channel, waits for the reply channel, and returns the result — or fire-and-forgets, or returns a future. The **service activator** (`@ServiceActivator`) is the receiving side: a plain bean method that takes the payload and returns the reply. The result is the best of both worlds — normal Spring code with clean interfaces and exception semantics, backed by declarative, testable EIP flows. Gateways are the front desk; the flow is the office; your code never sees the mail system.
