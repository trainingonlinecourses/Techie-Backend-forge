---
title: The Security Model — Authentication vs Authorization
summary: Core security concepts, password hashing, and the mental model for every Spring Security feature.
order: 1
minutes: 15
topics: [authentication, authorization, hashing, security-model]
docs:
  - https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html
  - https://docs.spring.io/spring-security/reference/servlet/architecture.html
---

# The Security Model — Authentication vs Authorization

## The two words that matter

- **Authentication (authn)** — *who are you?* Prove identity: password, token, OTP, SSO.
- **Authorization (authz)** — *what may you do?* Once known, decide access: roles, permissions, scopes.

```
Request → AUTHENTICATION (who) → AUTHENTICATION (principal) → AUTHORIZATION (may they?) → resource
```

## The principal and the SecurityContext

Spring Security stores the authenticated user as a **principal** in the `SecurityContext` — held per-request:

```java
@GetMapping("/me")
public UserDto me(@AuthenticationPrincipal UserPrincipal principal) {
    return UserDto.from(principal.user());
}
```

`SecurityContextHolder` holds the context for the current thread (and propagates to child threads in Spring). It's the single source of truth for "who is calling right now."

## Password storage: hash, don't encrypt

Passwords are **hashed one-way** with a slow, salted algorithm — never reversible, never plaintext, never encrypted (encryption is reversible!). Spring's default is BCrypt:

```java
@Bean
PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();     // adaptive: automatically strengthens over time
}

String hash = encoder.encode("hunter2");    // $2a$10$... (contains salt + cost)
encoder.matches("hunter2", hash);           // true  — verify by re-hashing input
```

**Never** write your own hash algorithm. BCrypt/Argon2/scrypt are the industry choices; MD5/SHA1-for-passwords are banned.

## Where identity comes from

Spring Security supports them all through one `AuthenticationManager`:

| Source | `AuthenticationProvider` |
|---|---|
| Username + password in a DB | `DaoAuthenticationProvider` (via `UserDetailsService`) |
| LDAP / Active Directory | `LdapAuthenticationProvider` |
| OAuth2 / OIDC (Google, GitHub, ...) | `OAuth2LoginAuthenticationProvider` |
| SAML, CAS, JWT resource servers | dedicated providers |

## The flow, in one picture

```
1. Client sends credentials (or token)
2. Filter chain captures them → AuthenticationManager
3. An AuthenticationProvider verifies → returns an authenticated Authentication
4. SecurityContextHolder.setAuthentication(...)
5. Authorization rules evaluate authorities (ROLE_USER etc.)
6. Response; SecurityContext cleared at end of request (stateless) or kept in session
```

> **Why it matters (organizational view)** — Security is everyone's job, but *this* model is the shared vocabulary: authn proves identity, authz grants access, hashes protect secrets, the filter chain enforces policy. Teams that share this model review security code well; teams that don't ship `role==ADMIN` string checks that break the first time a role is renamed.

## Key takeaways

- Authn = who; authz = may they; both live in the request pipeline.
- `SecurityContextHolder` = current principal; `@AuthenticationPrincipal` = typed access.
- BCrypt (or Argon2) for passwords — never plaintext, never custom hashing.
- `AuthenticationManager` + providers = the pluggable core.

**Official docs:** [Password storage](https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html) · [Architecture](https://docs.spring.io/spring-security/reference/servlet/architecture.html)
