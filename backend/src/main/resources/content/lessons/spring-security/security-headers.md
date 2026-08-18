---
title: Security Headers — HSTS, CSP, X-Frame-Options and More
summary: The response headers that harden a browser-facing app, how Spring Security sets them by default, and the CSP configuration scenarios.
order: 15
minutes: 17
topics: [security-headers, hsts, csp, x-frame-options, content-security-policy, referrer-policy, headers]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/exploits/headers.html
  - https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy
---

# Security Headers — HSTS, CSP, X-Frame-Options and More

## The concept: the browser is part of the attack surface

Every response your app sends is interpreted by a browser that applies security *policies* — and those policies are set by **response headers**. Without them, the browser applies its weakest defaults. Spring Security enables a sensible **default header set** automatically (`headers` is on by default); knowing what each one does — and when to tighten it — is the security-headers skill.

## The default set, explained

```java
// All enabled by default — this is what Spring Security sends:
http.headers(headers -> headers
    .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31536000))
    .frameOptions(f -> f.sameOrigin())          // X-Frame-Options: SAMEORIGIN
    .contentTypeOptions(Customizer.withDefaults())  // X-Content-Type-Options: nosniff
    .xssProtection(x -> x.disable())            // X-XSS-Protection off (deprecated, replaced by CSP)
    .cacheControl(Customizer.withDefaults())    // Cache-Control: no-cache for sensitive content
    .referrerPolicy(p -> p.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.SAME_ORIGIN))
    .permissionsPolicy(p -> p.policy("camera=(), microphone=(), geolocation=()"))
);
```

| Header | What it prevents |
|---|---|
| `Strict-Transport-Security` (HSTS) | The browser only ever uses HTTPS for this domain — blocks downgrade attacks and SSL-stripping |
| `X-Frame-Options: SAMEORIGIN` | Clickjacking — your pages can't be embedded in another site's iframe |
| `X-Content-Type-Options: nosniff` | MIME-sniffing attacks — the browser won't guess the content type |
| `Cache-Control: no-cache` | Sensitive responses cached by shared proxies |
| `Referrer-Policy: same-origin` | Controls what URL info leaks in the `Referer` header |
| `Permissions-Policy` | Restricts browser features (camera, geolocation) for your origin |

## Content-Security-Policy — the most powerful, hardest to configure

CSP tells the browser **what resources are allowed to load** and from where. It's the modern defense-in-depth against XSS: even if an attacker injects a script, CSP blocks it unless the policy allows that source.

```java
http.headers(headers -> headers.contentSecurityPolicy(
    "default-src 'self'; " +
    "script-src 'self' 'nonce-{nonce}'; " +          // only same-origin + nonce'd inline scripts
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https://cdn.example.com; " +
    "connect-src 'self' https://api.example.com; " +
    "frame-ancestors 'self'; " +
    "base-uri 'self'; form-action 'self'"));
```

**The nonce trick:** `'nonce-{nonce}'` lets Spring generate a per-response nonce; your inline scripts carry `nonce="..."` and only those run — a precise way to allow legitimate inline scripts without `'unsafe-inline'` (which defeats CSP's script protection).

**Rollout strategy in orgs (CSP is notoriously easy to break):**

1. Start in **report-only** mode — `Content-Security-Policy-Report-Only` logs violations without blocking.
2. Collect violations for a week; fix the legitimate ones (inline styles, CDN scripts).
3. Move to enforcing CSP with the report endpoint still monitoring regressions.

CSP mistakes break pages *silently* (blocked resources, no error) — the report-only path is how mature teams avoid "CSP broke our dashboard" incidents.

## How we use it in an organization: the scenarios

**Scenario 1 — HTTPS-only API/web app.** HSTS with `includeSubDomains` and a long max-age — after one visit, the browser refuses plain HTTP for a year. (Caveat: only set `includeSubDomains` when *every* subdomain supports HTTPS.)

**Scenario 2 — admin console anti-clickjacking.** `frame-options: SAMEORIGIN` keeps your admin UI from being iframed by a phishing page that overlays fake inputs.

**Scenario 3 — SPA with CSP.** The frontend needs scripts from its own origin + analytics CDN; `script-src 'self' https://cdn.example.com` with nonces for any inline bootstrap script. The API's CSP is separate — the SPA's index.html carries it (or it's set on the static host), and the API headers protect API responses.

**Scenario 4 — report-only CSP rollout** for a legacy app: `report-only` + a violation collector (a small `/csp-report` endpoint or a SaaS) for a month before enforcing.

## Pitfalls

- **CSP blocking legitimate features** — inline handlers, `eval()`-based code, data: images all need explicit allowance; test every page after a policy change.
- **`'unsafe-inline'` in script-src** — this mostly defeats CSP for XSS; use nonces/hashes for inline scripts.
- **HSTS on a site with mixed content** — once HSTS is cached, any HTTP subresource fails hard; move everything to HTTPS first.
- **Headers on API responses vs HTML** — an API serving JSON may not need CSP at all (no HTML to protect); apply header hardening where HTML is rendered. Spring Security applies them everywhere by default — configure per-chain if needed.
- **Frame-ancestors vs X-Frame-Options** — CSP's `frame-ancestors` is the modern replacement; set both during migration, drop the older one after.

## Key takeaways

- Spring Security's default header set covers HSTS, clickjacking, nosniff, caching, referrer — keep it on.
- CSP is the strongest XSS defense and the most fragile to configure — roll out report-only first.
- HSTS forces HTTPS; only include subdomains when all subdomains support TLS.
- Headers matter per response type — tighten for HTML, simplify for pure JSON APIs.
- Use nonces for inline scripts; avoid `'unsafe-inline'` in script-src.
