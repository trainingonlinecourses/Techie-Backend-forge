---
title: Message Channels — Direct, Queue, Publish-Subscribe, and Priority
module: spring-integration
order: 2
minutes: 25
topics: ["MessageChannel", "DirectChannel", "QueueChannel", "publish-subscribe", "priority channel", "channel adapters"]
summary: The channel is the pipe of the integration — but not all pipes behave alike. The channel type you choose is the integration's semantics: direct cha...
docs:
  - title: "Message Channels (Spring Integration Reference)"
    url: "https://docs.spring.io/spring-integration/reference/channel.html"
  - title: "Channel Implementations (Spring Integration Reference)"
    url: "https://docs.spring.io/spring-integration/reference/channel-implementations.html"
---

# Message Channels — Direct, Queue, Publish-Subscribe, and Priority

## The Concept: The Pipes That Decide the Semantics

The channel is the *pipe* of the integration — but not all pipes behave alike. The channel type you choose *is* the integration's semantics: **direct** channels are synchronous calls (transactional, blocking), **queue** channels are async buffers (decoupled, buffered), **publish-subscribe** channels broadcast to every subscriber, and **priority** channels reorder by importance. Choosing wrong is how integrations deadlock, drop messages, or silently reorder them — so the channel decision deserves deliberate thought, not the default.

**The mental model:** a direct channel is a phone call — connected the instant you dial, synchronous, one listener. A queue channel is a mailbox — you drop the letter and leave; the recipient collects it whenever. A publish-subscribe channel is a town crier — *everyone* hears it. Each serves a different need, and the *channel* (not the endpoints) embodies that difference.

## DirectChannel: The Synchronous Default

```java
@Bean
MessageChannel ordersChannel() {
    return MessageChannels.direct().get();
}
```

**The semantics:** the sender invokes the receiver *in the same thread* — a synchronous method call through the message abstraction. `channel.send(message)` blocks until the (single) subscriber's endpoint finishes.

**Why it's the default:** transactions and error handling stay in the caller's thread. If the flow must be *transactional* ("consume this JMS message, transform it, and write to the DB — all-or-nothing"), the direct channel is the vehicle: the whole chain runs inside the consuming transaction. The backpressure is natural: a slow consumer blocks the producer. **The caveat:** the synchronous chain runs *in your request thread* — a long pipeline (file processing, slow API calls) ties up the thread; that's when a queue or an async poller is the right switch.

## QueueChannel: The Async Buffer

```java
@Bean
MessageChannel emailOutbox() {
    // A bounded queue: 100 pending messages. The sender never blocks
    // (until full); a consumer drains at its own pace.
    return MessageChannels.queue(100).get();
}
```

**The semantics:** `send` enqueues and returns immediately; a consumer (a poller on a downstream endpoint, or `@ServiceActivator(inputChannel=..., poller=...)`) dequeues when ready. The producer and consumer are decoupled — different threads, different paces.

**The operational truths:**
- **A bounded queue is a contract.** Full → `send` blocks (or fails with `MessageDeliveryException` if you set `failOnTimeout`). The bound is your backpressure policy: unbounded queues hide problems until memory blows.
- **A queue is a failure point.** Messages wait in memory (or in an embedded channel's backing store) — a restart loses them. For *reliable* async integration, the queue should be a real broker (Kafka/RabbitMQ) via an adapter, not an in-memory channel.
- **The consumer needs a poller** — a queue channel alone does nothing; the downstream endpoint must poll it (`e -> e.poller(Pollers.fixedDelay(100))`), or you get a silent no-op.

## PublishSubscribeChannel: The Broadcast

```java
@Bean
MessageChannel auditEvents() {
    // EVERY subscriber receives every message — independently.
    return MessageChannels.publishSubscribe().get();
}

// Two subscribers, both get everything:
@ServiceActivator(inputChannel = "auditEvents")
public void auditToDatabase(Object payload) { ... }

@ServiceActivator(inputChannel = "auditEvents")
public void auditToKafka(Object payload) { ... }
```

**The semantics:** one message in, N copies out — each subscriber processes independently, in its own error context. This is the event-driven "multiple reactions to one fact" pattern in channel form. **The distinctions that matter:** a *direct* channel with two subscribers is an error (only one receives); a publish-subscribe channel *requires* multiple subscribers to earn its name; and each subscriber's failure is isolated (one subscriber throwing doesn't stop the others). For true fan-out to *systems* (Kafka topics, webhooks), the `@Poller`-less pub-sub channel dispatches to each subscriber's endpoint directly.

