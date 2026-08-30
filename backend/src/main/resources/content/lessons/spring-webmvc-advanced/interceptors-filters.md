---
title: Filters, Interceptors and Argument Resolvers
module: spring-webmvc-advanced
order: 5
minutes: 22
topics: ["OncePerRequestFilter", "HandlerInterceptor", "ArgumentResolver", "filter chain", "pre/post processing"]
docs:
  - title: "Interceptors"
    url: "https://docs.spring.io/spring-framework/reference/web/webmvc.html#mvc-handlermapping-interceptor"
summary: Three layers sit between the HTTP request and your controller method. Knowing which to use for what — Filter (servlet level), HandlerInterceptor (M...
---

# Filters, Interceptors and Argument Resolvers

Three layers sit between the HTTP request and your controller method. Knowing which to use for what — `Filter` (servlet level), `HandlerInterceptor` (MVC level), `ArgumentResolver` (parameter level) — is the difference between clean cross-cutting code and a tangled mess.

## The Three Layers

```
Servlet container
  └─ Filter (OncePerRequestFilter)      — every request, before MVC
       └─ DispatcherServlet
            └─ HandlerInterceptor       — around handler execution
                 ├─ preHandle           — before controller
                 ├─ postHandle          — after controller, before view
                 └─ afterCompletion     — after view rendered
                      └─ ArgumentResolver — builds controller parameters
```

| Layer | Scope | Sees | Use for |
|-------|-------|------|---------|
| `Filter` | Every request, all paths | Raw request/response | CORS, auth tokens, request logging, compression |
| `HandlerInterceptor` | Matched handlers only | Handler + ModelAndView | Auth checks per mapping, audit, locale |
| `ArgumentResolver` | One parameter | Method + arguments | Custom parameter injection |

## OncePerRequestFilter

```java
@Component
public class RequestLoggingFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        long start = System.nanoTime();
        try {
            filterChain.doFilter(request, response);
        } finally {
            long ms = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
            log.info("{} {} -> {} in {}ms",
                request.getMethod(), request.getRequestURI(),
                response.getStatus(), ms);
        }
    }
}
```

`OncePerRequestFilter` guarantees a single execution even with internal forwards — a plain `Filter` would run twice on a forward.

### Registering with Order

```java
@Configuration
public class FilterConfig {

    @Bean
    public FilterRegistrationBean<RequestLoggingFilter> loggingFilter() {
        FilterRegistrationBean<RequestLoggingFilter> reg = new FilterRegistrationBean<>();
        reg.setFilter(new RequestLoggingFilter());
        reg.addUrlPatterns("/api/*");
        reg.setOrder(1);          // lower = earlier
        return reg;
    }
}
```

Filters run in `Order` — request logging (1) before auth (2) before rate limiting (3).

## HandlerInterceptor

```java
@Component
public class AuditInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response,
                             Object handler) {
        // return false → stop the request here (403/redirect)
        log.info("Handling {} {}", request.getMethod(), request.getRequestURI());
        return true;
    }

    @Override
    public void postHandle(HttpServletRequest request, HttpServletResponse response,
                           Object handler, ModelAndView modelAndView) {
        if (modelAndView != null) {
            modelAndView.addObject("renderTime", Instant.now());
        }
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        // Runs even when the handler threw — perfect for cleanup/audit
        if (ex != null) log.error("Handler failed", ex);
    }
}
```

### Registration and Paths

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final AuditInterceptor audit;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(audit)
            .addPathPatterns("/api/**")
            .excludePathPatterns("/api/health", "/api/auth/**");
    }
}
```

**Why interceptors over filters for auth?** Interceptors know the *handler* — you can skip auth for `@PublicEndpoint`-annotated methods:

```java
@Override
public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                         Object handler) {
    if (handler instanceof HandlerMethod method) {
        if (method.hasMethodAnnotation(PublicEndpoint.class)) {
            return true;    // skip auth
        }
    }
    return authenticate(request, response);
}
```

## HandlerMethodArgumentResolver

Inject **anything** into controller parameters:

```java
@Component
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

    private final UserService userService;

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(CurrentUser.class);
    }

    @Override
    public Object resolveArgument(MethodParameter parameter,
                                  ModelAndViewContainer mavContainer,
                                  NativeWebRequest webRequest,
                                  WebDataBinderFactory binderFactory) {
        HttpServletRequest request = webRequest.getNativeRequest(HttpServletRequest.class);
        String userId = (String) request.getAttribute("authenticatedUserId");
        return userService.findById(userId).orElse(null);
    }
}
```

```java
@GetMapping("/me")
public UserDto me(@CurrentUser User user) {
    return UserDto.from(user);
}
```

Register it:

```java
@Override
public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
    resolvers.add(currentUserResolver);
}
```

Controllers become declarative: no boilerplate token parsing, no repeated lookups.

## Filters vs. Interceptors — The Decision

| Need | Use |
|------|-----|
| Every request, even unmapped paths | Filter |
| Only mapped handlers | Interceptor |
| Auth that must skip some handlers | Interceptor (handler-aware) |
| Request body reading / rewriting | Filter |
| Per-parameter injection | ArgumentResolver |
| After-view rendering | Interceptor `afterCompletion` |
| Servlet-level concerns (charset, CORS) | Filter |

## Combined: Request Id End-to-End

The classic pattern uses a filter to generate, an interceptor to log, and everything downstream to carry:

```java
// Filter: create request id
@Component
public class RequestIdFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Request-Id";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String requestId = request.getHeader(HEADER);
        if (requestId == null || requestId.isBlank()) {
            requestId = UUID.randomUUID().toString();
        }
        response.setHeader(HEADER, requestId);
        MDC.put("requestId", requestId);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove("requestId");
        }
    }
}
```

Every log line in the request now carries the same request id — filter, interceptor, controller, and service alike.

## Testing

```java
@SpringBootTest
@AutoConfigureMockMvc
class InterceptorTest {

    @Autowired MockMvc mockMvc;

    @Test
    void auditInterceptorLogsRequests() throws Exception {
        mockMvc.perform(get("/api/courses"))
            .andExpect(status().isOk());
        // assert the audit log contains the request (capture appender)
    }

    @Test
    void currentUserResolved() throws Exception {
        mockMvc.perform(get("/api/me")
                .requestAttr("authenticatedUserId", "u1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value("u1"));
    }
}
```

## Summary

| Layer | Strength | Typical use |
|-------|----------|-------------|
| Filter | Universal, pre-MVC | Request id, CORS, compression, raw logging |
| Interceptor | Handler-aware | Auth, audit, view enrichment, locale |
| ArgumentResolver | Parameter-level | `@CurrentUser`, custom params, pagination objects |

Compose them deliberately: filters for the raw plumbing, interceptors for MVC concerns, resolvers for ergonomics. Each layer doing one job keeps the request pipeline readable and the controllers thin.
