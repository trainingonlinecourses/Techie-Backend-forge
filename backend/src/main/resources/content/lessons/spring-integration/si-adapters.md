---
title: Adapters — Connecting to Files, HTTP, JDBC, and Messaging Systems
module: spring-integration
order: 5
minutes: 26
topics: ["adapters", "inbound adapters", "outbound adapters", "file integration", "HTTP integration", "JDBC integration", "Kafka integration"]
docs:
  - title: "Endpoint Adapters (Spring Integration Reference)"
    url: "https://docs.spring.io/spring-integration/reference/file.html"
  - title: "HTTP Support (Spring Integration Reference)"
    url: "https://docs.spring.io/spring-integration/reference/http.html"
summary: Everything so far has been inprocess: messages flowing through channels and stations inside your JVM. The real world is outside: files on disk, HTT...
---

# Adapters — Connecting to Files, HTTP, JDBC, and Messaging Systems

## The Concept: The Doors to the Outside World

Everything so far has been *in-process*: messages flowing through channels and stations inside your JVM. The real world is outside: files on disk, HTTP APIs, database rows, Kafka topics, JMS queues. **Adapters** are the doors — the endpoints that connect a flow to an external system in either direction. **Inbound adapters** bring the outside *in* (a file appears → a message enters the flow); **outbound adapters** push the flow *out* (a message → a file written, an HTTP call, a DB insert). The flow stays identical; only the doors differ.

**The mental model:** the integration flow is the factory floor; adapters are the loading docks. The *inbound* dock watches the driveway (a directory, an HTTP endpoint, a queue) and brings each arrival onto the floor as a message. The *outbound* dock takes finished messages and ships them (writes a file, calls an API, inserts a row). You build the floor once; swap the docks to change what you integrate with.

## File Adapters: The Classic Integration

```java
// INBOUND — watch a directory, emit each new file as a message:
@Bean
public IntegrationFlow fileInbound() {
    return IntegrationFlow
            .from(Files.inboundAdapter(new File("/data/inbox"))
                    .patternFilter("*.csv")            // only CSV
                    .preventDuplicates(true),          // track processed files
                e -> e.poller(Pollers.fixedDelay(5000)
                        .maxMessagesPerPoll(10)))      // poll every 5s
            .transform(Transformers.fileToString())    // File -> String
            .handle("csvParser", "parse")
            .get();
}

// OUTBOUND — write each message's payload to a file:
@Bean
public IntegrationFlow fileOutbound() {
    return IntegrationFlow
            .from("processedChannel")
            .handle(Files.outboundAdapter(new File("/data/outbox"))
                    .fileNameGenerator(m ->
                        "order-" + m.getHeaders().get("orderId") + ".csv")
                    .autoCreateDirectory(true))
            .get();
}
```

**The inbound file adapter's key decisions:** the **poller** (how often to check), `patternFilter` (which files count), and `preventDuplicates` (idempotency — don't reprocess the same file after a restart). The outbound adapter's `fileNameGenerator` decides the written name — including the `temporaryFileSuffix` option (write to `.tmp`, rename on completion — the standard "don't read half-written files" discipline, implemented by `useTemporaryFileSuffix(true)`).

## HTTP Adapters: Calling and Exposing APIs

```java
// INBOUND — expose a flow as an HTTP endpoint:
@Bean
public IntegrationFlow httpInbound() {
    return IntegrationFlow
            .from(Http.inboundChannelAdapter("/api/ingest")
                    .requestMapping(r -> r.methods(HttpMethod.POST))
                    .requestPayloadType(String.class))
            .handle("ingestService", "process")     // payload = the request body
            .get();   // the return value becomes the HTTP response body
}

// OUTBOUND — call an external API from the flow:
@Bean
public IntegrationFlow httpOutbound() {
    return IntegrationFlow
            .from("submitChannel")
            .handle(Http.outboundChannelAdapter("https://api.academy.com/orders")
                    .httpMethod(HttpMethod.POST)
                    .expectedResponseType(String.class)
                    .headerMapper(httpHeadersMapper()))   // pass auth headers
            .get();
}
```

