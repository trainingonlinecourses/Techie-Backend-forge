---
title: Issuing JWTs — From Login to Token
module: spring-security-jwt-deep
order: 2
minutes: 25
topics: ["token issuance", "jjwt", "claims", "expiry", "login flow"]
summary: The issuance side of JWT auth is the login flow: the user presents credentials, the server verifies them, and — if valid — mints a token the user c...
docs:
  - title: "jjwt (Java JWT library)"
    url: "https://github.com/jwtk/jjwt"
---

# Issuing JWTs — From Login to Token

## The Concept: The Login Handshake

The **issuance** side of JWT auth is the login flow: the user presents credentials, the server verifies them, and — if valid — **mints a token** the user carries for subsequent requests. The token *encodes the identity and permissions* so future requests need no database lookup.

The flow:

```
1. POST /api/auth/login  {username, password}
2. Server: verify credentials against the user store
3. Server: build claims (subject, roles, issued-at, expiry)
4. Server: sign with the secret/private key
5. Server: respond  {accessToken: "eyJ..."}
6. Client: stores the token, sends it as "Authorization: Bearer <token>" on every request
```

The stateless win: after login, the server **doesn't remember you**. Every request carries its own proof. No session table, no server-side state — which is why JWT scales across many server instances (any instance can verify a token with the shared key).

## Choosing Claims — What Goes In

Good claims are **stable, small, and useful**:

```json
{
  "sub": "42",                       // the user id (never the username alone)
  "username": "sateesh",             // display convenience
  "roles": ["USER", "ADMIN"],        // authorization decisions
  "iat": 1755000000,                 // issued at
  "exp": 1755086400                  // expires in 24h
}
```

Rules:

- **Keep it small** — the token is sent on *every* request; a 10 KB token bloats every call. Only identity + roles + expiry.
- **No secrets, no PII-heavy data** — email addresses, phone numbers, and anything sensitive is readable by anyone holding the token.
- **Roles, not permissions lists** — put roles in the token; keep fine-grained permission checks server-side (tokens can't be instantly revoked).
- **`sub` is the stable user id** — if a username changes, the token's identity must not break.

## The Code Walkthrough

```java
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;

@Service
public class TokenService {

    private final SecretKey key;
    private final long expiryHours = 24;

    public TokenService(@Value("${app.jwt.secret}") String secret) {
        // Derive an HMAC key from the configured secret (HS256 needs >= 256-bit key)
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public String issueToken(User user) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(String.valueOf(user.getId()))          // sub
                .claim("username", user.getUsername())
                .claim("roles", user.getRoles())                 // e.g. ["USER","ADMIN"]
                .issuedAt(Date.from(now))                        // iat
                .expiration(Date.from(now.plus(expiryHours, ChronoUnit.HOURS)))  // exp
                .signWith(key)                                   // HS256 with our key
                .compact();                                      // produce the string
    }

    // The login endpoint uses this service:
    public String login(String username, String rawPassword) {
        User user = userStore.findByUsername(username);          // fetch user
        if (user == null || !passwordEncoder.matches(rawPassword, user.getPasswordHash())) {
            throw new BadCredentialsException("invalid credentials");
        }
        return issueToken(user);
    }
}
```

### Walking Through Each Part

**The key** — derived from the configured secret via `Keys.hmacShaKeyFor` (which enforces the minimum 256-bit length — a weak secret throws at startup, a good fail-fast). The secret lives in config (env var in prod), never in code.

**The builder** — `.subject(id)` sets `sub`; `.claim("roles", ...)` adds custom claims; `.issuedAt`/`.expiration` set the time window; `.signWith(key)` selects HS256 with the derived key; `.compact()` produces the final three-part token. The library handles base64url encoding and HMAC for you — your job is choosing the claims.

**The login** — verify the password with the `PasswordEncoder` (bcrypt `matches` — never compare raw passwords), then mint. On failure: `BadCredentialsException` — same message for "user not found" and "wrong password" (don't leak which one, it aids enumeration attacks).

## Password Verification — Why PasswordEncoder Matters

```java
// Spring Security's PasswordEncoder — bcrypt by default in modern Boot
PasswordEncoder encoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();

String hash = encoder.encode("correct horse battery staple");   // $2a$10$...
boolean ok = encoder.matches("correct horse battery staple", hash);   // true
boolean no = encoder.matches("guess", hash);                           // false
```

- **Never store raw passwords** — store the bcrypt hash (a salted, deliberately slow hash).
- **`matches` is constant-time-ish** — it compares hashes, not strings, so timing attacks can't recover the password.
- Argon2 (via `Argon2PasswordEncoder`) is the modern recommendation; bcrypt is the safe default.

## The Expiry Question — How Long Should a Token Live?

| Token lifetime | Trade-off |
|---|---|
| 15 min | Short — a stolen token is useful briefly; but users re-login often |
| 24 h | Balanced — reasonable UX, contained blast radius |
| 30 days | Convenient — a leaked token is dangerous for a month |

The industry pattern is **short access tokens + refresh tokens** (next lesson): an access token that expires in 15 minutes, and a refresh token that lives longer and can mint new access tokens. This bounds the damage of a stolen access token while keeping users logged in.

## Common Beginner Pitfalls

1. **Leaking which error** — "user not found" vs "wrong password" enables account enumeration. Use one generic message.
2. **No expiry** — tokens that never expire are a permanent backdoor.
3. **Roles in tokens but never re-checked** — roles stale if permissions change; tokens are snapshots. For critical changes, revoke (refresh flow, token versioning).
4. **A weak secret** — HS256 with a short/guessable secret is forgeable. Use 256+ random bits from env.
5. **Putting email/phone in claims** — readable by anyone holding the token; keep claims minimal.
6. **Issuing on every successful request** — mint at login (and refresh), not per request (wasteful, and log-noise).

## Key Takeaways

- Issuance = verify credentials → build claims → sign → return token.
- Keep claims small and stable: `sub` (user id), roles, `iat`, `exp`. No secrets, no PII.
- Use a library (jjwt) with a properly derived key; never hand-roll signing.
- Verify passwords with `PasswordEncoder` (bcrypt/Argon2) — never raw comparison.
- Always set `exp`; prefer short access tokens + refresh tokens.
- Same generic error for unknown user vs wrong password (anti-enumeration).
