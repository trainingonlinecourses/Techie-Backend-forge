---
title: Validating JWTs — The Stateless Checkpoint
module: spring-security-jwt-deep
order: 3
minutes: 25
topics: ["JWT validation", "jjwt parser", "signature verification", "expiry check", "stateless auth"]
docs:
  - title: "jjwt parsing"
    url: "https://github.com/jwtk/jjwt#reading-a-jws"
---

# Validating JWTs — The Stateless Checkpoint

## The Concept: Every Request Re-Proves Itself

The validation side is the other half of the handshake. On **every** authenticated request, the server must answer: *"is this token genuine, untampered, and still valid?"* With JWT, that answer needs **no database, no session store, no shared memory** — just the token and the key.

The verification checklist, in order:

1. **Format** — does it look like a JWT (three base64url parts)?
2. **Signature** — recompute the HMAC over header+payload with the key; must match.
3. **Algorithm** — is it the algorithm we expect (and not `none`)?
4. **Expiry** — is `exp` still in the future?
5. **Issuer/audience** (optional but recommended) — does `iss`/`aud` match ours?

This is the *stateless* magic: any server instance holding the key can validate any token. Scale horizontally, validate everywhere, no shared session state.

## The Code Walkthrough

```java
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;

@Service
public class TokenValidator {

    private final SecretKey key;

    public TokenValidator(@Value("${app.jwt.secret}") String secret) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Returns the claims if the token is valid, otherwise throws.
     */
    public Claims validate(String token) {
        return Jwts.parser()
                .verifyWith(key)              // 1. pin the key (=> algorithm fixed)
                .requireIssuer("academy-api") // 2. issuer must match
                .build()
                .parseSignedClaims(token)     // 3. verifies signature + expiry, parses claims
                .getPayload();
    }

    public boolean isValid(String token) {
        try {
            validate(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;                    // expired, tampered, malformed, wrong issuer
        }
    }
}
```

### Walking Through Each Part

**`verifyWith(key)`** — the most important line. It pins the verification key, which *implicitly pins the algorithm*: the library will only accept signatures made with this key under an algorithm it deems safe (jjwt rejects `none` and weak algorithms by default). This is the fix for the famous `alg: none` and algorithm-confusion attacks.

**`requireIssuer("academy-api")`** — verifies the `iss` claim matches ours. If your app accepts tokens from anywhere, a token signed with a *different* service's key (or a leaked one) would pass the signature check — the issuer check bounds trust to our own tokens.

**`parseSignedClaims(token)`** — does the heavy lifting: base64url-decodes the three parts, recomputes the HMAC over header+payload, compares with the signature (tamper detection), **checks `exp` automatically** (throws `ExpiredJwtException` if past), and parses the claims JSON. Any failure throws a `JwtException` subclass — malformed, tampered, and expired tokens are all rejected.

**The try/catch** — validation failures are *expected* (expired tokens, bad input) — catch and treat as unauthenticated. In a Spring Security filter, a validation failure means "no principal" — the request proceeds as anonymous and hits a 401 at the authorization check.

## Where Validation Runs — The Security Filter

Validation happens in a **filter** that runs before your controllers:

```java
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.filter.OncePerRequestFilter;

public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final TokenValidator validator;

    public JwtAuthenticationFilter(TokenValidator validator) { this.validator = validator; }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) {

        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);
            try {
                var claims = validator.validate(token);

                // Build Spring Security's authentication object from the claims
                var authorities = claims.get("roles", java.util.List.class).stream()
                        .map(r -> new SimpleGrantedAuthority("ROLE_" + r))
                        .toList();

                var auth = new UsernamePasswordAuthenticationToken(
                        claims.getSubject(), null, authorities);

                // Place it in the SecurityContext — controllers can now see the user
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (Exception e) {
                // invalid token -> leave the context empty (request stays anonymous)
            }
        }
        chain.doFilter(request, response);
    }
}
```

### Walking Through Each Part

**The filter position** — `OncePerRequestFilter` runs once per request, before the servlet hands off to controllers. Every request passes through: if the `Authorization: Bearer ...` header is present and validates, the SecurityContext is populated; otherwise the request proceeds anonymous.

**From claims to authentication** — the token's `sub` becomes the principal's name; `roles` claims become `GrantedAuthority`s (`ROLE_USER`, `ROLE_ADMIN`). This is how `@PreAuthorize("hasRole('ADMIN')")` and `hasAuthority(...)` in your security config know the caller's permissions — all from the token, no lookup.

**Invalid → anonymous** — a failed validation leaves the context empty; the request continues and hits `401` at the endpoint's authorization check. This is the classic JWT filter shape (Spring Security 6 has built-in OAuth2 resource-server support that does exactly this with `oauth2ResourceServer().jwt()` — covered in the advanced security module).

## Token Lifecycle Checks — The Full Picture

| Check | When it fails | Result |
|---|---|---|
| Signature | Tampered or forged | Reject |
| `exp` | Past the expiry | Reject (`ExpiredJwtException`) |
| `iss`/`aud` | Wrong issuer/audience | Reject |
| User still exists | User deleted | **Not detectable from the token** — needs a lookup or refresh flow |
| Roles changed | User demoted | **Not detectable** — stale until expiry/refresh |

The honest limitation: **JWT validation is stateless, so it can't see account changes.** A deleted user's token keeps working until `exp`. That's the trade-off of statelessness — you accept a bounded window (the token's lifetime) or add a revocation layer (refresh tokens with server-side checks, token version, blacklist for high-value actions).

## Common Beginner Pitfalls

1. **Parsing without `verifyWith`** — `Jwts.parser().build().parse(...)` accepts unsigned tokens (`alg: none`). Always verify.
2. **Ignoring `exp`** — some old examples parse claims and forget expiry; jjwt checks it by default, but if you hand-roll, *you* must check `exp`.
3. **Trusting the `alg` from the header** — never switch verification behavior based on the header's `alg`; pin the key/algorithm.
4. **Logging tokens** — tokens are credentials; never log the full token.
5. **Catching everything as "invalid"** — that's fine for auth, but log *why* (expired vs tampered) for ops visibility.
6. **Relying on tokens for instant revocation** — stateless means stale until expiry; design the refresh/revocation story for privileged operations.

## Key Takeaways

- Validation = signature recompute + algorithm pin + expiry + issuer — all stateless, key-only.
- `verifyWith(key)` pins the key/algorithm — the security-critical line.
- `requireIssuer(...)` bounds which tokens your app trusts.
- Validation lives in a security filter that populates the SecurityContext from claims.
- Failed validation = anonymous request → 401 at authorization.
- Stateless tokens can't see account changes — bounded staleness is the accepted trade-off.
