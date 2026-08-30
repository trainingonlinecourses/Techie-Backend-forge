---
title: WebSocket Security — Auth, Origins, and Authorization
module: websockets-deep
order: 4
minutes: 25
topics: ["handshake auth", "origin checks", "destination authorization", "CSRF", "JWT over WS"]
summary: A WebSocket is a longlived, bidirectional connection — which makes it a bigger risk than a request/response call:
docs:
  - title: "STOMP security (Spring Security reference)"
    url: "https://docs.spring.io/spring-security/reference/servlet/integrations/websocket.html"
---

# WebSocket Security — Auth, Origins, and Authorization

## The Concept: The Open Line Needs a Guarded Door

A WebSocket is a *long-lived, bidirectional* connection — which makes it a bigger risk than a request/response call:

- **One open connection is a persistent session** — if it's not authenticated, an attacker rides it indefinitely.
- **The server pushes on it** — a malicious subscriber to the wrong topic receives internal data.
- **Cross-site attacks** — any website can open a socket to your server unless you restrict origins.

WebSocket security has three layers, mirroring HTTP security but with WebSocket specifics:

1. **Authentication** — prove *who* is connecting (at the handshake).
2. **Origin control** — ensure the connection comes from *your* site.
3. **Authorization** — control *which destinations* a user may subscribe to or send to.

## Layer 1 — Authenticate the Handshake

The connection *starts* as HTTP — so the JWT/CSRF machinery from the security modules applies at that moment. The standard pattern: validate the token in an **interceptor** during the handshake and attach the principal to the session:

```java
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

public class JwtHandshakeInterceptor implements HandshakeInterceptor {

    private final TokenValidator validator;

    public JwtHandshakeInterceptor(TokenValidator validator) { this.validator = validator; }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {

        // The token rides the handshake URL: /ws?token=...
        String query = request.getURI().getQuery();
        String token = extractToken(query);           // parse token=...

        if (token != null && validator.isValid(token)) {
            // Attach the identity to the session attributes — available to handlers later
            attributes.put("userId", validator.subject(token));
            return true;                               // allow the connection
        }

        response.setStatusCode(org.springframework.http.HttpStatus.UNAUTHORIZED);
        return false;                                  // reject the handshake
    }
}
```

Register the interceptor:

```java
registry.addEndpoint("/ws")
        .addInterceptors(new JwtHandshakeInterceptor(validator))
        .setAllowedOrigins("https://academy.example.com");
```

### Why the Handshake Is the Only Place

Once the connection is established, there's no more HTTP — the token can't be re-checked per message (well, you *can* check per frame, but the standard is: **verify once at the handshake, carry the identity in session attributes**). A rejected handshake never opens the connection — the attacker gets nothing.

## Layer 2 — Origin Checks

```java
registry.addEndpoint("/ws")
        .setAllowedOrigins("https://academy.example.com");   // exact allow-list
```

Without origin restrictions, **any** website can open a socket to `/ws` (browsers don't enforce same-origin on WebSockets by default). With the allow-list, only your domain's pages can connect. Never use `"*"` for authenticated sockets.

## Layer 3 — Destination Authorization

The dangerous scenario: a logged-in user subscribes to `/topic/admin/alerts` or SENDS to `/app/admin.action`. Spring Security can intercept SUBSCRIBE and SEND frames:

```java
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.config.annotation.web.socket.EnableWebSocketSecurity;
import org.springframework.security.messaging.access.intercept.MessageMatcherDelegatingAuthorizationManager;

import static org.springframework.messaging.simp.SimpMessageType.*;

@Configuration
@EnableWebSocketSecurity
public class WebSocketSecurityConfig {

    @Bean
    public AuthorizationManager<Message<?>> messageAuthorizationManager() {
        var messages = MessageMatcherDelegatingAuthorizationManager.builder();

        // Everyone authenticated may connect, subscribe to chat, send to chat
        messages.simpDestMatchers("/topic/chat/**", "/app/chat/**").authenticated();

        // Only ADMIN may see admin topics
        messages.simpDestMatchers("/topic/admin/**").hasRole("ADMIN");

        // Reject everything else (deny-by-default)
        messages.anyMessage().denyAll();

        return messages.build();
    }
}
```

**Deny-by-default is the key**: any destination not explicitly allowed is rejected. A user with a valid token but no admin role gets a `403`-style rejection when subscribing to `/topic/admin/**` — at the frame level, before any data flows.

## CSRF Over STOMP

Because the client sends STOMP frames over the socket (not browser-form submissions), classic CSRF doesn't apply the same way — but the handshake can be CSRF-affected if cookies authenticate it. The practical guidance:

- If you authenticate via **Bearer tokens in the handshake** (the pattern above), CSRF is largely moot — the attacker can't know the token.
- If cookies authenticate, keep CSRF protection for the HTTP upgrade request (Spring Security protects the STOMP handshake by default when CSRF is enabled) — and use `SameSite` cookies.

## The Complete Security Checklist

- [ ] Token validated **at the handshake** (interceptor), identity in session attributes.
- [ ] `setAllowedOrigins` with an explicit allow-list (never `*`).
- [ ] Destination authorization: subscribe/send matchers, deny-by-default.
- [ ] Sensitive topics role-gated (`hasRole`).
- [ ] TLS (`wss://`) in production — the socket is only as safe as the transport.
- [ ] Idle timeouts + heartbeats — dead authenticated sessions shouldn't linger forever.
- [ ] Rate-limit SEND frames — a malicious client can flood the server.
- [ ] Log connect/disconnect with user identity (audit).

## Common Beginner Pitfalls

1. **No handshake auth** — any unauthenticated client connects; the "open line" is wide open.
2. **`setAllowedOrigins("*")`** — cross-site hijack; allow-list your domain.
3. **Authorizing only the HTTP layer** — the socket bypasses it; you need frame-level authorization (matchers above).
4. **Broadcasting sensitive topics to all subscribers** — topic design *is* a security decision; gate admin/internal topics.
5. **Tokens in the URL (logs!)** — `?token=` lands in proxy and access logs; consider a cookie or a short-lived one-time handshake token.
6. **No reconnection auth** — when the client reconnects, the handshake runs again; make sure the token is still valid (short tokens expire — refresh before reconnect).
7. **ws:// in production** — plain WebSocket over the internet is sniffable; `wss://` only.

## Key Takeaways

- The handshake is the only HTTP moment — authenticate there, carry identity in session attributes.
- Restrict origins to your domain; never `*` for authenticated sockets.
- Authorize at the frame level: subscribe/send matchers, deny-by-default, role-gated topics.
- Bearer-token auth makes CSRF largely moot; cookie auth needs CSRF + SameSite.
- Use `wss://` in production; heartbeat idle connections; rate-limit SEND.
- Topic design is a security decision — not everyone should see every channel.
