---
title: JWT as Access Tokens — Structure, Signing, and Validation
module: oauth2-oidc
order: 3
minutes: 27
topics: ["JWT", "access tokens", "signature", "HS256", "RS256", "JWKS", "audience"]
docs:
  - title: "JWT (jwt.io)"
    url: "https://jwt.io/introduction"
  - title: "JSON Web Token (RFC 7519)"
    url: "https://datatracker.ietf.org/doc/html/rfc7519"
summary: OAuth2 access tokens come in two flavors: opaque (random strings the resource server must look up at the auth server) and JWT (selfcontained JSON t...
---

# JWT as Access Tokens — Structure, Signing, and Validation

## The Concept: The Self-Contained Token

OAuth2 access tokens come in two flavors: **opaque** (random strings the resource server must look up at the auth server) and **JWT** (self-contained JSON that carries its own claims and can be *verified locally*). JWTs are the modern default: a signed, structured token the resource server validates with cryptography alone — no network call to the auth server on every request.

**The mental model:** an opaque token is a claim check — you must go to the bank (auth server) to see what it's worth. A JWT is a *signed document* — like a notarized letter: you (resource server) can verify the notary's signature with a public key you already have, read the contents, and check the expiry — no phone call to the bank needed. The trade: a leaked JWT is readable (it's base64 JSON) and *statelessly valid* until expiry — so signatures, short expiries, and audience checks are the security that makes it safe.

## The Three Parts

A JWT is three base64url-encoded sections joined by dots:

```text
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9        <- header
.eyJzdWIiOiJ1c2VyLTEyMzQiLCJzY29wZXMiOiJyZWFkOndyaXRlIiwiZXhwIjoxNzM4NDM...  <- payload
.dGVzdC1zaWduYXR1cmU...                       <- signature
```

**Part 1 — the header:** `{"alg": "RS256", "typ": "JWT"}` — the signing algorithm and type. **The `alg` value is a security decision**: `HS256` (symmetric — one shared secret signs *and* verifies) vs `RS256`/`ES256` (asymmetric — private key signs, public key verifies). Production auth servers use **asymmetric (RS256)** so the resource server only needs the *public* key — a shared secret that leaked to every resource server would be a signing-key catastrophe.

**Part 2 — the payload (claims):**

```json
{
  "iss": "https://auth.academy.com",      // issuer — who signed it
  "sub": "user-1234",                     // subject — who it's about
  "aud": "https://api.academy.com",       // audience — who it's FOR
  "exp": 1738434600,                      // expiry — unix timestamp
  "iat": 1738431000,                      // issued-at
  "scope": "read:lessons write:progress", // the delegation limits
  "roles": ["student"]                    // app-specific claims
}
```

The registered claims (`iss`, `sub`, `aud`, `exp`, `iat`, `nbf`) are standardized; the rest are app-defined. **The resource server must validate `iss`, `aud`, and `exp`** — those three are what stop a token meant for someone else (or expired, or forged-issuer) from being accepted.

**Part 3 — the signature:** `HMACSHA256(base64url(header) + "." + base64url(payload), secret-or-private-key)`. Anyone can *read* the parts (they're just base64) — the signature is what proves the token wasn't *tampered with* and was issued by the party holding the key.

## Validation: What the Resource Server Checks

```java
// The resource server's validation checklist (what Spring Security does):
// 1. SIGNATURE — verify with the issuer's public key.
// 2. EXPIRY (exp) — reject if now > exp.
// 3. ISSUER (iss) — must match the expected authorization server.
// 4. AUDIENCE (aud) — must include THIS resource server.
// 5. NBF (not before) — reject if used too early.
// 6. ALGORITHM — must be a whitelisted algorithm (never "none"!).
```

**The attacks these checks prevent:**

- **Signature check** stops forgery — an attacker can't mint a token with `roles: ["admin"]` without the signing key.
- **The "alg: none" attack** — an attacker crafts a token with header `{"alg": "none"}` and no signature; a *naive* validator that trusts the header accepts it as valid. Every serious JWT library has `none` disabled by default; if you hand-roll validation, **whitelist algorithms explicitly**.
- **Audience check** stops token confusion — a token issued for `https://payments.example.com` presented to `https://lessons.example.com` must be rejected (the audience doesn't match). Without it, a token for any service in the ecosystem works everywhere.
- **Expiry check** limits the blast radius of a leaked token.

## Key Management: JWKS

For RS256, the resource server needs the issuer's **public key** — and it needs to handle key *rotation* (auth servers rotate keys periodically). The standard mechanism is **JWKS (JSON Web Key Set)**: the auth server publishes its public keys at a well-known URL (`https://auth.academy.com/.well-known/jwks.json`), and the resource server fetches and caches them, selecting by the token's `kid` (key id) header:

```json
GET https://auth.academy.com/.well-known/jwks.json
{
  "keys": [
    { "kty": "RSA", "kid": "key-2025-01", "n": "...", "e": "AQAB" },
    { "kty": "RSA", "kid": "key-2024-12", "n": "...", "e": "AQAB" }
  ]
}
```

**The rotation dance:** the token's header carries `kid` → the resource server picks the matching key from the cached JWKS → verifies. When the auth server rotates, it *publishes both keys* for a grace period (old tokens still validate with the old key) before dropping the old one. This is exactly what Spring Security's `NimbusJwtDecoder.withIssuerLocation(...)` implements — fetch JWKS, cache, rotate-aware verification.

## JWT in Spring Security (The Resource Server Side)

```properties
# The whole local-validation setup:
spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.academy.com
# -> Spring fetches the JWKS from the issuer, validates signature/exp/iss,
#    and populates the SecurityContext from the token's claims.
```

```java
@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
            // requests need a valid JWT; method-level security refines by
            // scope/authority:
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/lessons/**").hasAuthority("SCOPE_read:lessons")
                .anyRequest().authenticated());
        return http.build();
    }
}
```

**The Spring translation:** `issuer-uri` → fetch JWKS → validate every incoming `Authorization: Bearer <jwt>` → build an `Authentication` carrying the claims (subject, scopes, authorities). `hasAuthority("SCOPE_read:lessons")` enforces the token's scope at the endpoint — the resource-server enforcement of OAuth's delegation limits.

## The JWT Realities and Risks

1. **JWTs are NOT encrypted** — readable by anyone with the token. Never put secrets (passwords, PII beyond necessity) in claims. (JWE — encrypted JWTs — exists but is rare; JWTs are signed, not secret.)
2. **Stateless = hard to revoke.** A valid JWT is valid until `exp` — you can't "log out" a stolen JWT server-side without a denylist or short expiries + refresh tokens. That's the *design reason* for short access-token lifetimes (minutes) backed by refresh tokens (hours/days, revocable).
3. **The signature algorithm matters** — prefer RS256/ES256 (asymmetric); treat `none` and weak HMAC secrets as vulnerabilities.
4. **Always validate exp, iss, aud** — the three-claim minimum — plus `nbf` for strictness.
5. **Use established libraries** (jjwt, Nimbus via Spring) — hand-rolled base64+HMAC "validation" is where real JWT CVEs live.

## Recap

A JWT is a signed, self-contained token: header (algorithm), payload (claims — `iss`, `sub`, `aud`, `exp`, `scope`), and signature. The resource server validates it *locally*: signature via the issuer's public key (from JWKS, rotation-aware), `exp` (freshness), `iss` (right issuer), and `aud` (right audience) — rejecting forgery, expiry, and token confusion. Asymmetric signing (RS256) keeps the private key at the auth server while resource servers verify with public keys; short expiries plus refresh tokens compensate for the statelessness that makes JWTs hard to revoke. Spring Security wires the whole validation from `issuer-uri` — but the checklist (signature, exp, iss, aud, algorithm whitelist) is what you must understand to trust it and to debug when it fails.
