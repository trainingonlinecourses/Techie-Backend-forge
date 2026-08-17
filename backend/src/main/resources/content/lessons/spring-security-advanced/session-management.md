---
title: Session Management & Hardening
summary: Sessions beyond the default — session fixation, concurrency control, session registry, Redis-backed storage and the session-vs-JWT decision.
order: 3
minutes: 14
topics: [session management, session fixation, concurrency control, session registry, redis sessions]
docs:
  - https://docs.spring.io/spring-session/reference/
  - https://docs.spring.io/spring-security/reference/servlet/authentication/session-management.html
---

# Session Management & Hardening

## Where sessions come from

Spring Security creates an `HttpSession` on login (the `JSESSIONID` cookie). It's the server-side state that answers "who is this browser?" — and like all server-side state, it needs explicit management: lifetime, concurrency, storage and theft protection.

## Session fixation: the attack and the fix

**Session fixation** = the attacker plants a known session id in the victim's browser, then waits for the victim to log in — the attacker now shares the authenticated session.

```java
http.sessionManagement(sm -> sm.sessionFixation(SessionFixationConfigurer::newSession));
```

Spring Security's **default is already `changeSessionId()`** (keep the session, rotate the id) — never disable it. The equivalent discipline for JWT-based apps: always rotate tokens/keys on privilege change.

## Concurrency control: one user, how many sessions?

```java
http.sessionManagement(sm -> sm
    .maximumSessions(1)                        // one active session per user
    .maxSessionsPreventsLogin(true)            // new login rejected (vs. kicking the old one)
    .expiredUrl("/login?expired"));
```

The two semantics: `maxSessionsPreventsLogin(false)` (default) **invalidates the oldest session** — the user gets silently logged out elsewhere; `true` **rejects the new login**. Choose per product: banking = reject new; internal tool = kick old.

**`SessionRegistry`** is the bookkeeping that makes this work (and powers "show all sessions of user X", "kill a session remotely"):

```java
@Bean
SessionRegistry sessionRegistry() { return new SessionRegistryImpl(); }

// Audit / admin: enumerate and destroy sessions
List<SessionInformation> sessions = sessionRegistry.getAllSessions(user, false);
sessions.forEach(s -> s.expireNow());
```

Register sessions by adding `http.sessionManagement(sm -> sm.sessionRegistry(sessionRegistry()))` — concurrent-session control **requires** the registry.

## Storage: single-instance default, Redis for scale-out

The default in-memory `HttpSession` dies on restart and breaks load-balanced deployments (user A hits instance 1, next request lands on instance 2 with no session). **Spring Session** moves sessions out of the JVM — Redis being the standard:

```xml
<dependency>
  <groupId>org.springframework.session</groupId>
  <artifactId>spring-session-data-redis</artifactId>
</dependency>
```

```java
@EnableRedisHttpSession(defaultMaxInactiveIntervalSeconds = 3600)  // 1h TTL
public class SessionConfig { }
```

Now: sessions survive restarts, any instance serves any user, and the session has a **server-enforced TTL** (the Redis key expires). The same pattern covers JDBC-backed sessions (`spring-session-jdbc`) when Redis isn't in the stack.

## Timeouts and cleanup

- Default idle timeout: `server.servlet.session.timeout: 30m` (or `@EnableRedisHttpSession(defaultMaxInactiveIntervalSeconds=...)` for Redis).
- Idle vs. absolute: an **idle timeout** dies after inactivity; an **absolute timeout** dies N minutes after login regardless — sessions that should expire at a hard deadline (admin portals, payment flows) need absolute semantics enforced in code (store `loginAt` and check).
- Logout must **invalidate the server session AND clear the cookie**: `POST /logout` (CSRF token required!) → `SecurityContextLogoutHandler` invalidates and clears; the browser drops `JSESSIONID`.

## The session-vs-JWT decision (the argument that matters)

| Session (cookie + HttpSession) | JWT/Bearer |
|---|---|
| Server-side state, revocable instantly | Stateless, no server storage |
| Works with plain server-rendered apps | Great for SPAs and APIs |
| Scale-out needs Spring Session (Redis) | Scale-out is trivial — but revocation is limited |
| CSRF protection required (cookies!) | CSRF not needed with Bearer headers |
| Opaque to the client | Client-visible claims (careful with data in the token) |

Rule of thumb: **server-rendered/HTMX app or tight server control → sessions; API/SPA/mobile → JWT.** Hybrids exist (session cookie for browser UI + JWT for API clients) — the crime is mixing the two *within one trust boundary* and getting neither's guarantees.

## Key takeaways

- Keep the default session-fixation protection (`changeSessionId`); rotate IDs on privilege change.
- Concurrency control needs a `SessionRegistry`; choose kick-old vs. reject-new deliberately.
- Move sessions to Redis (Spring Session) the moment you run more than one instance.
- Sessions = revocable + CSRF-bound; JWT = stateless + limited revocation — pick by architecture, not fashion.

Official docs: [Spring Session](https://docs.spring.io/spring-session/reference/) · [Session Management](https://docs.spring.io/spring-security/reference/servlet/authentication/session-management.html)
