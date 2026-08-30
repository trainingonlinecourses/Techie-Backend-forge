---
title: OpenID Connect — OAuth2 Plus Identity
module: oauth2-oidc
order: 4
minutes: 26
topics: ["OpenID Connect", "ID token", "discovery", "userinfo", "claims", "authentication"]
summary: OAuth2 answers "what can this app do for the user?" — but it famously does not answer "who is the user?" A resource server can verify a token's val...
docs:
  - title: "OpenID Connect Core 1.0"
    url: "https://openid.net/specs/openid-connect-core-1_0.html"
  - title: "OIDC Discovery 1.0"
    url: "https://openid.net/specs/openid-connect-discovery-1_0.html"
---

# OpenID Connect — OAuth2 Plus Identity

## The Concept: Who Are You? (Not Just: What May You Do?)

OAuth2 answers "what can this app do *for* the user?" — but it famously does **not** answer "who *is* the user?" A resource server can verify a token's validity and scope while remaining ignorant of the person behind it. **OpenID Connect (OIDC)** is OAuth2 extended with *authentication*: it adds the **ID token** — a JWT asserting the user's identity — plus standardized discovery and user-profile endpoints. "Sign in with Google" is OIDC; the API call afterward is OAuth2.

**The mental model:** OAuth2 is the valet key (access); OIDC is the *photo ID* (identity). When you sign in with Google, you get both: the ID token is the ID card the app checks to know it's you ("Ada, verified by Google"), and the access token is the valet key it uses to act for you. The distinction is why the two coexist: authorization without authentication is meaningless ("this app may read lessons — for whom?"), and OIDC is the standard way to add the "for whom."

## The ID Token

The ID token is a JWT with a special purpose and standardized claims:

```json
{
  "iss": "https://accounts.google.com",     // the identity provider
  "sub": "110539264789...",                 // the USER's stable identifier
  "aud": "academy-app",                     // the CLIENT (your app!) is the audience
  "exp": 1738434600,
  "iat": 1738431000,
  "nonce": "abc123",                        // anti-replay: ties token to THIS login
  "email": "ada@example.com",
  "email_verified": true,
  "name": "Ada Lovelace",
  "picture": "https://.../photo.jpg",
  "at_hash": "..."                          // binds the ID token to the access token
}
```

**The critical difference from the access token:** the ID token's **audience is the *client* (your app)**, not a resource server. The access token is for the API; the ID token is for your application to establish the user's identity. The `sub` claim is the durable user identifier — the value you store in your users table (the `sub` from Google is *stable* for a given user+client, unlike an email that can change).

