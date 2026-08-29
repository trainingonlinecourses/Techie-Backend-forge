---
title: Method Security — @PreAuthorize, @PostAuthorize and the Expression Language
summary: Enforcing authorization inside methods with @PreAuthorize/@PostAuthorize, SpEL expressions, @Secured and @RolesAllowed, and when method security beats URL rules.
order: 9
minutes: 20
topics: [method-security, preauthorize, postauthorize, secured, rolesallowed, spel, authorization]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html
  - https://docs.spring.io/spring-security/reference/servlet/authorization/expression-based.html
---

# Method Security — @PreAuthorize, @PostAuthorize and the Expression Language

## The concept: authorization where the data is

URL-based rules (`/api/orders/**` needs `ROLE_ADMIN`) authorize at the **edge** — they know the path but not the *data*. Method security authorizes **at the method that touches the resource**, where the actual object is in hand. That's the difference between "any admin can read any order" and "an admin can only read orders in their own tenant" — the second is only expressible inside the method.

Enable it once:

```java
@Configuration
@EnableMethodSecurity   // Spring Security 6 — replaces @EnableGlobalMethodSecurity
public class SecurityConfig { }
```

Then annotate service methods:

```java
@PreAuthorize("hasRole('ADMIN')")                    // role check before the call
@PreAuthorize("hasAuthority('orders:read')")         // granular permission
@PreAuthorize("hasRole('ADMIN') or hasRole('SUPPORT')")
@PreAuthorize("#order.ownerId == authentication.principal.id")  // object-level check
```

## The SpEL expressions you'll actually use

- `hasRole('ADMIN')` / `hasAuthority('orders:read')` — `hasRole` auto-prefixes `ROLE_`; `hasAuthority` is exact.
- `hasAnyRole('ADMIN','SUPPORT')` / `hasAnyAuthority(...)` — any of a set.
- `#param.method()` — reference **method arguments** by name (parameter names must be compiled in, or use `@P`/`@Param` to name them).
- `authentication.principal` — the current user object (your `UserDetails` or custom principal).
- `@beanName.method(...)` — call **any bean** from the expression (a permission service, a tenant resolver).
- `isAuthenticated()`, `permitAll()`, `denyAll()`, `hasIpAddress('10.0.0.0/8')`.

## How we use it in an organization: the scenarios

**Scenario 1 — tenant isolation (the data-scoped rule that URL security can't do):**

```java
@Service
public class OrderService {
    @PreAuthorize("@tenantGuard.canAccess(#orderId)")   // delegate to a bean
    public Order getOrder(String orderId) { ... }

    // tenantGuard:
    @Component
    public class TenantGuard {
        public boolean canAccess(String orderId) {
            Order o = orderRepo.findById(orderId).orElseThrow();
            return o.tenantId().equals(currentTenant());   // object-level truth
        }
    }
}
```

URL rules only see `/api/orders/{id}` — they cannot know which tenant the order belongs to. The method rule checks the actual record. This is the canonical "why method security exists" scenario.

**Scenario 2 — ownership via method arguments:**

```java
@PreAuthorize("#userId == authentication.principal.id")
public Profile getProfile(String userId) { ... }
// Only the profile owner (or an explicit admin bypass) may read it.
```

**Scenario 3 — multi-role with escalation rules:**

```java
@PreAuthorize("hasAnyRole('ADMIN','AUDITOR') and @auditPolicy.allowsExport()")
public byte[] exportLedger(LedgerFilter filter) { ... }
```

**Scenario 4 — `@PostAuthorize` for data-dependent responses.** The check runs *after* the method, on its return value — useful when the return object itself carries the permission:

```java
@PostAuthorize("returnObject.ownerId == authentication.principal.id or hasRole('ADMIN')")
public Document getDocument(String id) { ... }
```

`@PostFilter` filters a returned collection (`@PostFilter("filterObject.ownerId == authentication.principal.id")`) — useful but beware it filters *after* the query, so it doesn't protect data volume or performance the way a WHERE clause does.

## @Secured and @RolesAllowed — the simpler alternatives

```java
@Secured("ROLE_ADMIN")            // role-only, no SpEL — fine for simple cases
@RolesAllowed("ADMIN")            // JSR-250 standard; also role-only
```

Both are plain role checks — no arguments, no bean calls, no SpEL. `@Secured` is Spring's, `@RolesAllowed` is the Jakarta standard (useful for code shared across frameworks). Modern code prefers `@PreAuthorize` because it grows: a role check can become an ownership check without changing the annotation family.

## Method security vs URL rules — how teams split them

- **URL rules** (in `SecurityFilterChain`): coarse, edge-level gates — "this path requires authentication", "this admin area requires ROLE_ADMIN". They protect the perimeter and give clean 401/403 semantics at the HTTP layer.
- **Method security**: fine-grained, data-aware checks inside the service layer. The rule of thumb: **URL rules keep strangers out; method rules enforce business authorization.**

Both should be enabled — defense in depth. A service method with `@PreAuthorize` is still protected if someone forgets the URL rule, and vice versa.

## Pitfalls

- **Parameter names must be available** — compile with `-parameters` (Spring Boot's default) or use `@P("userId")`/`@Param("userId")` or Spring Security will fail to resolve `#userId`.
- **Method security needs the Spring proxy** — self-invocation (`this.exportLedger(...)`) bypasses it, exactly like `@Transactional`. Inject the bean (or self-inject) to go through the proxy.
- **`@PostFilter` leaks data volume** — the query already fetched everything. Prefer filtering in the query when the permission is expressible in SQL.
- **Don't put security logic in the expression that belongs in a bean** — long SpEL strings are unreadable and untestable; delegate to `@tenantGuard`-style beans with unit tests.
- **Exceptions** — a denied call throws `AccessDeniedException`; ensure a `@ControllerAdvice` maps it to 403 (not 500).

## Key takeaways

- Method security authorizes where the data is — object-level and ownership checks URL rules can't express.
- `@PreAuthorize` + SpEL covers roles, permissions, arguments, and bean calls.
- `@PostAuthorize`/`@PostFilter` check return values after execution.
- URL rules protect the perimeter; method rules enforce business authorization — run both.
- Compile with `-parameters`, avoid self-invocation, delegate complex logic to testable beans.
