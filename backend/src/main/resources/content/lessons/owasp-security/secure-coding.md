---
title: Secure Coding — Deserialization, SSRF, Logging, and Secrets
module: owasp-security
order: 5
minutes: 27
topics: ["deserialization", "SSRF", "secure logging", "secrets management", "input validation", "secure defaults"]
docs:
  - title: "Deserialization Cheat Sheet (OWASP)"
    url: "https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html"
  - title: "Server-Side Request Forgery Prevention Cheat Sheet (OWASP)"
    url: "https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html"
summary: Injection, XSS, and access control get the attention; the quieter vulnerabilities get the breaches. This lesson covers four productioncritical area...
---

# Secure Coding — Deserialization, SSRF, Logging, and Secrets

## The Concept: The Vulnerabilities Beyond the Top 10's Headlines

Injection, XSS, and access control get the attention; the quieter vulnerabilities get the breaches. This lesson covers four production-critical areas that every serious codebase must handle deliberately: **deserialization** (untrusted data that becomes objects), **SSRF** (server-side fetches of attacker-chosen URLs), **secure logging** (what you log and what you never log), and **secrets management** (where credentials live). None is exotic — all four appear in everyday Spring applications.

## Deserialization: Turning Untrusted Bytes Into Objects

**The danger:** deserialization reconstructs *objects* from bytes — and object construction can *execute code*. The classic attack: a serialized object whose class has a dangerous `readObject`/gadget chain runs arbitrary commands the moment it's deserialized. Java's native `ObjectInputStream` + `Serializable` is the highest-risk combo — which is why the ecosystem moved away from it.

```java
// VULNERABLE pattern — deserializing untrusted input with the JDK:
// ObjectInputStream in = new ObjectInputStream(untrustedStream);
// Object obj = in.readObject();      // could be an attack gadget!

// The mitigations, in order:
// 1. DON'T use Java serialization for untrusted input. Use safe formats:
//    JSON (Jackson) / Protobuf / etc. — data, not executable objects.
// 2. If you MUST deserialize, validate the stream's classes against an
//    ALLOWLIST (not a denylist) before constructing:
//    in.setObjectInputFilter(Filter.classNameMatches("com.academy.**")
//                            .maxDepth(10).maxArrayLength(1000).build());
// 3. Never accept serialized objects from clients — serialization is for
//    your own trusted persistence, not for network boundaries.
```

**The practical rules:** JSON APIs (the norm in Spring) don't hit the `readObject` danger — Jackson builds POJOs from typed, bounded data. The risk returns with: Java serialization over the wire, unsafe `yaml.load` of untrusted YAML (snakeyaml gadgets), and unsafe deserialization of RMI/JMX payloads. The single rule that covers them all: **never deserialize untrusted input with a format that can instantiate arbitrary classes.** Jackson's `DefaultTyping` (polymorphic typing) is the subtle one — enable it only with a strict allowlist.

## SSRF: The Server as the Attacker's Proxy

**Server-Side Request Forgery:** the application fetches a URL *the attacker chose* — and the server's network position (inside the firewall, with cloud credentials) makes the fetch dangerous: reaching internal services (`http://localhost:5432`, `http://10.0.0.5/...`), the cloud metadata endpoint (`http://169.254.169.254/latest/meta-data/` — AWS credentials!), or the internal network.

```java
// VULNERABLE — the URL comes straight from the request:
@GetMapping("/fetch")
public String fetch(@RequestParam String url) {
    // GET /fetch?url=http://169.254.169.254/latest/meta-data/iam/security-credentials
    // -> the server fetches the CLOUD METADATA endpoint — credential theft!
    return restClient.get().uri(url).retrieve().body(String.class);
}

// SAFE — allowlist the destinations; never raw user URLs:
@GetMapping("/fetch")
public String fetch(@RequestParam String path) {
    // 1. Only internal, approved hosts are reachable:
    if (!path.startsWith("/public-assets/")) throw new ForbiddenException();
    return restClient.get().uri("https://assets.academy.com" + path)
                     .retrieve().body(String.class);
    // 2. Or: resolve the host and REJECT private/loopback/link-local IPs
    //    (DNS rebinding aware), and block the metadata endpoints explicitly.
}
```

