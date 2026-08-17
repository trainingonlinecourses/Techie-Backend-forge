---
title: OWASP Top 10 for Spring Backends
summary: The ten vulnerabilities that actually hit web APIs — and the Spring/Java countermeasures for each, from injection to insecure design.
order: 5
minutes: 16
topics: [owasp top 10, injection, xss, csrf, ssrf, security hardening]
docs:
  - https://owasp.org/Top10/
  - https://owasp.org/www-project-top-ten/
---

# OWASP Top 10 for Spring Backends

The OWASP Top 10 is the industry's agreed list of the most dangerous web vulnerabilities. Each one has a Spring-native countermeasure — this lesson maps them so "secure by default" is concrete, not vibes.

## A01 — Broken Access Control (the #1 real-world bug)

Missing authorization checks, IDOR (`GET /orders/42` — but is it *your* 42?), privilege escalation, forced browsing.

```java
@GetMapping("/orders/{id}")
public OrderDto get(@PathVariable long id) {
    Order o = orderRepo.findById(id).orElseThrow();
    if (!o.getCustomerId().equals(currentUser().getId())) throw new ForbiddenException();  // object-level
    return OrderDto.from(o);
}

// Never trust a client-supplied "isAdmin" — authority comes from the server's authentication
@PreAuthorize("hasRole('ADMIN')")
@DeleteMapping("/users/{id}")
```

Countermeasures: authorization at **every** layer (URL + method + object), deny-by-default `anyRequest().authenticated()`, never rely on client-sent identity, and test with role-matrix tests (user A must not read user B's data — write that test).

## A02 — Cryptographic Failures

Sensitive data in transit or at rest unprotected — old TLS, weak algorithms, plaintext storage, secrets in code.

- **Transport**: TLS everywhere (`server.ssl.*` or the platform's edge), HSTS header, `https` redirect.
- **At rest**: passwords via **BCrypt/Argon2** (`PasswordEncoderFactories.createDelegatingPasswordEncoder()`), never SHA/MD5, never reversible encryption for passwords.
- **Secrets**: never in `application.yml` committed to git — env vars/secrets manager (this academy's `.env-local` + Render env pattern); rotate JWT secrets on rotation policy, not on feeling.
- **Key length**: JWT signing with RSA ≥ 2048-bit or HS256 with a ≥ 256-bit random secret.

## A03 — Injection (SQL, NoSQL, command)

The classic: string-built queries.

```java
// WRONG
jdbc.query("SELECT * FROM users WHERE name = '" + input + "'", ...);   // ' OR 1=1 --
// RIGHT
jdbc.query("SELECT * FROM users WHERE name = ?", ps -> ps.setString(1, input), ...);
// Spring Data derived queries and @Query with :params are parameterized by design — use them
```

Countermeasures: **parameterized queries everywhere** (JDBC `?`, JPA named params, Mongo `Criteria` — never string-concatenated `$where`), validate input at the boundary (Bean Validation), least-privilege DB roles (the app user can't `DROP TABLE`). SpEL/user expressions: only `SimpleEvaluationContext` (the SpEL lesson).

## A04 — Insecure Design

Threat modeling gaps: missing rate limits, no account lockout, "trust the client" flows, unlimited pagination.

Spring-native fixes: **rate limiting** (Bucket4j/Resilience4j or a Redis fixed-window limiter — this academy's API implements one), account lockout after N failures (`AuthenticationFailureHandler` + counter), pagination caps (`PageRequest.of(page, min(size, 100))`), and security **tests that encode the abuse cases** (login brute-force test, pagination cap test).

## A05 — Security Misconfiguration

Verbose errors, default credentials, debug endpoints in prod, permissive CORS.

- `server.error.include-stacktrace: never` (or `on_param` in dev only); a clean `@RestControllerAdvice` error contract (the validation lesson's shape).
- Actuator: expose only needed endpoints (`management.endpoints.web.exposure.include: health,info`) — never `env`, `heapdump`, `shutdown` in prod without auth.
- **CORS allowlist** (the cors-csrf lesson): explicit origins, never `*` with credentials; verify with an evil-origin test (this academy's CORS test does exactly that).
- `spring-boot-starter-security`'s defaults (all endpoints authenticated) as the baseline, not an afterthought.

## A06 — Vulnerable Components

Outdated dependencies are a top-10 entry every year. **Spring Boot manages versions** — stay on a supported Boot line (this app: Boot 3.x on Java 17/21) and watch the security advisories:

```bash
mvn versions:display-dependency-updates   # see what's stale
./mvnw dependency:tree | grep -i log4j    # hunt a specific CVE
```

GitHub's Dependabot/renovate on this repo would flag CVEs in PRs — the cheap, continuous version of "keep it patched". The fix is process (renovate + a supported line), not a one-time bump.

## A07 — Identification & Authentication Failures

Weak session handling, no lockout, session fixation, predictable tokens.

Covered by the session-management and JWT lessons: rotate session ids (`changeSessionId`), `maximumSessions`, Redis sessions with TTL, **long random secrets for JWT** (the current `APP_JWT_SECRET` is an env var for a reason), and lockout/rate-limit on login endpoints.

## A08 — Software & Data Integrity Failures

Deserializing untrusted data, unsigned updates, insecure CI/CD.

- **Never `ObjectInputStream`/`XMLDecoder` on untrusted input** — Java deserialization is a code-execution class of bug (the 2015-16 apocalypse). Use Jackson with `@JsonTypeInfo` only for trusted sources; keep polymorphic deserialization off by default.
- Dependency integrity: pin versions, verify checksums (`mvn` verifies by default from Maven Central).
- Supply chain: `renovate` + locked lockfiles (this repo's `package-lock.json`/Maven POM).

## A09 — Logging & Monitoring Failures

You can't respond to what you can't see. The logging lesson's discipline: structured logs with correlation IDs, **no secrets in logs** (this academy's chat fix verifies the API key never appears), alert on auth failures and 5xx spikes, audit sensitive operations.

## A10 — Server-Side Request Forgery (SSRF)

The app fetches a user-supplied URL → the attacker points it at internal services (`http://169.254.169.254/`, the cloud metadata endpoint).

```java
// Validate and allowlist destinations before any client.fetch(url):
URI u = new URI(url);
if (!ALLOWED_HOSTS.contains(u.getHost())) throw new BadRequestException();
// or block private/loopback/link-local ranges explicitly
```

Applies to: webhooks, image fetchers, file-import-by-URL, **AI tool-calling** (a chat model that fetches URLs — the exact surface this academy's AI tutor could expose). Never follow redirects blindly; validate the *final* host.

## The test that proves it

A security regression suite isn't exotic — it's five `MockMvc` tests: anonymous → 401, wrong-role → 403, user-A-reading-user-B → 403/404, `' OR 1=1 --` in search → no rows leaked, evil CORS origin → 403. This academy's live e2e suite already runs three of those against the deployed API — extend it, and keep it in CI.

## Key takeaways

- Broken access control is the #1 bug: authorize at URL + method + object level, deny by default.
- Parameterize every query; BCrypt/Argon2 for passwords; secrets in env, never in code.
- Tighten the misconfiguration surface: error contract, CORS allowlist, minimal Actuator exposure.
- Stay on a supported Boot line with automated dependency updates; log and monitor auth failures.
- Validate any URL your server will fetch (SSRF) — including URLs an AI assistant might fetch.

Official docs: [OWASP Top 10](https://owasp.org/Top10/) · [Spring Security](https://docs.spring.io/spring-security/reference/)
