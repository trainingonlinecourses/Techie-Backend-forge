---
title: Request-Reply and Correlation — Asking Questions Over Messaging
module: spring-messaging
order: 5
minutes: 23
topics: ["request-reply", "correlation id", "reply channels", "async request", "messaging patterns"]
docs:
  - title: "Request-reply (Enterprise Integration Patterns)"
    url: "https://www.enterpriseintegrationpatterns.com/RequestReply.html"
summary: Most messaging is oneway: drop an event, move on. But sometimes you need an answer: "here's an order — what's the shipping quote?" Direct REST does...
---

# Request-Reply and Correlation — Asking Questions Over Messaging

## The Concept: Fire-and-Forget Is Not Always Enough

Most messaging is one-way: drop an event, move on. But sometimes you need an **answer**: "here's an order — what's the shipping quote?" Direct REST does this trivially (request → response). How do you get an answer when the conversation goes *through a broker or channel*?

**Request-reply messaging** solves it with two tricks:

1. **A reply channel** — the request message carries *where to send the answer* (`replyChannel` header).
2. **A correlation id** — the request and reply share a token (`correlationId`), so whoever receives the answer knows *which request* it answers.

Think of it like a radio call: "Base, this is Unit 7, over." (correlation id = Unit 7). The reply — "Unit 7, proceed, over" — names Unit 7 so anyone listening can match the response to the call. Without the id, a flood of replies would be unassignable.

## Why Correlation Matters — The Concurrency Problem

With many in-flight requests, replies arrive **out of order** and interleaved:

```
Client sends:   req#1 (corr=1), req#2 (corr=2), req#3 (corr=3)
Replies arrive: rep#3 (corr=3), rep#1 (corr=1), rep#2 (corr=2)
```

Without correlation ids, there's no way to know which reply belongs to which request. The `correlationId` header makes the matching trivial: *"the reply with corr=2 answers the request with corr=2."*

## The Code Walkthrough

```java
import org.springframework.integration.annotation.Gateway;
import org.springframework.integration.annotation.MessagingGateway;
import org.springframework.integration.support.MessageBuilder;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

// ---- 1. The request-reply gateway ----
@MessagingGateway
public interface QuoteGateway {

    // Callers get a synchronous answer:
    @Gateway(requestChannel = "quotes.in", replyChannel = "quotes.out")
    Quote requestQuote(Order order);
}

// ---- 2. The service that answers ----
@Component
public class QuoteService {

    @org.springframework.integration.annotation.ServiceActivator(inputChannel = "quotes.in")
    public Quote answer(Order order) {
        // simulate work (in a real app: pricing engine, possibly async)
        return new Quote(order.id(), order.total().multiply(java.math.BigDecimal.valueOf(0.10)));
    }
}

// ---- 3. Manual request-reply (async, with explicit correlation) ----
@Component
public class AsyncQuoteClient {

    private final MessageChannel quotesIn;

    public AsyncQuoteClient(MessageChannel quotesIn) { this.quotesIn = quotesIn; }

    public CompletableFuture<Quote> ask(Order order) {
        CompletableFuture<Quote> future = new CompletableFuture<>();
        String correlationId = UUID.randomUUID().toString();

        Message<Order> request = MessageBuilder.withPayload(order)
                .setHeader("correlationId", correlationId)      // the matching token
                .setHeader("replyChannel", replyChannel(correlationId, future))
                .build();

        quotesIn.send(request);
        return future;
    }

    // Each request gets its own reply channel wired to a future
    private MessageChannel replyChannel(String correlationId,
                                        CompletableFuture<Quote> future) {
        return message -> {
            if (correlationId.equals(message.getHeaders().get("correlationId"))) {
                future.complete((Quote) message.getPayload());
            }
        };
    }
}
```

### Walking Through Each Part

**The gateway (synchronous)** — `requestQuote(order)` looks like a plain method call to the caller, but under the hood: the message goes to `quotes.in` **with a temporary reply channel**; the gateway *blocks* until an answer arrives on `quotes.out`; the answer is returned. Request-reply with the machinery hidden.

**The answering service** — `@ServiceActivator(inputChannel = "quotes.in")` receives the request; its return value is routed to the request's `replyChannel` header. The service doesn't need to know who asked or where the reply goes — the headers carry that.

**The manual async version** — this is the pattern's guts made visible:

1. A **correlation id** is generated per request.
2. The message carries `correlationId` and a *per-request* `replyChannel` (here a lambda that completes a `CompletableFuture`).
3. When the answer arrives, the correlation id is checked, and the matching future completes.

The async shape lets the caller do other work while the answer is in flight — the messaging version of "don't block the thread" (see the WebClient lesson for the same idea on HTTP).

## Correlation Across a Broker

The same pattern transfers to RabbitMQ/Kafka:

- **RabbitMQ RPC** — the request sets `reply_to` (a temporary queue name) and `correlation_id`; the consumer answers to `reply_to` with the same `correlation_id`. RabbitMQ's official RPC tutorial is exactly this pattern.
- **Kafka request-reply** — a `correlationId` in headers + a reply topic; consumers match by id. Less common (Kafka is usually fire-and-forget event streaming), but the pattern works.

Whatever the transport: **correlationId + reply destination** are the two headers that make "ask over messaging" possible.

## Timeouts and Failure

A request-reply flow can hang: the answer never comes (consumer down, message lost). The discipline:

- **Bound the wait** — a timeout on the gateway/future (e.g., `future.get(5, TimeUnit.SECONDS)`), after which the request fails with a clear error.
- **Correlate failures** — when a request fails, the reply mechanism should still *complete* the future with an error (so the caller doesn't wait forever).
- **Expire stale requests** — a correlation id registry that purges entries after N minutes prevents memory leaks from never-answered requests.

## Common Beginner Pitfalls

1. **No correlation id** — replies can't be matched; interleaved responses corrupt the flow.
2. **Reusing a reply channel across requests** — each request needs its own destination/association; a shared channel without correlation is a race.
3. **No timeout** — a lost request leaves the caller blocked forever. Always bound the wait.
4. **Reply with the wrong payload type** — the gateway converts the reply to the return type; mismatches throw at conversion.
5. **Forgetting the reply path** — a service that consumes the request but never sends an answer strands the caller; reply via return value or explicit channel.
6. **Async complexity without need** — if the answer is needed synchronously anyway, plain REST/RestClient is simpler; request-reply pays off when decoupling or broker routing is the point.

## Key Takeaways

- Request-reply messaging = request carries a reply destination + correlation id; the answer comes back matched.
- The gateway hides this: a plain method call that blocks for the answer.
- The correlation id makes interleaved, out-of-order replies assignable.
- Manual pattern: per-request reply channel + `CompletableFuture`, completed when the matching reply arrives.
- The same pattern crosses transports: RabbitMQ `reply_to`/`correlation_id` RPC, Kafka header correlation.
- Always bound timeouts; expire stale requests; complete futures with errors on failure.
