---
title: Backpressure Patterns — Controlling Data Flow
summary: What backpressure is, why it matters for reactive streams, strategies (buffer, drop, latest), and production patterns for handling slow consumers.
order: 10
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

```java
// Without backpressure — 1 million events per second, but consumer handles 100/s
Flux.range(1, 1_000_000)
    .map(this::processEvent)  // Consumer is overwhelmed!
    .subscribe();             // 💥 Memory overflow after a few seconds
```

### The Solution: Backpressure Strategies

```java
// With backpressure — producer respects consumer's capacity
Flux.range(1, 1_000_000)
    .onBackpressureBuffer(1000)  // Buffer up to 1000 items
    .map(this::processEvent)     // Consumer processes at its own pace
    .subscribe();
```

---

## Backpressure Strategies

### 1. Buffer (Default) — Store Until Processed

```java
Flux.range(1, 1_000_000)
    .onBackpressureBuffer(1000)      // Buffer up to 1000 items
    .map(this::slowProcess)          // Process slowly
    .subscribe();

// When buffer is full:
// - Buffer overflow strategy: drops oldest items
// - Or throws BufferOverflowException
```

### 2. Drop — Discard New Items

```java
Flux.range(1, 1_000_000)
    .onBackpressureDrop()            // Drop items when consumer is busy
    .map(this::processEvent)
    .subscribe();

// If consumer can't keep up, new items are simply discarded
// Good for: metrics, real-time data where old data doesn't matter
```

### 3. Latest — Keep Only the Most Recent

```java
Flux.range(1, 1_000_000)
    .onBackpressureLatest()          // Keep only the latest item
    .map(this::processEvent)
    .subscribe();

// When consumer catches up, it gets the LATEST item
// Good for: stock prices, sensor readings where only current value matters
```

### 4. Error — Fail on Backpressure

```java
Flux.range(1, 1_000_000)
    .onBackpressureError()           // Throw exception when backpressured
    .map(this::processEvent)
    .subscribe();

// Throws BackpressureException immediately
// Good for: systems where data loss is unacceptable
```

---

## Request-Based Backpressure

### Demand-Driven: Consumer Pulls Data

```java
// Consumer requests only what it can handle
Flux.range(1, 1_000_000)
    .limitRate(100)                  // Request 100 items at a time
    .map(this::processEvent)
    .subscribe();

// Consumer processes 100, then requests 100 more
// Producer never overwhelms consumer
```

### Using `publishOn` for Parallel Processing

```java
Flux.range(1, 1_000_000)
    .publishOn(Schedulers.boundedElastic())  // Process on elastic pool
    .limitRate(100)                           // Request 100 at a time
    .map(this::processEvent)                  // Process in parallel
    .subscribe();
```

---

## In an Organization

### Scenario 1: Log Ingestion Pipeline

```java
@Service
public class LogIngestionService {

    public Flux<LogEntry> ingestLogs(Flux<String> rawLogs) {
        return rawLogs
            .map(this::parseLog)                    // Parse raw string to LogEntry
            .filter(Objects::nonNull)                // Skip malformed logs
            .onBackpressureBuffer(5000)              // Buffer during traffic spikes
            .flatMap(this::enrichLog, 16)            // Enrich with metadata, 16 concurrent
            .onBackpressureDrop(dropped ->
                log.warn("Dropped log entry: {}", dropped))
            .flatMap(this::indexInElasticsearch, 8)  // Index, 8 concurrent
            .onBackpressureLatest();                  // Keep only latest if still behind
    }
}
```

### Scenario 2: Real-Time Sensor Data

```java
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
```

### Scenario 3: Message Queue Consumer

```java
@Service
public class MessageConsumer {

    public Flux<ProcessedMessage> consumeMessages(Flux<Message> messages) {
        return messages
            .limitRate(50)                           // Pull 50 at a time
            .publishOn(Schedulers.boundedElastic())  // Process on elastic threads
            .flatMap(this::processMessage, 10)       // 10 concurrent processors
            .onBackpressureBuffer(1000,              // Buffer during spikes
                dropped -> auditLog.record("DROPPED", dropped))
            .retry(3)                                // Retry failed processing
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
