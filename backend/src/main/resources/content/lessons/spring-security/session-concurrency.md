---
title: Session Management & Concurrency Control
summary: Concurrent session control, session fixation protection, session timeout, and how to handle "one session per user" vs "multiple sessions" policies. Beginner-friendly with line-by-line code.
order: 12
minutes: 18
topics: [session management, concurrent sessions, session fixation, session timeout, session repository, session registry]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/authentication/session-management.html
---

# Session Management & Concurrency Control

## What is Session Management? (From Zero)

When a user logs in, the server creates a **session** — a server-side record that this user is authenticated. The user gets a session ID (usually in a cookie), and every subsequent request includes that cookie so the server knows who they are.

**Session management** controls:
- How many sessions can one user have simultaneously?
- What happens when a user logs in on a new device?
- How long does a session last before expiring?
- Can someone hijack another user's session?

### The Default Behavior

By default, Spring Security allows **unlimited concurrent sessions** per user. If you log in on 5 devices, all 5 sessions work. Most organizations want to limit this.

---

## The Code — Line by Line

### Limiting Concurrent Sessions

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .sessionManagement(session -> session
                // Maximum 2 concurrent sessions per user
                .maximumSessions(2)

                // What happens when the 3rd login attempt comes in?
                .maxSessionsPreventsLogin(false)    // false = old session is invalidated
                // true = new login is rejected (user sees "already logged in")

                // Session fixation protection
                .sessionFixation(fix -> fix
                    .migrateSession()              // New session ID after login (default)
                    // .newSession()                // Create entirely new session
                    // .none()                      // No protection (don't do this!)
                )

                // Session timeout (also configurable in application.properties)
                .sessionTimeout(Duration.ofMinutes(30))

                // Where to redirect when session expires
                .expiredUrl("/login?expired=true")
            );

        return http.build();
    }
}
```

**Line-by-line explained:**
- `maximumSessions(2)` — Each user can have at most 2 active sessions. The 3rd login invalidates the oldest session.
- `maxSessionsPreventsLogin(false)` — When the limit is reached, invalidate the OLD session (user stays logged in on new device). If `true`, the new login is rejected.
- `sessionFixation(migrateSession())` — After login, the session ID changes. Prevents session fixation attacks (where an attacker tricks a user into using a known session ID).
- `sessionTimeout(Duration.ofMinutes(30))` — Sessions expire after 30 minutes of inactivity.

### Session Repository (Persistent Sessions)

```java
@Configuration
@EnableSpringHttpSession   // Enables Spring's session management
public class SessionConfig {

    @Bean
    public JdbcIndexedSessionRepository sessionRepository(DataSource dataSource) {
        // Sessions stored in database — survive server restarts
        return new JdbcIndexedSessionRepository(new JdbcTransactionManager(dataSource));
    }
}
```

```properties
# application.properties
spring.session.store-type=jdbc                    # Store sessions in database
spring.session.timeout=PT30M                       # 30 minutes
spring.session.jdbc.initialize-schema=always       # Create session tables
spring.session.jdbc.table-name=SPRING_SESSION      # Custom table name
```

**Line-by-line explained:**
- `spring.session.store-type=jdbc` — Sessions are stored in the database, not in-memory. This means they survive server restarts and work across multiple server instances.
- `spring.session.timeout=PT30M` — ISO-8601 duration format: 30 minutes.
- `spring.session.jdbc.initialize-schema=always` — Spring Boot auto-creates the session tables.

### Custom Session Event Listener

```java
@Component
public class SessionEventListener {

    @EventListener
    public void onSessionCreated(SessionCreatedEvent event) {
        String sessionId = event.getSessionId();
        log.info("New session created: {}", sessionId);
        // Track active sessions, send analytics, etc.
    }

    @EventListener
    public void onSessionDestroyed(SessionDestroyedEvent event) {
        String sessionId = event.getSessionId();
        String username = event.getSession().getAttribute("SPRING_SECURITY_CONTEXT")
            .map(ctx -> ((Authentication) ctx.getPrincipal()).getName())
            .orElse("unknown");
        log.info("Session destroyed: {} (user: {})", sessionId, username);
    }

    @EventListener
    public void onSessionExpired(SessionExpiredEvent event) {
        log.warn("Session expired: {}", event.getSessionId());
        // Send notification, clean up resources, etc.
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Banking — One Session Per User

```java
.sessionManagement(session -> session
    .maximumSessions(1)                              // Only 1 session per user
    .maxSessionsPreventsLogin(true)                   // Reject new login
    .expiredUrl("/login?reason=another-device")       // Tell user why
)
```

When a bank customer logs in on a new device, the old session is NOT invalidated (that could be a security risk if the attacker has the old session). Instead, the new login is rejected with a clear message.

### Scenario 2: Session Fixation Attack

```
1. Attacker visits your site → gets session ID "abc123"
2. Attacker sends link to victim: https://yoursite.com/login?session=abc123
3. Victim clicks link, logs in with their credentials
4. WITHOUT session fixation protection: victim is now using session "abc123"
   → Attacker already knows this session ID → session hijacking!
5. WITH session fixation protection: session ID changes to "xyz789" after login
   → Attacker's "abc123" is now invalid → attack fails
```

### Scenario 3: Multiple Device Support

```java
.sessionManagement(session -> session
    .maximumSessions(3)                              // Allow 3 devices
    .maxSessionsPreventsLogin(false)                  // Invalidate oldest session
    .expiredUrl("/login?session-expired")             // Redirect on expiry
)
```

User logs in on phone → laptop → tablet → oldest phone session is invalidated → phone shows "Session expired, please log in again."

---

## Common Mistakes

| Mistake | Why It's a Problem | Fix |
|---|---|---|
| Unlimited concurrent sessions | Compromised credentials allow unlimited access | Set `maximumSessions(2-3)` |
| `sessionFixation(none)` | Vulnerable to session fixation attacks | Use `migrateSession()` (default) |
| In-memory session store | Sessions lost on restart, doesn't work with multiple instances | Use JDBC or Redis session store |
| Very long session timeout | Stolen session cookies remain valid for days | Set 15-30 minute timeout for sensitive apps |
| Not monitoring session events | Can't detect suspicious activity (many sessions) | Add session event listeners |

---

## Key Takeaways

- **Limit concurrent sessions** (2-3) to prevent credential sharing and limit attack surface.
- **Session fixation protection** (`migrateSession`) is essential — it changes the session ID after login.
- **Persistent sessions** (JDBC/Redis) survive restarts and work across multiple server instances.
- **Set reasonable timeouts** — 15-30 minutes for sensitive apps, longer for low-risk apps.
- **Monitor session events** — detect suspicious patterns like many simultaneous sessions.

Official docs: [Session Management (Spring)](https://docs.spring.io/spring-security/reference/servlet/authentication/session-management.html)
