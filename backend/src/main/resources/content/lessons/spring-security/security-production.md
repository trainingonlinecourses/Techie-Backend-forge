---
title: Production Security — Secrets, Audit & Operations
summary: Secrets management, audit logging, token lifecycle, and the operational side of keeping an API safe.
order: 9
minutes: 14
topics: [secrets, audit, token-lifecycle, production]
docs:
  - https://docs.spring.io/spring-boot/reference/features/external-config.html
  - https://docs.spring.io/spring-security/reference/servlet/authentication/architecture.html
---

# Production Security — Secrets, Audit & Operations

## Secrets management

```yaml
# application.yml — placeholder only, value comes from the environment
app:
  jwt:
    secret: ${APP_JWT_SECRET}
  database:
    password: ${DB_PASSWORD}
```

- Secrets via env vars or a vault (Vault, AWS Secrets Manager, cloud KMS) — never in git.
- Rotate: short-lived credentials, scheduled rotation, tooling that *proves* rotation (check mtime of the secret).
- The JWT secret must be ≥ 32 random bytes (`openssl rand -base64 48`).

## Token lifecycle & revocation

Stateless JWTs can't be revoked server-side — plan for it:

| Need | Approach |
|---|---|
| Logout on the client | Client deletes the token (and the UI state) |
| Force re-login | Short expiry (15m–1h) + refresh tokens |
| Immediate revocation | Denylist (`jti` claim → Redis/cache) checked by the filter |
| Block a user | Check user existence/enabled state per request (we do this) |

```java
// denylist check inside JwtAuthFilter
if (denylist.contains(tokenId)) { chain.doFilter(request, response); return; }
```

## Audit logging

Security-relevant events deserve structured, tamper-resistant logs:

```java
@Component
public class SecurityAuditLogger {

    public void record(String action, String username, String detail) {
        // JSON line to stdout: {"ts":..., "event":"LOGIN_FAILED", "user":"alice", "ip":..., "trace":"..."}
        log.info("audit event={} user={} detail={} trace={}", action, username, detail, traceId());
    }
}
```

Events worth auditing: login success/failure, password change, role change, privileged actions, exports/deletes. Ship to a SIEM/log aggregator; retain per policy.

## The production hardening checklist

- [ ] JWT/HS256 → RS256 with proper keypair, or a managed IdP
- [ ] Secrets rotated and vaulted
- [ ] Rate limits on login + public POSTs
- [ ] Audit trail for privileged actions
- [ ] Security headers verified (`curl -I`)
- [ ] Dependency scan in CI; alerts on CVEs
- [ ] Error responses leak nothing (no stack traces, no SQL)
- [ ] Logs redact PII/credentials
- [ ] Access rules tested per role (see security-testing lesson)
- [ ] TLS enforced end to end (ingress + service mesh)

## A note on "security is layered"

The layers: network (TLS, firewall) → app (authn/authz, validation) → data (encryption at rest, least privilege DB users) → ops (audit, monitoring, incident response). Spring Security covers the app layer; the org covers the rest. "We use JWT" is not a security strategy — it's one layer.

> **Why it matters (organizational view)** — Production security is operational: rotated secrets, audit trails you can query after an incident, tokens that expire, and dashboards on auth failures. The org runbook: quarterly secret rotation, access reviews, dependency alerts, and a post-incident habit of "which layer failed and which logging let us see it?"

## Key takeaways

- Secrets in env/vaults, rotated on a schedule; JWT secrets ≥ 32 random bytes.
- Plan revocation: short expiry + denylist + per-request user checks.
- Audit privileged actions with structured, searchable logs.
- Security is layered — app security is one layer of many.

**Official docs:** [Externalized config](https://docs.spring.io/spring-boot/reference/features/external-config.html) · [Security architecture](https://docs.spring.io/spring-security/reference/servlet/authentication/architecture.html)
