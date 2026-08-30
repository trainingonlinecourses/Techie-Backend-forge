---
title: "WebSockets — Real-Time Communication Without Polling"
summary: "What WebSockets are, how they differ from HTTP, STOMP protocol, and how organizations use them for chat, notifications, and live dashboards."
order: 56
minutes: 20
topics: [websocket, stomp, real-time, push-notifications, spring-websocket, sockjs]
docs:
  - https://docs.spring.io/spring-framework/reference/web/websocket.html
  - https://spring.io/guides/gs/messaging-stomp-websocket
---

## The Concept, From Zero

### What are WebSockets?

**HTTP** is a request-response protocol. The client asks, the server answers, then the connection closes. If you want real-time updates, you have to keep asking:

```
Client: "Any new messages?" → Server: "No" → Connection closes
Client: "Any new messages?" → Server: "No" → Connection closes
Client: "Any new messages?" → Server: "Yes! Here they are" → Connection closes
```

This is called **polling** — it wastes resources and introduces delay.

**WebSockets** create a persistent, bidirectional connection:

```
Client: "Connect to me" → Server: "Connected!"
...connection stays open...
Server: "New message from Alice!" → Client sees it instantly
Server: "New message from Bob!" → Client sees it instantly
Client: "Hi everyone!" → Server broadcasts to all clients
```

**One connection, unlimited messages, in both directions, instantly.**

### How WebSockets Work

1. **Handshake** — Client sends an HTTP request to upgrade to WebSocket
2. **Connection** — Server accepts, connection stays open
3. **Messaging** — Both sides can send messages at any time
4. **Close** — Either side can close the connection

### Spring WebSocket with STOMP

Spring uses **STOMP** (Simple Text Oriented Messaging Protocol) over WebSockets:

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
    
    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue");
        // ↑ Client subscribes to these prefixes
        // ↑ /topic = broadcast to all subscribers
        // ↑ /queue = send to specific user
        
        registry.setApplicationDestinationPrefixes("/app");
        // ↑ Client sends messages to these prefixes
        // ↑ /app/chat.send → handled by @MessageMapping
    }
    
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
            .setAllowedOriginPatterns("*")
            .withSockJS();
        // ↑ WebSocket endpoint URL
        // ↑ SockJS provides fallback for older browsers
    }
}
```

### Server-Side Message Handling

```java
@Controller
public class ChatController {
    
    @MessageMapping("/chat.send")
    // ↑ When client sends to /app/chat.send, this method runs
    // ↑ @MessageMapping is like @RequestMapping for WebSockets
    
    @SendTo("/topic/messages")
    // ↑ The return value is broadcast to all subscribers of /topic/messages
    
    public ChatMessage sendMessage(ChatMessage message) {
        // ↑ Spring auto-converts JSON to ChatMessage object
        message.setTimestamp(Instant.now());
        return message;
        // ↑ Return value is sent to ALL subscribers
    }
    
    @MessageMapping("/chat.private")
    // ↑ Send to a specific user
    
    @SendToUser("/queue/private")
    // ↑ Only the authenticated user receives this
    
    public PrivateMessage sendPrivate(PrivateMessage message) {
        return message;
    }
}
```

### Client-Side (JavaScript)

```html
<script src="https://cdn.jsdelivr.net/npm/stompjs@2.3.3/lib/stomp.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sockjs-client@1/dist/sockjs.min.js"></script>
<script>
    const socket = new SockJS('http://localhost:8080/ws');
    // ↑ Create WebSocket connection (with SockJS fallback)
    
    const stompClient = Stomp.over(socket);
    // ↑ Wrap in STOMP protocol
    
    stompClient.connect({}, (frame) => {
        console.log('Connected: ' + frame);
        
        // Subscribe to broadcast messages
        stompClient.subscribe('/topic/messages', (message) => {
            const msg = JSON.parse(message.body);
            displayMessage(msg);
        });
        
        // Send a message
        stompClient.send('/app/chat.send', {}, JSON.stringify({
            sender: 'Alice',
            content: 'Hello everyone!',
            type: 'CHAT'
        }));
    });
