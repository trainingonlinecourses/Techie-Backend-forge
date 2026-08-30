---
title: Spring Session — Distributed Session Management
summary: How Spring Session externalizes HTTP sessions to Redis/JDBC, enabling session sharing across instances, sticky-session-free scaling, and session listeners for real-time features.
order: 1
minutes: 25
topics: ["spring-session", "redis sessions", "jdbc sessions", "session repository", "session events"]
docs:
  - url: "https://spring.io/projects/spring-session"
    title: "Spring Session"
---

## The Concept, From Zero

When you log into a website, the server remembers you using an **HTTP session** — a piece of data stored on the server tied to a session ID in your cookie. By default, Spring Boot stores sessions **in memory** (the JVM heap).

This breaks when you run **multiple instances** of your app behind a load balancer. User A logs in on Instance 1, then their next request goes to Instance 2 — which doesn't have their session. They get logged out.

**Spring Session** solves this by storing sessions in an external data store (Redis, JDBC/PostgreSQL, MongoDB) that **all instances share**. Now it doesn't matter which instance handles the request — they all see the same session data.

Think of it like this: instead of keeping your notes in your desk drawer (instance memory), you put them in a shared cloud drive (Redis/PostgreSQL) that everyone can access.

**When organizations use this:**
- E-commerce: Sessions survive server restarts during Black Friday scaling
- Banking: Session data persists across rolling deployments
- SaaS: Multiple microservices share authentication state
- Real-time: Session events trigger WebSocket notifications

---

## Session Storage Backends

| Backend | Speed | Persistence | Best For |
|---------|-------|-------------|----------|
| **Redis** | ~1ms | Configurable | Most applications (recommended) |
| **JDBC** | ~5ms | Permanent | Compliance, audit trails |
| **MongoDB** | ~3ms | Permanent | Document-oriented session data |

---

## Redis-Backed Sessions (Most Common)

### Step 1: Add Dependencies

```xml
<dependency>
    <groupId>org.springframework.session</groupId>
    <artifactId>spring-session-data-redis</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

### Step 2: Configure

```yaml
# application.yml
spring:
  session:
    store-type: redis                    # Use Redis as session store
    timeout: 30m                         # Sessions expire after 30 minutes
    redis:
      flush-mode: on_save                # Save on response commit (default)
      namespace: spring:session          # Key prefix in Redis
  data:
    redis:
      host: localhost
      port: 6379
```

### Step 3: Annotate Your Application

```java
package com.example;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.session.config.annotation.web.server.EnableSpringWebSession;

@SpringBootApplication
@EnableSpringWebSession  // Enables Spring Session
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

**That's it.** Your sessions are now stored in Redis. Every instance of your app reads/writes to the same Redis, so sessions are shared.

### Line-by-Line Breakdown

```yaml
spring:
  session:
    store-type: redis
```
- Tells Spring Session to use Redis instead of in-memory storage. This is the core switch.

```yaml
    timeout: 30m
```
- Sessions automatically expire after 30 minutes of inactivity. Redis handles the TTL — no manual cleanup needed.

```yaml
spring:
  data:
    redis:
      host: localhost
```
- Points to your Redis server. In production, this would be your Redis cluster URL.

---

## JDBC-Backed Sessions (Persistent)

For compliance-heavy industries where session data must survive in a database:

```xml
<dependency>
    <groupId>org.springframework.session</groupId>
    <artifactId>spring-session-jdbc</artifactId>
</dependency>
```

```yaml
spring:
  session:
    store-type: jdbc
    jdbc:
      initialize-schema: always  # Auto-create session tables
      table-name: http_sessions   # Custom table name
    timeout: 30m
```

**JDBC creates two tables automatically:**
```sql
CREATE TABLE SPRING_SESSION (
    PRIMARY_ID CHAR(36) NOT NULL,
    SESSION_ID CHAR(36) NOT NULL,
    CREATION_TIME BIGINT NOT NULL,
    LAST_ACCESS_TIME BIGINT NOT NULL,
    MAX_INACTIVE_INTERVAL INT NOT NULL,
    EXPIRY_TIME BIGINT NOT NULL,
    PRINCIPAL_NAME VARCHAR(100),
    ...
);
```

---

## Session Attributes in Practice

