---
title: Java Cryptography Architecture — Complete Beginner's Guide
summary: How Java's security API works, message digests, digital signatures, key management, and the crypto operations every backend dev should know.
order: 15
minutes: 18
topics: [jca, cryptography, message digest, digital signature, keypair, keystore]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/specs/security/standard-names.html
  - https://docs.oracle.com/en/java/javase/21/security/java-cryptography-architecture-jca-reference-guide.html
---

# Java Cryptography Architecture — Complete Beginner's Guide

## What is JCA?

The **Java Cryptography Architecture (JCA)** is Java's built-in framework for security operations: hashing, encryption, digital signatures, and key management. It provides a **provider-based** architecture — you use the API, and the actual crypto implementation is pluggable.

```
Your code:  MessageDigest.getInstance("SHA-256")
                ↓
JCA API:     Standard interface for hashing
                ↓
Provider:    SunJCE, BouncyCastle, or other provider
                ↓
Algorithm:   Actual SHA-256 implementation
```

## Message Digests — hashing data

A **message digest** (hash) converts data into a fixed-length string. It's one-way: you can't reverse it.

```java
// Hash a password with SHA-256
import java.security.MessageDigest;

public byte[] hashPassword(String password) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");  // Line 1: Get SHA-256 instance
    byte[] hash = digest.digest(password.getBytes(StandardCharsets.UTF_8));  // Line 2: Hash the bytes
    return hash;  // Line 3: Returns 32-byte array (256 bits)
}

// Convert to hex string for storage
public String toHex(byte[] bytes) {
    StringBuilder sb = new StringBuilder();
    for (byte b : bytes) {
        sb.append(String.format("%02x", b));  // Line 1: Convert each byte to 2 hex chars
    }
    return sb.toString();  // Line 2: Returns "a3f2b8c1..." (64 hex chars for SHA-256)
}
```

**Why not use hashing for passwords?** SHA-256 is too fast! An attacker can try billions of passwords per second. Use BCrypt instead (see the security basics lesson).

## Digital Signatures — proving authenticity

A **digital signature** proves that data came from a specific sender and hasn't been tampered with.

```java
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;

// Generate a key pair (public + private)
KeyPairGenerator keyGen = KeyPairGenerator.getInstance("RSA");  // Line 1: RSA algorithm
keyGen.initialize(2048);                                        // Line 2: 2048-bit key size
KeyPair keyPair = keyGen.generateKeyPair();                     // Line 3: Generate keys

// Sign data
Signature sig = Signature.getInstance("SHA256withRSA");  // Line 1: Signing algorithm
sig.initSign(keyPair.getPrivate());                      // Line 2: Use private key to sign
sig.update(data.getBytes(StandardCharsets.UTF_8));       // Line 3: Feed the data
byte[] signature = sig.sign();                           // Line 4: Generate signature

// Verify signature
Signature verifySig = Signature.getInstance("SHA256withRSA");  // Line 1: Same algorithm
verifySig.initVerify(keyPair.getPublic());                      // Line 2: Use public key to verify
verifySig.update(data.getBytes(StandardCharsets.UTF_8));        // Line 3: Feed the same data
boolean isValid = verifySig.verify(signature);                   // Line 4: Check if signature matches
// isValid = true → data is authentic and untampered
```

**Real-world use:** JWT tokens use digital signatures to prove the token was issued by your server and wasn't modified.

## Key Management — storing and protecting keys

```java
// Generate and store a key pair in a keystore
KeyPairGenerator keyGen = KeyPairGenerator.getInstance("RSA");
keyGen.initialize(2048);
KeyPair keyPair = keyGen.generateKeyPair();

// Create a keystore
KeyStore keyStore = KeyStore.getInstance("PKCS12");  // Line 1: PKCS12 format
keyStore.load(null, "password".toCharArray());        // Line 2: Initialize empty keystore
keyStore.setKeyEntry("mykey",                        // Line 3: Alias
    keyPair.getPrivate(),                            // Line 4: Private key
    "password".toCharArray(),                        // Line 5: Key password
    new Certificate[]{/* certificate */});            // Line 6: Certificate chain

// Save keystore to file
try (FileOutputStream fos = new FileOutputStream("keystore.p12")) {
    keyStore.store(fos, "password".toCharArray());   // Line 1: Store with password
}
```

## Symmetric vs Asymmetric encryption

| | Symmetric (AES) | Asymmetric (RSA) |
|---|---|---|
| **Keys** | Same key encrypts and decrypts | Public key encrypts, private key decrypts |
| **Speed** | Fast (100x faster than RSA) | Slow |
| **Key distribution** | Problem: how to share the key safely | Easy: share public key openly |
| **Use case** | Encrypting data at rest | Key exchange, digital signatures, JWT |

```java
// Symmetric encryption (AES)
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

KeyGenerator keyGen = KeyGenerator.getInstance("AES");
keyGen.init(256);  // Line 1: 256-bit key
SecretKey key = keyGen.generateKey();

Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");  // Line 2: AES with GCM mode
cipher.init(Cipher.ENCRYPT_MODE, key);                      // Line 3: Initialize for encryption
byte[] encrypted = cipher.doFinal(data.getBytes());         // Line 4: Encrypt
```

## Common mistakes

| Mistake | Why it's dangerous | Fix |
|---|---|---|
| Using MD5/SHA1 for passwords | Too fast, vulnerable to brute-force | Use BCrypt/Argon2 |
| Hardcoding keys in source code | Keys exposed in version control | Use environment variables or vault |
| Using ECB mode for encryption | Pattern leakage | Use CBC or GCM mode |
| Not specifying padding | Vulnerable to padding oracle attacks | Use `AES/GCM/NoPadding` |
| Weak key sizes | Easily brute-forced | Use 2048+ bits for RSA, 256+ for AES |

## Key takeaways

- JCA provides a provider-based API for hashing, encryption, and signatures
- Message digests (SHA-256) are one-way — use BCrypt for passwords
- Digital signatures prove authenticity — used in JWT and code signing
- Symmetric (AES) for speed, asymmetric (RSA) for key exchange
- Never hardcode keys — use keystores, vaults, or environment variables

**Official docs:** [JCA Reference Guide](https://docs.oracle.com/en/java/javase/21/security/java-cryptography-architecture-jca-reference-guide.html) · [Standard Names](https://docs.oracle.com/en/java/javase/21/docs/specs/security/standard-names.html)
