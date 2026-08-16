---
title: Authorization — Roles, URL Rules & Method Security
summary: URL-based rules vs method security, @PreAuthorize, authorities and the differences between roles and permissions.
order: 5
minutes: 16
topics: [authorization, preauthorize, roles, method-security]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/authorization/index.html
  - https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html
---

# Authorization — Roles, URL Rules & Method Security

## Two places to enforce rules

| Layer | Where | Use for |
|---|---|---|
| **URL rules** | `authorizeHttpRequests` | Coarse paths: `/api/admin/**` → ADMIN |
| **Method security** | `@PreAuthorize` on service methods | Fine-grained business rules |

Start with URL rules, add method security where *business logic* needs guards.

## URL rules

```java
.authorizeHttpRequests(auth -> auth
    .requestMatchers("/api/content/**").permitAll()          // public reading
    .requestMatchers("/api/admin/**").hasRole("ADMIN")
    .requestMatchers(HttpMethod.POST, "/api/accounts/**").hasAnyRole("USER", "ADMIN")
    .anyRequest().authenticated())
```

`hasRole("ADMIN")` matches authority `ROLE_ADMIN`. `hasAuthority("account:write")` matches a permission. The difference is convention: roles are coarse buckets, authorities/permissions are fine-grained claims.

## Method security

```java
@Configuration
@EnableMethodSecurity                     // turns on @PreAuthorize etc.
public class SecurityConfig { ... }
```

```java
@Service
public class PaymentService {

    @PreAuthorize("hasRole('ADMIN')")
    public void reconcile() { ... }

    @PreAuthorize("hasAuthority('account:read')")
    public AccountView findAccount(String iban) { ... }

    // SpEL can reference the principal:
    @PreAuthorize("#iban == authentication.principal.user().iban or hasRole('ADMIN')")
    public void manage(String iban) { ... }
}
```

## Authorities vs roles

Authorities are the raw strings in the token/principal. Spring Security convention: role authorities are prefixed `ROLE_`. Permissions can be arbitrary strings (`account:read`).

```java
// Give users fine-grained permissions (org pattern):
public Collection<? extends GrantedAuthority> getAuthorities() {
    List<GrantedAuthority> authorities = new ArrayList<>();
    authorities.add(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()));
    authorities.addAll(user.getPermissions().stream()        // "account:read", "payment:create"
            .map(SimpleGrantedAuthority::new)
            .toList());
    return authorities;
}
```

## The hierarchy: roles → permissions

Many orgs model it as: **User has Roles; Roles grant Permissions**. Encode it as a role→permissions table and map to authorities at login. Then `@PreAuthorize("hasAuthority('payment:create')")` survives role renames.

## Method security annotations

| Annotation | Meaning |
|---|---|
| `@PreAuthorize` | Evaluate before the call (the workhorse) |
| `@PostAuthorize` | Evaluate after (result-aware: `returnObject`) |
| `@Secured` | Legacy role check |
| `@RolesAllowed` | JSR-250 role check |

## Failure handling

- Not authenticated → `AuthenticationEntryPoint` → **401**.
- Authenticated but not allowed → `AccessDeniedHandler` → **403**.

Both return JSON in an API app (see jwt-auth lesson). The distinction matters to clients: 401 = "log in again", 403 = "you're in, but not allowed".

> **Why it matters (organizational view)** — Authorization is where security bugs actually happen (authn bugs are loud; authz bugs are quiet data leaks). Org standards: coarse URL rules at the edge, `@PreAuthorize` with permission-based authorities in services, no ad-hoc `role.equals(...)` checks in controllers, and every endpoint's access rule visible in one security config + method annotations.

## Key takeaways

- URL rules for coarse paths; method security for business-level guards.
- `@EnableMethodSecurity` + `@PreAuthorize("hasRole(...)")` / `hasAuthority(...)`.
- Model permissions, not just roles, for fine-grained control.
- 401 vs 403: authenticate first, authorize second.

**Official docs:** [Authorization](https://docs.spring.io/spring-security/reference/servlet/authorization/index.html) · [Method security](https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html)
