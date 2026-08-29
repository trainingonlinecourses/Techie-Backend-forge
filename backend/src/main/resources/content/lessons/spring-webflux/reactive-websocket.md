---
title: Reactive WebSocket — Real-Time Communication with WebFlux
summary: WebSocket endpoints in Spring WebFlux — handler functions, broadcast patterns, room-based messaging, heartbeat, and the patterns for scalable real-time applications. Beginner-friendly with line-by-line code.
order: 14
minutes: 22
topics: [WebSocket, reactive WebSocket, real-time, broadcast, rooms, heartbeat, SSE vs WebSocket, WebSocket handler]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webflux-websocket.html
---

# Reactive WebSocket — Real-Time Communication with WebFlux

## What is WebSocket? (From Zero)

HTTP is **request-response**: the client asks, the server answers, connection closes. **WebSocket** keeps the connection open — both the client and server can send messages at any time. This makes it perfect for real-time features: chat, live notifications, stock tickers, collaborative editing, live dashboards.

### HTTP vs WebSocket vs SSE

| Protocol | Direction | Use Case | Connection |
|---|---|---|---|
| **HTTP** | Client → Server → Client | REST APIs, form submissions | Short-lived |
| **SSE** | Server → Client (one-way) | AI streaming, notifications | Long-lived |
| **WebSocket** | Client ↔ Server (bidirectional) | Chat, gaming, collaboration | Long-lived |

---

## The Code — Line by Line

### 1. WebSocket Handler (The Core)

```java
@Component
public class ChatWebSocketHandler implements WebSocketHandler {

    // Store all connected sessions (like a chat room)
    private final ConcurrentHashMap<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    @Override
    public Mono<Void> handle(WebSocketSession session) {
        String sessionId = session.getId();
        sessions.put(sessionId, session);                        // Track this connection

        log.info("User connected: {}", sessionId);

        // Handle incoming messages from this client
        return session.receive()
            .map(message -> {
                // Parse the incoming message
                ChatMessage chatMessage = parseMessage(message.getPayloadAsText());
                return chatMessage;
            })
            .doOnNext(msg -> {
                // Broadcast to ALL connected clients
                broadcastMessage(sessionId, msg);
            })
            .doOnComplete(() -> {
                // Client disconnected
                sessions.remove(sessionId);
                log.info("User disconnected: {}", sessionId);
                broadcastSystemMessage(sessionId + " left the chat");
            })
            .doOnError(e -> {
                sessions.remove(sessionId);
                log.error("WebSocket error for {}: {}", sessionId, e.getMessage());
            })
            .then();                                            // Mono<Void>
    }

    private void broadcastMessage(String senderId, ChatMessage message) {
        String json = toJson(new ChatEvent("message", senderId, message.content(), Instant.now()));

        // Send to ALL sessions except the sender
        sessions.values().stream()
            .filter(s -> !s.getId().equals(senderId))           // Don't echo back to sender
            .filter(WebSocketSession::isOpen)                   // Only open sessions
            .forEach(session -> session.sendMany(
                Mono.just(session.textMessage(json))
            ).subscribe());
    }

    private void broadcastSystemMessage(String text) {
        String json = toJson(new ChatEvent("system", "server", text, Instant.now()));
        sessions.values().stream()
            .filter(WebSocketSession::isOpen)
            .forEach(session -> session.sendMany(
                Mono.just(session.textMessage(json))
            ).subscribe());
    }
}
```

**Line-by-line explained:**
- `WebSocketHandler` — Spring's interface for handling WebSocket connections. The `handle` method receives each new connection.
- `session.receive()` — Returns `Flux<WebSocketMessage>` — a stream of all messages from this client.
- `session.sendMany(...)` — Sends messages back to the client. Can send multiple messages.
- `ConcurrentHashMap` — Thread-safe storage for all connected sessions. Multiple threads may access it simultaneously.

### 2. WebSocket Configuration

```java
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final ChatWebSocketHandler chatHandler;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(chatHandler, "/ws/chat")            // WebSocket endpoint URL
                .setAllowedOrigins("*");                         // Allow all origins (dev only!)
    }
}
```

### 3. Room-Based Chat (Multiple Chat Rooms)

```java
@Component
public class RoomWebSocketHandler implements WebSocketHandler {

    // Room ID → set of sessions in that room
    private final ConcurrentHashMap<String, Set<WebSocketSession>> rooms = new ConcurrentHashMap<>();

    @Override
    public Mono<Void> handle(WebSocketSession session) {
        return session.receive()
            .map(msg -> parseMessage(msg.getPayloadAsText()))
            .flatMap(message -> {
                switch (message.type()) {
                    case "join" -> {
                        // Add session to the room
                        rooms.computeIfAbsent(message.roomId(), k ->
                            ConcurrentHashMap.newKeySet()
                        ).add(session);
                        sendToRoom(message.roomId(),
                            new ChatEvent("system", "server",
                                session.getId() + " joined the room",
                                Instant.now()));
                    }
                    case "leave" -> {
                        rooms.getOrDefault(message.roomId(), Set.of()).remove(session);
                        sendToRoom(message.roomId(),
                            new ChatEvent("system", "server",
                                session.getId() + " left the room",
                                Instant.now()));
                    }
                    case "message" -> {
                        sendToRoom(message.roomId(),
                            new ChatEvent("message", session.getId(),
                                message.content(), Instant.now()));
                    }
                }
                return Mono.empty();
            })
            .then();
    }

    private void sendToRoom(String roomId, ChatEvent event) {
        String json = toJson(event);
        rooms.getOrDefault(roomId, Set.of()).stream()
            .filter(WebSocketSession::isOpen)
            .forEach(s -> s.sendMany(Mono.just(s.textMessage(json))).subscribe());
    }
}

public record ChatEvent(String type, String sender, String content, Instant timestamp) {}
public record ChatMessage(String type, String roomId, String content) {}
```

