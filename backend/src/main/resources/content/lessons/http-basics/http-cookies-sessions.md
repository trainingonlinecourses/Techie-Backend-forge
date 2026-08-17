---
title: Cookies and Sessions — State on a Stateless Protocol
module: http-basics
order: 4
minutes: 26
topics: ["cookies", "sessions", "SameSite", "HttpOnly", "Secure", "statelessness"]
docs:
  - title: "RFC 6265 — HTTP State Management Mechanism"
    url: "https://datatracker.ietf.org/doc/html/rfc6265"
---

# Cookies and Sessions — State on a Stateless Protocol

## The Concept: Remembering Across Stateless Requests

HTTP is **stateless**: each request is independent — the server doesn't know it's the same person who logged in a minute ago. Yet every web app *remembers* you: your cart, your login, your preferences. How?

The answer is the **cookie**: a small piece of state the *server hands to the browser* once, and the browser **sends back with every subsequent request** to that domain. The server reads the cookie and recognizes you.

```
1. POST /login  {username, password}
   Server: verifies, creates a session, responds:
   Set-Cookie: session=abc123; HttpOnly; Path=/; SameSite=Lax

2. GET /api/me
   Cookie: session=abc123        <- the browser auto-attaches it
   Server: looks up session abc123 -> "this is Sateesh"
```

The cookie *is* the "I remember you" token. The server-side **session** is what the token maps to (a stored record: who, when, what's in the cart).

## The Cookie Attributes — The Security Settings

| Attribute | Meaning | Why it matters |
|---|---|---|
| `HttpOnly` | JavaScript can't read the cookie | **Blocks XSS theft** — a stolen cookie = a stolen session |
| `Secure` | Only sent over HTTPS | Prevents sniffing on plain HTTP |
| `SameSite=Lax/Strict` | Only sent on same-site requests | **Blocks CSRF** — cross-site requests don't carry the cookie |
| `Path=/` | Which paths the cookie applies to | Scoping |
| `Max-Age` / `Expires` | Lifetime | Bounded sessions |
| `Domain` | Which domains accept it | Scoping |

The minimum production set for an auth cookie: **`HttpOnly; Secure; SameSite=Lax`**.

## Cookie vs Token (JWT) — The Two Auth Styles

| | Cookie-based sessions | Token (JWT) auth |
|---|---|---|
| Storage | Cookie (browser) + server session store | Token in the client (memory/header) |
| Server state | Session store (DB/Redis) | Stateless (signature only) |
| Revocation | Instant (delete the session) | Until expiry (or refresh machinery) |
| XSS risk | Low (HttpOnly) | High (localStorage-readable) |
| CSRF risk | Needs SameSite/CSRF tokens | Low (header-based) |
| Best for | Browser web apps | APIs, SPAs, mobile, microservices |

Both appear in real stacks — and the modern pattern combines them: **HttpOnly cookie for the refresh token, in-memory access token** (from the JWT module).

## The Code Walkthrough — Sessions in Spring

```java
import jakarta.servlet.http.HttpSession;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class SessionController {

    // ---- 1. Create session state at login ----
    @PostMapping("/login")
    public String login(@RequestBody LoginRequest req, HttpSession session) {
        User user = authService.authenticate(req.username(), req.password());
        session.setAttribute("userId", user.getId());   // server-side state
        session.setAttribute("roles", user.getRoles());
        // The container sends Set-Cookie: JSESSIONID=... automatically
        return "ok";
    }

    // ---- 2. Read session state on later requests ----
    @GetMapping("/me")
    public UserDto me(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return userService.get(userId);
    }

    // ---- 3. Invalidate the session at logout ----
    @PostMapping("/logout")
    public void logout(HttpSession session) {
        session.invalidate();            // the server forgets everything
    }
}
```

### Walking Through Each Part

**The login** — authenticate, then store identity *server-side* in the `HttpSession`. The container manages the cookie (`JSESSIONID`) — set as `HttpOnly` by default in Spring Boot. The session is server state; the cookie is just its key.

**The `me` endpoint** — reads the session attribute. The flow: browser sends `JSESSIONID` cookie → container finds the session → `getAttribute` returns the user id. No credentials re-sent, no token parsing.

**Logout** — `session.invalidate()` deletes the server-side record: the session is dead instantly (even if the cookie is somehow replayed). This is the *revocation* story that stateless JWTs lack.

## Session Storage — Where Sessions Live

| Store | Characteristics |
|---|---|
| In-memory (default) | Fast, lost on restart, per-instance only |
| **Redis** | Shared across instances, survives restarts, expires (TTL) — the production choice |
| Database | Durable, slower, the fallback |

For multi-instance deployments (like this academy's backend), **in-memory sessions break**: the user's session lives on instance 1; the next request hits instance 2, which has no record → logged out randomly. The fix is a shared store (Redis) or stateless tokens (JWT) — the two scale paths.

## The Attacks Cookies Defend Against

- **Session hijacking (theft)** — attacker steals the cookie. Defenses: `HttpOnly` (XSS can't read it), `Secure` (can't sniff it), HTTPS everywhere, regenerate the session id after login (session fixation defense).
- **CSRF** — a malicious site triggers a request that *carries your cookie*. Defenses: `SameSite=Lax` (the browser withholds the cookie cross-site), CSRF tokens for state-changing requests, `Origin` checks.
- **Session fixation** — attacker plants a session id before login. Defense: `session.changeSessionId()` after authentication (Spring Security does this automatically).

## Common Beginner Pitfalls

1. **Cookies without `HttpOnly`** — XSS steals the session; the single most common cookie mistake.
2. **Cookies without `SameSite`** — CSRF-able; set `SameSite=Lax` (or `Strict`).
3. **Cookies without `Secure` on HTTPS sites** — sniffable on the wire.
4. **In-memory sessions in a multi-instance deployment** — random logouts as requests bounce between instances; use Redis or stateless tokens.
5. **Storing secrets in cookies** — the cookie is visible to the browser and any script (unless HttpOnly, which then makes it unreadable by *your* JS too); store a session key, not the data.
6. **No session id rotation at login** — session fixation; rotate after auth.
7. **Cookies for API tokens in non-browser clients** — mobile/native clients don't manage cookies well; header-based tokens suit APIs.

## Key Takeaways

- Cookies are how the stateless HTTP protocol remembers you: server sets, browser auto-sends back.
- Sessions are server-side state keyed by the cookie; the cookie itself is just the key.
- Minimum security set: `HttpOnly; Secure; SameSite=Lax`.
- Cookie-session auth is revocable (delete the session); JWT auth is stateless but stale-until-expiry.
- Multi-instance production needs a shared session store (Redis) or stateless tokens.
- Defend: HttpOnly (XSS), SameSite (CSRF), Secure (sniffing), session rotation (fixation).
