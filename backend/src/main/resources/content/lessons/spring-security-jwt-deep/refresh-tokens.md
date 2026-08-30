---
title: Refresh Tokens — Staying Logged In Safely
module: spring-security-jwt-deep
order: 4
minutes: 27
topics: ["refresh tokens", "token rotation", "revocation", "logout", "sliding sessions"]
docs:
  - title: "OAuth 2.0 refresh tokens (RFC 6749 §1.5)"
    url: "https://datatracker.ietf.org/doc/html/rfc6749#section-1.5"
summary: A single longlived JWT is a liability: a stolen token works until expiry, and you can't revoke it (stateless). A single shortlived token is a UX ni...
---

# Refresh Tokens — Staying Logged In Safely

## The Concept: Short Access, Long Refresh

A single long-lived JWT is a liability: a stolen token works until expiry, and you can't revoke it (stateless). A single short-lived token is a UX nightmare: users re-login every 15 minutes.

**The refresh-token pattern splits the difference:**

- **Access token** — short-lived (5–15 min), carries identity/roles, validated statelessly on every request.
- **Refresh token** — long-lived (days–weeks), *not* sent on every request; used only to mint **new access tokens**.

The security math: a stolen access token is useful for minutes (bounded blast radius); a stolen refresh token is still dangerous, but because refresh tokens are **server-side records**, you can *revoke* them — detect theft, rotate them, and kill the session. You get short-token safety with long-session UX.

## The Flow

```
1. Login:  {username, password}
2. Server: issue access token (15 min) + refresh token (30 days, stored in DB)
3. Requests: Authorization: Bearer <access token>     (validated statelessly)
4. Access expires: client calls POST /api/auth/refresh {refreshToken}
5. Server: validate refresh token against DB, ROTATE it (new refresh token issued, old one invalidated)
6. Server: return new access token + new refresh token
7. Logout: server deletes the refresh token from the DB — session dead
```

**Rotation** (step 5) is the security core: every refresh invalidates the previous refresh token. If a stolen refresh token is used, the *original* one is already dead — and if the attacker's token is used *after* the legitimate user's, the legitimate session breaks, alerting the user.

## The Code Walkthrough

```java
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
public class RefreshTokenService {

    private final RefreshTokenRepository repository;
    private final TokenService tokenService;      // issues access tokens (previous lesson)

    public RefreshTokenService(RefreshTokenRepository repo, TokenService tokens) {
        this.repository = repo; this.tokenService = tokens;
    }

    // Called at login: create a refresh token record
    @Transactional
    public RefreshToken issue(User user) {
        RefreshToken rt = new RefreshToken(
                UUID.randomUUID().toString(),     // unguessable token value
                user.getId(),
                Instant.now().plusSeconds(30 * 24 * 3600));   // 30 days
        return repository.save(rt);
    }

    // Called at /api/auth/refresh: validate + rotate
    @Transactional
    public TokenPair refresh(String refreshTokenValue) {
        RefreshToken stored = repository.findByToken(refreshTokenValue)
                .orElseThrow(() -> new InvalidTokenException("unknown refresh token"));

        if (stored.getExpiresAt().isBefore(Instant.now())) {
            repository.delete(stored);            // expired — clean up
            throw new InvalidTokenException("refresh token expired");
        }

        // ROTATION: the old token is dead the moment it's used
        repository.delete(stored);

        String newRefresh = UUID.randomUUID().toString();
        repository.save(stored.withToken(newRefresh));   // new token, same user, fresh expiry

        String newAccess = tokenService.issueToken(userService.load(stored.getUserId()));
        return new TokenPair(newAccess, newRefresh);
    }

    @Transactional
    public void revoke(String refreshTokenValue) {
        repository.deleteByToken(refreshTokenValue);    // logout = delete the record
    }
}
```

### Walking Through Each Part

**`issue` at login** — a refresh token is a **random unguessable string** (UUID), stored in the database *with* the user id and an expiry. It's a server-side session record — revocable, inspectable, per-user.

**`refresh` with rotation** — the heart of the pattern:

1. Look up the presented token; unknown → reject.
2. Expired → delete and reject.
3. **Delete the old token** (rotation): the presented token is invalid from this moment.
4. Issue a **new** refresh token (fresh random value, same user).
5. Mint a fresh access token.

If an attacker replays a *stolen* refresh token, rotation ensures: whoever uses it second breaks the first session. This turns token theft into a detectable event rather than silent continued access.

**`revoke` at logout** — deleting the DB record kills the session instantly (unlike a stateless JWT, which lives until expiry). This is the whole point of making refresh tokens server-side.

## Token Storage on the Client

Where the client keeps tokens determines the risk profile:

| Storage | Risk |
|---|---|
| `localStorage` | Readable by any JS on the page — XSS exfiltrates tokens |
| `sessionStorage` | Same, but cleared on tab close |
| **HttpOnly cookie** | JS can't read it — XSS can't steal it. Best for refresh tokens |
| Memory (SPA state) | Lost on refresh; access token in memory + refresh in HttpOnly cookie is the modern pattern |

The practical split: **refresh token in an HttpOnly, Secure, SameSite cookie** (JS never touches it, XSS can't read it); **access token in memory** (sent via `Authorization` header from an interceptor). CSRF protection still needed for cookie-borne refresh calls.

## Revocation and Theft Detection

Beyond rotation, hardening:

- **Reuse detection** — if the *same* refresh token is presented twice (rotation already invalidated it), that's evidence of theft: revoke the *whole family* (all tokens for that user/session) and force re-login.
- **Per-device sessions** — store a device fingerprint with each refresh token; a token used from a different IP/device is suspicious.
- **Absolute session caps** — enforce a maximum session lifetime regardless of refresh (e.g., 90 days), so even rotated sessions eventually end.
- **Logout everywhere** — delete *all* the user's refresh tokens on "log out of all devices".

## The Access Token Still Has Limits

Even with refresh tokens, the access token itself is stateless: **its `exp` is the hard limit** for server-side checks without a lookup. Two common accommodations:

1. **Short access tokens (5–15 min)** — the staleness window is tiny; account changes propagate at next refresh.
2. **Hybrid revocation for sensitive actions** — payment, password change, admin actions: *also* check a server-side session version (a `tokenVersion` column bumped on password change/logout). Cheap, targeted.

## Common Beginner Pitfalls

1. **No rotation** — a refresh token that stays valid forever is a permanent master key; rotate on every use.
2. **Refresh token in `localStorage`** — one XSS and the session is stolen. HttpOnly cookie.
3. **No server-side record** — if the refresh token is just another stateless JWT, you can't revoke it — the pattern is pointless.
4. **Unbounded session** — even rotated, cap absolute session life and re-auth for sensitive actions.
5. **Refresh endpoint without rate limiting** — attackers brute-force refresh tokens; throttle by IP/account.
6. **Ignoring reuse** — the *same* token appearing twice is a theft signal; act on it (revoke family).

## Key Takeaways

- Access tokens: short-lived, stateless, sent every request. Refresh tokens: long-lived, server-side, revocable.
- Rotation: every refresh invalidates the old token — theft becomes detectable.
- Logout = delete the refresh token record — instant revocation.
- Store refresh tokens in HttpOnly cookies; access tokens in memory.
- Cap absolute session lifetime; detect reuse; rate-limit the refresh endpoint.
- This is the standard session model behind most modern auth — and the pattern Spring Security's OAuth2 login (and the login in this academy app) builds on.