### 4. WebSocket with Authentication

```java
@Component
public class AuthenticatedWebSocketHandler implements WebSocketHandler {

    private final JwtTokenValidator tokenValidator;

    @Override
    public Mono<Void> handle(WebSocketSession session) {
        // Extract JWT from query parameter or first message
        String token = session.getHandshakeInfo()
            .getURI()
            .getQuery()
            .split("token=")[1];                                 // ?token=xxx

        // Validate the token
        return tokenValidator.validate(token)
            .flatMap(user -> {
                // Token valid — attach user info to session
                session.getAttributes().put("user", user);
                return handleAuthenticated(session, user);       // Process messages
            })
            .switchIfEmpty(
                // Token invalid — close the connection
                session.close(CloseStatus.POLICY_VIOLATION)
                    .then(Mono.empty())
            );
    }

    private Mono<Void> handleAuthenticated(WebSocketSession session, User user) {
        return session.receive()
            .map(msg -> parseMessage(msg.getPayloadAsText()))
            .doOnNext(msg -> processMessage(session, user, msg))
            .then();
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Live Notification System

```java
@Component
public class NotificationWebSocketHandler implements WebSocketHandler {

    private final ConcurrentHashMap<String, WebSocketSession> userSessions = new ConcurrentHashMap<>();

    // Called from other services to push notifications:
    public void sendNotification(String userId, Notification notification) {
        WebSocketSession session = userSessions.get(userId);
        if (session != null && session.isOpen()) {
            String json = toJson(notification);
            session.sendMany(Mono.just(session.textMessage(json))).subscribe();
        }
    }

    @Override
    public Mono<Void> handle(WebSocketSession session) {
        // Register this session for the user
        String userId = extractUserId(session);
        userSessions.put(userId, session);

        return session.receive()
            .then()                                              // We don't expect messages — just listen
            .doFinally(signal -> userSessions.remove(userId))    // Clean up on disconnect
            .then();
    }
}
```

### Scenario 2: Live Dashboard Updates

```java
@Component
public class DashboardWebSocketHandler implements WebSocketHandler {

    private final Flux<DashboardUpdate> updateStream;

    public DashboardWebSocketHandler(DashboardUpdateService updateService) {
        // Continuous stream of dashboard updates:
        this.updateStream = updateService.streamUpdates()
            .publish()                                           // Multicast to multiple subscribers
            .autoConnect();
    }

    @Override
    public Mono<Void> handle(WebSocketSession session) {
        // Send dashboard updates as they arrive:
        return session.send(
            updateStream
                .map(update -> session.textMessage(toJson(update)))
                .takeUntilOther(session.closeStatus())           // Stop when client disconnects
        ).then();
    }
}
```

### Scenario 3: Collaborative Editing

```java
@Component
public class CollaborativeEditorHandler implements WebSocketHandler {

    // Document ID → list of sessions editing it
    private final ConcurrentHashMap<String, Set<WebSocketSession>> documents = new ConcurrentHashMap<>();

    @Override
    public Mono<Void> handle(WebSocketSession session) {
        return session.receive()
            .map(msg -> parseEdit(msg.getPayloadAsText()))
            .doOnNext(edit -> {
                // Broadcast the edit to all other editors of the same document
                documents.getOrDefault(edit.documentId(), Set.of()).stream()
                    .filter(s -> !s.getId().equals(session.getId()))
                    .filter(WebSocketSession::isOpen)
                    .forEach(s -> s.sendMany(
                        Mono.just(s.textMessage(toJson(edit)))
                    ).subscribe());
            })
            .doOnComplete(() -> {
                // Remove session from all documents
                documents.values().forEach(sessions -> sessions.remove(session));
            })
            .then();
    }
}
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Not handling disconnections | Memory leak — dead sessions accumulate | Handle `doOnComplete` to clean up |
| Broadcasting to all sessions (including sender) | User sees their own message echoed back | Filter out the sender's session |
| No authentication on WebSocket | Anyone can connect and send messages | Validate JWT on connection or first message |
| Using `subscribe()` without tracking | Can't clean up on shutdown | Track subscriptions, cancel on shutdown |
| Not handling backpressure | Client overwhelmed with messages | Use `Flux.take()` or rate limiting |

---

## Key Takeaways

- **WebSocket = bidirectional** real-time communication. Use for chat, collaboration, live dashboards.
- **`WebSocketHandler.handle()`** returns `Mono<Void>` — the connection lives until the mono completes.
- **`session.receive()`** gives you a `Flux<WebSocketMessage>` — a stream of incoming messages.
- **Room-based patterns**: track sessions by room ID, broadcast to room members.
- **Always handle disconnections** — clean up sessions in `doOnComplete` or `doFinally`.

Official docs: [WebSocket (Spring WebFlux)](https://docs.spring.io/spring-framework/reference/web/webflux-websocket.html)
