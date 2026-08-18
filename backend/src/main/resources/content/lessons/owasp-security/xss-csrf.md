---
title: XSS and CSRF — The Browser Attacks
module: owasp-security
order: 3
minutes: 27
topics: ["XSS", "CSRF", "content security policy", "same-origin policy", "CORS", "browser security"]
docs:
  - title: "Cross-Site Scripting Prevention Cheat Sheet (OWASP)"
    url: "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html"
  - title: "Cross-Site Request Forgery Prevention Cheat Sheet (OWASP)"
    url: "https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html"
---

# XSS and CSRF — The Browser Attacks

## The Concept: Attacking Through the Browser

Two of the most misunderstood web attacks share a theme: they abuse the *browser's trust*. **XSS (Cross-Site Scripting)** makes your application *execute the attacker's JavaScript* in a victim's browser — giving the attacker everything the page can do. **CSRF (Cross-Site Request Forgery)** makes the victim's browser *send authenticated requests* the victim never intended — "you logged into my bank; now this page quietly tells your bank to transfer money." One executes attacker code in your app; the other rides the victim's session to your app.

**The mental model — XSS:** your page is a stage, and the attacker's script is an uninvited actor. Anywhere your app renders *untrusted input as HTML*, the input can contain `<script>` (or event handlers like `<img onerror=...>`) that runs with your page's privileges: read cookies, call your APIs as the logged-in user, deface the page. The browser trusts your origin — so the attacker's code, once inside your origin, gets that trust.

**The mental model — CSRF:** the browser is a butler that carries the session cookie *automatically* to your origin, no matter who asked. A malicious page on another origin can submit a form or fire an image request to `https://bank.com/transfer?to=attacker&amount=1000` — and the butler (browser) attaches your bank session cookie, because the request goes *to your origin*. The server can't tell the difference between "you clicked transfer" and "another page made the browser do it."

## XSS: The Three Flavors

**1. Reflected XSS** — the input goes *into the response immediately* (a search query echoed back):

```text
GET /search?q=<script>alert('xss')</script>
Response: <p>You searched for: <script>alert('xss')</script></p>
```
The victim must click a crafted link; the script runs in the response.

**2. Stored (persistent) XSS** — the input is *saved* and rendered later, for every visitor (a comment, a profile field):

```text
Comment submitted: <script>fetch('/api/account').then(...send to attacker...)</script>
-> stored in the DB, rendered for every user who views the comment
```
The most dangerous flavor: no click required, every visitor affected.

**3. DOM-based XSS** — the input never reaches the server; client-side JavaScript reads it (from the URL hash, localStorage) and injects it into the DOM via `innerHTML`.

## Preventing XSS: The Defense Layers

```jsx
// React/JSX — the framework escapes by default:
return <p>Hello {userInput}</p>;      // SAFE: <script> renders as text
// return <p dangerouslySetInnerHTML={{__html: userInput}} />;  // UNSAFE

// The rules:
// 1. NEVER render untrusted input as raw HTML (no innerHTML, no
//    dangerouslySetInnerHTML with user data).
// 2. Use the framework's text rendering — it escapes <, >, &, ", '.
// 3. If rich HTML is genuinely required, sanitize with a library
//    (DOMPurify) — never roll your own "strip script tags."
```

**Server-side (for any rendered HTML):**

1. **Context-aware output encoding** — encode for the context (HTML body, attribute, URL, JavaScript) — the OWASP XSS cheat sheet's tables per context.
2. **Content-Security-Policy (CSP)** — the *safety net*: an HTTP header that tells the browser what's allowed to execute. Even if a script slips through, CSP blocks it:

```text
Content-Security-Policy: default-src 'self'; script-src 'self';
# Only scripts from the same origin may run. Inline scripts/event
# handlers (the XSS vehicle) are blocked. This turns "script executed"
# into "script blocked" — the difference between a breach and a log line.
```

3. **HttpOnly cookies** — `Set-Cookie: session=...; HttpOnly` — JavaScript can't read the cookie, so XSS can't *steal the session* (it can still act *as* the session in the page, but the cookie itself is safe from exfiltration).

