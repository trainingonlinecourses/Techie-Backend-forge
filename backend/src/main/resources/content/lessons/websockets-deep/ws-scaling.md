---
title: Scaling WebSockets — Beyond One Instance
module: websockets-deep
order: 5
minutes: 25
topics: ["horizontal scaling", "session affinity", "Redis pub-sub", "sticky sessions", "broker relay"]
docs:
  - title: "STOMP broker relay (Spring docs)"
    url: "https://docs.spring.io/spring-framework/reference/web/websocket/stomp/configuration.html#websocket-stomp-handle-broker-relay"
---

# Scaling WebSockets — Beyond One Instance

## The Concept: The In-Memory Session Trap

The chat handler from the first lesson keeps sessions in a `ConcurrentHashMap` — in *one JVM's memory*. That's fine for a single instance. But the moment you scale to **two instances** behind a load balancer:

```
Browser A ──> Instance 1  (A's session lives here)
Browser B ──> Instance 2  (B's session lives here)

Instance 1 broadcasts A's message → only its own sessions see it
Instance 2's sessions (including B) NEVER see it
```

A message sent to Instance 1 never reaches the sessions on Instance 2. The in-memory broker (from the STOMP lesson) has exactly this problem: subscriptions live per-instance. **The fix is a shared channel between instances** — a message published on any instance must be *relayed* to all of them.

## The Two Scaling Strategies

### Strategy 1 — Sticky sessions (session affinity)

The load balancer pins each client to one instance (by cookie or source IP). All of a client's messages hit the same instance, so its session always exists there. Simple — but:

- Uneven load (some instances carry more sockets).
- Instance failure kills its pinned clients (no failover).
- The "broadcast to all sessions" problem *remains* — a message published on instance 1 still doesn't reach instance 2's clients.

Sticky sessions fix *session continuity*, not *cross-instance broadcast*. You still need the shared channel.

### Strategy 2 — The shared message channel (the real answer)

A **broker** (RabbitMQ, Redis pub/sub, Kafka) connects the instances:

```
Instance 1 ─┐
            ├── shared broker (topic: /topic/chat)
Instance 2 ─┘

A publishes on Instance 1 → broker → Instance 1 (local sessions) + Instance 2 (remote sessions)
```

Every instance subscribes to the broker; every broadcast goes *through* the broker, so all instances deliver it. Subscriptions become **global** instead of per-instance.

## The Code Walkthrough — Redis Pub/Sub Relay

```java
// ---- 1. Redis pub/sub: the lightweight shared channel ----
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.listener.adapter.MessageListenerAdapter;
import org.springframework.stereotype.Component;

@Component
public class RedisChatRelay {

    private final SimpMessagingTemplate template;    // delivers to LOCAL sessions

    public RedisChatRelay(SimpMessagingTemplate template,
                          RedisConnectionFactory redisFactory) {
        this.template = template;

        // Listen for messages published by OTHER instances:
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(redisFactory);
        container.addMessageListener(new MessageListenerAdapter(this, "onRelay"),
                new ChannelTopic("chat-relay"));
        container.start();
    }

    // Called when ANOTHER instance published to the channel
    public void onRelay(String payload) {
        // Deliver to THIS instance's local subscribers:
        template.convertAndSend("/topic/chat", payload);
    }

    // Called by THIS instance's handlers when a message arrives locally
    public void publish(String payload) {
        template.convertAndSend("/topic/chat", payload);   // deliver locally
        redisTemplate.convertAndSend("chat-relay", payload); // tell other instances
    }
}
```

### Walking Through Each Part

**The relay pattern** — every instance has both ears:

- **Local delivery**: `template.convertAndSend("/topic/chat", ...)` reaches this instance's STOMP subscribers.
- **Relay**: publishing to the Redis channel tells every *other* instance "a message happened" — each of them delivers it to *its* local subscribers.

