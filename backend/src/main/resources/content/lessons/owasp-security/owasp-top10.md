---
title: The OWASP Top 10 — The Web Security Syllabus
module: owasp-security
order: 1
minutes: 27
topics: ["OWASP Top 10", "web security", "injection", "XSS", "security risks", "vulnerabilities"]
docs:
  - title: "OWASP Top 10 (owasp.org)"
    url: "https://owasp.org/www-project-top-ten/"
  - title: "OWASP Cheat Sheet Series"
    url: "https://cheatsheetseries.owasp.org/"
---

# The OWASP Top 10 — The Web Security Syllabus

## The Concept: The Shared Vocabulary of Web Vulnerabilities

Every web developer should know the most common ways applications get attacked — not to become a security engineer, but because *the developer writes the code the attacker reads*. The **OWASP Top 10** is the community's ranked list of the most critical web application security risks, updated roughly every four years (latest: 2021). It's not an exhaustive catalog — it's the *syllabus*: the risks so common and so damaging that every team should know them, recognize them in their own code, and have a first-line defense for each.

**The mental model:** the Top 10 is the attacker's playbook made public. Each entry is a *failure pattern* — a way your application can be made to do something it shouldn't — with a name, a mechanism, and a mitigation. When you read "injection," you should instantly think "my SQL query with string concatenation." When you read "XSS," you should think "my React component rendering user input as HTML." The list converts "security" from a vague anxiety into a checklist your code can be measured against.

## The 2021 Top 10, Ranked and Explained

**A01 — Broken Access Control (rank 1).** The app fails to enforce "who may do what": a user can view another user's data by changing an ID in the URL, or call an admin endpoint directly. The #1 web risk because it's so common and so damaging. *First defense:* enforce authorization server-side on every request (never trust client-side hiding), use object-level checks (`@PreAuthorize`, ownership checks), and deny-by-default.

**A02 — Cryptographic Failures.** Secrets stored or transmitted without proper encryption: passwords in plaintext, credit cards in logs, TLS missing. *First defense:* hash passwords with bcrypt/Argon2, encrypt sensitive data at rest, enforce HTTPS everywhere, and never log secrets.

**A03 — Injection.** Untrusted input reaches an interpreter (SQL, NoSQL, OS, LDAP) and is executed as code: `SELECT * FROM users WHERE name = '` + userInput + `'` — the attacker's `' OR '1'='1` turns the query into a logic bomb. *First defense:* parameterized queries/prepared statements (never string concatenation), ORM binding, and input validation.

**A04 — Insecure Design.** The architecture itself enables attacks — missing rate limits, no threat modeling, trust placed in client-supplied values. *First defense:* threat modeling at design time, rate limiting, and secure defaults.

**A05 — Security Misconfiguration.** Default credentials, verbose error pages exposing stack traces, unpatched components, unnecessary features enabled. *First defense:* hardened configs, least privilege, automated scanning, and the discipline of "secure by default."

**A06 — Vulnerable and Outdated Components.** Running libraries with known CVEs — the dependency you never update is the one that gets exploited. *First defense:* dependency scanning (OWASP Dependency-Check, Snyk, Dependabot) in CI, and a patch cadence.

**A07 — Identification and Authentication Failures.** Weak or broken login: session fixation, credential stuffing, no MFA, session IDs in URLs. *First defense:* strong password policy, MFA, rate-limited login, secure session management (HttpOnly, Secure cookies), and Spring Security's battle-tested defaults.

**A08 — Software and Data Integrity Failures.** Code or data that can't be verified — deserializing untrusted objects, unsigned updates, CI/CD pipelines that trust unverified code. *First defense:* signature verification, integrity checks, and never deserializing untrusted input.

**A09 — Security Logging and Monitoring Failures.** Attacks happen *undetected* because nothing is logged or monitored. *First defense:* log security events (logins, access denials, admin actions), centralize logs, and alert on anomalies.