The layered view: escaping prevents the script from forming; CSP blocks it if it forms anyway; HttpOnly protects the session if it somehow runs. Defense in depth, three independent layers.

## CSRF: The Attack and the Fixes

```html
<!-- The attacker's page (evil.com) — the victim just visits it: -->
<img src="https://bank.com/transfer?to=attacker&amount=10000" />
<!-- The browser sends the request WITH the bank's session cookie -->
<!-- (cookies are origin-scoped, not page-scoped). Bank executes the transfer. -->
```

**The preconditions:** a state-changing request (GET with side effects, or POST) that relies *only* on the session cookie for authentication, with no unpredictable value the attacker can't know.

**The defenses (layered):**

**1. Synchronizer token (the standard)** — the server embeds an unpredictable token in the form/session; every state-changing request must carry it:

```html
<form method="POST" action="/transfer">
  <input type="hidden" name="_csrf" value="7F3dK9..." />
  ...
</form>
```
The attacker's page can't read the token (same-origin policy blocks reading your responses) — so their forged request lacks it and fails.

**Spring Security does this automatically**: it injects the CSRF token into forms and validates it on every state-changing request (enabled by default for cookie-based sessions).

**2. SameSite cookies** — the modern defense: `Set-Cookie: session=...; SameSite=Lax` (or `Strict`) tells the browser *not* to send the cookie on cross-site requests — the CSRF request arrives *without* the session, and fails:

```properties
server.servlet.session.cookie.same-site=lax
```

**3. Verify the Origin/Referer** — the server checks the request's `Origin` header against the allowlist; a cross-site request has the attacker's origin.

**The SPA/REST caveat:** token-based auth (JWT in a header, not a cookie) is inherently CSRF-resistant — a cross-site page can't attach your `Authorization` header (it's not auto-sent like cookies). That's why Spring Security's CSRF protection is often disabled for pure Bearer-token APIs — and why cookie-based sessions *must* keep it on.

## CORS: The Cousin That's Often Confused

**CORS (Cross-Origin Resource Sharing)** is *not* a CSRF defense — it's the browser's rule for when a *page* on origin A may *read responses* from origin B. Same-origin policy blocks reads by default; CORS headers relax that for legitimate cross-origin APIs:

```java
// Spring: allow the React SPA at localhost:5173 to call the API:
@Configuration
public class CorsConfig {
    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(List.of("http://localhost:5173"));
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE"));
        cfg.setAllowedHeaders(List.of("*"));
        UrlBasedCorsConfigurationSource src = new UrlBasedCorsConfigurationSource();
        src.registerCorsConfiguration("/api/**", cfg);
        return src;
    }
}
```

**The critical distinction:** CORS controls *reading responses from other origins* — it does NOT stop the browser from *sending* requests (the CSRF vector). A `fetch` from evil.com to bank.com is *sent* regardless of CORS; CORS only decides whether evil.com can *read the response*. And a misconfigured CORS (`Access-Control-Allow-Origin: *` with credentials) turns same-origin protection off entirely. **Configure CORS as an exact allowlist** — never a wildcard with credentials — and keep CSRF protection for cookie-based sessions.

## The Defense Summary

| Attack | Mechanism | Primary defense | Secondary |
|---|---|---|---|
| XSS | attacker script runs in your page | escape output (framework default) | CSP, HttpOnly cookies |
| CSRF | browser auto-sends session cookie | CSRF token (Spring default) | SameSite cookies, Origin check |
| CORS misuse | reads allowed across origins | exact allowlist, no `*` with credentials | — |

## Recap

XSS and CSRF are browser-trust attacks: XSS makes your page *execute attacker JavaScript* (reflected, stored, or DOM) — prevented by output escaping at the framework level, with CSP and HttpOnly cookies as the safety net. CSRF makes the victim's browser *send authenticated requests* the victim never intended — prevented by Spring Security's CSRF tokens (default), SameSite cookies, and Origin checks; token-based APIs are inherently resistant. CORS is the separate rule about cross-origin *reads*, configured as an exact allowlist and never as a credentials-bearing wildcard. The mental model to keep: **the browser trusts your origin and auto-sends your cookies — your defenses must ensure that trust can only be used by your page, for your user's intent.**
