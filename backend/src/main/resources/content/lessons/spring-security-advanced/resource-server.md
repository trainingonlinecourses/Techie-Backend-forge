---
title: OAuth2 — Building a Resource Server
summary: Securing APIs with Bearer tokens — JWT validation against a JWKS endpoint, opaque-token introspection, and scopes/claims mapped to authorities.
order: 2
minutes: 15
topics: [oauth2 resource server, jwt validation, jwks, bearer token, scopes]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/index.html
  - https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html
---

# OAuth2 — Building a Resource Server

## The resource server's job

The resource server (RS) protects data and **validates tokens without talking to the AS on every request** — that's the scalability trick of OAuth2. The RS trusts the AS's signature (JWT: verify with the public key from `/oauth2/jwks`) or its introspection endpoint (opaque tokens). No shared session, no per-request round trip.

## JWT resource server: three lines of config

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://auth.example.com   # discovery → JWKS endpoint
          # or explicitly: jwk-set-uri: https://auth.example.com/oauth2/jwks
```

```java
@Configuration
@EnableWebSecurity
public class ResourceServerConfig {

    @Bean
    SecurityFilterChain api(HttpSecurity http) throws Exception {
        http.securityMatcher("/api/**")
            .oauth2ResourceServer(rs -> rs.jwt(Customizer.withDefaults()))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/public/**").permitAll()
                .anyRequest().authenticated());
        return http.build();
    }
}
```

What happens per request: extract `Authorization: Bearer <jwt>` → verify signature against the **JWKS** public key → check `exp`/`iss`/`aud` → build the `Authentication` with claims. Stateless, fast, no AS round trip.

## Scopes and authorities

The token's **`scope` claim** is the authorization contract. Map scopes to authorities and enforce with the tools you know:

```java
.oauth2ResourceServer(rs -> rs.jwt(jwt -> jwt.jwtAuthenticationConverter(
    jwt -> new JwtAuthenticationToken(jwt, extractAuthorities(jwt)))))
```

```java
List<GrantedAuthority> extractAuthorities(Jwt jwt) {
    return jwt.getClaimAsStringList("scope").stream()
        .map(s -> new SimpleGrantedAuthority("SCOPE_" + s))   // SCOPE_orders.read
        .toList();
}

@PreAuthorize("hasAuthority('SCOPE_orders.read')")
public List<Order> listOrders() { ... }      // method security on the resource
```

Convention: `SCOPE_<scope>` as the authority name (Spring's default). A token with only `profile` scope can't read orders — **authorization is scope-based, not role-based**, because the RS knows nothing about the user's roles inside the client's session.

## JWT validation details that matter

- **Issuer validation** — `issuer-uri` pins the expected issuer; `jwt.getIssuer()` must match, or an attacker's token from another AS is accepted. The decoder caches the JWKS and rotates keys automatically.
- **Audience** — if tokens carry `aud`, validate it (`jwtAuthenticationConverter` or a custom `JwtDecoder` with `OAuth2TokenValidator<Jwt>`): a token minted for the SPA must not work on the backend RS.
- **Clock skew** — `exp`/`nbf` checks allow small skew by default; for long-lived JWTs, the RS is only as secure as the token lifetime — prefer **short-lived JWTs + refresh tokens**.
- **`NimbusJwtDecoder`** is the default and handles JWKS rotation; override it when you need custom validators (audience, custom claims).

## Opaque tokens: when you can't verify signatures

Some ASs issue opaque (random) tokens — the RS must call the introspection endpoint per request:

```yaml
spring.security.oauth2.resourceserver.opaquetoken:
  introspection-uri: https://auth.example.com/oauth2/introspect
  client-id: resource-server
  client-secret: ${RS_SECRET}
```

```java
.oauth2ResourceServer(rs -> rs.opaqueToken(Customizer.withDefaults()))
// Authentication built from introspection response (active, scope, sub…)
```

JWT is usually preferable (no per-request call, works offline), but opaque tokens win when **revocation must be immediate** (a JWT lives until `exp`; an opaque token dies the moment you revoke it at the AS).

## Securing the SPA + RS split

The full architecture: **SPA → AS (login, PKCE) → RS (Bearer)**.

- The SPA stores the access token in memory (short-lived) and refreshes via the refresh token — the resource server never sees session cookies.
- The RS trusts only the token; it should **never** accept the SPA's cookies as proof of identity.
- CORS + the RS: the RS must allow the SPA's origin and the `Authorization` header (the CORS lesson's `allowedOrigins` covers it — with credentials **disabled**, since Bearer headers aren't cookies).

## Testing the resource server

```java
// Generate a signed JWT in the test and hit the endpoint:
@Test
void tokenWithScopeCanRead() {
    String token = JwtUtil.testToken("orders.read");
    mockMvc.perform(get("/api/orders").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk());
}

@Test
void noTokenIsRejected() { mockMvc.perform(get("/api/orders")).andExpect(status().isUnauthorized()); }
```

Test both sides of the coin: valid-scope success and missing/invalid-token rejection — the security-testing lesson's patterns apply unchanged.

## Key takeaways

- RS validates tokens locally (JWKS signature) — no per-request AS calls, stateless by design.
- Enforce authorization by **scope** (`SCOPE_` authorities) with `@PreAuthorize`; validate issuer, audience and expiry.
- Opaque tokens = introspection per request, but instant revocation; JWTs = fast and offline but live until `exp`.
- The SPA↔RS trust boundary is the token, never cookies.

Official docs: [OAuth2 Resource Server](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/index.html) · [JWT specifics](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html)
