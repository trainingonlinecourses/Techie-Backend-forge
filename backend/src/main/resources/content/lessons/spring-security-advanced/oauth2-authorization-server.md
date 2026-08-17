---
title: OAuth2 — Building an Authorization Server
summary: Running your own authorization server with Spring Authorization Server — client registration, the authorization code flow, token endpoints and PKCE.
order: 1
minutes: 16
topics: [oauth2, authorization server, authorization code flow, pkce, client registration]
docs:
  - https://docs.spring.io/spring-authorization-server/reference/
  - https://oauth.net/2/
---

# OAuth2 — Building an Authorization Server

## The cast of OAuth2

OAuth2 is about **delegated authorization** — a third party gets a token to act on a user's behalf, without the password. Four roles:

- **Resource owner** — the user.
- **Client** — the app asking for access (your SPA, a mobile app, a service).
- **Authorization Server (AS)** — issues tokens after the user consents (that's what this lesson builds).
- **Resource Server (RS)** — serves protected data, validates tokens (the next lesson).

Spring's split: **Spring Security** does login/sessions inside an app; **Spring Authorization Server** is the *token-issuing* component — login, consent and token issuance, packaged as `spring-authorization-server`.

## Client registration: who may talk to you

Clients are registered server-side (JDBC-backed `RegisteredClientRepository` in production):

```java
@Bean
RegisteredClientRepository clientRepository(JdbcTemplate jdbc) {
    RegisteredClient client = RegisteredClient.withId(UUID.randomUUID().toString())
        .clientId("spa-client")
        .clientSecret("{noop}")                       // public client (SPA) — no secret
        .clientAuthenticationMethod(ClientAuthenticationMethod.NONE)
        .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
        .authorizationGrantType(AuthorizationGrantType.REFRESH_TOKEN)
        .redirectUri("https://app.example.com/callback")
        .postLogoutRedirectUri("https://app.example.com")
        .scope("openid", "profile", "orders.read")
        .build();
    return new JdbcRegisteredClientRepository(jdbc);
}
```

The client type matters: **public clients** (SPAs, mobile) have no secret and must use **PKCE**; **confidential clients** (server backends) authenticate with `client_id` + `client_secret`.

## The authorization code flow (with PKCE)

The sequence behind every "Sign in with …" button:

```
1. Client → AS:  /oauth2/authorize?client_id=spa-client&response_type=code
                  &redirect_uri=...&code_challenge=<hash>&scope=orders.read
2. AS:            user logs in (Spring Security login page) → consent screen
3. AS → redirect: redirect_uri?code=<one-time-code>
4. Client → AS:   POST /oauth2/token  code + code_verifier (PKCE proof) + client_id
5. AS → client:   { access_token, refresh_token, id_token }
6. Client → RS:   GET /orders  Authorization: Bearer <access_token>
```

- **PKCE** (RFC 7636): the SPA sends a `code_challenge` (hash of a random verifier) in step 1 and proves knowledge of the verifier in step 4 — an eavesdropped `code` is useless without it. **SPAs must always use PKCE**.
- The `code` is single-use and short-lived; it's exchanged server-side for tokens.
- **`id_token`** (OIDC) is the "who is the user" token (JWT with subject/claims); the `access_token` is the "what may this client do" token (opaque or JWT).

## Configuring the server

```java
@Configuration
@EnableWebSecurity
public class AuthorizationServerSecurityConfig {

    @Bean
    @Order(1)
    SecurityFilterChain authServer(HttpSecurity http) throws Exception {
        http.securityMatcher("/oauth2/**", "/.well-known/openid-configuration")
            .oauth2ResourceServer(rs -> rs.jwt(...))     // token introspection endpoints
            .exceptionHandling(...);
        return http.build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain defaultSecurity(HttpSecurity http) throws Exception {
        http.formLogin(Customizer.withDefaults());       // the user login screen
        return http.build();
    }

    @Bean
    JwtEncoder jwtEncoder(RSAPublicKey pub, RSAPrivateKey priv) { ... }
}
```

Out of the box you get `/oauth2/authorize`, `/oauth2/token`, `/oauth2/jwks` (public keys for RS verification), and `/.well-known/openid-configuration` (the discovery document clients fetch to find endpoints).

## Consent and user info

- Spring Authorization Server renders the **consent screen** automatically (which scopes does the client request?); consent records persist in `OAuth2AuthorizationConsent` tables.
- `/userinfo` (OIDC) returns the profile claims for clients that hold an `openid` scope token.
- The JDBC schema (`oauth2-registered-client-schema.sql`, `oauth2-authorization-schema.sql`) is required for anything beyond a demo — the in-memory default loses registrations and authorizations on restart.

## When to run your own AS

| Run your own | Use a provider (Auth0, Keycloak, Okta…) |
|---|---|
| You're the identity platform (your users ARE the product) | Time-to-market matters; enterprise SSO/SAML needed |
| Full control of token claims and consent UX | Compliance certifications (SOC2, etc.) a provider already holds |
| Token format must match internal RS requirements | Multi-tenant SaaS where isolation is core |

Keycloak (open source) sits between: self-hosted, full OIDC, but pre-built — most teams that "need their own AS" actually need Keycloak, not a from-scratch Spring AS. Build the Spring AS when the *integration contract* with your own services is the point.

## Key takeaways

- OAuth2 = delegated authorization: AS issues tokens, RS validates them, the client never sees the password.
- Authorization code + PKCE is the flow for SPAs; confidential clients use client secrets.
- Spring Authorization Server = `/oauth2/authorize` + `/oauth2/token` + JWKS + discovery, with JDBC-backed registrations in production.
- Evaluate Keycloak/identity providers before building your own AS — the Spring AS shines when you own the token contract.

Official docs: [Spring Authorization Server](https://docs.spring.io/spring-authorization-server/reference/) · [OAuth2.net](https://oauth.net/2/)
