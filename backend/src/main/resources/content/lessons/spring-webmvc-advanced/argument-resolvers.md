---
title: HandlerMethodArgumentResolver — Custom Controller Parameters
summary: How Spring fills controller parameters, the built-in resolvers, and custom resolvers for current-user, tenant, and header-injected arguments.
order: 11
minutes: 18
topics: [argument-resolver, handlermethodargumentresolver, controller-parameters, current-user, tenant-context]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/arguments.html
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-config/customize.html
---

# HandlerMethodArgumentResolver — Custom Controller Parameters

## The concept: who fills the parameters?

A controller method declares parameters (`@PathVariable Long id`, `@RequestParam String q`, `@RequestBody OrderDto body`, `Principal principal`) — and Spring fills them via **argument resolvers**, a chain of `HandlerMethodArgumentResolver`s, each of which *supports* certain parameter types and *resolves* the value. The framework ships ~20 built-ins:

- `@PathVariable`, `@RequestParam`, `@RequestHeader`, `@CookieValue`
- `@RequestBody` (message converter), `@ModelAttribute` (data binding)
- `Principal`, `Authentication`, `HttpServletRequest/Response`
- `Pageable` (Spring Data!), `@SessionAttribute`, `@RequestAttribute`
- `Model`, `BindingResult`, `Locale`, `TimeZone`, `ZoneId`

The extension point: **write your own resolver** to inject a custom parameter — the current user, the tenant, a header-derived object — so controllers don't repeat extraction boilerplate.

## A custom resolver — current user and tenant

```java
@Component
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.getParameterType().equals(CurrentUser.class);
        // only resolves parameters declared as CurrentUser
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mav,
                                  NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof AppUserDetails u)) {
            throw new AccessDeniedException("No authenticated user");
        }
        return new CurrentUser(u.getId(), u.getEmail(), u.getRoles());
    }
}
```

Register it:

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(currentUserResolver);     // appended AFTER the built-ins
    }
}
```

Now every controller can declare the argument directly — no repeated extraction:

```java
@GetMapping("/api/orders/mine")
public List<Order> myOrders(CurrentUser user) {       // resolved by the custom resolver
    return orderService.findByCustomer(user.id());
}
```

## The two rules of the contract

1. **`supportsParameter` must be precise** — it decides routing *and* error behavior. Match the exact type (or a well-defined annotation) so you never shadow a built-in resolver. Returning true too broadly breaks every controller that uses that type.
2. **`resolveArgument` runs per request** — it can throw (bad header → 400/403), read headers, call services, and mutate the `ModelAndViewContainer` (for model-attribute-style results). Keep it cheap — it's on the request path of every matching handler.

## The patterns organizations actually use

**Pattern 1 — the tenant-context argument.** Multi-tenant APIs inject the tenant for every controller:

```java
@Component
public class TenantResolver implements HandlerMethodArgumentResolver {
    @Override public boolean supportsParameter(MethodParameter p) {
        return p.getParameterType().equals(Tenant.class);
    }
    @Override public Object resolveArgument(...) {
        String tenant = webRequest.getHeader("X-Tenant-Id");
        if (tenant == null || tenant.isBlank()) throw new TenantMissingException();
        return Tenant.of(tenant);
    }
}

@GetMapping("/api/orders")
public Page<Order> list(Tenant tenant, Pageable pageable) {
    return orderRepo.findByTenant(tenant.id(), pageable);   // tenant everywhere, zero boilerplate
}
```

**Pattern 2 — the header-parsed argument.** A `Pagination` object built from `X-Page`/`X-Per-Page` headers, or a `RequestId` for correlation — resolved once in the resolver instead of three `@RequestHeader` + parsing lines per controller.

**Pattern 3 — the user object.** Instead of `Principal` + casting + loading the user in every method, resolve a rich `CurrentUser` (with roles, preferences) — the pattern above.

**Pattern 4 — the request-context object.** An `ApiContext` bundling user + tenant + request id + locale, injected where needed.

## Resolver vs filter vs interceptor — the division

- **Filter** (servlet) — request *mutation*, early and cross-cutting (logging, auth), before MVC.
- **Interceptor** — pre/post handler hooks, model prep, login checks.
- **Argument resolver** — turning the *request* into *typed controller parameters*. If the goal is "controllers can declare `Tenant tenant`", that's a resolver; if it's "log every request", that's a filter.

Teams sometimes overuse filters to "prepare" things that belong in resolvers — the resolver is the cleaner home for *parameter derivation*.

## Pitfalls

- **Resolver order matters** — custom resolvers run after built-ins; if your type collides with a built-in's type, the built-in wins. Use a distinct type or an annotation to stay unambiguous.
- **Throwing from `resolveArgument`** — exceptions here become 500s unless handled; throw a `ResponseStatusException`/custom exception the advice maps (see the exception-handling lessons).
- **No null handling** — a resolver that returns null for "absent" leaves the controller with null; decide and document whether absence is an error (throw) or a default.
- **Testing** — resolvers are plain classes: unit-test `supportsParameter` (type routing) and `resolveArgument` (value derivation) directly with mock `NativeWebRequest`.
- **Don't build state into the resolver** — it's a stateless converter; the value it produces is per-request.

## Key takeaways

- Argument resolvers convert request data into typed controller parameters — the framework fills built-ins, you extend the chain.
- `supportsParameter` must be precise; `resolveArgument` must be cheap and exception-aware.
- Custom resolvers for current-user, tenant, header-parsed objects — killing repeated extraction boilerplate.
- Resolvers turn requests into parameters; filters/interceptors handle the rest — use the right tool.
- Unit-test the two methods directly; register via `WebMvcConfigurer.addArgumentResolvers`.