**The HTTP inbound adapter turns a REST endpoint into a flow's entry point** — the request body becomes the message payload, the handler's return value becomes the response. The **outbound adapter** turns a flow into a REST *client* — each message becomes an HTTP request. The integration between them: an HTTP-triggered flow that calls other APIs, transforms, and replies — the API-facade pattern built entirely from the DSL. (The `headerMapper` is where `Authorization` headers and content types are carried — the security seam.)

## JDBC Adapters: The Database as Endpoint

```java
// INBOUND — poll the database for new rows:
@Bean
public IntegrationFlow jdbcInbound() {
    return IntegrationFlow
            .from(Jdbc.inboundChannelAdapter(dataSource,
                    "SELECT * FROM pending_emails WHERE sent = false")
                .updateSql("UPDATE pending_emails SET sent = true WHERE id = :id")
                .maxRowsPerPoll(50),                      // batch size
                e -> e.poller(Pollers.fixedDelay(10000)))
            .handle("emailService", "send")
            .get();
}
// Each returned row becomes a message; the updateSql marks it done —
// the polling-with-claim pattern, atomic per row.

// OUTBOUND — insert/update per message:
@Bean
public IntegrationFlow jdbcOutbound() {
    return IntegrationFlow
            .from("eventsChannel")
            .handle(Jdbc.outboundGateway(dataSource,
                    "INSERT INTO events(id, type, payload) VALUES (:payload.id, :payload.type, :payload.payload)")
                    .returningResultSetExtractor(/* map the generated key back */))
            .get();
}
```

**The JDBC inbound adapter is the "new database rows as events" pattern** (the poor-man's CDC): poll a query, emit each row, and claim it via `updateSql` so concurrent polls never double-process. The outbound gateway inserts per message — with named parameters bound from the payload. This is the adapter that turns Spring Integration into a lightweight, transactional job framework for database-driven work.

## Kafka, JMS, and AMQP Adapters: The Messaging Doors

```java
// INBOUND — consume Kafka records into a flow:
@Bean
public IntegrationFlow kafkaInbound() {
    return IntegrationFlow
            .from(Kafka.inboundChannelAdapter(kafkaConsumerFactory(),
                    new ConsumerProperties("orders")))
            .handle("orderService", "applyEvent")
            .get();
}

// OUTBOUND — publish flow messages to Kafka:
@Bean
public IntegrationFlow kafkaOutbound() {
    return IntegrationFlow
            .from("publishedChannel")
            .handle(Kafka.outboundChannelAdapter(kafkaTemplate())
                    .topic("orders"))
            .get();
}
```

**The pattern repeats for every broker** — Kafka, JMS, AMQP (RabbitMQ): an inbound adapter consumes into the flow (with the broker's consumer semantics — acknowledgments, redelivery — handled by the adapter), an outbound adapter publishes from the flow. The same flow grammar works against a file, a database, or a broker — **the adapters are interchangeable doors, and the pipeline logic never changes.** This is the framework's true value: learn the flow grammar once, integrate with anything.

## The Adapter Best Practices

1. **Claim before process** (JDBC `updateSql`, file `preventDuplicates`, broker acknowledgments) — every inbound adapter needs an idempotency/claim story so restarts don't double-process.
2. **Batch with `maxMessagesPerPoll`** — bound the work per poll cycle for graceful backpressure.
3. **Temp files for writes** — the `.tmp` + rename pattern (outbound file adapters do this by default with the right settings) prevents half-written outputs from being consumed.
4. **Headers carry the context** — auth, tenant, correlation ids travel in message headers through the adapters (header mappers for HTTP, `recordMetadata` for Kafka).
5. **Errors to an error channel** — each adapter's failures route to an error channel (retry, dead-letter, alert) rather than dying silently.
6. **Test with the real boundary** — an adapter test that uses a temp directory (JUnit's `@TempDir`) or an embedded broker is the difference between "the flow works" and "the integration works."

## Recap

Adapters are the doors between the flow and the outside world: **inbound** (file polls, HTTP endpoints, JDBC row-polls, Kafka/JMS/AMQP consumption) bring external events in as messages; **outbound** (file writes, HTTP calls, JDBC inserts, broker publishes) ship messages out. The flow grammar stays identical regardless of the door — swap adapters to change what you integrate with. The production discipline is uniform across all of them: claim-then-process for idempotency, bounded batches, temp-file writes, header context, and error channels. Master the adapters and Spring Integration becomes the universal integrator — one grammar, every system.
