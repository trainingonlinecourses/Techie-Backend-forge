---
title: OAuth2 Overview — Roles, Grants, and the Protocol
module: oauth2-oidc
order: 1
minutes: 27
topics: ["OAuth2", "authorization server", "resource server", "scopes", "grants", "tokens"]
docs:
  - title: "OAuth 2.0 (RFC 6749)"
    url: "https://datatracker.ietf.org/doc/html/rfc6749"
  - title: "OAuth2 Concepts (oauth.net)"
    url: "https://oauth.net/2/"
---

# OAuth2 Overview — Roles, Grants, and the Protocol

## The Concept: Delegate Access Without Sharing Passwords

The worst way to let an app access your data on another service is to hand over your password — the app then has *total, permanent, unrevocable* access, and the service can't tell the app's actions from yours. **OAuth 2.0** is the industry's answer: a protocol for *delegated authorization* — an app gets a **limited, revocable, scoped** access token instead of your credentials.

**The mental model:** think of a hotel valet. You don't give the valet your house keys (password). Instead, the front desk (authorization server) issues a *valet key* (access token) that opens only the car door, works for one hour, and can be cancelled at any time. The car (resource server) accepts the valet key without ever seeing your house key. That's OAuth: you (resource owner) authorize an app (client) to act within defined limits (scopes) for a limited time (expiry) through a trusted third party (authorization server).

**Why this matters for a Spring developer:** when your app offers "Sign in with Google" or calls the GitHub API on a user's behalf, or when you build an API that other apps call with tokens — all of that is OAuth2. Understanding the roles and flows is what makes Spring Security's OAuth2 support (client, resource server, authorization server) comprehensible instead of magic.

## The Four Roles

- **Resource Owner** — the user (or system) who owns the data and grants access.
- **Client** — the application requesting access (your Spring Boot app, a mobile app, an SPA).
- **Authorization Server** — the trusted issuer of tokens (Google, GitHub, Keycloak, Spring Authorization Server). Authenticates the resource owner and issues tokens.
- **Resource Server** — the API protecting the data (your Spring Boot API, GitHub's API). Accepts and validates access tokens.

**The fundamental principle:** the resource server and authorization server never share the user's password. The password (or other credentials) travels only between the user and the authorization server; everything else flows through **tokens**.

## The Token: The Valet Key

The **access token** is the currency of OAuth2 — an opaque or self-contained credential carrying *what the holder may do*:

```text
Access token (a JWT, for example):
  - issuer:   https://auth.academy.com
  - audience: https://api.academy.com
  - subject:  user-1234
  - scopes:   ["read:lessons", "write:progress"]
  - expiry:   2025-02-01T10:30:00Z
```

**The properties that matter:**
- **Scopes** — the *limits* of delegation: "read:lessons" but not "admin". The client asks for scopes; the authorization server grants (or refuses) them; the resource server enforces them.
- **Expiry** — the token is short-lived (minutes to hours) by design: a leaked token is dangerous only briefly.
- **Revocability** — the token can be invalidated (via the authorization server) without touching the user's password.

## The Grant Types: The Five Flows

OAuth2 defines *grant types* — the ways a client can obtain a token, chosen by the client's nature:

| Grant | Who | Typical use |
|---|---|---|
| **Authorization Code** | server-side web app (confidential client) | the classic flow — "Sign in with Google" |
| **Authorization Code + PKCE** | SPA / mobile (public client) | the modern SPA flow (PKCE = proof key) |
| **Client Credentials** | server-to-server (machine-to-machine) | your backend calling another backend's API |
| **Refresh Token** | any long-lived client | get new access tokens without re-login |
| **Resource Owner Password** | legacy/first-party only | deprecated — discouraged |

**The two you'll use most:**

1. **Authorization Code** — the user authenticates *at the authorization server* (never at your app), your app receives a one-time *code*, exchanges it for tokens. The user's password never touches your app — the security win that makes the flow standard.

2. **Client Credentials** — no user involved: the *client itself* authenticates with its own credentials (client id + secret) and gets a token for its own API calls. This is the flow for server-to-server integration — the one most Spring microservices use when calling each other.

## Scopes in Practice

```text
Client asks:  scope=read:lessons write:progress
User approves at the consent screen:  [x] read lessons  [x] save progress
Token issued: scopes: ["read:lessons", "write:progress"]

API call:  GET /api/lessons     with the token
Resource server checks: does the token's scope include "read:lessons"?  -> 200
API call:  DELETE /api/users    with the same token
Resource server checks: scope "admin"? Not present -> 403
```

**Scopes are the granularity of delegation** — the difference between "this app can see my lessons" and "this app can do anything." The consent screen is where the resource owner sees and approves the scopes. The resource server *enforces* them on every request.

## The Protocol in One Flow

The **Authorization Code flow** step by step (the "Sign in with Google" anatomy):

```text
1. Browser -> Client:            "sign in with Google" clicked
2. Browser -> Auth Server:       GET /authorize?client_id=app&redirect_uri=...&scope=...
3. (User authenticates at Google — Google's page, not yours)
4. Browser <- Auth Server:       302 redirect to redirect_uri?code=one-time-code
5. Client -> Auth Server:        POST /token with the code + client credentials
6. Client <- Auth Server:        { access_token, refresh_token, expires_in }
7. Client -> Resource Server:    GET /api/data  Authorization: Bearer <access_token>
8. Resource Server:              validates the token (signature, expiry, audience)
9. Resource Server -> Client:    200 + data
```

**The three security pillars to notice:** the password stays at the auth server (step 3); the code is one-time and exchanged for tokens only with client credentials (step 5 — so a stolen redirect can't be replayed by a stranger); and the resource server never contacts the user — it validates the token itself (step 8, via signature).

## OAuth2 vs OIDC: The One-Sentence Distinction

OAuth2 is *authorization* — "what can this app do?" **OpenID Connect (OIDC)** is OAuth2 *plus authentication* — "who is the user?" OIDC adds the **ID token** (a JWT proving identity) and the `openid` scope, layered on the same flows. When you "sign in with Google," OIDC answers *who you are*; OAuth2 answers *what the app may do*. The next lessons build on this distinction.

## Recap

OAuth2 is delegated authorization: a resource owner grants a client limited, revocable, scoped access to a resource server's data through a trusted authorization server — without ever sharing a password. The four roles (owner, client, auth server, resource server) and the token (with its scopes, expiry, and audience) are the vocabulary; the grant types (authorization code, client credentials, refresh, PKCE) are the flows suited to each client type; and the protocol's genius is keeping credentials at the auth server while everything downstream works with tokens. Master the roles and the flows, and Spring Security's OAuth2 support — and the "sign in with Google" everywhere — becomes a protocol you can read, not a black box.
