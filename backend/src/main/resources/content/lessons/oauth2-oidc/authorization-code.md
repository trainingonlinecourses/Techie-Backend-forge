---
title: The Authorization Code Flow — With PKCE
module: oauth2-oidc
order: 2
minutes: 27
topics: ["authorization code", "PKCE", "redirect URIs", "code exchange", "state", "SPA"]
docs:
  - title: "Authorization Code Grant (RFC 6749 §4.1)"
    url: "https://datatracker.ietf.org/doc/html/rfc6749#section-4.1"
  - title: "PKCE (RFC 7636)"
    url: "https://datatracker.ietf.org/doc/html/rfc7636"
---

# The Authorization Code Flow — With PKCE

## The Concept: The Flow Behind Every "Sign In With ..."

The **authorization code flow** is the workhorse of OAuth2 — the flow behind every "Sign in with Google / GitHub / Apple" button. Its genius is a *two-step token acquisition* that keeps secrets off the browser: the user authenticates at the authorization server, receives a short-lived **code** in the redirect, and only the *client's backend* (which holds the client secret) can exchange that code for tokens. The browser — where attackers lurk — never sees the access token.

**The mental model:** the code is a *claim ticket*. The user (through the browser) does the identity check at the front desk (auth server) and gets a ticket (code). The ticket is worthless alone — anyone holding it can't use it. Only the *client's kitchen* (the backend, which knows the secret handshake) can redeem the ticket for the meal (tokens). Because the kitchen never sends its secret through the public dining room, the secret stays safe.

## The Full Flow, Step by Step

```text
+----------+                                  +------------------+
| Browser  | --- (1) /authorize?client_id...->| Authorization    |
| (user)   | <-- (4) 302 redirect w/ code ----| Server           |
+----------+                                  +------------------+
     |                                              ^
     | (2) user authenticates at the auth server    |
     | (3) consent screen: approve scopes           |
     v                                              |
+----------+   (5) POST /token: code + secret   +------------------+
| Client   | ------------------------------------->| Token Endpoint  |
| backend  | <-- (6) access_token + refresh_token  |                 |
+----------+                                       +------------------+
```

**The steps, with the security of each:**

1. **The client builds the authorize URL** — `GET https://auth.example.com/authorize?response_type=code&client_id=academy-app&redirect_uri=https://api.academy.com/callback&scope=read:lessons&state=xyz123`. Note `response_type=code` (asking for the code flow), the `redirect_uri` (where the code must come back), and the `state` parameter.
2. **The user authenticates at the auth server** — the password form lives *on the auth server's domain*, never on your app's.
3. **The consent screen** — the user approves the requested scopes ("academy-app wants to read your lessons").
4. **The redirect back** — the auth server sends the browser to `redirect_uri?code=one-time-code&state=xyz123`. The client backend verifies `state` matches what it sent (anti-CSRF: a forged redirect with a *matching* state is impossible without the session).
5. **The code exchange** — the client's *backend* calls `POST /token` with: the code, the client id, the **client secret** (never in the browser!), and the redirect_uri. The auth server verifies the code is valid, unexpired, and was issued *for this redirect_uri*.
6. **Tokens arrive** — `{ access_token, token_type: "Bearer", expires_in, refresh_token, scope }`. Only the backend ever saw them.

**The two security pillars:** the code is single-use and bound to the redirect_uri and client; the secret travels only in the server-to-server exchange. Even if an attacker intercepts the redirect (step 4), they hold a code they can't redeem without the secret — and the code is already spent.

## PKCE: Protecting the Public Client

The flow above assumes a **confidential client** — one with a backend that can hold a secret. **SPAs and mobile apps have no backend** — the "secret" would live in the browser, visible to anyone. **PKCE (Proof Key for Code Exchange)** solves this: instead of a secret, the client generates a *random verifier*, sends only a *hash* of it (the challenge), and later proves knowledge of the verifier when exchanging the code.

```java
// The client-side PKCE preparation:
// 1. Generate a random verifier (43-128 chars):
String verifier = Base64.getUrlEncoder().withoutPadding()
        .encodeToString(randomBytes(32));      // e.g. "fdbGH93h..."

// 2. Send only the SHA-256 CHALLENGE in the authorize request:
String challenge = Base64.getUrlEncoder().withoutPadding()
        .encodeToString(sha256(verifier));
//    GET /authorize?code_challenge=<challenge>&code_challenge_method=S256&...

// 3. At the code exchange, prove knowledge of the verifier:
//    POST /token  body: { code, client_id, code_verifier: verifier }
//    The auth server hashes the verifier and compares to the challenge.
//    Only the client that generated the verifier can complete the swap.
```

**Why PKCE defeats code interception:** if an attacker steals the code, they still can't exchange it — they don't know the original verifier, and the auth server's hash comparison fails. PKCE is now *recommended for every* authorization-code flow (even confidential clients) — defense in depth for the same one-time-code exchange. Spring Security's OAuth2 client supports it out of the box; if you use the framework, this entire ceremony is `spring.security.oauth2.client.registration.*` configuration.

## The state Parameter: The CSRF Defense

Without `state`, an attacker could *inject* a fake redirect to your callback, or swap their login for the victim's. The `state` parameter is a random value the client stores in its session before starting the flow and verifies on the callback — the OAuth analog of a CSRF token. **Never ship an OAuth2 integration without it**; it's the difference between "an attacker can log the user into the attacker's account and capture the victim's authorization" and "nothing."

## Redirect URIs: The Tightest Possible Allowlist

The `redirect_uri` is where the code can legally arrive — and it's the number-one OAuth2 attack surface. The rules:

1. **Exact-match validation** — the auth server must compare the redirect_uri *exactly* (scheme, host, port, path) against the registered allowlist. `https://api.academy.com/callback` is not the same as `https://api.academy.com/callback/` or `http://...`.
2. **Never use wildcards** in production redirect URIs — a wildcard turns any open redirect on your domain into a token-stealing vector.
3. **Register *every* environment** (localhost for dev, each region) explicitly — and beware the classic `localhost` confusion: `http://localhost:8080` and `http://127.0.0.1:8080` are different URIs to a strict server.

## The Flow in Spring Security (A Preview)

```properties
# application.properties — the whole flow, configured:
spring.security.oauth2.client.registration.google.client-id=...
spring.security.oauth2.client.registration.google.client-secret=...
spring.security.oauth2.client.registration.google.scope=openid,profile,email
spring.security.oauth2.client.provider.google.issuer-uri=https://accounts.google.com
```

Spring Security's OAuth2 client implements the entire authorization-code flow (state, redirect handling, code exchange, PKCE where configured) from these properties. The next lessons show the *server* side (resource server validation) and the *identity* side (OIDC).

## Recap

The authorization code flow is the standard behind every social login: the user authenticates at the auth server (password never touches your app), receives a single-use **code** via redirect (guarded by `state` against CSRF), and only the client's backend — holding the **client secret** — exchanges it for tokens. **PKCE** extends the flow to public clients (SPAs/mobile) by replacing the secret with a verifier/challenge hash pair, defeating code interception. The three disciplines: verify `state` always, keep redirect URIs an exact-match allowlist, and let the secret live only server-to-server. Spring Security configures the entire ceremony from properties — but understanding the steps is what lets you debug it when it doesn't work.
