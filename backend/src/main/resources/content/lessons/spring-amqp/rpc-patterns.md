---
title: Request-Reply and RPC Patterns
module: spring-amqp
order: 4
minutes: 20
topics: ["RPC", "replyTo", "correlationId", "convertSendAndReceive", "async request-reply"]
docs:
  - title: "Request and reply"
    url: "https://docs.spring.io/spring-amqp/reference/template.html#template-send-and-receive"
summary: Most messaging is fireandforget, but some flows need an answer: "validate this address", "compute this quote", "translate this text". RabbitMQ's re...
---

# Request-Reply and RPC Patterns

Most messaging is fire-and-forget, but some flows need an answer: "validate this address", "compute this quote", "translate this text". RabbitMQ's request-reply pattern uses two queues — request and reply — joined by `correlationId` and `replyTo`.

## The Request-Reply Flow

```
Client                          Server
  │  send to requestQueue         │
  │  replyTo: responseQueue       │
  │  correlationId: abc123  ────▶ │  @RabbitListener(requestQueue)
  │                               │    process()
  │                               │  send to responseQueue
  │  ◀────────────────────────────│  correlationId: abc123
  │  convertSendAndReceive()      │
```

## The Server: @RabbitListener Returns a Value

```java
@Component
public class AddressValidationServer {

    @RabbitListener(queues = "validation.requests")
    public ValidationResult validate(AddressRequest request) {
        // the return value is sent to the reply queue automatically
        return addressService.validate(request);
    }
}
```

Spring AMQP's listener container detects a return value and publishes it to the `replyTo` queue with the matching `correlationId`. Zero manual plumbing.

## The Client: convertSendAndReceive

```java
@Service
public class AddressValidationClient {

    private final RabbitTemplate template;

    public ValidationResult validate(AddressRequest request) {
        return (ValidationResult) template.convertSendAndReceive(
            "validation.exchange", "validation.requests", request);
    }
}
```

`convertSendAndReceive` blocks until the reply arrives (or times out). The reply is correlated automatically via a private reply queue + correlation id.

### Timeouts

```java
template.setReplyTimeout(10_000);   // ms — default 5s

// or per call with a MessagePostProcessor carrying timeout
ValidationResult result = (ValidationResult) template
    .convertSendAndReceive(request, message -> {
        message.getMessageProperties().setExpiration("10000");   // queue-side TTL
        return message;
    });
```

A hanging RPC is worse than a failed one — always set timeouts.

## Asynchronous Request-Reply

Blocking `convertSendAndReceive` ties up a thread per in-flight request. For high throughput, go async with a `CompletableFuture`-style correlation:

```java
@Service
public class AsyncValidationClient {

    private final RabbitTemplate template;
    private final ConcurrentHashMap<String, CompletableFuture<ValidationResult>>
        pending = new ConcurrentHashMap<>();

    public AsyncValidationClient(ConnectionFactory factory, ObjectMapper mapper) {
        this.template = new RabbitTemplate(factory);
        this.template.setMessageConverter(new Jackson2JsonMessageConverter(mapper));
    }

    public CompletableFuture<ValidationResult> validateAsync(AddressRequest request) {
        CompletableFuture<ValidationResult> future = new CompletableFuture<>();
        String correlationId = UUID.randomUUID().toString();
        pending.put(correlationId, future);

        template.convertAndSend("validation.exchange", "validation.requests",
            request, m -> {
                m.getMessageProperties().setCorrelationId(correlationId);
                m.getMessageProperties().setReplyTo("validation.responses.async");
                return m;
            });

        return future;
    }

    @RabbitListener(queues = "validation.responses.async")
    public void onReply(Message message) {
        String correlationId = message.getMessageProperties().getCorrelationId();
        CompletableFuture<ValidationResult> future = pending.remove(correlationId);
        if (future != null) {
            ValidationResult result = (ValidationResult)
                new Jackson2JsonMessageConverter().fromMessage(message);
            future.complete(result);
        }
    }
}
```

The client maps each reply to the waiting future by correlation id — no thread blocked.

## When to Use RPC Over Messaging

| Use RPC-over-AMQP when | Use plain HTTP when |
|------------------------|---------------------|
| Producer and consumer are both Spring apps on AMQP | Public APIs, browser clients |
| You need the broker's delivery guarantees | Simple synchronous calls |
| Fan-out + selective reply | REST semantics (verbs, status codes) |
| Decoupled deployment of client/server | Teams already speak HTTP |

RPC-over-messaging is an *internal* pattern. Exposing it publicly means every caller needs AMQP — usually a mistake.

## Error Handling in RPC

The server's exception must reach the client as a distinguishable reply:

```java
@RabbitListener(queues = "validation.requests")
public Object validate(AddressRequest request) {
    try {
        return addressService.validate(request);
    } catch (AddressNotFoundException e) {
        // return an error envelope, not a throw — the throw would requeue
        return new ValidationError("ADDRESS_NOT_FOUND", e.getMessage());
    }
}
```

Return an error envelope; reserve throws for cases where you *want* the retry ladder.

## Testing Request-Reply

```java
@SpringBootTest
class RpcFlowTest {

    @Autowired RabbitTemplate template;
    @Autowired TestConfig testConfig;

    @Test
    void clientReceivesServerReply() {
        // send to the request queue, expect a reply
        ValidationResult result = (ValidationResult)
            template.convertSendAndReceive("validation.exchange",
                "validation.requests", new AddressRequest("1 Main St"));

        assertNotNull(result);
        assertTrue(result.valid());
    }

    @Test
    void replyTimesOut() {
        template.setReplyTimeout(500);
        Object reply = template.convertSendAndReceive(
            "validation.exchange", "slow.requests", new AddressRequest("x"));
        assertNull(reply);   // timeout → null
    }
}
```

## Summary

| Concern | Mechanism |
|---------|-----------|
| Server reply | `@RabbitListener` returning a value |
| Client call | `convertSendAndReceive` (blocking) |
| Async client | Correlation-id map to CompletableFutures |
| Correlation | `correlationId` property |
| Reply routing | `replyTo` property / private reply queue |
| Timeouts | `setReplyTimeout` + TTL |
| Errors | Error envelope in the reply, not a throw |

Request-reply turns RabbitMQ from a queue into a distributed function call — with the broker's reliability guarantees and the two sides deployed independently. Keep it internal, keep it time-boxed, and correlate explicitly.
