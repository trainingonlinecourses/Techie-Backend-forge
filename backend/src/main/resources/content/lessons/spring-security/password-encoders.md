---
title: Password Storage — BCrypt, Argon2 and DelegatingPasswordEncoder
summary: Why plaintext and hashes without salt fail, BCrypt/Argon2 semantics, the {id} encoded-password format, and the upgrade path for legacy systems.
order: 11
minutes: 18
topics: [password-storage, bcrypt, argon2, delegatingpasswordencoder, salting, hash, password-upgrade]
docs:
  - https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html
  - https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
---

# Password Storage — BCrypt, Argon2 and DelegatingPasswordEncoder

## The concept: how a password should be stored

A password is never stored "as is" — the server stores a **one-way hash** so a database leak doesn't leak credentials. But hash quality matters enormously:

- **Fast hashes (MD5, SHA-256, SHA-1)** are *designed* to be quick — and that's exactly what makes them wrong for passwords. An attacker with a leaked DB can try billions of guesses per second on commodity GPUs. SHA-256 of a common password is cracked in seconds.
- **Password-hashing functions (BCrypt, Argon2, PBKDF2, scrypt)** are *deliberately slow* — each hash costs milliseconds to tens of milliseconds, and the cost is **tunable**. Cracking a 10,000-entry leak at 10ms per guess takes hours, not seconds.
- **Salting** — a random per-user value mixed into the hash — defeats rainbow tables and makes identical passwords produce different hashes. Without a salt, two users with the same password have the same hash, and precomputed tables crack the whole set at once.

The OWASP standard today: **Argon2id** (modern) or **BCrypt** (ubiquitous, battle-tested), with a per-user salt, a work factor that keeps each hash ~100-500ms, and never a fast hash.

## How Spring Security encodes

```java
@Bean
public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder(12);   // work factor 12 — ~200-400ms per hash
}
```

`BCryptPasswordEncoder.encode(raw)` returns a **self-describing string**:

```text
$2a$12$KIX7xLf... (version) (cost) (22-char salt + 31-char hash)
```

The cost and salt are embedded in the hash — so `matches(raw, hash)` can always verify, even if you later raise the cost. You never store the salt separately; it travels with the hash.

## DelegatingPasswordEncoder — the upgrade pattern

`PasswordEncoderFactories.createDelegatingPasswordEncoder()` is the default in Spring Security, and it solves the **legacy migration** problem: existing users have old-format hashes (`{noop}`, `{MD5}`, `{SHA-256}`), new users get strong hashes. The delegating encoder prefixes every hash with its **algorithm id**:

```text
{bcrypt}$2a$12$...     ← new users
{argon2}$argon2id$...   ← or this
{noop}secret            ← legacy plaintext (migration-only!)
{MD5}...                ← legacy MD5 (migration-only!)
```

`encode()` always produces the **strongest** algorithm you configured; `matches()` reads the `{id}` prefix and dispatches to the right encoder — so old users verify against their legacy format while new hashes are strong. The pattern for a legacy system:

```java
@Bean
public PasswordEncoder passwordEncoder() {
    String idForEncode = "bcrypt";
    Map<String, PasswordEncoder> encoders = Map.of(
        idForEncode, new BCryptPasswordEncoder(12),
        "argon2", Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8(),
        "noop", NoOpPasswordEncoder.getInstance(),   // legacy only — remove as you migrate
        "MD5", new MessageDigestPasswordEncoder("MD5") // legacy only
    );
    return new DelegatingPasswordEncoder(idForEncode, encoders);
}
```

**The migration play:** keep legacy ids registered so old users can log in, and add a re-hash-on-login step — when a user authenticates successfully with a legacy hash, re-encode with bcrypt and update the row. Over time the `{noop}`/`{MD5}` population drains to zero and you delete those encoders.

## How we use it in an organization: the scenarios

**Scenario 1 — user registration and login.** The service layer never sees the raw password outside the encode/verify boundary:

```java
@Service
public class UserService {
    private final PasswordEncoder encoder;

    public void register(RegisterRequest r) {
        String hash = encoder.encode(r.password());      // hash at the boundary
        userRepo.save(new User(r.email(), hash));
    }

    public boolean verify(String raw, String storedHash) {
        return encoder.matches(raw, storedHash);         // constant-time-ish comparison inside
    }
}
```

**Scenario 2 — re-hash on login (drain legacy):**

```java
public User authenticate(String email, String raw) {
    User u = userRepo.findByEmail(email).orElseThrow();
    if (!encoder.matches(raw, u.passwordHash())) throw new BadCredentialsException("bad");
    if (isLegacyFormat(u.passwordHash())) {              // starts with {noop}/{MD5}/
        u.rehash(encoder.encode(raw));                   // upgrade quietly on success
        userRepo.save(u);
    }
    return u;
}
```

**Scenario 3 — import from an old system.** During a migration, imports come as `{MD5}` or `{noop}` hashes *temporarily* — the delegating encoder lets them sign in, and the login-time rehash upgrades them without a forced password reset (force-reset only the `{noop}` population, since plaintext imports are genuinely dangerous).

## Pitfalls

- **Never write your own hash.** Home-grown "encrypt then base64" schemes are a recurring breach cause. Use the framework's encoders.
- **`{noop}` is a landmine** — it stores plaintext. It exists only for migrating *existing* data. New registrations must never produce `{noop}`.
- **Work factor too low:** BCrypt cost 10 is ~100ms (minimum); cost 12 is the common production choice; cost 13+ starts hurting login UX on small boxes. Tune on your hardware with a benchmark.
- **Don't truncate** the encoded string — it embeds version, cost, salt, and hash; cutting it breaks verification and destroys the salt.
- **Argon2 needs the right library** — `spring-security-crypto` ships `Argon2PasswordEncoder` (uses the C binding); on some platforms the pure-Java fallback is slow. BCrypt is the zero-dependency default that always works.
- **Login timing** — a correct hash check returns "no match" *fast* (no hash computed) vs a real match (100ms+). Rate-limit login attempts to blunt timing/enumeration attacks; this is a known trade-off of BCrypt.

## Key takeaways

- Store passwords with a deliberately slow, salted hash — BCrypt or Argon2id — never fast hashes, never plaintext.
- The encoded string carries version + cost + salt: raise cost later without invalidating old hashes.
- `DelegatingPasswordEncoder` with `{id}` prefixes is the standard upgrade path for legacy systems.
- Re-hash on successful login to drain legacy formats; delete `{noop}` encoders once migrated.
- Hash at the service boundary, verify with `matches`, and rate-limit login attempts.
