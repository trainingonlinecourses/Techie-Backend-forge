---
title: The Security Filter Chain
summary: SecurityFilterChain, ordering, and how each request travels through security filters.
order: 2
minutes: 16
topics: [filter-chain, securityfilterchain, filters]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/architecture.html#servlet-securityfilterchain
  - https://docs.spring.io/spring-security/reference/servlet/architecture.html#servlet-filters-review
---

# The Security Filter Chain

## What it is

Security in a servlet app is a **chain of filters**. Each request passes through, and filters can: pass it along, short-circuit it (401/403), or mutate the request/response. Spring Security configures the chain for you via `SecurityFilterChain`.

```java
@Bean
SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http
        .csrf(csrf -> csrf.disable())
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/api/auth/**", "/actuator/health").permitAll()
            .anyRequest().authenticated());
    return http.build();
}
```

## The default order of filters (simplified)

```
1. SecurityContextHolderFilter      — populate/clear the SecurityContext
2. CorsFilter                       — CORS headers / preflight handling
3. CsrfFilter                       — token check (stateful apps)
4. UsernamePasswordAuthenticationFilter — form login (stateful)
5. [YOUR JwtAuthFilter]             — Bearer token → authentication
6. AnonymousAuthenticationFilter    — "anonymous" principal for public routes
7. ExceptionTranslationFilter       — convert errors → 401/403 responses
8. AuthorizationFilter              — the authorizeHttpRequests rules
   → Controller
```

## Custom filters: where and how

Filters are beans; add yours before/after the built-ins:

```java
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String username = jwtService.subject(header.substring(7));
            if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
                users.findByUsername(username).ifPresent(user -> {
                    var auth = new UsernamePasswordAuthenticationToken(
                            new UserPrincipal(user), null, List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole())));
                    SecurityContextHolder.getContext().setAuthentication(auth);
                });
            }
        }
        chain.doFilter(request, response);
    }
}
```

```java
http.addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
```

`OncePerRequestFilter`: runs exactly once per request even with filter chains/forwards.

## Matching rules: the order matters

```java
.authorizeHttpRequests(auth -> auth
    .requestMatchers("/api/auth/**").permitAll()      // specific first
    .requestMatchers("/api/admin/**").hasRole("ADMIN")
    .requestMatchers(HttpMethod.GET, "/api/content/**").permitAll()
    .anyRequest().authenticated())                    // catch-all last
```

Rules are evaluated **top to bottom**, first match wins. Put specific rules before catch-alls.

## Multiple chains

You can register several `SecurityFilterChain` beans, matched by path — e.g. a public chain for `/api/public/**` and a strict one for everything else. Only the first matching chain runs.

> **Why it matters (organizational view)** — The filter chain is where ALL access policy lives, in one readable block. Debugging "why is this endpoint accessible?" = read the chain. Debugging "why is this endpoint blocked?" = read the chain. Org standard: one `SecurityConfig` per app, rules ordered specific→general, custom auth filters injected at a known position, and no security logic scattered in controllers.

## Key takeaways

- Requests flow through filters; any can short-circuit or authenticate.
- `authorizeHttpRequests` evaluates top-down, first match wins.
- Custom filters (`OncePerRequestFilter`) slot in via `addFilterBefore/After`.
- One security config per app; rules specific → catch-all.

**Official docs:** [SecurityFilterChain](https://docs.spring.io/spring-security/reference/servlet/architecture.html#servlet-securityfilterchain) · [Filters](https://docs.spring.io/spring-security/reference/servlet/architecture.html#servlet-filters-review)