**The validation checklist for the ID token (client-side):** signature (verify with the issuer's public key), `iss` (the expected identity provider), `aud` (must be *your client id*), `exp` (fresh), and **`nonce`** — the anti-replay claim: your app sends a random nonce at login start and verifies it comes back in the ID token, proving this token belongs to *this* login session, not a replayed one.

## Discovery: The Machine-Readable Doorway

OIDC's big standardization win: every provider exposes its configuration at a **well-known discovery endpoint**:

```json
GET https://auth.academy.com/.well-known/openid-configuration
{
  "issuer": "https://auth.academy.com",
  "authorization_endpoint": "https://auth.academy.com/oauth2/authorize",
  "token_endpoint": "https://auth.academy.com/oauth2/token",
  "jwks_uri": "https://auth.academy.com/oauth2/jwks",
  "userinfo_endpoint": "https://auth.academy.com/oauth2/userinfo",
  "scopes_supported": ["openid", "profile", "email"],
  "response_types_supported": ["code"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"]
}
```

**Why discovery matters:** a client needs *six* endpoints and behaviors configured to integrate with a provider. Discovery reduces that to *one URL* (the issuer) — the client fetches everything else. This is exactly why Spring Security's `spring.security.oauth2.client.provider.google.issuer-uri=...` works with one line: the framework reads the discovery document and configures itself. The `jwks_uri` in the document is how the client finds the keys to verify ID tokens (the JWKS from the previous lesson).

## The UserInfo Endpoint

The ID token carries basic identity; the **UserInfo endpoint** returns the full standardized profile — called with the *access* token (never the ID token):

```text
GET https://auth.academy.com/oauth2/userinfo
Authorization: Bearer <access_token>

{
  "sub": "110539264789...",
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "email_verified": true,
  "picture": "https://.../photo.jpg"
}
```

The `sub` here must match the ID token's `sub` — that's the consistency check binding the two tokens to the same user.

## The OIDC Flow (Authorization Code + OIDC)

The flow is the authorization-code flow *plus* the identity claims:

```text
1. Client -> Auth Server:  GET /authorize?scope=openid%20profile%20email&nonce=abc123...
   (note: the `openid` scope is what makes it OIDC instead of plain OAuth2)
2. User authenticates; consents to the scopes.
3. Redirect back with the code.
4. Client backend: POST /token with the code + secret.
5. Response: { access_token, id_token, refresh_token }   <- BOTH tokens
6. Client VALIDATES the ID token (signature, iss, aud=client_id, exp, nonce).
7. Client may call /userinfo with the access token for full profile.
8. Client creates/updates its local user from sub + profile claims.
```

**Step 1 is the on/off switch:** including `openid` in the scope is what makes the provider issue an ID token and behave as OIDC. Without it, you get plain OAuth2 — tokens but no identity.

## OIDC in Spring Security: The Login Flow

```properties
# The client side — one issuer URI configures the entire OIDC flow:
spring.security.oauth2.client.registration.google.client-id=xxx
spring.security.oauth2.client.registration.google.client-secret=xxx
spring.security.oauth2.client.registration.google.scope=openid,profile,email
spring.security.oauth2.client.provider.google.issuer-uri=https://accounts.google.com
```

```java
// The authenticated user arrives with identity claims available:
@GetMapping("/me")
public Map<String, Object> me(Authentication authentication) {
    // OIDC puts the ID-token claims (sub, name, email...) on the principal:
    var idToken = ((OidcUser) authentication.getPrincipal()).getClaims();
    return Map.of(
        "sub", idToken.get("sub"),
        "name", idToken.get("name"),
        "email", idToken.get("email"));
}
```

Spring Security's OAuth2 *client* support (with `spring-boot-starter-oauth2-client`) runs the entire flow — discovery, code exchange, ID-token validation (including nonce), and UserInfo — and presents the user as an `OidcUser` carrying the claims. The pattern for your app: store the `sub` + email on first login, upsert into your users table, and treat subsequent logins as identity confirmation.

## OIDC vs the Alternatives

- **OIDC** — the standard for "let another provider authenticate my users" (Google, GitHub, Keycloak, Azure AD). Use it for social login and enterprise SSO.
- **SAML** — the enterprise predecessor; XML-based, still dominant in legacy corporate SSO. OIDC is the modern replacement.
- **JWT + your own login form** — fine when you control both ends (your auth server issues your tokens); OIDC is for delegating identity to an external provider.
- **Spring Authorization Server** — how you *become* the OIDC provider (issue ID tokens for your own ecosystem) — the next lesson's territory.

## Recap

OpenID Connect layers authentication on OAuth2: the **ID token** (a JWT whose *audience is the client*, asserting the user's identity via `sub`, `email`, `name`) plus **discovery** (one well-known URL exposing every endpoint) and the **UserInfo** endpoint. The `openid` scope is the switch that activates it; the ID token's validation (signature, `iss`, `aud` = your client id, `exp`, **nonce**) is what makes the identity trustworthy. Spring Security's OAuth2 client runs the whole flow from an issuer URI, handing you an `OidcUser` with the claims. The mental model to keep: **access token = what the app may do (OAuth2); ID token = who the user is (OIDC)** — two tokens, one login, complementary jobs.
