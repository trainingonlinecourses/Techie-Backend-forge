---
title: Session Management — Sessions, Fixation and Concurrency Control
summary: Session fixation attacks, session creation policies, concurrency limits, and how stateless JWT apps avoid sessions entirely.
order: 14
minutes: 17
topics: [session, session-fixation, concurrency-control, session-creation-policy, stateless, remember-me]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/authentication/session-management.html
  - https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
---

# Session Management — Sessions, Fixation and Concurrency Control

## The concept: what a session is

A **session** is server-side state tied to a client via a cookie (`JSESSIONID`). After login, the server stores the `Authentication` in the session so subsequent requests are recognized without re-sending credentials. Session-based auth is the classic web model — and it brings three concerns: **fixation**, **lifetime**, and **concurrency**.

## Session fixation — the attack and the fix

**Fixation:** an attacker *pre-sets* the victim's session id (e.g., sends a link with `?JSESSIONID=attackerKnownId`), the victim logs in, and the server keeps that *attacker-known* session id — now authenticated. The attacker uses the known id and is logged in as the victim.

**The fix is trivial and mandatory:** **change the session id at login**. Spring does this with `sessionFixation().migrateSession()` (default) or `newSession()` (strictest). Never log a user in and keep the pre-login session id.

```java
http.sessionManagement(sm -> sm
    .sessionFixation(fix -> fix.newSession())          // discard old id, issue fresh one
    .maximumSessions(2)                                 // concurrency control
    .maxSessionsPreventsLogin(false));                  // old session expires instead of blocking
```

## Session creation policies

- `IF_REQUIRED` (default) — create a session only when needed (e.g., at login).
- `ALWAYS` — force a session even for anonymous requests (memory cost, rarely wanted).
- `NEVER` — don't create sessions, but use one if the client already has it.
- `STATELESS` — never create or use sessions — every request re-authenticates (JWT model).

For a stateless JWT API, `STATELESS` is the setting (with `csrf` disabled) — no session, no fixation risk, no server-side session store, and horizontal scaling with no shared session storage. That's the dominant modern API architecture.

## Concurrency control — how many sessions per user

`maximumSessions(n)` limits simultaneous logins per user. Two modes:

```java
// Mode 1: prevent the new login when at the limit
.maxSessionsPreventsLogin(true)

// Mode 2 (default): the NEW login succeeds, the OLDEST session is expired
.maxSessionsPreventsLogin(false)
```

Teams choose per product: banks and internal tools often use `preventLogin(true)` (a second login is *rejected*); consumer apps often expire the old session so "login on my phone" doesn't lock out "login on my laptop". Note: with `STATELESS` (JWT) there *are* no server sessions, so this control doesn't apply — the JWT's `exp` and refresh-token rotation become the equivalent mechanisms.

## Session lifetime and idle timeout

```properties
server.servlet.session.timeout=30m      # absolute session lifetime
# plus code-level:
http.sessionManagement(sm -> sm.sessionFixation(...));
```

Session timeout is the balance between UX (too short = re-logins) and security (too long = stolen-session window). OWASP guidance: idle timeout of 15-30 minutes for sensitive apps; absolute timeout (re-login after a fixed period regardless of activity) for banking-grade apps.

## How we use it in an organization: the scenarios

**Scenario 1 — server-rendered admin console (cookie sessions).** CSRF on, `migrateSession`/`newSession` at login, `maximumSessions(1)` + `preventLogin(true)` (an admin shouldn't be logged in twice), session timeout 30m, and logout that invalidates both session and cookie:

```java
http
    .formLogin(form -> form.loginPage("/login").defaultSuccessUrl("/dashboard"))
    .logout(logout -> logout
        .logoutUrl("/logout")
        .invalidateHttpSession(true)       // destroy the server-side session
        .deleteCookies("JSESSIONID"));     // clear the client cookie
```

**Scenario 2 — stateless JWT API.** `STATELESS`, CSRF off, no session concerns — auth is a header on every request. The trade-off: a stolen JWT is valid until `exp` (can't be revoked server-side without a denylist), which is why refresh tokens with rotation and short access-token lifetimes exist.

**Scenario 3 — hybrid: JWT for API + session for admin UI.** Two security filter chains — one stateless for `/api/**`, one session-based for the admin web app. Each chain has its own policy; the session chain keeps fixation protection and CSRF.

## Pitfalls

- **Forgetting `sessionFixation`** — the default protects you, but an explicit `newSession()` on login is the audited, belt-and-suspenders pattern.
- **`STATELESS` with cookie-session expectations** — code that reads the session (`HttpSession`, `@SessionAttribute`) silently breaks. Stateless means *no* session; move state to JWT claims or the database.
- **Clustered deployments** — session-based apps behind a load balancer need **sticky sessions** or a shared session store (Redis-backed `spring-session-data-redis`); otherwise requests bounce between nodes and users get logged out randomly. Stateless JWT sidesteps this entirely.
- **Concurrency control with stateless JWT** — `maximumSessions` won't work; enforce "one active token per user" in your own token store if needed.
- **Long-lived sessions without absolute timeout** — a stolen session id stays valid indefinitely; add an absolute re-auth interval for sensitive data.

## Key takeaways

- Sessions = server state + cookie; always rotate the session id on login (fixation).
- `STATELESS` + JWT: no sessions, no fixation, no shared-store problem — but tokens need short expiry + refresh.
- `maximumSessions` + `preventLogin` for concurrency control — pick reject-new vs expire-old per product.
- Clustered session apps need sticky sessions or a shared store (Spring Session + Redis).
- Logout must invalidate the session and delete the cookie; consider absolute timeouts for sensitive apps.
