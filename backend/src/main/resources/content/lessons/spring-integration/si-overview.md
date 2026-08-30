---
title: Spring Integration — Enterprise Integration Patterns, In Spring
module: spring-integration
order: 1
minutes: 27
topics: ["Spring Integration", "Enterprise Integration Patterns", "messages", "channels", "EIP", "integration flows"]
summary: Systems don't live alone: a Spring Boot service must read files, call REST APIs, listen to queues, watch directories, poll databases, and transform...
docs:
  - title: "Spring Integration Reference"
    url: "https://docs.spring.io/spring-integration/reference/"
  - title: "Enterprise Integration Patterns (Gregor Hohpe)"
    url: "https://www.enterpriseintegrationpatterns.com/"
---

# Spring Integration — Enterprise Integration Patterns, In Spring

## The Concept: The Patterns for Connecting Systems

Systems don't live alone: a Spring Boot service must read files, call REST APIs, listen to queues, watch directories, poll databases, and transform data between formats. Every one of those integrations repeats the same shapes — poll, filter, transform, route, split, aggregate — and those shapes were catalogued in the book *Enterprise Integration Patterns* (Hohpe & Woolf, 2003). **Spring Integration** is that catalog *as a Spring framework*: message-based, declarative, and testable.

**The mental model:** think of integration as a *pipeline of stations*. A **message** (payload + headers) enters a **channel** (the pipe), passes through **endpoints** — filters (keep or drop), transformers (reshape), routers (send left or right), splitters (one message → many), aggregators (many → one) — and exits to a system (a file, a queue, a REST call). Spring Integration gives each of those stations a name, a component, and a Java DSL — so an integration is described as a *flow*, not scattered imperative code.

**Why a framework for this?** Hand-written integrations are where "it works on my machine" meets reality: polling races, retry storms, half-written files, mismatched formats, unreadable error handling. The EIP vocabulary gives every integration a *shared shape and a testable structure* — and Spring Integration implements the patterns with the framework's guarantees (transactions, error channels, retry, idempotency) built in.

## The Core Vocabulary

- **Message** — the unit of flow: `payload` (the data) + `headers` (metadata: id, timestamp, correlationId, content type).
- **MessageChannel** — the pipe: a `DirectChannel` (synchronous, one receiver) or a `QueueChannel` (buffered, async consumers).
- **Endpoint** — the station that does something: a `ServiceActivator` (calls a method), a transformer, a filter, a router, a splitter, an aggregator.
- **IntegrationFlow** — the DSL describing the pipeline: `from(...).transform(...).handle(...)`.
- **Adapter / gateway** — the door to the outside world: a file inbound adapter (watches a directory), an HTTP outbound gateway (calls a URL), a JMS/Kafka adapter, a JDBC outbound adapter.

## Your First Integration Flow

```java
@Configuration
public class FileToQueueFlow {

    // The DSL: from the file system -> transform -> route by content.
    @Bean
    public IntegrationFlow fileIngest() {
        return IntegrationFlow
                .from(Files.inboundAdapter(new File("/inbox"))
                        .patternFilter("*.csv")        // only CSV files
                        .preventDuplicates(true),      // don't re-read files
                    e -> e.poller(Pollers.fixedDelay(5000)))  // poll every 5s
                .transform(Transformers.fileToString())       // File -> String
                .transform(/* CSV -> a List of rows (a custom transformer) */)
                .<List<String>>route(r -> classify(r),
                    mapping -> mapping
                        .channelMapping("orders", "ordersChannel")
                        .channelMapping("rejects", "rejectsChannel"))
                .get();
    }
}
```

**Walking through the flow — this is the EIP grammar in one example:**

- `from(Files.inboundAdapter(...).poller(...))` — the **inbound adapter**: watches `/inbox` for `*.csv` files every 5 seconds, emitting each file as a message. `preventDuplicates` tracks processed files (idempotency built in).
- `.transform(Transformers.fileToString())` — a **transformer**: turns the `File` payload into its string content. The next transformer parses CSV into rows (a custom transformer implementing `GenericTransformer<String, List<String>>`).
- `.route(...)` — the **router**: inspects the payload and sends each message to one of two channels (`ordersChannel` or `rejectsChannel`) — a content-based router, one of the canonical EIP patterns.
- `.get()` — materializes the flow definition.

Every station is a declarative, testable component. The flow *is* the integration — readable top to bottom.

