---
title: Security Exception Handling — Entry Points, Denied Handlers and 401/403
summary: AuthenticationEntryPoint vs AccessDeniedHandler, why security errors bypass @ControllerAdvice, and the JWT-API error-response patterns.
order: 16
minutes: 17
topics: [authenticationentrypoint, accessdeniedhandler, 401, 403, security-exceptions, error-handling]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/authentication/architecture.html
  - https://docs.spring.io/spring-security/reference/servlet/authorization/architecture.html
---

# Security Exception Handling — Entry Points, Denied Handlers and 401/403

## The concept: security failures bypass your @ControllerAdvice

Exceptions thrown by the **security filter chain** (missing token, bad credentials, insufficient role) are thrown *before* your controller runs — so `@RestControllerAdvice` never sees them. Spring Security handles them with two dedicated components:

1. **`AuthenticationEntryPoint`** — what happens when the request is **unauthenticated** (no/invalid token): the 401 path. Default: redirect to a login page (form login) or `403`/`401` (default for APIs).
2. **`AccessDeniedHandler`** — what happens when an **authenticated** user lacks permission: the 403 path. Default: forward to `/error` (which your error controller renders).

For a JSON API, both must be customized to return JSON with the right status — otherwise clients get HTML or wrong statuses.

## The JWT-API configuration

```java
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    return http
        .csrf(csrf -> csrf.disable())
        .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .exceptionHandling(ex -> ex
            .authenticationEntryPoint((request, response, authException) -> {
                response.setStatus(HttpStatus.UNAUTHORIZED.value());
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                response.getWriter().write("{\"status\":401,\"error\":\"Unauthorized\","
                    + "\"message\":\"Missing or invalid authentication token\"}");
            })
            .accessDeniedHandler((request, response, accessDeniedException) -> {
                response.setStatus(HttpStatus.FORBIDDEN.value());
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                response.getWriter().write("{\"status\":403,\"error\":\"Forbidden\","
                    + "\"message\":\"You do not have permission for this resource\"}");
            }))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/api/auth/**", "/actuator/health").permitAll()
            .anyRequest().authenticated())
        .build();
}
```

Both handlers write JSON directly to the response — the pattern for stateless APIs. (Teams often extract a small `writeError(...)` helper or use `response.sendError` + a filter-mapped error handler for consistency with the `@ControllerAdvice` shape.)

## The exception → handler mapping

| Exception | Handler | Status |
|---|---|---|
| `AuthenticationException` (bad/missing token) | `AuthenticationEntryPoint` | 401 |
| `AccessDeniedException` (authenticated, not allowed) | `AccessDeniedHandler` | 403 |
| `InsufficientAuthenticationException` | Entry point (usually) | 401 |
| `AuthenticationCredentialsNotFoundException` | Entry point | 401 |

**The trap:** `InsufficientAuthenticationException` (unauthenticated access to a protected resource) and `AccessDeniedException` are *different* types — a common bug is mapping both to the same handler and returning 403 for unauthenticated requests (breaking clients that react to 401 by prompting login).

## The 401 vs 403 rule, in security terms

- **401 Unauthorized** — "I don't know who you are": no token, expired token, invalid signature, malformed credentials. Client should re-authenticate.
- **403 Forbidden** — "I know who you are, but you can't do this": authenticated but role/permission insufficient. Client should NOT retry with credentials.

Spring Security distinguishes them for you (entry point vs denied handler) — keep the mapping clean so API consumers can rely on the semantics.

## How we use it in an organization: the scenarios

**Scenario 1 — consistent error shape with the rest of the API.** The security handlers write the *same* `ApiError` JSON the `@ControllerAdvice` uses — one client-side error parser works for security failures too. Teams share a `writeError(response, status, code)` helper between the two handlers and the advice.

**Scenario 2 — form-login redirects for a web app.** For a server-rendered admin UI, the entry point *should* redirect to `/login` (not return JSON) and the denied handler redirect to a 403 page — the inverse of the API pattern. Per-chain configuration keeps both behaviors in one app (API chain JSON, admin chain redirects).

**Scenario 3 — method-security failures.** `@PreAuthorize` denials throw `AccessDeniedException` *inside* the controller call — these DO reach `@RestControllerAdvice` (they're within MVC). A `@ExceptionHandler(AccessDeniedException.class)` in the advice maps them to 403, complementing the filter-chain denied handler. Both paths end in the same 403 JSON.

**Scenario 4 — custom 401 for missing token vs expired token.** Some teams distinguish "no token" from "expired token" with different codes/messages (a client may refresh on one, re-login on the other) — the entry point inspects the exception and writes accordingly.

## Pitfalls

- **Relying on @ControllerAdvice for security errors** — it never fires for filter-chain failures; both layers must be configured.
- **Returning the default HTML error page from a JSON API** — the signature "my API returned HTML for a 401" bug; always set `Content-Type: application/json`.
- **401 for unauthenticated, 403 for everything** — clients break (refresh logic, login prompts) when the semantics blur.
- **Error pages via forward** — the default denied handler forwards to `/error`; the error controller must produce JSON for API clients (see the error-handling lesson).
- **Exceptions in the entry point itself** — an exception thrown *while writing* the 401 (a serialization failure) causes a 500 with no body; keep the handlers dead simple.

## Key takeaways

- Filter-chain security failures never reach `@RestControllerAdvice` — configure the entry point and denied handler.
- `AuthenticationEntryPoint` → 401 (unauthenticated); `AccessDeniedHandler` → 403 (not allowed).
- JSON APIs must write JSON in both handlers — never the default HTML error page.
- Keep the 401/403 semantics clean: clients react differently to each.
- Method-security denials (inside MVC) do reach the advice — map `AccessDeniedException` there too.
