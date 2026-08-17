---
title: JWT Structure — What's Actually in a Token
module: spring-security-jwt-deep
order: 1
minutes: 26
topics: ["JWT", "JWS", "header", "payload", "signature", "base64url"]
docs:
  - title: "RFC 7519 — JSON Web Token"
    url: "https://datatracker.ietf.org/doc/html/rfc7519"
---

# JWT Structure — What's Actually in a Token

## The Concept: A Signed, Self-Contained Statement

A **JWT** (JSON Web Token) is a compact, URL-safe string that carries **claims** (statements about a subject — "user 42 is an admin", "this token expires at ...") and is **cryptographically signed** so nobody can tamper with it. It solves a core stateless-auth problem: *how does a server trust "who you are" without looking anything up?*

Think of it as a **signed passport**. The passport contains facts about you (name, nationality) — the *claims*. It's signed by the issuing authority's seal — the *signature* — so any border agent can verify it's authentic without calling the issuing country. The agent doesn't need a database lookup; the signature is the proof.

A JWT looks like this:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
eyJzdWIiOiI0MiIsIm5hbWUiOiJTYXRlZXNoIiwiYWRtaW4iOnRydWV9.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

Three parts, separated by dots:

1. **Header** — metadata about the token (which algorithm signed it).
2. **Payload** — the claims (the facts).
3. **Signature** — the cryptographic proof.

All three are **Base64URL-encoded JSON** — a URL-safe variant of Base64 (no `+`/`/`/`=`), which is why the token survives in URLs, headers, and cookies without escaping.

## The Three Parts, Decoded

### 1. Header

```json
{ "alg": "HS256", "typ": "JWT" }
```

- `alg` — the signing algorithm (`HS256` = HMAC-SHA256, `RS256` = RSA-SHA256). **This is critical:** it tells the verifier *how* to check the signature.
- `typ` — "JWT" (the token type). Usually fixed.

### 2. Payload (claims)

```json
{
  "sub": "42",                    // subject — who the token is about
  "name": "Sateesh",
  "admin": true,                  // a custom claim
  "iat": 1755000000,              // issued-at (epoch seconds)
  "exp": 1755086400               // expiration (epoch seconds)
}
```

Standard claim names (`sub`, `iat`, `exp`, `iss`, `aud`) are *reserved* — their meanings are defined by the spec. Anything else (`name`, `admin`, `role`) is a custom claim.

### 3. Signature

```
HMACSHA256(
  base64url(header) + "." + base64url(payload),
  secret
)
```

The signature is computed over **header + payload** with a secret (HMAC) or private key (RSA/ECDSA). If *any* character of the header or payload changes, the signature no longer matches. That's the tamper-proofing.

## The Code Walkthrough — Building a Token by Hand

```java
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

public class JwtStructureDemo {

    // base64url: standard base64, but URL-safe and no padding
    static String b64url(byte[] data) {
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(data);
    }

    public static void main(String[] args) throws Exception {
        String secret = "super-secret-key";   // NEVER hardcode in real apps

        // 1. Header + payload as JSON, then base64url-encoded
        String header  = "{\"alg\":\"HS256\",\"typ\":\"JWT\"}";
        String payload = "{\"sub\":\"42\",\"name\":\"Sateesh\",\"admin\":true}";

        String h = b64url(header.getBytes(StandardCharsets.UTF_8));
        String p = b64url(payload.getBytes(StandardCharsets.UTF_8));

        // 2. Sign header.payload with HMAC-SHA256
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String signingInput = h + "." + p;
        byte[] sig = mac.doFinal(signingInput.getBytes(StandardCharsets.UTF_8));

        String token = signingInput + "." + b64url(sig);
        System.out.println(token);

        // 3. Verification: recompute the signature and compare
        //    (in practice, a library like jjwt does this)
        String[] parts = token.split("\\.");
        Mac verifier = Mac.getInstance("HmacSHA256");
        verifier.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] expected = verifier.doFinal((parts[0] + "." + parts[1]).getBytes(StandardCharsets.UTF_8));
        boolean valid = java.util.Arrays.equals(expected,
                Base64.getUrlDecoder().decode(parts[2]));
        System.out.println("signature valid: " + valid);
    }
}
```

### Walking Through Each Part

**Step 1 — encode header and payload.** The header and payload are JSON documents; base64url-encoding makes them URL-safe. Note they are **not encrypted** — anyone can decode them. That's by design: JWTs carry *verifiable*, not *secret*, data. Never put secrets in a JWT payload.

**Step 2 — sign.** The signature input is literally `header + "." + payload`; HMAC-SHA256 with the shared secret produces the signature. Only someone holding the secret can produce this value — which is why the token can't be forged (by someone without the secret) or tampered with (any change invalidates the signature).

**Step 3 — verify.** Verification is *recomputation*: recompute the HMAC over the received header+payload and compare with the received signature. Equal → authentic and untampered. This is the whole trust model — and why **keeping the secret secret** is the security of the system.

## JWS vs JWE — Signed vs Encrypted

- **JWS** (JSON Web Signature) — what everyone means by "JWT": signed, readable, tamper-proof. The standard for auth tokens.
- **JWE** (JSON Web Encryption) — *encrypted*: the payload is hidden. Rarely needed for auth; used when the payload must be confidential.

For auth, JWS is correct: you *want* the server to read the claims (subject, roles, expiry) without a lookup, and the signature guarantees authenticity.

## The Algorithm Confusion — HS256 vs RS256

| | HS256 (HMAC) | RS256 (RSA) |
|---|---|---|
| Key | One shared **secret** | **Private** key to sign, **public** key to verify |
| Who can verify | Anyone with the secret | Anyone with the public key |
| Best for | Single service (server issues + verifies) | Microservices / multiple verifiers (auth server signs, services verify) |
| Failure mode | Secret leak = total forgery | Private key leak = total forgery; public key leak is fine |

**Never mix them up.** `alg` confusion attacks exploit servers that accept `alg: none` or downgrade to HS256 while expecting RS256. A modern JWT library with explicit algorithm configuration (e.g., jjwt's `parser().verifyWith(...)`) prevents this.

## Common Beginner Pitfalls

1. **Putting secrets in the payload** — the payload is base64url, *not* encrypted. Anyone can decode it.
2. **Trusting `alg: none` or accepting any algorithm** — pin the algorithm explicitly; never parse without signature verification.
3. **Tokens without expiry (`exp`)** — a leaked token works forever. Always set `exp`.
4. **Hardcoding the secret** — from env/secret manager, never in code (config module rules).
5. **Storing the whole token in the URL** — it leaks into logs/proxies; headers or cookies are better.
6. **Thinking "signed" means "encrypted"** — anyone can read the claims; only the signature is protected.

## Key Takeaways

- A JWT is `base64url(header).base64url(payload).signature`.
- Header = algorithm; payload = claims (`sub`, `exp`, customs); signature = HMAC/RSA proof.
- The payload is readable by anyone — signed, not encrypted.
- Verification = recompute the signature and compare; tampering breaks it.
- HS256 = one shared secret; RS256 = private/public key pair (better for multi-service).
- Never use `alg: none`, never trust tokens without verification, always set `exp`.