The result: one logical topic spread across N instances, each instance handling only its own sockets, all instances seeing all messages. **Redis pub/sub is the lightweight glue** (no message durability needed — a missed real-time chat message is acceptable); RabbitMQ is the heavyweight option with the same role.

## The Broker Relay Option (Spring + RabbitMQ)

Spring's `enableStompBrokerRelay` pushes the *brokering itself* to RabbitMQ:

```java
@Override
public void configureMessageBroker(MessageBrokerRegistry config) {
    config.enableStompBrokerRelay("/topic", "/queue")
            .setRelayHost("rabbitmq")
            .setRelayPort(61613)          // STOMP port
            .setClientLogin("guest")
            .setClientPasscode("guest");
    config.setApplicationDestinationPrefixes("/app");
}
```

Now RabbitMQ IS the broker: subscriptions register with RabbitMQ, messages route through it, and every instance is just a *relay point* to the same logical broker. Subscriptions are global by construction — no manual relay code at all. The cost: an extra moving part (RabbitMQ) to operate.

## Redis pub/sub vs Broker Relay — Choosing

| | Redis pub/sub relay | STOMP broker relay (RabbitMQ) |
|---|---|---|
| What's shared | A channel for broadcasts | The entire broker (subscriptions + routing) |
| Code | You write the relay | Config only |
| Durability | None (fire-and-forget) | Message persistence available |
| Complexity | Redis only (often already present) | RabbitMQ to operate |
| Best for | Chat/notifications where drops are OK | Real messaging semantics, durability, queues |

If you already run Redis (cache, sessions), the pub/sub relay is the pragmatic choice. If you run RabbitMQ for other messaging, the broker relay is free.

## The Connection-Keeping Problem

Each client holds an open socket on *one* instance. As instances scale, the distribution question returns:

- **Sticky sessions** keep a client pinned (works, uneven).
- **Any-instance connects** (non-sticky) — a client can reconnect to a different instance; with the broker relay, that's fine (subscriptions are global).
- **Graceful shutdown** — when an instance drains, its clients must reconnect (the platform routes them elsewhere); implement client reconnection with backoff.

## The Scaling Checklist

- [ ] All broadcasts go through a shared channel (Redis pub/sub or broker relay).
- [ ] Subscriptions are global (broker-based), not per-instance.
- [ ] Client reconnects with backoff (instances come and go).
- [ ] Heartbeats defeat proxy/load-balancer idle timeouts.
- [ ] Instance count is a stateless scaling decision — adding an instance needs zero config.
- [ ] Capacity measured in *sockets per instance* (memory per connection) — plan instance size accordingly.

## Common Beginner Pitfalls

1. **Scaling without a shared channel** — instance 2's clients never see instance 1's broadcasts; the classic "chat works in dev, breaks in prod with 2+ instances".
2. **Sticky sessions as the only answer** — they fix continuity, not cross-instance broadcast; you still need the relay.
3. **Missing client reconnection** — instance restarts drop sockets; without reconnect, users silently lose the live feed.
4. **Redis pub/sub for durable messages** — it's fire-and-forget; use a broker/queue for anything that must survive a disconnect.
5. **Per-instance in-memory state** (sessions, counters) — anything the app *needs* across instances must live outside the JVM (Redis, DB, broker).
6. **Not load-testing sockets** — thousands of long-lived connections have different memory/latency profiles than request/response; test at scale.

## Key Takeaways

- In-memory sessions/subscriptions are per-instance — the core scaling problem.
- The fix: a shared channel (Redis pub/sub or STOMP broker relay) so every broadcast reaches all instances.
- Sticky sessions give continuity; the relay gives global broadcasts — you need both for real scale.
- The broker relay (RabbitMQ) makes subscriptions global by construction, at the cost of running RabbitMQ.
- Clients must reconnect with backoff; instances are ephemeral.
- Sockets are memory-heavy — size instances by sockets, and test at scale.
