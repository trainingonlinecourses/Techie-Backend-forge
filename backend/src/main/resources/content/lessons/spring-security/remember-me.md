---
title: Remember-Me Authentication — Persistent Logins Done Safely
summary: How remember-me works, token-based vs persistent implementations, cookie risks, and the org policy decisions for long-lived logins.
order: 17
minutes: 16
topics: [remember-me, persistent-login, token, cookie, remembermeparameter, session-fixation]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/authentication/rememberme.html
  - https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
---

# Remember-Me Authentication — Persistent Logins Done Safely

## The concept: "keep me signed in" is a second credential

**Remember-me** lets a returning user skip login: after a successful login, the server issues a **remember-me cookie**; on the next visit, the cookie authenticates the session without a password. It is *not* "the session never expires" — it's a **second, long-lived credential** stored in the browser, and it deserves the same care as the password itself.

The decision every team makes first: **is remember-me appropriate at all?** For banking, admin consoles, and anything with account-takeover impact, the answer is usually *no* — sessions expire and users re-authenticate. For consumer apps and low-risk tools, remember-me is standard UX. The org policy sets this per application, not per developer.

## Token-based remember-me (the simple, less-secure version)

```java
http.rememberMe(rm -> rm
    .key("unique-and-secret-key")     // server secret — MUST be externalized, not hard-coded
    .tokenValiditySeconds(2_592_000)); // 30 days
```

The token is `username + expiry + MD5(username:expiry:password:key)`. **The flaw:** the token's hash includes the *password*, so changing the password invalidates all tokens — but more importantly, the token itself is the credential, and there's no server-side record to revoke. A stolen cookie is a stolen login for up to 30 days with no kill-switch. Fine for prototypes; not the production answer.

## Persistent-token remember-me (the production pattern)

The persistent implementation stores each token **server-side** and tracks usage:

```java
http.rememberMe(rm -> rm
    .tokenRepository(jdbcTokenRepository())   // a PersistentTokenRepository (JDBC-backed)
    .tokenValiditySeconds(2_592_000));

@Bean
public PersistentTokenRepository jdbcTokenRepository(DataSource ds) {
    JdbcTokenRepositoryImpl repo = new JdbcTokenRepositoryImpl();
    repo.setDataSource(ds);
    repo.setCreateTableOnStartup(true);       // creates persistent_logins on first boot
    return repo;
}
```

Schema: `persistent_logins (username, series, token, last_used)`.

**Why the series/token pair matters:**

- The **series** identifies the login; the **token** is the current credential.
- On each remembered login: compare the presented token to the stored one; if it matches, **rotate the token** (new random value) and update `last_used`.
- **If the series matches but the token doesn't** — someone is replaying a stolen cookie. The standard response: **invalidate the whole series** (the user's token was stolen and used) — and many implementations flag the account for investigation.

This gives server-side **revocation** (delete the row = logged out everywhere) and **theft detection** (token mismatch = possible compromise).

## Cookie security — non-negotiable

```java
http.rememberMe(rm -> rm
    .rememberMeParameter("remember-me")     // the login form checkbox name
    .rememberMeCookieName("ACADEMY_REMEMBER_ME")
    .tokenValiditySeconds(2_592_000));

// The cookie MUST be: Secure + HttpOnly + SameSite
```

Spring sets `HttpOnly` and `Secure` (on HTTPS) by default; add **SameSite** so the cookie isn't sent on cross-site requests (the CSRF-adjacent protection for cookies):

```properties
server.servlet.session.cookie.same-site=lax
```

A remember-me cookie without `Secure` is transmitted over HTTP; without `HttpOnly` it's readable by any XSS; without `SameSite` it rides along on cross-site requests. All three are review-blockers.

## How we use it in an organization: the scenarios

**Scenario 1 — consumer app with persistent login.** The login page has "Keep me signed in"; persistent tokens in the DB; logout deletes both the session and the remember-me series row — "sign out everywhere" is real.

**Scenario 2 — theft detection.** A token-replay detection that invalidates the series and alerts security: the dashboard shows "Your session was signed out from another device" — the standard user-facing cover for the detection firing.

**Scenario 3 — remember-me for API-less web apps.** It's a browser-cookie feature — for a JWT API, the equivalent is the **refresh token** (long-lived, server-revocable, rotated) — see the refresh-tokens lesson. The *design lesson* carries over: long-lived credentials need rotation and revocation, whatever the transport.

**Scenario 4 — force re-auth for sensitive actions.** Even with remember-me, "change password", "view full card number", and "transfer money" re-prompt for the password (step-up auth) — remember-me authenticates the *session*, not every sensitive action.

## Pitfalls

- **Hard-coded remember-me key** — a leaked key lets attackers forge tokens for any user. Externalize it (env var/secret).
- **MD5 in the token hash** — the simple implementation is weak by modern standards; prefer the persistent repository.
- **No revocation path** — without server-side tokens, "log me out everywhere" and theft response are impossible.
- **Forgetting to invalidate on password change** — a stolen remember-me cookie surviving a password reset is a security hole; invalidate all series on password change.
- **Remember-me on shared computers** — the UX pitfall: a "remember me" left on a shared kiosk is an open session. Many orgs disable it or add an explicit "this is a private device" confirmation.
- **Session fixation interplay** — remember-me re-authenticates and must still rotate the session id (the default handles it); never let a remember-me cookie resurrect a stale pre-login session.

## Key takeaways

- Remember-me is a long-lived second credential — policy first: it's wrong for high-impact apps.
- Persistent tokens (series + rotating token, server-stored) beat token-only: revocation and theft detection.
- Rotate the token each use; on series-match/token-mismatch, invalidate the series and investigate.
- Cookie must be Secure + HttpOnly + SameSite; externalize the signing key.
- Invalidate all tokens on password change; step-up auth for sensitive actions; for APIs, use revocable refresh tokens.
