---
title: Session Security — CSRF, Fixation, and Session Management Best Practices
summary: How to secure HTTP sessions against CSRF attacks, session fixation, concurrent session control, and session hijacking — with Spring Security integration patterns.
order: 3
minutes: 22
topics: ["CSRF protection", "session fixation", "concurrent sessions", "session hijacking", "secure cookies"]
docs:
  - url: "https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html"
    title: "CSRF Protection"
---

## The Concept, From Zero

Sessions are the most targeted part of a web application. Attackers try to steal session IDs (hijacking), forge session requests (CSRF), or reuse old session tokens (fixation). This lesson covers every session security pattern you need.

---

## CSRF Protection

**Cross-Site Request Forgery** is when a malicious site tricks your browser into making requests to your app using your session cookie.

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf
                // Enable CSRF for browser-based apps (default)
                .csrfTokenRepository(
                    CookieCsrfTokenRepository.withHttpOnlyFalse())
                // Only protect state-changing requests
                .ignoringRequestMatchers("/api/public/**")
            )
            .sessionManagement(session -> session
                // Maximum concurrent sessions per user
                .maximumSessions(1)
                // Expire old session when new one is created
                .maxSessionsPreventsLogin(false)
            );
        return http.build();
    }
}
```

### How CSRF Tokens Work

```
1. Browser loads your page → Spring sends XSRF-TOKEN cookie
2. Browser submits form → Axios automatically adds X-XSRF-TOKEN header
3. Server validates token matches → Request succeeds
4. Attacker's site tries to submit → No valid token → Blocked
```

---

## Session Fixation Prevention

**Session fixation** is when an attacker sets a known session ID before the user logs in, then hijacks the session after login.

```java
http.sessionManagement(session -> session
    // Prevents fixation by creating a new session ID after login
    .sessionFixation().migrateSessionId()  // Default
);
```

| Strategy | Behavior | Best For |
|----------|----------|----------|
| `migrateSessionId()` | New ID, same attributes | Most applications (default) |
| `changeSessionId()` | New ID only, minimal overhead | High-performance apps |
| `newSession()` | Fresh session, no attributes carried over | Maximum security |
| `none()` | No protection | Never use in production |

---

## Concurrent Session Control

```java
http.sessionManagement(session -> session
    .maximumSessions(1)                    // One session per user
    .maxSessionsPreventsLogin(false)        // Kick out old session
    .expiredUrl("/login?expired=true")     // Where to redirect
);
```

**When user A logs in from Device 1, then logs in from Device 2:**
- `maxSessionsPreventsLogin(false)` → Device 1 is logged out, Device 2 succeeds
- `maxSessionsPreventsLogin(true)` → Device 2 is rejected, Device 1 stays

---

## Secure Cookie Configuration

```java
@Bean
public ServletContextInitializer cookieConfig() {
    return servletContext -> {
        SessionCookieConfig cookie = servletContext.getSessionCookieConfig();
        cookie.setName("__Host-session-id");    // __Host- prefix: HTTPS only
        cookie.setHttpOnly(true);               // No JavaScript access
        cookie.setSecure(true);                 // HTTPS only
        cookie.setMaxAge(1800);                 // 30 minutes
        cookie.setPath("/");                    // Entire domain
        cookie.setAttribute("SameSite", "Lax"); // Prevents CSRF from cross-site
    };
}
```

**SameSite Cookie Values:**

| Value | Behavior | Use Case |
|-------|----------|----------|
| `Strict` | Never sent cross-site | Banking, admin panels |
| `Lax` | Sent for top-level navigation | Most web apps (default) |
| `None` | Always sent (requires Secure) | Embedded content, cross-origin APIs |

---

## Session Hijacking Prevention

```java
@Component
public class SessionHijackPrevention {

    private final SessionRepository<? extends Session> sessions;

    /**
     * Bind session to IP address and User-Agent.
     * If either changes, invalidate the session.
     */
    @EventListener
    public void onSessionCreated(SessionCreatedEvent event) {
        Session session = sessions.findById(event.getSessionId());
        if (session != null) {
            session.setAttribute("creationIp", getCurrentIp());
            session.setAttribute("creationUserAgent", getCurrentUserAgent());
        }
    }

    public boolean validateSession(HttpServletRequest request) {
        String sessionId = request.getSession(false).getId();
        Session session = sessions.findById(sessionId);
        if (session == null) return false;

        String currentIp = request.getRemoteAddr();
        String currentUA = request.getHeader("User-Agent");
        String storedIp = (String) session.getAttribute("creationIp");
        String storedUA = (String) session.getAttribute("creationUserAgent");

        // IP or User-Agent changed → possible hijacking
        if (!currentIp.equals(storedIp) || !currentUA.equals(storedUA)) {
            sessions.deleteById(sessionId);
            return false;
        }
        return true;
    }
}
```

---

## Common Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| Disabling CSRF for "convenience" | Vulnerable to CSRF attacks | Keep CSRF enabled, use token repository |
| Using `sessionFixation().none()` | Vulnerable to session fixation | Use `migrateSessionId()` |
| No session timeout | Sessions live forever → memory leak | Set `spring.session.timeout: 30m` |
| Missing `Secure` flag on cookies | Session ID sent over HTTP | Always set `Secure=true` |
| Storing sensitive data in session | Session data readable in Redis | Store IDs only, fetch data in service |