</script>
```

### Organization Use Cases

**1. Live Chat Application**
```java
@Controller
public class ChatController {
    @MessageMapping("/chat.send")
    @SendTo("/topic/messages")
    public ChatMessage send(ChatMessage msg) {
        msg.setTimestamp(Instant.now());
        return msg;
    }
}
```

**2. Live Dashboard Updates**
```java
@Service
public class DashboardService {
    @Autowired private SimpMessagingTemplate template;
    
    public void broadcastMetrics(Metrics metrics) {
        template.convertAndSend("/topic/metrics", metrics);
        // ↑ Push updates to all connected dashboards
        // ↑ No polling — clients receive instantly
    }
}
```

**3. Notification System**
```java
@Service
public class NotificationService {
    @Autowired private SimpMessagingTemplate template;
    
    public void notifyUser(Long userId, Notification notification) {
        template.convertAndSendToUser(
            userId.toString(),
            "/queue/notifications",
            notification
        );
        // ↑ Send to specific user's queue
        // ↑ Only that user receives the notification
    }
}
```

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| No authentication | Anyone can connect | Add Spring Security to WebSocket |
| No message size limit | Memory exhaustion | Configure max message size |
| Blocking in @MessageMapping | Thread starvation | Use async processing |
| Not handling disconnects | Zombie connections | Implement heartbeat/ping-pong |
| Sending to wrong prefix | Messages lost | Match client subscribe prefix with server @SendTo |

### Line-by-Line Code Explanation

```java
@Configuration
// ↑ Spring configuration class — sets up WebSocket infrastructure

@EnableWebSocketMessageBroker
// ↑ Enables STOMP message broker — handles routing, subscriptions, sessions

public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
    // ↑ Implements the configuration interface for WebSocket message broker
    
    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // ↑ Configure where messages go (broker) and where they come from (client)
        
        registry.enableSimpleBroker("/topic", "/queue");
        // ↑ "/topic" = broadcast channel (all subscribers get the message)
        // ↑ "/queue" = point-to-point channel (one user gets the message)
        // ↑ This is an in-memory broker — fine for single-server apps
        // ↑ For multi-server, use RabbitMQ or Redis as the broker
        
        registry.setApplicationDestinationPrefixes("/app");
        // ↑ Client sends messages to /app/... → routes to @MessageMapping
        // ↑ Example: client sends to /app/chat.send → routes to @MessageMapping("/chat.send")
    }
    
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // ↑ Register the WebSocket endpoint URL
        
        registry.addEndpoint("/ws")
            // ↑ URL: ws://localhost:8080/ws
            // ↑ This is the initial HTTP handshake URL
            
            .setAllowedOriginPatterns("*")
            // ↑ Allow connections from any origin (dev mode)
            // ↑ In production, specify your frontend domain
            
            .withSockJS();
            // ↑ Enable SockJS fallback
            // ↑ SockJS tries WebSocket first, falls back to HTTP long-polling
            // ↑ Needed for older browsers and corporate proxies
    }
}
```

### Key Takeaways

1. **WebSockets = persistent bidirectional connection** — no polling needed
2. **STOMP over WebSocket** — message routing, subscriptions, user queues
3. **`@MessageMapping`** — handles incoming messages (like `@RequestMapping`)
4. **`@SendTo`** — broadcasts return value to subscribers
5. **`/topic` = broadcast, `/queue` = point-to-point** — choose the right pattern
6. **Use SockJS fallback** — compatibility with older browsers
7. **Secure your WebSocket** — add authentication and origin checks

### Real-World Organization Scenario

A stock trading platform uses WebSockets to push real-time price updates to 50,000 traders. Each trader subscribes to their watched stocks via `/topic/prices/AAPL`, `/topic/prices/GOOGL`. The server pushes updates every 100ms. Without WebSockets, they'd need 50,000 HTTP polls per second. With WebSockets, they maintain 50,000 persistent connections and push only when prices change.
