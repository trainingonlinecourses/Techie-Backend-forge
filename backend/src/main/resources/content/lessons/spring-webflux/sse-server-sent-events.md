---
title: Server-Sent Events (SSE) — Real-Time Push
summary: Push live updates from server to client using SSE, SseEmitter, Flux-based SSE endpoints, and real-time dashboards.
order: 9
minutes: 16
topics: [sse, server-sent-events, real-time, event-stream, push-notifications, live-data]
docs:
  - https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
  - https://docs.spring.io/spring-framework/reference/web/webmvc-webflux/sse.html
---

# Server-Sent Events (SSE) — Real-Time Push

## What Are Server-Sent Events?

**Server-Sent Events (SSE)** let the server **push updates** to the client automatically, without the client asking. It's one-directional: server → client.

**Think of it like**: a news ticker — the server keeps sending new headlines, and the client displays them as they arrive.

**Use cases:**
- Live dashboards (stock prices, system metrics)
- Notification feeds
- Progress bars for long-running tasks
- Live chat messages
- Log streaming

### SSE vs WebSockets vs Polling

| Feature | SSE | WebSocket | Polling |
|---------|-----|-----------|---------|
| Direction | Server → Client | Bidirectional | Client → Server |
| Protocol | HTTP | Custom (ws://) | HTTP |
| Auto-reconnect | ✅ Built-in | ❌ Manual | ❌ Manual |
| Complexity | Low | Medium | Low |
| Browser support | All modern | All modern | All |
| Best for | Live feeds, notifications | Chat, gaming | Simple updates |

---

## SSE in Spring MVC (SseEmitter)

### Basic SSE Endpoint

```java
@RestController
@RequestMapping("/api/events")
public class EventController {

    private final SseEmitterManager emitterManager;

    public EventController(SseEmitterManager emitterManager) {
        this.emitterManager = emitterManager;
    }

    @GetMapping("/stream")
    public SseEmitter stream() {
        // Create an emitter with 10-minute timeout
        SseEmitter emitter = new SseEmitter(600_000L);

        // Register for connection events
        emitter.onCompletion(() -> emitterManager.remove(emitter));
        emitter.onTimeout(() -> emitterManager.remove(emitter));
        emitter.onError(e -> emitterManager.remove(emitter));

        // Register this emitter so we can send events later
        emitterManager.add(emitter);

        return emitter;
    }
}
```

### SseEmitter Manager

```java
@Component
public class SseEmitterManager {

    private static final Logger log = LoggerFactory.getLogger(SseEmitterManager.class);
    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public void add(SseEmitter emitter) {
        emitters.add(emitter);
        log.info("Client connected. Total: {}", emitters.size());
    }

    public void remove(SseEmitter emitter) {
        emitters.remove(emitter);
        log.info("Client disconnected. Total: {}", emitters.size());
    }

    // Broadcast event to ALL connected clients
    public void broadcast(String eventName, Object data) {
        List<SseEmitter> deadEmitters = new ArrayList<>();

        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                    .name(eventName)
                    .data(data)
                    .id(UUID.randomUUID().toString())
                    .build());
            } catch (IOException e) {
                deadEmitters.add(emitter);
                log.warn("Failed to send event: {}", e.getMessage());
            }
        }

        // Clean up dead connections
        emitters.removeAll(deadEmitters);
    }
}
```

### Sending Events from a Service

```java
@Service
public class OrderNotificationService {

    private final SseEmitterManager emitterManager;

    public OrderNotificationService(SseEmitterManager emitterManager) {
        this.emitterManager = emitterManager;
    }

    @EventListener
    public void onOrderCreated(OrderCreatedEvent event) {
        // Push to all connected clients
        emitterManager.broadcast("order-created", Map.of(
            "orderId", event.getOrderId(),
            "customer", event.getCustomerName(),
            "total", event.getTotal(),
            "timestamp", Instant.now().toString()
        ));
    }

    @EventListener
    public void onOrderStatusChanged(OrderStatusChangedEvent event) {
        emitterManager.broadcast("order-status", Map.of(
            "orderId", event.getOrderId(),
            "oldStatus", event.getOldStatus(),
            "newStatus", event.getNewStatus(),
            "timestamp", Instant.now().toString()
        ));
    }
}
```

---

## SSE in Spring WebFlux (Flux-based)

### Using Flux直接 as SSE

```java
@RestController
@RequestMapping("/api/events")
public class ReactiveEventController {

    private final EventPublisher eventPublisher;

    public ReactiveEventController(EventPublisher eventPublisher) {
        this.eventPublisher = eventPublisher;
    }

    // Spring automatically converts Flux to SSE format
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<Map<String, Object>>> stream() {
        return eventPublisher.getEventFlux()
            .map(event -> ServerSentEvent.<Map<String, Object>>builder()
                .id(event.getId())
                .event(event.getType())
                .data(event.getData())
                .build());
    }
}
```

### Event Publisher

```java
@Service
public class EventPublisher {

    private final Sinks.Many<Map<String, Object>> sink =
        Sinks.many().multicast().onBackpressureBuffer();

    public void publish(String eventType, Map<String, Object> data) {
        Map<String, Object> event = new HashMap<>(data);
        event.put("type", eventType);
        event.put("timestamp", Instant.now().toString());
        sink.tryEmitNext(event);
    }

    public Flux<Map<String, Object>> getEventFlux() {
        return sink.asFlux();
    }
}
```

---

## Client-Side JavaScript

```javascript
// Connect to SSE endpoint
const eventSource = new EventSource('/api/events/stream');

// Listen for specific events
eventSource.addEventListener('order-created', (event) => {
    const data = JSON.parse(event.data);
    console.log('New order:', data.orderId);
    showNotification(`New order from ${data.customer}: $${data.total}`);
});

eventSource.addEventListener('order-status', (event) => {
    const data = JSON.parse(event.data);
    updateOrderStatus(data.orderId, data.newStatus);
});

// Listen for all events
eventSource.onmessage = (event) => {
    console.log('Event:', event.data);
};

// Handle errors (auto-reconnects by default)
eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    // EventSource automatically reconnects!
};

// Close connection when done
eventSource.close();
```

---

## In an Organization

### Scenario 1: Live Order Dashboard

```java
@Service
public class DashboardService {

    private final EventPublisher eventPublisher;
    private final MeterRegistry metrics;

    public void publishOrderMetrics() {
        // Scheduled task sends metrics every 5 seconds
        Flux.interval(Duration.ofSeconds(5))
            .map(tick -> {
                Map<String, Object> metrics_data = Map.of(
                    "ordersPerMinute", getOrdersPerMinute(),
                    "averageWaitTime", getAverageWaitTime(),
                    "activeUsers", getActiveUserCount()
                );
                return metrics_data;
            })
            .subscribe(data -> eventPublisher.publish("metrics", data));
    }
}
```

### Scenario 2: Live Chat Notifications

```java
@Service
public class ChatService {

    private final EventPublisher eventPublisher;

    public Mono<Void> sendMessage(ChatMessage message) {
        return messageRepository.save(message)
            .then(Mono.fromRunnable(() ->
                eventPublisher.publish("chat-message", Map.of(
                    "roomId", message.getRoomId(),
                    "sender", message.getSender(),
                    "content", message.getContent(),
                    "timestamp", message.getCreatedAt().toString()
                ))
            ));
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Not handling client disconnect | Memory leak, dead emitters | Use `onCompletion()` and `onError()` callbacks |
| Sending too much data | Client overwhelmed, network congestion | Use `Flux.interval()` to rate-limit updates |
| Not setting timeout | Connection hangs forever | Set appropriate `SseEmitter` timeout |
| Not auto-reconnecting client | Client loses connection permanently | Use `EventSource` which auto-reconnects |
| Broadcasting to dead connections | IOException spam | Clean up dead emitters in broadcast loop |
| Using SSE for bidirectional | SSE is one-way only | Use WebSocket for bidirectional communication |

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Not handling client disconnect | Memory leak, dead emitters | Use `onCompletion()` and `onError()` callbacks |
| Sending too much data | Client overwhelmed, network congestion | Use `Flux.interval()` to rate-limit updates |
| Not setting timeout | Connection hangs forever | Set appropriate `SseEmitter` timeout |
| Not auto-reconnecting client | Client loses connection permanently | Use `EventSource` which auto-reconnects |
| Broadcasting to dead connections | IOException spam | Clean up dead emitters in broadcast loop |
| Using SSE for bidirectional | SSE is one-way only | Use WebSocket for bidirectional communication |
