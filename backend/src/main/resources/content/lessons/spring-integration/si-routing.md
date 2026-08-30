---
title: Routing, Transformation, and Enrichment — Shaping the Flow
module: spring-integration
order: 4
minutes: 26
topics: ["routers", "transformers", "enrichers", "splitters", "aggregators", "content-based routing", "message transformation"]
docs:
  - title: "Message Routing (Spring Integration Reference)"
    url: "https://docs.spring.io/spring-integration/reference/message-routing.html"
  - title: "Message Transformation (Spring Integration Reference)"
    url: "https://docs.spring.io/spring-integration/reference/message-transformation.html"
summary: Channels are the pipes; routers, transformers, enrichers, splitters, and aggregators are the verbs — the stations that decide where messages go and...
---

# Routing, Transformation, and Enrichment — Shaping the Flow

## The Concept: The Verbs of the Pipeline

Channels are the pipes; **routers, transformers, enrichers, splitters, and aggregators** are the *verbs* — the stations that decide where messages go and what they look like when they get there. These are the Enterprise Integration Patterns that give integrations their intelligence: routing on content, transforming between formats, enriching with data from other sources, splitting batches, and recombining results. This lesson is the grammar of the pipeline.

**The mental model:** a package-sorting facility. The **router** reads the label and sends each package down the right conveyor (by region, by size, by type). The **transformer** re-labels packages (zip code → city, one format → another). The **enricher** tacks on extra information (look up the customer name). The **splitter** unpacks a pallet into individual boxes; the **aggregator** gathers the boxes back into a shipment. Each station does one job, and the flow composes them.

## Transformers: Changing the Payload

```java
// The three ways to transform:
// 1. The built-ins:
.transform(Transformers.fileToString())          // File -> String
.transform(Transformers.objectToString())       // any -> String (via toString)
.transform(Transformers.json(JsonTransformer.class))  // JSON manipulation

// 2. A SpEL expression:
.transform("payload.toUpperCase()")

// 3. A method on a bean — the general form:
.transform("formatService", "toCsv")
//   bean name + method: the payload becomes the argument, the return
//   value becomes the new payload.

// A transformer bean (the reusable, testable form):
@Component
public class FormatService {
    public String toCsv(Order order) {
        return order.id() + "," + order.total() + "," + order.status();
    }
    public Order fromCsv(String line) {
        String[] parts = line.split(",");
        return new Order(Long.parseLong(parts[0]), new java.math.BigDecimal(parts[1]), parts[2]);
    }
}
```

**The transformer contract:** in-payload → method → out-payload. Every format conversion in an integration — XML→JSON, CSV→objects, DTO→wire format — is a transformer. The bean-method form keeps the logic testable in isolation: a `FormatService.toCsv` is a plain method you can unit-test without any messaging.

## Routers: Sending to the Right Place

```java
// Content-based routing — inspect the payload, choose the channel:
IntegrationFlow routingFlow() {
    return IntegrationFlow
            .from("inbound")
            .<Order>route(order -> order.status(),
                mapping -> mapping
                    .channelMapping("PLACED", "placedChannel")
                    .channelMapping("PAID", "paidChannel")
                    .channelMapping("CANCELLED", "cancelledChannel")
                    .defaultOutputChannel("miscChannel"))   // the catch-all
            .get();
}
```

```java
// Header-based routing:
.<Order>route("headers['priority']", mapping -> mapping
        .channelMapping("high", "priorityChannel")
        .channelMapping("low", "normalChannel"))

// Recipient-list routing — send to SEVERAL channels (pub-sub style):
.recipientList(/* a Collection of channel names resolved from the payload */)
```

**The router forms:** content-based (a SpEL expression on the payload → a channel), header-based (routing on message headers — the natural place for priority/tenant/version), and recipient-list (fan-out to *several* channels — the difference from a router, which sends to exactly one). The `defaultOutputChannel` is the router's safety net — unmatched messages go somewhere explicit instead of failing invisibly.