**A10 — Server-Side Request Forgery (SSRF).** The server fetches a URL supplied by the attacker — reaching internal services, cloud metadata endpoints, or the local network from inside. *First defense:* validate/allowlist URLs, block private IP ranges, and never trust user-supplied URLs in server-side fetches.

## The Three That Bite Spring Developers Most

Every entry matters, but three dominate real Spring Boot applications:

**1. Injection (A03) — the SQL variety.** The classic vulnerability in Java is still string-built SQL:

```java
// VULNERABLE — never do this:
String sql = "SELECT * FROM users WHERE name = '" + name + "'";
jdbcTemplate.execute(sql);   // name = "'; DROP TABLE users; --" destroys the table

// SAFE — parameterized query; the input can never become code:
jdbcTemplate.query(
    "SELECT * FROM users WHERE name = ?",
    (rs, i) -> new User(rs.getString("name")), name);
```

The rule is absolute: **SQL with `?` placeholders and bound parameters, always** — whether via `JdbcTemplate`, JPA's named parameters, or an ORM. The `?` tells the database "this is data, never code" — the attacker's quotes become part of the *value*, not the query.

**2. Broken Access Control (A01) — the object-reference bug.** The most common real-world bug:

```java
@GetMapping("/api/lessons/{id}")
public LessonDto getLesson(@PathVariable Long id, Authentication auth) {
    // VULNERABLE: any authenticated user can read ANY lesson by guessing ids.
    return lessonService.findById(id);

    // SAFE: verify the caller owns (or may access) this object:
    // if (!lessonService.isAccessibleTo(id, auth.getName())) throw new ForbiddenException();
    // ...or enforce with @PreAuthorize("hasRole('ADMIN') or @lessonService.owns(#id, principal)")
}
```

**3. XSS — the stored/reflected script injection.** The classic web vulnerability: user input rendered as HTML executes the attacker's script. React/JSX escapes by default (the `<` becomes `&lt;`) — the danger returns the moment you use `dangerouslySetInnerHTML` or concatenate HTML. *First defense:* never render raw user input as HTML, use the framework's escaping (default), and apply `Content-Security-Policy` headers as the safety net.

## How to Use the Top 10, Practically

1. **Read it as a design checklist** — before building a feature, ask: "where does untrusted input enter? where do I authorize? what do I log?"
2. **Map it to your stack** — Spring Security mitigates A01/A07; prepared statements mitigate A03; dependency scanning mitigates A06; structured logging + monitoring mitigates A09. Knowing the *mitigation for each* is the skill.
3. **Test against it** — automated scanners (OWASP ZAP, Burp) run the Top 10 checks against your running app; SAST tools (Semgrep, SonarQube) scan the code. Both belong in CI.
4. **Fix the root, not the symptom** — the Top 10 entries are *categories* of failure; a fix that patches one instance without changing the pattern leaves the next instance open.

## The Follow-on Curriculum

The Top 10 is the map; the deeper lessons follow the roads: injection and XSS/CSRF get dedicated deep-dives (the next lessons in this module), authentication/authorization map to the Spring Security modules in this academy, SSRF and deserialization get their own patterns, and the OWASP **Cheat Sheet Series** is the definitive per-topic reference (password storage, SQL injection prevention, input validation — every one links from the Top 10 page).

## Recap

The OWASP Top 10 is the web security syllabus: broken access control (the #1 risk — enforce authorization server-side on every request), cryptographic failures (hash passwords, encrypt at rest, TLS), injection (parameterized queries, never string-built SQL), insecure design, misconfiguration, vulnerable components (scan dependencies in CI), auth failures (MFA, secure sessions), integrity failures (don't deserialize untrusted data), logging/monitoring gaps, and SSRF. For Spring developers, the three that bite most are **SQL injection** (fix: `?` parameters), **broken object-level access control** (fix: server-side ownership checks), and **XSS** (fix: framework escaping + CSP). Use the list as a design checklist, map each entry to your stack's mitigation, and scan/test against it in CI — the Top 10 turns "be secure" into "check these ten boxes, and check them again after every feature."
