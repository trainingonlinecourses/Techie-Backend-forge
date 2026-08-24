---
title: WebSocket with Spring Boot — Real-Time Bidirectional Communication
summary: STOMP vs raw WebSocket, SockJS fallback, message broker configuration, @MessageMapping, room-based broadcasting, and how organizations build live dashboards and chat systems.
order: 25
minutes: 22
topics: [websocket, stomp, sockjs, message-mapping, simpbroker, broadcast, realtime, live-dashboard]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/html/web.html#web.servlet.spring-mvc.websocket
  - https://docs.spring.io/spring-framework/reference/web/websocket.html
---

# WebSocket with Spring Boot — Real-Time Bidirectional Communication

## The concept

HTTP is request-response: the client asks, the server answers, connection closes. **WebSocket** is a persistent, bidirectional connection. Either side can send a message at any time. This is essential for live dashboards, chat systems, collaborative editing, multiplayer games, and real-time notifications.

Spring supports two WebSocket styles:

1. **Raw WebSocket** (`WebSocketHandler`) — low-level, you handle frames directly.
2. **STOMP over WebSocket** — higher-level, message-oriented with topics, queues, and subscriptions. This is what most organizations use.

**STOMP** (Simple Text Oriented Messaging Protocol) gives WebSocket a messaging semantics similar to JMS: `@MessageMapping` (like `@RequestMapping`), `/topic` (broadcast), `/queue` (point-to-point).

## Configuration

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        config.enableSimpleBroker("/topic", "/queue");  // in-memory broker
        config.setApplicationDestinationPrefixes("/app");  // client → server prefix
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
            .setAllowedOrigins("*")  // in production, restrict to your domain
            .withSockJS();  // SockJS fallback for older browsers
    }
}
```

**Message flow:**
- Client subscribes to `/topic/orders` — receives broadcasts.
- Client sends to `/app/create-order` — server's `@MessageMapping("/create-order")` handles it.
- Server broadcasts to `/topic/orders` — all subscribers receive it.

## Server-side message handler

```java
@Controller
public class OrderWebSocketHandler {

    private final SimpMessagingTemplate messagingTemplate;

    public OrderWebSocketHandler(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/create-order")
    @SendTo("/topic/orders")  // broadcast result to all subscribers
    public OrderCreatedEvent createOrder(OrderRequest request) {
        Order order = orderService.create(request);

        // Also send a personalized notification to the customer
        messagingTemplate.convertAndSendToUser(
            order.customerId(),
            "/queue/notifications",
            new Notification("Your order " + order.id() + " has been placed!")
        );

        return new OrderCreatedEvent(order.id(), order.status(), Instant.now());
    }
}
```

## Client-side (JavaScript)

```javascript
const socket = new SockJS('/ws');
const stompClient = Stomp.over(socket);

stompClient.connect({}, (frame) => {
    console.log('Connected: ' + frame.headers['user-name']);

    // Subscribe to order broadcasts
    stompClient.subscribe('/topic/orders', (event) => {
        const order = JSON.parse(event.body);
        renderOrder(order);
    });

    // Subscribe to personal notifications
    stompClient.subscribe('/user/queue/notifications', (event) => {
        const notification = JSON.parse(event.body);
        showToast(notification.message);
    });

    // Send a create-order message
    stompClient.send('/app/create-order', {}, JSON.stringify({
        customerId: 'user-123',
        items: [{ productId: 'prod-1', quantity: 2 }]
    }));
});
```

## Room-based broadcasting

```java
@Controller
public class ChatHandler {

    private final SimpMessagingTemplate messaging;

    @MessageMapping("/chat.send")
    public void sendMessage(ChatMessage message) {
        // Broadcast only to the specific room
        messaging.convertAndSend("/topic/chat." + message.roomId(), message);
    }

    @MessageMapping("/chat.join")
    public void joinRoom(ChatMessage message) {
        messaging.convertAndSend("/topic/chat." + message.roomId(),
            new ChatMessage(message.roomId(), message.sender(), "joined the room"));
    }
}
```

## Security with WebSocket

```java
@Override
public void configureClientInboundChannel(ChannelRegistration registration) {
    registration.interceptors(new ChannelInterceptor() {
        @Override
        public Message<?> preSend(Message<?> message, MessageChannel channel) {
            StompHeaderAccessor accessor = MessageHeaderAccessor
                .getAccessor(message, StompHeaderAccessor.class);

            if (StompCommand.CONNECT.equals(accessor.getCommand())) {
                // Authenticate the WebSocket connection
                Authentication auth = authenticateUser(accessor);
                accessor.setUser(auth);
            }
            return message;
        }
    });
}
```

## How we use it in organizations

### Scenario 1: live order dashboard

```java
@Service
public class OrderService {

    private final SimpMessagingTemplate messaging;

    public Order updateStatus(String orderId, String newStatus) {
        Order order = repository.findById(orderId)
            .orElseThrow(() -> new NotFoundException(orderId));
        order.setStatus(newStatus);
        Order saved = repository.save(order);

        // Push update to dashboard subscribers
        messaging.convertAndSend("/topic/orders.status",
            new OrderStatusUpdate(saved.id(), saved.status(), Instant.now()));

        return saved;
    }
}
```

### Scenario 2: real-time collaborative document

```java
@Controller
public class DocumentHandler {

    @MessageMapping("/doc.edit")
    public void handleEdit(DocumentEdit edit) {
        documentService.applyEdit(edit);

        // Broadcast to everyone viewing this document
        messaging.convertAndSend("/topic/doc." + edit.documentId(), edit);
    }
}
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| No origin restriction on WebSocket | Cross-site WebSocket hijacking |
| Broadcasting to `/topic` without room filtering | All users see all messages |
| Not authenticating WebSocket connections | Anonymous users receive authorized data |
| Using raw WebSocket instead of STOMP | No built-in topic/queue semantics |
| Missing SockJS fallback | Incompatible with corporate proxies |
