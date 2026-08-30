---
title: OAuth2 Production Practices — Refresh Tokens, Rotation, and Security
module: oauth2-oidc
order: 5
minutes: 26
topics: ["refresh tokens", "token rotation", "client credentials", "security best practices", "Spring resource server"]
docs:
  - title: "Refresh Token Grant (RFC 6749 §6)"
    url: "https://datatracker.ietf.org/doc/html/rfc6749#section-6"
  - title: "OAuth 2.0 Security Best Practices (draft-ietf)"
    url: "https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics"
summary: The previous lessons covered getting tokens. Production is about managing them: what happens when the access token expires (refresh tokens), how to...
---

# OAuth2 Production Practices — Refresh Tokens, Rotation, and Security

## The Concept: The Token Lifecycle and the Attack Surface

The previous lessons covered *getting* tokens. Production is about *managing* them: what happens when the access token expires (refresh tokens), how to keep long-lived sessions safe (rotation), and how the machine-to-machine flow (client credentials) fits. Every piece of this lesson is a *security decision* — the OAuth2 ecosystem's consensus on how to balance convenience against the realities of stolen tokens, leaked secrets, and long-lived sessions.

**The mental model:** the access token is a short-lived key card that expires every 15 minutes; the **refresh token** is the *membership card* that gets you a new key card without re-authenticating. The membership card is far more powerful (it's valid for days and can mint new access tokens), so it must be guarded more strictly — and the modern standard, **refresh token rotation**, makes it *single-use*: every refresh *replaces* the membership card, so a stolen one becomes worthless the moment it's used.

## The Token Lifecycle

```text
Login ──▶ access_token (15 min) + refresh_token (7 days)
              │
              │ API call with access_token ── 200 OK
              │ ...15 minutes pass...
              ▼
API call with EXPIRED access_token ── 401
              │
              ▼
Client: POST /token  { grant_type: refresh_token, refresh_token: <rt> }
              │
              ▼
Auth server: validates the refresh token ── issues NEW access_token (+ NEW refresh_token)
              │
              ▼
Client continues with the fresh access_token
```

**The pattern:** access tokens are short (minutes) so a leaked token is dangerous only briefly; refresh tokens are long (hours-days) so users don't re-authenticate constantly — but they're *high-value* and must be protected (server-side storage, secure storage on mobile, rotation). When the client gets a `401` with an expired access token, it transparently refreshes and retries — the standard client-side logic every OAuth2 library implements.

## Refresh Token Rotation

**The vulnerability without rotation:** a stolen refresh token works forever (until expiry) — the thief keeps minting fresh access tokens, and the legitimate user's session and the thief's are indistinguishable. **Refresh token rotation** fixes it: the auth server issues a *new* refresh token on every refresh and **invalidates the old one**.

```java
// Client side — with rotation, the refresh becomes a swap:
// old refresh token is used ONCE; the response carries its replacement.
OAuth2RefreshToken newRefresh = refresh(oldRefresh);   // old is now DEAD

// Auth server side — the enforcement:
// 1. Refresh request with token R -> validate R
// 2. Issue NEW refresh token R' (a fresh random value)
// 3. INVALIDATE R immediately
// 4. (Reuse detection) if R is presented again -> it was stolen/copied:
//    revoke the ENTIRE session (the family of tokens)
```

**The reuse-detection bonus:** if an attacker *replays* a rotated-out refresh token, the server sees a token that was already used — a strong theft signal — and can revoke the whole token family (the user's session). This is the current best practice (and the default in Spring Authorization Server) — it converts token theft from "silent and permanent" into "detected and contained."

## Client Credentials: The Server-to-Server Flow

The most common flow in microservice architectures — no user involved:

```java
// The client (your backend) authenticates with its OWN credentials:
POST https://auth.academy.com/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=payments-service
&client_secret=<the service's secret>
&scope=read:orders

// Response: { "access_token": "...", "token_type": "Bearer", "expires_in": 3600 }
```

**The security discipline:**
- **One client identity per service** — `client_id` identifies *which* service is calling; the auth server's `scope` limits what it may do.
- **Secrets in the secret store** — the client secret lives in a vault/secrets manager, injected at deploy (the ConfigMap/Secret lesson's territory), never in the repo or image.
- **Short expiries + cached tokens** — clients cache the token until near-expiry and refresh then, avoiding a token request per call.
- **mTLS as the upgrade** — mutual TLS replaces the shared secret with certificate-based client authentication; the strongest server-to-server identity.

In Spring, this is the `WebClient`/`RestClient` OAuth2 integration — the client exchanges its client credentials for a token and attaches `Bearer` to outbound calls, refreshing automatically.

## The Production Security Checklist

1. **Access tokens: short (5–15 min), refresh tokens: single-use (rotation).** The two dials that bound a leak's damage.
2. **Secrets never in code or Git** — client secrets, signing keys, and refresh tokens all live in secret stores; scan repos for leaked secrets (gitleaks).
3. **The `state`/`nonce` parameters always** — CSRF and replay protection, never optional.
4. **Redirect URIs: exact-match allowlists** — no wildcards, every environment registered explicitly.
5. **JWKS-based key rotation** — the resource server fetches public keys dynamically; sign with the current key, publish both during rotation.
6. **Validate exp/iss/aud/algorithm on every token** — the four-check minimum (from the JWT lesson).
7. **Audit and revoke** — know your tokens, revoke on suspicion (refresh-token families make this possible), log authentication events.
8. **TLS everywhere** — tokens travel as `Bearer` headers; nothing in the chain travels without encryption.

## The Spring Implementation Recap

```properties
# Client side (calling APIs with tokens):
spring.security.oauth2.client.registration.payments.client-id=payments-service
spring.security.oauth2.client.registration.payments.client-secret=${PAYMENTS_SECRET}
spring.security.oauth2.client.registration.payments.authorization-grant-type=client_credentials
spring.security.oauth2.client.registration.payments.scope=read:orders
spring.security.oauth2.client.provider.payments.token-uri=https://auth.academy.com/oauth2/token

# Resource server side (protecting your API):
spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.academy.com
```

Spring Security configures both sides from properties: the *client* gets tokens and refreshes them automatically (with rotation support); the *resource server* validates JWTs locally via JWKS. The properties are the configuration; the lessons in this module are the model underneath.

## The Failure Modes to Know

- **Long-lived access tokens without refresh** — every request re-authenticates (bad UX) *or* tokens are long (bad security). The refresh-token pattern is the balanced answer.
- **Refresh tokens stored insecurely** — in localStorage, in plaintext files. Server: hashed in the DB; mobile: secure storage.
- **No rotation** — a stolen refresh token is a permanent backdoor; rotate and detect reuse.
- **Client secrets in the browser** — SPAs are public clients; PKCE exists precisely because a secret in the browser is not a secret.
- **Ignoring the `aud` claim** — a token for service A accepted by service B; the audience check exists to stop it.

## Recap

Production OAuth2 is token lifecycle management: short-lived access tokens (minutes) refreshed via long-lived **refresh tokens** — which modern practice makes **single-use with rotation**, converting theft from permanent into detectable. The **client-credentials flow** serves server-to-server calls (one client identity per service, secrets in the vault, cached short-lived tokens). The security checklist — short tokens, rotating refresh tokens, secrets in stores, state/nonce, exact redirect allowlists, JWKS rotation, full claim validation — is the consensus that makes delegation safe at scale. Spring Security configures the client and resource-server sides from properties; this module's lessons are the model that makes those properties comprehensible and debuggable when the tokens misbehave.
