---
title: CORS, CSRF & API Hardening
summary: Why browsers enforce same-origin, when CSRF protection matters, security headers, and rate limiting.
order: 7
minutes: 15
topics: [cors, csrf, headers, hardening, rate-limiting]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/exploits/cors.html
  - https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html
---

# CORS, CSRF & API Hardening

## CORS: browsers decide what they may call

A browser enforces the **same-origin policy**: `https://app.example.com` cannot read responses from `https://api.example.com` unless the API explicitly allows it via CORS headers. It's not an attack blocker — it's a browser rule for *who may read*.

```java
@Bean
CorsConfigurationSource corsConfigurationSource(AppProperties props) {
    CorsConfiguration cfg = new CorsConfiguration();
    cfg.setAllowedOrigins(props.cors().allowedOrigins());   // explicit allowlist, never "*"
    cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
    cfg.setAllowedHeaders(List.of("*"));
    cfg.setAllowCredentials(true);                          // when using cookies
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", cfg);
    return source;
}
```

Rules: allowlist exact origins (no `*` with credentials), match methods/headers to what you actually use, and know that **CORS is enforced by the browser, not the server** — curl can always call you.

## CSRF: state-changing requests without your consent

CSRF attacks exploit **cookies**: an attacker's page makes your browser send a request *with your session cookie* to your app. Classic defenses: a CSRF token the server verifies, or **no cookies at all**.

```java
// Stateless JWT API: token in the Authorization header, no cookies →
// there is nothing for the attacker's page to carry → CSRF is a non-issue.
http.csrf(AbstractHttpConfigurer::disable);
```

**When CSRF protection matters**: session/cookie-based auth (classic form login, server-rendered apps). Then enable it and serve the token. The decision rule:

| Auth mechanism | CSRF |
|---|---|
| Bearer token in header (JWT/OAuth2) | disable — no cookie to exploit |
| Cookie/session auth | enable — mandatory |

## Security headers

Spring Security sets sane defaults; tune the important ones:

```yaml
server:
  forward-headers-strategy: framework
```

```java
http.headers(h -> h
    .contentSecurityPolicy(csp -> csp.policyDirectives(
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"))
    .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31536000))
    .frameOptions(f -> f.sameOrigin()));
```

| Header | Blocks |
|---|---|
| `Content-Security-Policy` | XSS via inline scripts/styles |
| `Strict-Transport-Security` | HTTP downgrade attacks (always on in prod) |
| `X-Content-Type-Options: nosniff` | MIME-sniffing attacks |
| `X-Frame-Options` / CSP `frame-ancestors` | Clickjacking |

## Rate limiting & brute-force defense

```java
@Component
public class RateLimitFilter extends OncePerRequestFilter {
    private final Cache<String, AtomicInteger> attempts = Caffeine.newBuilder()
            .expireAfterWrite(1, TimeUnit.MINUTES).maximumSize(10_000).build();

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String key = req.getRemoteAddr() + "|" + req.getRequestURI();
        AtomicInteger count = attempts.get(key, k -> new AtomicInteger());
        if (count.incrementAndGet() > 60) {
            res.setStatus(429);                      // Too Many Requests
            return;
        }
        chain.doFilter(req, res);
    }
}
```

Also: lock accounts after N failed logins (or back off), validate input at the boundary, and never trust client-supplied identity.

> **Why it matters (organizational view)** — Hardening is a checklist, not a vibe: CORS allowlist, CSRF decision documented per app, security headers on, rate limits on login and public endpoints, secrets in env, `Content-Security-Policy` for anything serving HTML. Pen-test findings almost always trace back to one of these five.

## Key takeaways

- CORS = browser read-policy; allowlist origins explicitly.
- CSRF matters only with cookie/session auth; JWT-in-header APIs disable it.
- Set CSP/HSTS/nosniff; they're one-liners.
- Rate-limit login and public endpoints; 429 on abuse.

**Official docs:** [CORS](https://docs.spring.io/spring-security/reference/servlet/exploits/cors.html) · [CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html)
