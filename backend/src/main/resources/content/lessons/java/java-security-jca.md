---
title: JCA: Cryptography, Keys & Secure Communication
summary: The Java Cryptography Architecture — hashing, MACs, AES, RSA, key management, TLS and the rules for storing secrets.
order: 18
minutes: 18
topics: [jca, cryptography, hashing, aes, rsa, tls, keystore]
docs:
  - https://docs.oracle.com/en/java/javase/21/security/java-cryptography-architecture-jca-reference-guide.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/javax/crypto/package-summary.html
---

# JCA: Cryptography, Keys & Secure Communication

## What JCA provides

The **Java Cryptography Architecture** is the standard SPI for:

- **Message digests** — `SHA-256`, `SHA-512` (one-way hashing)
- **MACs** — `HmacSHA256` (hash with a shared secret)
- **Symmetric ciphers** — `AES` (bulk encryption)
- **Asymmetric ciphers & signatures** — `RSA`, `ECDSA` (keys, signatures)
- **Key management** — `KeyStore`, `KeyGenerator`, `SecretKeyFactory`
- **TLS** — `SSLSocket`/`SSLContext` (HTTPS under the hood)

Providers (`SunJCE`, Bouncy Castle) plug in behind the SPI — you code against standard algorithm names, not implementations.

## The three primitives and when to use them

| Need | Primitive | Gotcha |
|---|---|---|
| Password storage | **Slow hash**: `PBKDF2WithHmacSHA256` / Argon2id / bcrypt | plain SHA-256 is too fast — attackers brute-force millions/sec |
| Integrity (file/data) | `MessageDigest SHA-256` | not secret; anyone can compute it |
| Integrity + authenticity | `HmacSHA256(secret, data)` | secret must be protected |
| Encrypt data at rest | **AES-GCM** (authenticated) | never ECB; use random IV per message; AEAD gives integrity too |
| Encrypt/agree with keys | RSA / ECDH + TLS | RSA only for small data or key exchange; prefer ECDHE in TLS |
| Non-repudiation | ECDSA/RSA signatures | keep private key in a KeyStore/HSM |

## Passwords: the one correct recipe

```java
// Java has no built-in bcrypt/argon2 — use spring-security-crypto's BCrypt:
BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
String hash = encoder.encode(rawPassword);   // embeds salt + cost
boolean ok = encoder.matches(rawPassword, hash);
```

Never store raw passwords, never use unsalted SHA/MD5, never write your own KDF.

## AES-GCM in practice

```java
SecretKey key = KeyGenerator.getInstance("AES").generateKey();  // 256-bit
Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
cipher.init(Cipher.ENCRYPT_MODE, key);
byte[] ct = cipher.doFinal(plaintext);
byte[] iv = cipher.getIV();        // store alongside ciphertext — random per message!
```

Decryption needs the same IV + key, and GCM fails (throws) if the ciphertext was tampered with — that's the point.

## Key management rules

- **Keys never in code, config or logs.** Environment variables are OK for dev; a **KeyStore** (`JCEKS`) or cloud KMS (AWS KMS, GCP KMS, Vault) for production.
- **Rotate keys** — have a key id in your data so old keys can decrypt while new writes use the new key.
- `KeyStore ks = KeyStore.getInstance("PKCS12");` — load with a password, never hardcode it.

## TLS in Java

`HttpsURLConnection` / `HttpClient` / Spring RestClient all use `SSLContext` defaults — **trusting the system CA store**. Custom setups (self-signed internal CAs) build an `SSLContext` from a truststore. In containers, set `-Djavax.net.ssl.trustStore` or mount a truststore; better, use a proper CA (Let's Encrypt / internal PKI).

## Production checklist

1. Use **BCrypt/Argon2** for passwords — cost factor tuned for your hardware (~12 for bcrypt in 2026).
2. **AES-GCM** for data encryption; random IV per message; never ECB.
3. Signatures/MACs for tamper-evidence on anything you send or store.
4. Keys in a KeyStore/KMS, rotated, never in logs.
5. HTTPS/TLS everywhere; HTTP only on localhost.

## Key takeaways

- JCA is a provider-based standard API — code to algorithm names, plug in providers.
- Slow hashes for passwords, AES-GCM for data, TLS for transport.
- Key management is the hardest part — plan rotation and storage up front.

Official docs: [JCA Reference Guide](https://docs.oracle.com/en/java/javase/21/security/java-cryptography-architecture-jca-reference-guide.html) · [javax.crypto](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/javax/crypto/package-summary.html)
