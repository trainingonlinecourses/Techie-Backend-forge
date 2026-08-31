---
title: Spring Session with Redis Cluster — Distributed Session Management
summary: Configuring Spring Session with Redis for horizontally scaled Spring Boot applications, including session serialization, TTL policies, and Redis cluster configuration.
order: 4
minutes: 20
topics: [spring-session, redis-cluster, distributed-session, session-serialization, sticky-sessions]
docs:
  - https://docs.spring.io/spring-session/reference/
---

## The Concept, From Zero

When you run multiple instances of your Spring Boot app behind a load balancer, user sessions become a problem. If user A logs in on instance 1, but their next request goes to instance 2, they appear logged out — because instance 2 doesn't have their session.

Spring Session solves this by storing sessions in an external store (Redis, JDBC, etc.) instead of in-memory. All instances share the same session store, so it doesn't matter which instance handles the request.

Think of it like a shared notebook that all servers can read and write. When user A logs in on server 1, the session goes into the notebook. When their request arrives at server 2, server 2 reads the notebook and finds the session.

## The Code

### Configuration
```yaml
# application.yml
spring:
  session:
    store-type: redis
    timeout: 30m
    redis:
      namespace: academy
      flush-mode: on_save
  data:
    redis:
      host: redis-cluster.example.com
      port: 6379
      timeout: 2000ms

server:
  servlet:
    session:
      cookie:
        same-site: lax
        http-only: true
        secure: true
```

### Session Usage in Controllers
```java
@RestController
public class AuthController {

    @PostMapping("/login")
    public ResponseEntity<?> login(
            @RequestBody LoginRequest req,
            HttpServletRequest request) {

        User user = authService.authenticate(req);

        // Spring Session handles storage automatically
        HttpSession session = request.getSession();
        session.setAttribute("user", user);
        session.setAttribute("loginTime", Instant.now());

        return ResponseEntity.ok(Map.of(
            "sessionId", session.getId(),
            "user", user.getName()
        ));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return ResponseEntity.status(401).build();
        }
        User user = (User) session.getAttribute("user");
        return ResponseEntity.ok(user);
    }
}
```

## Key Takeaways

1. **Spring Session + Redis** = all instances share sessions
2. **Redis Cluster** provides high availability and horizontal scaling
3. **Session serialization** — use Kryo or JSON for complex objects
4. **TTL policies** — set timeout based on security requirements
5. **Sticky sessions are not needed** — any instance can handle any request
