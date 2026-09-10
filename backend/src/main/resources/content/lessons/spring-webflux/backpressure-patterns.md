---
title: Backpressure Patterns — Controlling Data Flow
summary: What backpressure is, why it matters for reactive streams, strategies (buffer, drop, latest), and production patterns for handling slow consumers.
order: 2
minutes: 18
topics: [backpressure, reactive-streams, flow-control, buffer, drop, latest, demand]
docs:
  - https://www.reactive-streams.org/
  - https://projectreactor.io/docs/core/release/reference/#publisherotas
---

# Backpressure Patterns — Controlling Data Flow

## What Is Backpressure?

**Backpressure** is what happens when a data producer is faster than the consumer. Without it, a fast producer would overwhelm a slow consumer, causing memory overflow or data loss.

**Think of it like**: a fire hose connected to a small cup — without flow control, the cup overflows instantly. Backpressure tells the fire hose to "slow down" or "skip some water."

### The Problem: No Backpressure

// Without backpressure — 1 million events per second, but consumer handles 100/s
Flux.range(1, 1_000_000)
    .map(this::processEvent)  // Consumer is overwhelmed!
```java
    .subscribe();             // 💥 Memory overflow after a few seconds
```

### The Solution: Backpressure Strategies

// With backpressure — producer respects consumer's capacity
Flux.range(1, 1_000_000)
    .onBackpressureBuffer(1000)  // Buffer up to 1000 items
    .map(this::processEvent)     // Consumer processes at its own pace
```java
    .subscribe();
```

---

## Backpressure Strategies

### 1. Buffer (Default) — Store Until Processed


**What this code does — step by step:**

1. `.onBackpressureBuffer(1000)` — Buffer up to 1000 items
2. `.map(this::slowProcess)` — Process slowly
3. When buffer is full: - Buffer overflow strategy: drops oldest items. - Or throws BufferOverflowException

The same code, clean:

```java
Flux.range(1, 1_000_000)
    .onBackpressureBuffer(1000)
    .map(this::slowProcess)
    .subscribe();
```

### 2. Drop — Discard New Items

Flux.range(1, 1_000_000)
    .onBackpressureDrop()            // Drop items when consumer is busy
    .map(this::processEvent)
```java
    .subscribe();

// If consumer can't keep up, new items are simply discarded
// Good for: metrics, real-time data where old data doesn't matter
```

### 3. Latest — Keep Only the Most Recent

Flux.range(1, 1_000_000)
    .onBackpressureLatest()          // Keep only the latest item
    .map(this::processEvent)
```java
    .subscribe();

// When consumer catches up, it gets the LATEST item
// Good for: stock prices, sensor readings where only current value matters
```

### 4. Error — Fail on Backpressure

Flux.range(1, 1_000_000)
    .onBackpressureError()           // Throw exception when backpressured
    .map(this::processEvent)
```java
    .subscribe();

// Throws BackpressureException immediately
// Good for: systems where data loss is unacceptable
```

---

## Request-Based Backpressure

### Demand-Driven: Consumer Pulls Data

// Consumer requests only what it can handle
Flux.range(1, 1_000_000)
    .limitRate(100)                  // Request 100 items at a time
    .map(this::processEvent)
```java
    .subscribe();

// Consumer processes 100, then requests 100 more
// Producer never overwhelms consumer
```

### Using `publishOn` for Parallel Processing

Flux.range(1, 1_000_000)
    .publishOn(Schedulers.boundedElastic())  // Process on elastic pool
    .limitRate(100)                           // Request 100 at a time
    .map(this::processEvent)                  // Process in parallel
```java
    .subscribe();
```

---

## In an Organization

### Scenario 1: Log Ingestion Pipeline


**What this code does — step by step:**

1. `.map(this::parseLog)` — Parse raw string to LogEntry
2. `.filter(Objects::nonNull)` — Skip malformed logs
3. `.onBackpressureBuffer(5000)` — Buffer during traffic spikes
4. `.flatMap(this::enrichLog, 16)` — Enrich with metadata, 16 concurrent
5. `.flatMap(this::indexInElasticsearch, 8)` — Index, 8 concurrent
6. `.onBackpressureLatest();` — Keep only latest if still behind

The same code, clean:

```java
@Service
public class LogIngestionService {

    public Flux<LogEntry> ingestLogs(Flux<String> rawLogs) {
        return rawLogs
            .map(this::parseLog)
            .filter(Objects::nonNull)
            .onBackpressureBuffer(5000)
            .flatMap(this::enrichLog, 16)
            .onBackpressureDrop(dropped ->
                log.warn("Dropped log entry: {}", dropped))
            .flatMap(this::indexInElasticsearch, 8)
            .onBackpressureLatest();
    }
}
```

### Scenario 2: Real-Time Sensor Data

@Service
public class SensorService {

    public Flux<SensorReading> processSensorData(Flux<SensorReading> readings) {
        return readings
            .onBackpressureLatest()                  // Only keep latest reading per sensor
            .window(Duration.ofSeconds(5))           // Batch into 5-second windows
            .flatMap(window ->
                window.collectList()
                    .map(this::aggregateReadings)    // Average, min, max per window
            )
            .onBackpressureBuffer(100)
            .flatMap(this::storeAndAlert, 4);
    }
}

### Scenario 3: Message Queue Consumer


**What this code does — step by step:**

1. `.limitRate(50)` — Pull 50 at a time
2. `.publishOn(Schedulers.boundedElastic())` — Process on elastic threads
3. `.flatMap(this::processMessage, 10)` — 10 concurrent processors
4. `.onBackpressureBuffer(1000,` — Buffer during spikes
5. `.retry(3)` — Retry failed processing

The same code, clean:

```java
@Service
public class MessageConsumer {

    public Flux<ProcessedMessage> consumeMessages(Flux<Message> messages) {
        return messages
            .limitRate(50)
            .publishOn(Schedulers.boundedElastic())
            .flatMap(this::processMessage, 10)
            .onBackpressureBuffer(1000,
                dropped -> auditLog.record("DROPPED", dropped))
            .retry(3)
            .onErrorResume(e -> {
                log.error("Processing failed", e);
                return Mono.empty();
            });
    }
}
```

---

## Choosing the Right Strategy

| Strategy | Use When | Example |
|----------|----------|---------|
| **Buffer** | You can tolerate memory growth during spikes | Log ingestion, batch processing |
| **Drop** | Old data doesn't matter | Real-time metrics, monitoring |
| **Latest** | Only current value matters | Stock prices, sensor readings |
| **Error** | Data loss is unacceptable | Financial transactions, audit logs |
| **Limit Rate** | Consumer has known processing capacity | Database writes, API calls |

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Ignoring backpressure entirely | Memory overflow, OOM kills | Always specify a strategy |
| Using buffer without limit | Unbounded memory growth | Set a maximum buffer size |
| Using drop for critical data | Data loss without awareness | Use buffer or error for important data |
| Not using `limitRate` | Producer pushes too fast | Set demand-based pull with `limitRate()` |
| Mixing reactive and blocking | Backpressure doesn't work with blocking calls | Use R2DBC, never JDBC in reactive chain |
| Not monitoring buffer size | Can't detect backpressure issues | Add metrics for buffer size, drop count |

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [docs.spring.io/spring-framework/reference/web/webflux.html](https://docs.spring.io/spring-framework/reference/web/webflux.html)