```java
@RestController
@RequestMapping("/api/cart")
public class ShoppingCartController {

    @PostMapping("/add")
    public ResponseEntity<Cart> addToCart(
            @RequestBody CartItem item,
            HttpSession session) {

        // Get or create cart from session
        @SuppressWarnings("unchecked")
        List<CartItem> cart = (List<CartItem>) session
            .getAttribute("cart");

        if (cart == null) {
            cart = new ArrayList<>();
        }

        cart.add(item);
        session.setAttribute("cart", cart);  // Stored in Redis/JDBC

        return ResponseEntity.ok(new Cart(cart));
    }

    @GetMapping
    public ResponseEntity<Cart> getCart(HttpSession session) {
        @SuppressWarnings("unchecked")
        List<CartItem> cart = (List<CartItem>) session
            .getAttribute("cart");

        return ResponseEntity.ok(new Cart(
            cart != null ? cart : List.of()));
    }

    @DeleteMapping("/{itemId}")
    public ResponseEntity<Void> removeFromCart(
            @PathVariable String itemId,
            HttpSession session) {

        @SuppressWarnings("unchecked")
        List<CartItem> cart = (List<CartItem>) session
            .getAttribute("cart");

        if (cart != null) {
            cart.removeIf(i -> i.getId().equals(itemId));
            session.setAttribute("cart", cart);
        }

        return ResponseEntity.noContent().build();
    }
}
```

---

## Session Events — Reacting to Session Lifecycle

```java
@Component
public class SessionEventListener {

    private static final Logger log =
        LoggerFactory.getLogger(SessionEventListener.class);

    /**
     * Fires when a new session is created (user logs in).
     * Use for: tracking active users, sending welcome notifications.
     */
    @EventListener
    public void onSessionCreated(SessionCreatedEvent event) {
        String sessionId = event.getSessionId();
        log.info("New session created: {}", sessionId);

        // Track active sessions in Redis for admin dashboard
        redisTemplate.opsForSet()
            .add("active:sessions", sessionId);
    }

    /**
     * Fires when a session is destroyed (user logs out or timeout).
     * Use for: cleanup, analytics, real-time notifications.
     */
    @EventListener
    public void onSessionDestroyed(SessionDestroyedEvent event) {
        String sessionId = event.getSessionId();
        log.info("Session destroyed: {}", sessionId);

        // Remove from active sessions
        redisTemplate.opsForSet()
            .remove("active:sessions", sessionId);

        // Notify other services
        applicationEventPublisher.publishEvent(
            new UserLogoutEvent(sessionId));
    }
}
```

---

## Session Repository — Direct Access

```java
@Service
public class SessionAdminService {

    private final SessionRepository<? extends Session> sessions;

    public SessionAdminService(
            SessionRepository<? extends Session> sessions) {
        this.sessions = sessions;
    }

    /**
     * Force-logout a user by destroying all their sessions.
     */
    public void forceLogout(String principalName) {
        sessions.findByPrincipalName(principalName)
            .forEach(session -> {
                session.setAttribute("forceLogout", true);
                sessions.deleteById(session.getId());
            });
    }

    /**
     * Get all active sessions for monitoring.
     */
    public List<SessionInfo> getActiveSessions() {
        return sessions.findAll().stream()
            .map(s -> new SessionInfo(
                s.getId(),
                s.getPrincipalName(),
                s.getLastAccessedTime(),
                s.getMaxInactiveInterval()))
            .toList();
    }
}
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---------|--------------|-----|
| Not configuring `store-type` | Sessions stay in memory, no sharing | Set `spring.session.store-type=redis` |
| Serializing non-serializable objects | Redis can't store `HttpServletRequest` | Store only simple POJOs, Strings, Lists |
| No session timeout configuration | Default 30min may be too short/long | Set `spring.session.timeout` explicitly |
| Storing large objects in sessions | Redis memory explodes | Store references (IDs), not full objects |
| Ignoring session events | Missed analytics, no real-time features | Add `@EventListener` for Created/Destroyed |

---

## When NOT to Use Sessions

| Situation | Better Alternative |
|-----------|-------------------|
| Stateless REST APIs | JWT tokens (no session at all) |
| Microservices | OAuth2 + JWT (each service validates independently) |
| Single-page apps | Access tokens with refresh rotation |
| Serverless | No session state — use a database directly |
