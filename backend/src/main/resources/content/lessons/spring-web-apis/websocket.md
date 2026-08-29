---
title: WebSockets & STOMP in Spring
summary: Full-duplex browser-server communication — STOMP over WebSocket, @MessageMapping handlers, broker configuration, and when WebSocket beats polling and SSE.
order: 7
minutes: 15
topics: [websocket, stomp, messaging, spring websocket, realtime]
docs:
  - https://docs.spring.io/spring-framework/reference/web/websocket.html
  - https://docs.spring.io/spring-framework/reference/web/websocket/stomp.html
---

# WebSockets & STOMP in Spring

## The three realtime options

| Technique | Direction | Best for |
|---|---|---|
| Polling (REST every N sec) | server → client (via pull) | simplicity; low-frequency updates |
| Server-Sent Events (SSE) | server → client, one-way | live feeds (notifications, prices) |
| **WebSocket** | **full-duplex** | chat, collaborative editing, live dashboards with client→server traffic |

WebSocket is a **persistent, bidirectional TCP-ish connection** from the browser; STOMP is the simple messaging protocol layered on top (subscribe/ publish, destinations) — Spring's recommended way to use WebSocket, because it gives you topics, routing and a familiar publish/subscribe model.

## Wiring STOMP

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue");   // where the server pushes
        registry.setApplicationDestinationPrefixes("/app"); // where clients send
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws").setAllowedOriginPatterns("*").withSockJS();
        // SockJS: fallback transport (XHR/JSONP) for browsers/clients without raw WebSocket
    }
}
```

The path model: client sends to `/app/...` (handled by your controllers), server publishes to `/topic/...` (broadcast) or `/queue/...` (one user). The broker (simple in-memory, or a real one like RabbitMQ/ActiveMQ) routes messages.

## Handling messages server-side

```java
@Controller
public class ChatController {

    @MessageMapping("/chat.send")                       // client → /app/chat.send
    @SendTo("/topic/chat")                              // broadcast to subscribers
    public ChatMessage send(ChatMessage msg) {
        return msg.withServerTimestamp(Instant.now());
    }

    @MessageMapping("/chat.private")
    public void privateMsg(ChatMessage msg, Principal principal) {
        messagingTemplate.convertAndSendToUser(msg.toUser(), "/queue/reply", msg);
        // → /user/{username}/queue/reply, the authenticated user's private queue
    }
}
```

- `@MessageMapping` mirrors `@RequestMapping` for STOMP destinations; `@SendTo` routes the return value.
- **`SimpMessagingTemplate`** (`convertAndSend`, `convertAndSendToUser`) lets *any* bean push — a service notifying a room when an order ships:

```java
simpMessagingTemplate.convertAndSend("/topic/orders/" + orderId,
    new OrderEvent(orderId, "SHIPPED"));
```

- `convertAndSendToUser` needs the authenticated user: with Spring Security, the session's `Principal` is attached — **STOMP over a WebSocket authenticates like any Spring Security request** (your JWT/Session filter applies; `@PreAuthorize` works on message mappings).

## The browser side

```js
const sock = new SockJS('/ws');
const stomp = Stomp.over(sock);
stomp.connect({}, () => {
    stomp.subscribe('/topic/chat', frame => render(JSON.parse(frame.body)));
    stomp.send('/app/chat.send', {}, JSON.stringify({ user: 'ada', text: 'hi' }));
});
```

(Spring Boot serves the `sockjs-client`/`stomp.js` static assets; the frontend mirrors this with a JS client — in this academy's stack, the chat page's realtime would be wired exactly this way.)

## What breaks in production

1. **Multi-instance**: the in-memory simple broker is per-JVM — a message published on instance A never reaches subscribers on instance B. Scale-out requires a **shared broker** (RabbitMQ/ActiveMQ STOMP) or a Redis pub/sub relay:

```java
registry.enableStompBrokerRelay("/topic", "/queue")
    .setRelayHost("rabbit.internal");
```

2. **Authentication over WebSocket**: the `Authorization` header isn't sent on the initial handshake the way REST sends it — wire the token via query param/cookie in the SockJS handshake and validate it (Spring Security's `WebSocketConfigurer`-level auth). Never accept an unauthenticated upgrade.
3. **Heartbeats & disconnects**: idle connections die at proxies; configure STOMP heartbeats so both sides notice dead sockets.
4. **Load balancers**: WebSocket needs sticky sessions (or the shared-broker design above) and long-lived connection timeouts.

## Observability

- Micrometer instruments WebSocket sessions and message counts (`spring.messaging.*`).
- Log session connect/disconnect and per-destination publish rates — a chat room that grows silently is a memory leak in disguise (each session holds server resources; cap session count and message size).

## Key takeaways

- WebSocket for full-duplex realtime; STOMP gives it topics, routing and auth.
- `@MessageMapping` + `@SendTo` for request/reply; `SimpMessagingTemplate` for server-initiated pushes (including per-user).
- The in-memory broker is single-instance only — a shared broker or Redis relay is required for scale-out.
- Secure the handshake, configure heartbeats, and monitor sessions.

Official docs: [WebSocket support](https://docs.spring.io/spring-framework/reference/web/websocket.html) · [STOMP](https://docs.spring.io/spring-framework/reference/web/websocket/stomp.html)