## Enrichers: Adding Data From Elsewhere

```java
// The enricher: enrich the message with data from another source.
IntegrationFlow enrichedFlow() {
    return IntegrationFlow
            .from("orders.request")
            .enrich(e -> e
                // Where the extra data comes from — a request channel
                // that a lookup flow answers:
                .requestChannel("customer.lookup")
                // Map the reply's fields onto the message:
                .<Customer, String>propertyExpression("customerName", "payload.name")
                .<Customer, String>propertyExpression("customerEmail", "payload.email")
                // The reply payload REPLACES the message payload:
                .shouldClonePayload(false))
            .handle("orderService", "placeOrder")
            .get();
}
```

**The enricher pattern:** the message carries an id; the enricher *looks up* the related data (a DB call, an API call — modeled as its own request-reply flow on the `requestChannel`) and merges it into the message as new properties or as the new payload. It's the "join" of the messaging world — enriching a message with data that lives elsewhere, without the pipeline knowing how to fetch it.

## Splitters and Aggregators: One↔Many

```java
// SPLITTER — one message becomes many:
IntegrationFlow splitFlow() {
    return IntegrationFlow
            .from("batch.in")
            .split(s -> s.applySequence(true))   // split collections/lists
            // (a List<Order> payload -> one message per Order)
            .handle("orderService", "processOne")
            .get();
}

// The bean form — full control:
@Component
public class OrderSplitter {
    public List<Order> split(Batch batch) {
        return batch.orders();    // the return Collection becomes messages
    }
}

// AGGREGATOR — many become one (the mirror):
IntegrationFlow aggregateFlow() {
    return IntegrationFlow
            .from("items.processed")
            .aggregate(a -> a
                // Which messages belong together: the correlation id
                // (in the message headers, set by the splitter).
                .correlationStrategy(m -> m.getHeaders().get("batchId"))
                // When to release the group: count, or a time window.
                .releaseStrategy(g -> g.size() >= 10 || groupTimedOut(g))
                // What the combined message's payload is:
                .outputProcessor(g -> g.getMessages().stream()
                        .map(m -> (Processed) m.getPayload()).toList()))
            .get();
}
```

**The splitter-aggregator pair is the parallel-processing workhorse:** split a batch into per-item messages (each processed independently, possibly on different threads), then aggregate the results back by **correlation strategy** (how to group — the batch id) and **release strategy** (when to emit — count reached, or time window expired). This is scatter-gather — the EIP pattern behind "process 10,000 items, collect the results" — and it's where an integration either performs or silently drops results, so the release strategy (especially timeouts) deserves real design attention.

## The Ordering and Error Conventions

- **Transformers early** — normalize the format at the boundary, then route on normalized values (routing on raw, unnormalized data is fragile).
- **Routers need a default** — the `defaultOutputChannel` makes unmatched messages *explicit* (to an error/dead-letter channel) rather than silently dropped.
- **Aggregators need a timeout** — a release strategy that never triggers (a lost message) leaves the group hanging forever; the `groupTimeout`/expire-groups mechanism is the safety net.
- **Every station can have an error channel** — `@ServiceActivator(inputChannel=..., errorChannel=...)` per endpoint gives per-station error handling, and the flow-level `errorChannel` catches the rest.

## Recap

The pipeline verbs shape the flow: **transformers** convert payloads (built-ins, SpEL, or bean methods — the testable general form); **routers** send each message to one channel by content or header (with a `defaultOutputChannel` safety net) or fan out via recipient lists; **enrichers** look up and attach data from other sources through request-reply subflows; and **splitters + aggregators** implement scatter-gather — one batch into independent per-item messages and back into a combined result via correlation and release strategies. The craft is composing them in the right order (normalize early, route on normalized values) and giving every junction an explicit default and a timeout. Learn these five verbs and the pipeline grammar is complete — any integration becomes a sequence of named, testable stations.
