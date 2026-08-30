---
title: The WebSocket Protocol — Full-Duplex Over One Connection
module: websockets-deep
order: 1
minutes: 26
topics: ["WebSocket", "handshake", "frames", "full-duplex", "vs HTTP polling", "connection lifecycle"]
docs:
  - title: "RFC 6455 — The WebSocket Protocol"
    url: "https://datatracker.ietf.org/doc/html/rfc6455"
summary: HTTP is a requestresponse protocol: the client asks, the server answers, the connection closes (or idles). For realtime features — chat, live notif...
---

# The WebSocket Protocol — Full-Duplex Over One Connection

## The Concept: The Phone Call After the Handshake

HTTP is a *request-response* protocol: the client asks, the server answers, the connection closes (or idles). For real-time features — chat, live notifications, stock tickers, collaborative editing — polling (asking every 2 seconds) wastes bandwidth and adds latency. What you want is a **two-way open line**: the server can *push* at any moment, without the client asking.

**WebSocket** (RFC 6455) provides exactly that: one TCP connection, upgraded from HTTP, that stays open and carries messages **in both directions** simultaneously (full-duplex). Think of HTTP as a post office (send a letter, wait for a reply, new letter, new reply) and WebSocket as a phone call (both parties talk whenever they want, on one line).

## The Handshake — HTTP That Becomes Something Else

A WebSocket connection starts as a normal HTTP request with an *upgrade* header:

```http
GET /ws/chat HTTP/1.1
Host: academy.example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
```

The server responds `101 Switching Protocols`:

```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

**From that moment, the connection is a WebSocket**, not HTTP. The magic: because it starts as HTTP, it works through the same ports, proxies, and load balancers as web traffic — no new firewall rules needed. (The `Sec-WebSocket-Key`/`Accept` exchange is a handshake proof, not encryption — TLS still comes from HTTPS.)

## Frames — How Messages Travel

After the handshake, data flows in **frames**:

| Frame type | Purpose |
|---|---|
| text | UTF-8 text message |
| binary | Arbitrary bytes |
| ping / pong | Keep-alive liveness check |
| close | Graceful shutdown of the connection |

A message may span multiple frames (fragmentation) and frames may be **masked** (client → server only) — a protocol detail that exists to prevent cache-poisoning attacks on proxies.

## The Code Walkthrough — Spring's WebSocket Handler

```java
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class ChatWebSocketHandler extends TextWebSocketHandler {

    // All connected sessions, keyed by session id
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.put(session.getId(), session);
        System.out.println("connected: " + session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        // A message arrived FROM this client — broadcast it to everyone
        String payload = message.getPayload();
        TextMessage out = new TextMessage("user-" + session.getId() + ": " + payload);
        for (WebSocketSession other : sessions.values()) {
            if (other.isOpen()) {
                other.sendMessage(out);      // server PUSH — no client request needed
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session.getId());
        System.out.println("disconnected: " + session.getId());
    }
}
```

### Walking Through Each Part

**`TextWebSocketHandler`** — Spring's base class for text-message WebSockets: you override the lifecycle callbacks (`afterConnectionEstablished`, `handleTextMessage`, `afterConnectionClosed`) and Spring wires the protocol mechanics.

**The session registry** — a `ConcurrentHashMap` of connected clients. Each `WebSocketSession` is an open connection; the handler can `sendMessage` to *any* of them at any time. This is the "push" capability: a server-side event (new chat message, course published) can be sent to connected clients with no request from them.

**`handleTextMessage`** — fires when a client sends text. The handler reads it and broadcasts to every open session. This is the core of a chat room: any message from any client reaches all clients, server-mediated.

**`afterConnectionClosed`** — cleanup; the registry must not hold dead sessions.

## Spring Wiring — The Config

```java
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final ChatWebSocketHandler chatHandler;

    public WebSocketConfig(ChatWebSocketHandler chatHandler) { this.chatHandler = chatHandler; }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(chatHandler, "/ws/chat")
                .setAllowedOrigins("https://academy.example.com");   // CORS for WS
    }
}
```

The handler is registered at the `/ws/chat` path; clients connect with `new WebSocket("wss://.../ws/chat")`. `setAllowedOrigins` is the WebSocket equivalent of CORS — without it (or with `*`), any website can open a socket to your server.

## The Client Side (Browser)

```javascript
const ws = new WebSocket('wss://academy.example.com/ws/chat');

ws.onopen = () => ws.send('hello from the browser');
ws.onmessage = (event) => console.log('server pushed:', event.data);
// The server can push at any time — no polling, no requests
```

## WebSocket vs the Alternatives

| Approach | Latency | Server push | Overhead |
|---|---|---|---|
| HTTP polling (every 2s) | Up to 2s | No (client asks) | High (headers + empty responses) |
| Long-polling | ~instant | Sort of (hangs the request) | Medium |
| SSE (Server-Sent Events) | ~instant | Yes, one-way | Low |
| **WebSocket** | **Instant** | **Yes, both ways** | **Low (one connection, small frames)** |

**The decision rule:** need the *server* to push to the *client* only → **SSE** is simpler. Need *two-way* interaction (chat, games, collaborative editing) → **WebSocket**. (SSE rides plain HTTP with `text/event-stream`, auto-reconnects, and needs no upgrade — often the pragmatic choice for notifications.)

## Common Beginner Pitfalls

1. **No authentication on the socket** — the handshake is HTTP; validate the token *during* the handshake (interceptor) before accepting the connection.
2. **Missing `setAllowedOrigins`** — cross-site WebSocket hijacking; restrict origins.
3. **Sending on a closed session** — always check `isOpen()` (or catch `ClosedChannelException`); dead sessions throw.
4. **Shared-mutable session maps** — use `ConcurrentHashMap`; handlers are singletons, multiple threads send concurrently.
5. **Load balancer timeouts** — idle WS connections get killed by proxies; send periodic pings (Spring has heartbeat support).
6. **No reconnection logic on the client** — networks drop sockets; the client must reconnect with backoff.
7. **Scaling beyond one instance** — sessions live in one JVM's memory; across instances you need a broker (STOMP, next lesson).

## Key Takeaways

- WebSocket = one full-duplex connection upgraded from HTTP — server push without polling.
- The handshake (HTTP 101) makes it proxy/firewall friendly; frames carry text/binary/ping/close.
- Spring: `TextWebSocketHandler` + `@EnableWebSocket` + session registry = push capability.
- Restrict origins; authenticate at the handshake; ping to defeat proxy timeouts.
- Server-push-only needs → SSE; two-way needs → WebSocket.
- Sessions are in-memory per instance — multi-instance scaling needs a broker.
