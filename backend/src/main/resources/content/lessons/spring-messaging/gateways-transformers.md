---
title: Gateways and Transformers — The Integration Toolkit
module: spring-messaging
order: 3
minutes: 24
topics: ["@MessagingGateway", "transformers", "routers", "splitters", "aggregators", "EIP"]
docs:
  - title: "Enterprise Integration Patterns"
    url: "https://www.enterpriseintegrationpatterns.com/"
summary: Messaging systems have a set of recurring problems: how do I expose messaging to business code? How do I reshape a message? How do I route it based...
---

# Gateways and Transformers — The Integration Toolkit

## The Concept: The Enterprise Integration Patterns

Messaging systems have a set of recurring problems: *how do I expose messaging to business code? How do I reshape a message? How do I route it based on content? How do I split one message into many (or merge many into one)?* These were catalogued in the classic book **Enterprise Integration Patterns** (EIP), and Spring Integration implements each one as a first-class component:

| Pattern | Component | Job |
|---|---|---|
| Gateway | `@MessagingGateway` | Expose messaging as a plain Java method |
| Transformer | `@Transformer` | Reshape a message (payload/format) |
| Router | `@Router` | Send each message to the right channel |
| Splitter | `@Splitter` | One message → many |
| Aggregator | `@Aggregator` | Many messages → one (correlated) |
| Filter | `@Filter` | Drop messages that don't qualify |
| Service Activator | `@ServiceActivator` | Run business logic on a message |

This lesson covers the core four: gateway, transformer, router, and the splitter/aggregator pair. Learn these and you can read (and build) most integration flows.

## The Code Walkthrough

```java
import org.springframework.integration.annotation.*;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

// ---- 1. GATEWAY: messaging behind a Java method ----
@MessagingGateway
public interface ImportGateway {

    @Gateway(requestChannel = "imports.in")
    void submitImport(String fileName);
}

// ---- 2. TRANSFORMER: reshape the incoming message ----
@Component
public class ImportFlow {

    // "imports.in" -> transformer -> "imports.parsed"
    @Transformer(inputChannel = "imports.in", outputChannel = "imports.parsed")
    public ParsedImport parse(String fileName) {
        // Turn the file name into a structured payload
        String[] parts = fileName.split("\\.");
        return new ParsedImport(parts[0], parts[1]);
    }

    // ---- 3. ROUTER: content-based routing ----
    // "imports.parsed" -> router -> (csv | json | default)
    @Router(inputChannel = "imports.parsed")
    public String route(ParsedImport parsed) {
        return switch (parsed.extension().toLowerCase()) {
            case "csv"  -> "imports.csv";
            case "json" -> "imports.json";
            default     -> "imports.unknown";
        };
    }

    // ---- 4. SPLITTER: one message becomes many ----
    // "imports.csv" -> splitter -> "imports.rows" (one message per row)
    @Splitter(inputChannel = "imports.csv", outputChannel = "imports.rows")
    public List<CsvRow> split(CsvDocument doc) {
        return doc.rows();                       // each element = one message
    }

    // ---- 5. AGGREGATOR: many correlated messages become one ----
    // "imports.rows" -> aggregator -> "imports.summary"
    @Aggregator(inputChannel = "imports.rows", outputChannel = "imports.summary")
    public ImportSummary aggregate(List<CsvRow> allRows) {
        int total = allRows.stream().mapToInt(CsvRow::count).sum();
        return new ImportSummary(allRows.size(), total);
    }

    // ---- 6. FILTER: drop what doesn't qualify ----
    @Filter(inputChannel = "imports.rows")
    public boolean validRow(CsvRow row) {
        return row.count() > 0;
    }
}

record ParsedImport(String baseName, String extension) {}
record CsvRow(String name, int count) {}
record ImportSummary(int rows, int total) {}
```

### Walking Through Each Part

**The gateway** — `submitImport(String)` is a plain method to callers, but it drops a message on `imports.in`. The business code knows nothing about channels, transformers, or the downstream pipeline — the gateway is the seam between the imperative world and the messaging world.

**The transformer** — consumes a message, returns a *new* payload. `String fileName` → `ParsedImport`. Transformers are where formats meet: JSON ↔ objects, XML ↔ objects, CSV ↔ rows. The output goes to the declared output channel.

**The router** — makes a *routing decision* per message, returning the channel name to send it to. Content-based routing (`csv` → one channel, `json` → another) is the canonical EIP use. The router is the messaging equivalent of a dispatcher.

**The splitter** — returns a `List`; each element becomes its **own message** downstream. "Import a whole file" → "process each row". This is how you parallelize work over message parts.

**The aggregator** — the inverse: collects messages on a channel until the correlation group completes, then emits *one* message. In this flow, all the `CsvRow` messages from one import aggregate into a summary. (Correlation = messages from the same split; the framework tracks groups by correlation id.)

**The filter** — `true` keeps the message; `false` drops it. Simple, and it's the gatekeeper that keeps garbage out of downstream handlers.

## The Full Pipeline, Read Aloud

```
ImportGateway.submitImport("users.csv")
  -> imports.in
  -> TRANSFORM: "users.csv" -> ParsedImport(base=users, ext=csv)
  -> ROUTE: "csv" -> imports.csv
  -> SPLIT: doc -> [row1, row2, row3]  (three messages)
  -> FILTER: drop zero-count rows
  -> AGGREGATE: [row1, row2, row3] -> Summary(3 rows, total)
  -> imports.summary
```

Read it top to bottom and you've described the whole integration — this readability is why EIP/Spring Integration exists.

## The Splitter/Aggregator Gotcha

Aggregation needs to know **when a group is complete**:

- **Correlation id** — which messages belong together (usually propagated from the split).
- **Release strategy** — when is the group done? (Default: all messages of the correlation group arrived; or a `releaseStrategy` can say "every 10 or on timeout".)

If the release strategy is wrong, the aggregator waits forever (messages sit un-released). Always configure a **group timeout** for real flows — a missing message shouldn't hang the pipeline forever.

## Common Beginner Pitfalls

1. **Gateways that leak channel names** — the caller should pass *data*, not channel names; the routing is the pipeline's job.
2. **Transformers with side effects** — a transformer should reshape data, not call external services (that's a service activator's job).
3. **Routers returning an unknown channel** — Spring logs and drops; route to a `default` channel.
4. **Aggregators without timeouts** — a lost message leaves the group waiting forever; set group timeouts.
5. **Splitters that return null** — nothing downstream fires; return an empty list to "no messages" explicitly.
6. **One giant pipeline** — each pattern in its own method/component keeps flows testable and readable.

## Key Takeaways

- Spring Integration implements the Enterprise Integration Patterns as components.
- Gateway = messaging behind a Java method; Transformer = reshape; Router = route by content.
- Splitter fans one message into many; Aggregator correlates many back into one.
- Filter gates what flows downstream.
- Read a pipeline top-to-bottom — that readability is the design goal.
- Set aggregator timeouts and route to defaults; keep components single-purpose.
