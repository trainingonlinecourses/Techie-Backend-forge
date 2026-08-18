---
title: Security Events & Audit — Watching Authentication and Authorization
summary: AuthenticationEventPublisher, the security event classes, and the audit-log patterns that answer "who did what and when did login fail".
order: 18
minutes: 16
topics: [security-events, authenticationevents, audit-log, authenticationeventpublisher, failed-login, monitoring]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/authentication/events.html
  - https://docs.spring.io/spring-security/reference/servlet/authorization/authorization-events.html
---

# Security Events & Audit — Watching Authentication and Authorization

## The concept: security happens in events

Spring Security publishes **events** for every authentication and authorization outcome. You don't poll or wrap filters to observe them — you **listen** (the same `ApplicationEventPublisher` pattern as Spring events, with security-specific event classes):

| Event | When |
|---|---|
| `AuthenticationSuccessEvent` | Authentication succeeded |
| `AuthenticationFailureBadCredentialsEvent` | Wrong password |
| `AuthenticationFailureDisabledEvent` | Disabled account |
| `AuthenticationFailureLockedEvent` | Locked account |
| `AuthenticationFailureExpiredEvent` | Expired credentials |
| `AuthenticationSuccessEvent` / `AuthorizationDeniedEvent` | Authorization outcome |

Wiring the publisher (Spring Security 6 — in Boot 3 it's auto-wired when the context has a publisher):

```java
@Bean
public AuthenticationEventPublisher authenticationEventPublisher(
        ApplicationEventPublisher applicationEventPublisher) {
    return new DefaultAuthenticationEventPublisher(applicationEventPublisher);
}
```

Then a listener observes everything:

```java
@Component
public class SecurityAuditListener {
    private final AuditLog auditLog;

    @EventListener
    public void onSuccess(AuthenticationSuccessEvent event) {
        auditLog.success(event.getAuthentication().getName());
    }

    @EventListener
    public void onFailure(AuthenticationFailureBadCredentialsEvent event) {
        auditLog.failure(event.getAuthentication().getName(), "bad-credentials");
    }

    @EventListener
    public void onLocked(AuthenticationFailureLockedEvent event) {
        auditLog.failure(event.getAuthentication().getName(), "account-locked");
    }
}
```

## How we use it in an organization: the scenarios

**Scenario 1 — the failed-login ledger.** Every failed login appended to an audit store (DB table, log stream). This is the raw material for: **lockout policy** (after N failures, disable — implemented in the `UserDetails`/lockout service), **brute-force detection** (same IP, many users; same user, many IPs), and **incident investigation** ("was the attacker trying this account?").

```java
@EventListener
public void onFailure(AuthenticationFailureBadCredentialsEvent e) {
    String name = e.getAuthentication().getName();
    loginAttemptService.recordFailure(name, requestInfo());   // increments a counter, may lock
    auditRepo.save(new LoginFailure(name, Instant.now(), requestInfo()));
}
```

**Scenario 2 — the success trail.** "Who logged in when and from where" — the first query in any security investigation and the compliance answer for privileged systems:

```java
@EventListener
public void onSuccess(AuthenticationSuccessEvent e) {
    auditRepo.save(new LoginSuccess(e.getAuthentication().getName(), Instant.now()));
}
```

**Scenario 3 — account-state changes.** Locked, disabled, expired events feed both the audit and the *user-facing* message ("Your account is locked — contact support").

**Scenario 4 — authorization denials.** `AuthorizationDeniedEvent` records *attempted but denied* access — the signal for over-privileged users and probing:

```java
@EventListener
public void onDenied(AuthorizationDeniedEvent<?> event) {
    auditRepo.save(new AccessDenied(
        event.getAuthentication().getName(),
        event.getAuthorizationResult().getAuthorizationDecision().toString()));
}
```

## Where audit logs go — and how to structure them

- **A dedicated `audit_log` table** (event_type, principal, target, detail, timestamp, ip) — queryable for investigations and reporting.
- **Structured log lines** (JSON via Logstash encoder) shipped to the observability stack — for alerting (anomalous failure rates, lockout storms).
- **Event sourcing for critical systems** — append-only audit as the system of record (see the event-driven lessons).

**The invariant teams enforce:** audit writes are **append-only** — never update or delete audit rows (a mutable audit is worthless). The audit path should also be **resilient** — an audit failure must not silently drop the record (or must at least log loudly).

## Pitfalls

- **The publisher must exist** — with a custom setup, forgetting `DefaultAuthenticationEventPublisher` means *no events are published at all* and your listeners never fire (silent gap).
- **Async listeners** — a synchronous listener that writes to a slow DB delays the login response. `@Async` the listener (with a real executor) so audit doesn't sit on the login critical path — but preserve ordering for failure counting where it matters.
- **Logging passwords/raw credentials** — never log the credential; log the *username* (and be careful: usernames can contain sensitive data too).
- **PII in audit logs** — emails/IPs in audit are personal data; know your retention policy and redaction requirements (GDPR-style).
- **Not listening at all** — the default `AuthenticationEventPublisher` behavior when none is configured can silently drop failures; verify with a test that a failed login produces an event.

## Key takeaways

- Spring Security publishes authentication/authorization events — observe them via `@EventListener`.
- Wire `DefaultAuthenticationEventPublisher` when you customize the setup; verify it fires.
- Failed-login events feed lockout, brute-force detection, and incident investigation.
- Success events build the "who logged in when" trail; denial events surface access probing.
- Audit logs are append-only, structured, and off the login hot path — and never contain credentials.