## The Other Channel Flavors

```java
// Priority channel — dequeue by a priority header, not FIFO:
@Bean
MessageChannel jobsChannel() {
    return MessageChannels.priority(100, (m1, m2) ->
        Integer.compare(priorityOf(m2), priorityOf(m1))).get();   // highest first
}

// Rendezvous channel — the rarest: send BLOCKS until the receiver
// takes the message (a hand-off, no buffering). Useful for a strict
// "wait until consumed" handshake.

// Executor channel — async dispatch to a task executor (thread pool):
@Bean
MessageChannel slowTasks() {
    return MessageChannels.executor(Executors.newFixedThreadPool(4)).get();
}
// Like a queue channel, but with an explicit executor you control.
```

**The family portrait:** direct (sync, transactional), queue (async, buffered, bounded), executor (async, thread-pooled), priority (async, ordered by priority), rendezvous (blocking hand-off), and publish-subscribe (broadcast). Most integrations need one of the first three plus pub-sub for fan-out — the others are the specialized tools.

## The Poller: The Engine for Queue Channels

A queue channel's consumer doesn't run by itself — it needs a **poller**:

```java
@Bean
public IntegrationFlow processEmail() {
    return IntegrationFlow
            .from("emailOutbox", e -> e.poller(Pollers.fixedDelay(100)
                    .maxMessagesPerPoll(10)))     // poll every 100ms, 10 at a time
            .handle("emailService", "send")
            .get();
}
```

`fixedDelay(100)` polls every 100ms; `maxMessagesPerPoll` bounds the batch (backpressure in batches). The poller *is* the consumer's heartbeat — and its `taskExecutor` (a `TaskExecutor` you can supply) decides whether polling blocks the integration thread. The poller + queue combination is Spring Integration's built-in async engine: producer threads enqueue, a poller thread drains, bounded by `maxMessagesPerPoll` and the queue's capacity.

## Choosing the Channel

| Need | Channel |
|---|---|
| Transactional, in-thread processing | **Direct** (default) |
| Decouple producer from consumer speed | **Queue** (bounded!) |
| Fan-out to multiple independent reactions | **Publish-subscribe** |
| Async with a thread pool you own | **Executor** |
| Process by importance | **Priority** |
| Reliable cross-restart messaging | **A real broker via an adapter**, not an in-memory channel |

**The production wisdom:** direct channels for the *transactional* parts of a flow; queue/executor channels at the *boundaries* where speed must be decoupled; pub-sub for fan-out; and — the recurring theme — *in-memory channels are for in-process integration*, while *reliable, durable messaging belongs to a broker* (Kafka/RabbitMQ/JMS) reached through adapters. The channel is the semantics; choose it like you'd choose a data structure.

## Recap

Message channels are the pipes that define the integration's semantics: **direct** (synchronous, transactional, in-thread — the default), **queue** (async buffered — bounded, with a poller as the consumer engine), **publish-subscribe** (every subscriber gets everything, independently), plus priority, executor, and rendezvous flavors. The production discipline: use direct for transactional chains, bounded queues/executors where speed must decouple, pub-sub for fan-out — and remember that in-memory channels serve in-process integration, while durable cross-restart messaging belongs to a real broker through an adapter. The channel you choose *is* the behavior you get: blocking vs buffering, one receiver vs many, FIFO vs priority.
