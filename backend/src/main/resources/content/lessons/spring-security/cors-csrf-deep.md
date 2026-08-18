---
title: CORS & CSRF in Depth — Browser Security Models and API Hardening
summary: Same-origin policy, CORS preflight, when CSRF applies (cookies) vs not (Bearer tokens), and the exact configurations production APIs use.
order: 12
minutes: 20
topics: [cors, csrf, same-origin, preflight, cookies, bearer-tokens, browser-security, headers]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html
  - https://docs.spring.io/spring-security/reference/servlet/exploits/cors.html
  - https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
---

# CORS & CSRF in Depth — Browser Security Models and API Hardening

## The concept: the browser's two security models

**Same-Origin Policy (SOP):** a page from origin A cannot *read* responses from origin B. Without it, any website you visit could read your bank's API responses. **CORS** is the opt-in exception: the *server* (origin B) tells the browser which origins may read its responses, via headers:

```text
Access-Control-Allow-Origin: https://app.mybank.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Headers: Authorization, Content-Type
```

For **simple requests** (GET/POST with a few safe headers) the browser just adds the response check. For everything else — custom headers like `Authorization`, or PUT/DELETE — the browser first sends a **preflight** `OPTIONS` request and only proceeds if the server's CORS headers approve the actual request.

**CSRF (Cross-Site Request Forgery):** an attack where a *logged-in* user's browser is tricked into sending a state-changing request to a site where the user has an active **cookie session**. The browser *will* attach cookies automatically, so a malicious page can POST "transfer money" — the victim's cookie authenticates it. The defense is a **CSRF token**: a per-session secret the page must send with each state-changing request. An attacker's page cannot read the token (SOP), so forged requests fail.

## The key question: cookies or Bearer tokens?

CSRF protection exists because **cookies are attached automatically**. If your API authenticates with `Authorization: Bearer <jwt>` from `localStorage`, the browser does **not** attach it automatically — the JS must explicitly add it. A CSRF attack can't send a header it can't read, so **token-in-header APIs generally disable CSRF** (and Spring Security does exactly that when you configure a stateless session):

```java
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http
        .csrf(csrf -> csrf.disable())          // Bearer-token API: no cookie, no CSRF risk
        .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/api/auth/**").permitAll()
            .anyRequest().authenticated());
    return http.build();
}
```

If instead your app uses **cookie sessions** (traditional server-rendered, or session-based auth), CSRF protection must stay **on**:

```java
http.csrf(Customizer.withDefaults());          // default ON for cookie-based apps
// plus: http.csrf(csrf -> csrf.ignoringRequestMatchers("/api/webhook/**"));
//       — public webhooks are exempt because they're unauthenticated
```

## How we use it in an organization: the scenarios

**Scenario 1 — SPA frontend at a different origin calling the API.** Vite dev server on `localhost:5173`, API on `localhost:8080` — that's two origins, so CORS is needed in dev. Production often proxies through the same origin (Vercel rewrites `/api/*` to the backend), but a separate API origin needs explicit CORS:

```java
@Configuration
public class CorsConfig {
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(List.of(
            "https://app.example.com",          // prod SPA — explicit, not "*"
            "http://localhost:5173"));          // dev server
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Requested-With"));
        cfg.setExposedHeaders(List.of("X-Total-Count", "Location"));
        cfg.setAllowCredentials(true);          // only if cookies are used; must NOT be "*" then
        cfg.setMaxAge(3600L);                   // cache preflight for an hour
        UrlBasedCorsConfigurationSource src = new UrlBasedCorsConfigurationSource();
        src.registerCorsConfiguration("/api/**", cfg);
        return src;
    }
}
// Then: http.cors(Customizer.withDefaults()) in the filter chain
```

Production rules: **explicit allow-list** (never `*` for credentialed requests), scoped to `/api/**`, and `OPTIONS` must pass through unauthenticated (Spring's `cors()` integration handles preflight before auth).

**Scenario 2 — cookie-session app with CSRF.** Keep CSRF on, and have the SPA fetch the token from an endpoint or embed it in the initial HTML, then send it as the `X-CSRF-TOKEN` header on mutations.

**Scenario 3 — third-party webhooks.** Public endpoints (`/api/webhook/stripe`) that are called by Stripe, not a browser, get **no CSRF** (unauthenticated — nothing to forge) but *do* need their own signature verification (HMAC of the body) — CSRF is not the defense for webhooks; signatures are.

**Scenario 4 — same-origin deployments.** If the SPA and API share an origin (Vercel rewrite, Nginx proxy), CORS is unnecessary — the browser sees one origin. Many teams "fix" a CORS error by adding wildcard allow-origin; the *correct* fix is often a reverse-proxy so there's no cross-origin call at all (also avoids preflight latency on every request).

## Pitfalls

- **`Access-Control-Allow-Origin: *` with `Allow-Credentials: true` is invalid** and browsers reject it — pick explicit origins or no credentials, not both.
- **CORS is not authorization** — it's a browser policy. curl and server-to-server calls ignore it entirely. Your API still needs authentication and input validation; CORS only gates *browser* reads.
- **CSRF token in localStorage** defeats CSRF protection (an XSS can read it) — the token belongs in a cookie or the page, and is only meaningful for cookie-based sessions.
- **Disabling CSRF "because we use JWT"** is correct only if tokens are sent via header. A JWT in a cookie *is* cookie-based and needs CSRF.
- **Preflight caching** (`maxAge`) matters in hot SPAs — without it every mutating call costs an extra round-trip.

## Key takeaways

- CORS = server opt-in to the browser's Same-Origin Policy; preflight guards non-simple requests.
- CSRF matters only when cookies carry auth; Bearer-header APIs can disable it.
- Cookie sessions: keep CSRF on and wire the token; stateless JWT: disable and use headers.
- Allow-list origins explicitly; never combine `*` with credentials; scoped to `/api/**`.
- Webhooks are protected by signatures, not CSRF; same-origin proxying avoids CORS entirely.