**The defenses, layered:** allowlist destinations (best), reject private/loopback/link-local IP ranges after DNS resolution, block the cloud metadata addresses, disable redirects or validate them, and use a dedicated egress proxy. The trigger to audit: *any* place your server fetches a URL derived from user input — webhooks, image proxies, "preview" features.

## Secure Logging: The Audit Trail That Must Not Leak

Logging cuts both ways: **not enough** logging hides attacks (A09); **too much** logging leaks secrets. The discipline:

```java
// NEVER log:
log.info("User logged in: {}", user.getPassword());        // password!
log.info("Token: {}", authHeader);                          // credentials!
log.info("DB connection: {}", datasourceUrl + ":" + dbPassword);
// (and never log credit cards, SSNs, full addresses by default)

// The habits:
// 1. Log what's USEFUL for incident response:
log.info("Login success: user={}, ip={}", user.getId(), ip);       // who, from where
log.warn("Login failed: user={}, ip={}, reason={}", user, ip, "bad password");
log.error("Payment failed: txn={}, reason={}", txnId, reason);      // traceable, not sensitive

// 2. Sanitize structured logs (Logback + JSON encoder): mask fields.
// 3. Centralize + alert (the ELK/Prometheus story from observability).
```

**The incident-response test:** if an account is compromised, can your logs answer *who, when, from where, and what they did* — without *also* revealing credentials? Logins, failures, permission denials, admin actions, and data exports are the events that matter.

## Secrets Management: Where Credentials Live

The modern rules are unambiguous:

1. **Never in source code, config files in the repo, or images.** A committed secret is a breached secret — scan repos (`gitleaks`, GitHub secret scanning).
2. **Environment-injected at runtime** — from the deployment platform's secret store (Render/Vercel env vars, K8s Secrets, AWS Secrets Manager), never baked in.
3. **Spring's pattern** — reference env vars in config, keep the values outside the repo:

```properties
# application.properties — the key NAMES live in the repo:
spring.datasource.password=${DB_PASSWORD}
app.jwt.secret=${JWT_SECRET}
# ...the VALUES come from the environment at deploy time.
```

4. **Rotate regularly** — secrets have shelf lives; rotation turns a leaked secret from a breach into an incident log.
5. **Never log them** (the previous section) and mask them in config dumps (Actuator's `/actuator/env` shows values — restrict it in production).

## The Secure-By-Default Mindset

The meta-pattern behind every lesson in this module:

- **Deny by default** — features off until needed, endpoints closed until opened, formats restricted until justified.
- **Least privilege** — the app's DB account can't drop tables; the token can't do more than the page needs; the service can't reach the metadata endpoint.
- **Fail closed** — on error or misconfiguration, deny rather than allow (an exception in an authorization check should deny, not pass).
- **Validate at the boundary** — input is untrusted until proven otherwise; types, lengths, and formats are checked where they enter.
- **Defense in depth** — three independent layers (escape, CSP, HttpOnly) beat one perfect layer.

## The Audit Checklist for New Features

1. Where does untrusted input enter? (forms, URLs, headers, files, deserialized data)
2. Is every object reference authorized (IDOR check)?
3. Does anything fetch a URL derived from input (SSRF)?
4. What do we log, and what sensitive values are excluded?
5. Where do secrets come from, and are they out of the repo?
6. Is the feature deny-by-default, least-privilege, fail-closed?
7. Are the security-relevant events monitored and alertable?

## Recap

Beyond the headline vulnerabilities: **deserialization** must never reconstruct arbitrary classes from untrusted input (JSON/typed formats over Java serialization; allowlists over denylists); **SSRF** means no server-side fetch of user-chosen URLs (allowlist destinations, block private/metadata addresses); **secure logging** records who/when/from-where for incident response while never leaking credentials; and **secrets** live in deploy-time environment stores, never in repos or logs. The mindset uniting them — deny by default, least privilege, fail closed, validate at the boundary, defend in depth — is what makes a codebase *secure by design* rather than secure by patching. Run every feature through the audit checklist, and the quiet vulnerabilities stop being quiet surprises.