## Channels and the Sync/Async Decision

```java
// DIRECT channel — synchronous: the sender blocks until the receiver
// finishes. Transaction boundaries and error handling stay in the
// caller's thread. The DEFAULT — simplest, transactional.
@Bean
MessageChannel ordersChannel() {
    return MessageChannels.direct().get();
}

// QUEUE channel — asynchronous: the sender enqueues and returns.
// A separate consumer thread (or poller) drains the queue. Decouples
// producer speed from consumer speed — at the cost of buffering.
@Bean
MessageChannel emailOutbox() {
    return MessageChannels.queue(100).get();   // bounded queue
}

// PUBLISH-SUBSCRIBE — broadcast: every subscriber receives the message.
@Bean
MessageChannel auditEvents() {
    return MessageChannels.publishSubscribe().get();
}
```

**The channel types are the coupling dial:** direct = synchronous call (transaction-safe, backpressure by blocking); queue = async buffer (producer never blocks, but the queue is a failure point — bounded queues and monitoring matter); publish-subscribe = one-to-many broadcast (each subscriber independent — the event-driven pattern in EIP clothing). Choosing the channel type is choosing the integration's semantics.

## The Endpoints: The Pattern Library

| Pattern | Component | What it does |
|---|---|---|
| **Filter** | `.filter(predicate)` | keep or drop messages by a condition |
| **Transformer** | `.transform(...)` | change the payload (format conversion) |
| **Router** | `.route(...)` | send each message to one of several channels |
| **Splitter** | `.split(...)` | one message → many (a batch → per-item messages) |
| **Aggregator** | `.aggregate(...)` | many related messages → one (collect by correlation, release by strategy) |
| **Service Activator** | `.handle(...)` | invoke a Spring bean method (the "do the work" station) |
| **Enricher** | `.enrich(...)` | add data from another source (a DB lookup for extra fields) |
| **Resequencer** | `.resequence(...)` | restore order after parallel processing |
| **Wire tap** | `.wireTap(...)` | observe messages without changing the flow (monitoring) |

**The two composition stars:**

```java
// Splitter + Aggregator — the scatter-gather:
IntegrationFlow scatterGather() {
    return IntegrationFlow
            .from("inbound")
            .split()                        // one batch -> many item messages
            .handle("workerService", "processItem")   // parallel-ish processing
            .aggregate(a -> a.correlationStrategy(m -> m.getHeaders().get("batchId"))
                              .releaseStrategy(g -> g.size() >= expected))
            .get();
}
// Every item processed independently; the aggregator waits for all
// items of the batch (by correlation id), then releases the combined result.
```

The **splitter-aggregator** pair is the workhorse of parallel processing within an integration — split a batch, process items, recombine by correlation. The aggregator's release strategy decides "how many / how long until we emit the combined message" — the heartbeat/count-based patterns are the standard.

## Testing: The Integration That's Actually Testable

```java
// Spring Integration's test support — drive messages through the flow:
@SpringJUnitConfig(FileToQueueFlow.class)
class FlowTest {

    @Autowired
    private IntegrationFlow flow;

    @Autowired
    private MessageChannel ordersChannel;

    @Test
    void routesOrdersByContent() {
        // Send a message into the flow and assert on the output:
        Message<String> in = MessageBuilder.withPayload("1,100\n2,250")
                                           .setHeader("contentType", "csv")
                                           .build();
        // (drive the flow directly, or use MockIntegration to capture
        //  the channel's output and assert on it)
    }
}
```

The flows are Spring beans — the *entire* pipeline is testable in isolation: feed messages, capture the output channels, assert payloads and routing decisions. This is the framework's quiet superpower: integrations become unit-testable code instead of "send a real file and pray."

## Recap

Spring Integration implements the Enterprise Integration Patterns as a message-based Spring framework: **messages** flow through **channels** (direct = sync, queue = async, publish-subscribe = broadcast) and **endpoints** (filter, transformer, router, splitter, aggregator, service activator) — composed declaratively with the **IntegrationFlow DSL**. It's the structured vocabulary for connecting your Spring Boot services to files, queues, APIs, and databases — with transactions, retries, error channels, and idempotency built into the components. The mental model: every integration is a pipeline of named stations, and the framework's grammar (`from...transform...route...handle`) makes integrations readable, testable, and composed from battle-tested patterns rather than hand-rolled loops.
