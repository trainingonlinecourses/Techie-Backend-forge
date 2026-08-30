---
title: STOMP — Messaging Semantics on Top of WebSocket
module: websockets-deep
order: 2
minutes: 25
topics: ["STOMP", "message broker", "destinations", "subscriptions", "@MessageMapping", "@SendTo"]
summary: Raw WebSockets give you frames — but no routing, no topics, no requestreply, no "subscribe to a channel". You end up handrolling a miniprotocol (th...
docs:
  - title: "Using STOMP over WebSocket (Spring docs)"
    url: "https://docs.spring.io/spring-framework/reference/web/websocket/stomp.html"
---

# STOMP — Messaging Semantics on Top of WebSocket

## The Concept: When Raw WebSocket Isn't Enough

Raw WebSockets give you *frames* — but no routing, no topics, no request-reply, no "subscribe to a channel". You end up hand-rolling a mini-protocol (the chat handler in the previous lesson re-implemented broadcasting manually).

**STOMP** (Simple Text Oriented Messaging Protocol) puts **messaging semantics** on top of WebSocket — the same vocabulary you met in the messaging module, but over a browser-friendly transport:

- **Destinations** — `/topic/news` (fan-out to all subscribers), `/queue/jobs` (point-to-point).
- **Subscriptions** — a client says "I want messages on `/topic/news`".
- **Frames** — `SEND`, `SUBSCRIBE`, `MESSAGE`, `ACK` — a small, readable command set.
- **A broker** — routes messages to the right subscribers (Spring's in-memory simple broker, or a real broker like RabbitMQ via STOMP).

Think of it as **messaging (queues/topics) with a browser client**. The frontend subscribes to topics; the backend publishes; the broker does the routing. You get the full messaging mental model (from the messaging module) without building a protocol yourself.

## Spring's STOMP Stack

```
Browser (STOMP over WebSocket)
        |
        v
[ /app/** ] -> @MessageMapping handlers (your code)
        |
        v
[ /topic/**, /queue/** ] -> the broker -> subscribed clients
```

- Client sends to `/app/chat.send` → your `@MessageMapping` method.
- Your method returns (or uses `SimpMessagingTemplate`) to publish to `/topic/...`.
- The broker fans the message out to everyone subscribed to that topic.

## The Code Walkthrough

```java
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
public class ChatController {

    // ---- 1. Receiving + replying: request-reply style ----
    @MessageMapping("/chat.send")                    // client SENDs to /app/chat.send
    @SendTo("/topic/chat")                           // result goes to all subscribers
    public ChatMessage broadcast(ChatMessage message) {
        return new ChatMessage(message.from(), message.text());
    }

    // ---- 2. Server-push at any time (not just in response) ----
    private final SimpMessagingTemplate template;

    public ChatController(SimpMessagingTemplate template) { this.template = template; }

    public void notifyNewLesson(String courseTitle) {
        // Called from ANYWHERE in the app (a service, a scheduler, an event listener):
        template.convertAndSend("/topic/announcements",
                "New lesson published: " + courseTitle);
    }
}
```

```java
// The config: enable STOMP with an in-memory broker
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocketMessageBroker
public class StompConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        config.enableSimpleBroker("/topic", "/queue");   // broker destinations
        config.setApplicationDestinationPrefixes("/app"); // to @MessageMapping handlers
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws").withSockJS();          // the connect URL
    }
}
```

### Walking Through Each Part

**`@MessageMapping("/chat.send")`** — the server-side receiver: messages SENT to `/app/chat.send` invoke this method with the deserialized payload (JSON → the DTO via Jackson).

**`@SendTo("/topic/chat")`** — the reply route: the method's return value is published to `/topic/chat`, and the broker delivers it to *every subscriber*. Request-reply over messaging, declaratively.

**`SimpMessagingTemplate`** — the server-push escape hatch: any code (a service, an `@EventListener`, a `@Scheduled` job) can `convertAndSend` to a destination at any moment — no client request involved. This is the "notify all browsers when a lesson is published" capability.

**The config** — two destination prefixes:

- `/app/**` — client → server (goes to `@MessageMapping` handlers).
- `/topic/**` and `/queue/**` — server → client (the broker routes these to subscribers).

**`withSockJS()`** — enables the SockJS fallback: if the browser/proxy can't do WebSocket, SockJS falls back to HTTP-based transports (XHR streaming, long-polling) transparently. The client just uses the SockJS client.

## The Client (Browser) Side

```javascript
const socket = new SockJS('/ws');
const stompClient = Stomp.over(socket);

stompClient.connect({}, () => {
    // Subscribe to a topic — server pushes arrive here
    stompClient.subscribe('/topic/chat', (message) => {
        const chat = JSON.parse(message.body);
        console.log(chat.from, chat.text);
    });

    // Send to the backend's @MessageMapping
    stompClient.send('/app/chat.send', {}, JSON.stringify({ from: 'me', text: 'hi' }));
});
```

The browser subscribes and sends through one connection; the server routes via destinations.

## STOMP vs Raw WebSocket

| | Raw WebSocket | STOMP over WebSocket |
|---|---|---|
| Routing | You hand-roll | Destinations + broker |
| Topics/subscriptions | Manual | Built-in |
| Payload format | Frames | Frames with a message envelope |
| Multi-instance scaling | In-memory sessions only | Plug a real broker (RabbitMQ) |
| Best for | Small custom protocols | Chat, notifications, real-time dashboards |

**Rule:** if your real-time feature is "clients subscribe to channels and receive messages" → STOMP. If it's a custom low-level stream → raw WebSocket.

## Common Beginner Pitfalls

1. **Wrong destination prefix** — SENDING to `/topic/...` (broker-only) or subscribing to `/app/...` (handler-only) silently does nothing; respect the prefixes.
2. **No `SimpMessagingTemplate` for pushes** — `@SendTo` only covers "reply to this message"; pushes from other code need the template.
3. **Subscriptions before connect** — the client must `connect()` then `subscribe()`; subscribing too early silently drops.
4. **Security gaps** — restrict which destinations users can subscribe to (an interceptor on SUBSCRIBE frames); a malicious client subscribing to `/topic/admin` sees admin pushes.
5. **In-memory broker in production** — the simple broker works only on one instance; for multi-instance, use a real broker (RabbitMQ's STOMP plugin) or a shared topic backend.
6. **JSON parse errors on malformed payloads** — validate/deserialize defensively; a bad payload shouldn't kill the handler.

## Key Takeaways

- STOMP adds messaging semantics (destinations, subscriptions, broker routing) over WebSocket.
- `/app/**` = client → `@MessageMapping` handlers; `/topic/**`, `/queue/**` = broker → subscribers.
- `@SendTo` replies to the sender's channel; `SimpMessagingTemplate` pushes from anywhere.
- SockJS gives HTTP fallbacks when WebSocket is unavailable.
- Multi-instance production needs a real broker, not the in-memory simple broker.
- Secure subscriptions: not every client should see every topic.
