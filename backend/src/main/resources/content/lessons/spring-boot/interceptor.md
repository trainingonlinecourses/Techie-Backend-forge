---
title: Spring Boot Interceptors — HandlerInterceptor Deep Dive
summary: Pre and post request processing with HandlerInterceptor, HandlerInterceptorAdapter, registration patterns, order of execution vs filters, and real-world interceptor use cases.
order: 42
minutes: 20
topics: [handler-interceptor, prehandle, posthandle, aftercompletion, interceptor-registration, request-timing, cross-cutting]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-container/mvc-interceptor.html
---

# Spring Boot Interceptors — HandlerInterceptor Deep Dive

## The concept

An **interceptor** in Spring MVC sits between the DispatcherServlet and your controller. It lets you execute logic **before** a request reaches the controller, **after** the controller returns but before the response is sent, and **after** the response is fully completed.

Think of interceptors as hooks into the Spring MVC request lifecycle:

```
Request → DispatcherServlet → Interceptor.preHandle() → Controller → Interceptor.postHandle()
        → Interceptor.afterCompletion() → Response
```

**Interceptors vs Filters:**
- **Filters** operate at the Servlet container level (HttpServletRequest/Response). They see raw HTTP. They work for all requests including static resources.
- **Interceptors** operate at the Spring MVC level (HandlerMethod). They only apply to controller methods. They have access to Spring's handler metadata (which controller, which method).

**When to use interceptors:**
- Request timing and metrics
- Authentication/authorization checks (when you need controller-level context)
- Adding common request attributes
- Logging with controller metadata
- Rate limiting per controller method

## How we use it in organizations

### Scenario 1: Request timing interceptor

Measure how long each controller method takes:

```java
@Component
public class RequestTimingInterceptor implements HandlerInterceptor {

    private static final ThreadLocal<Long> startTime = new ThreadLocal<>();

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) {
        startTime.set(System.currentTimeMillis());
        return true;  // continue to controller
    }

    @Override
    public void postHandle(HttpServletRequest request, HttpServletResponse response,
                           Object handler, ModelAndView modelAndView) {
        long duration = System.currentTimeMillis() - startTime.get();
        if (handler instanceof HandlerMethod handlerMethod) {
            String controller = handlerMethod.getBeanType().getSimpleName();
            String method = handlerMethod.getMethod().getName();
            log.info("{}.{()} completed in {}ms [{}]",
                controller, method, duration, response.getStatus());
        }
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        startTime.remove();  // prevent ThreadLocal leak
    }
}
```

### Scenario 2: Authentication interceptor

Check JWT tokens before controller execution:

```java
@Component
public class AuthInterceptor implements HandlerInterceptor {

    private final TokenValidator tokenValidator;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) throws Exception {
        if (!(handler instanceof HandlerMethod handlerMethod)) {
            return true;  // not a controller method
        }

        // Skip if method is annotated with @Public
        if (handlerMethod.hasMethodAnnotation(Public.class)) {
            return true;
        }

        String token = extractToken(request);
        if (token == null || !tokenValidator.isValid(token)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.getWriter().write("{\"error\":\"Invalid or missing token\"}");
            return false;  // do NOT proceed to controller
        }

        // Attach user info to request for controllers to use
        UserPrincipal user = tokenValidator.parse(token);
        request.setAttribute("currentUser", user);
        return true;
    }
}
```

### Scenario 3: Response header interceptor

Add common headers to all API responses:

```java
@Component
public class ResponseHeadersInterceptor implements HandlerInterceptor {

    @Override
    public void postHandle(HttpServletRequest request, HttpServletResponse response,
                           Object handler, ModelAndView modelAndView) {
        response.setHeader("X-Request-Id", MDC.get("requestId"));
        response.setHeader("X-API-Version", "2.0");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
    }
}
```

## Registration and ordering

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // Order determines execution sequence (lower = first)
        registry.addInterceptor(new ResponseHeadersInterceptor())
            .addPathPatterns("/api/**")
            .order(1);

        registry.addInterceptor(authInterceptor)
            .addPathPatterns("/api/**")
            .excludePathPatterns("/api/auth/login", "/api/auth/register")
            .order(2);

        registry.addInterceptor(requestTimingInterceptor)
            .addPathPatterns("/**")
            .order(3);
    }
}
```

**Execution order for each request:**
1. `ResponseHeadersInterceptor.preHandle()` (order 1)
2. `AuthInterceptor.preHandle()` (order 2) — if returns false, chain stops
3. `RequestTimingInterceptor.preHandle()` (order 3)
4. Controller method executes
5. `RequestTimingInterceptor.postHandle()` (order 3)
6. `AuthInterceptor.postHandle()` (order 2)
7. `ResponseHeadersInterceptor.postHandle()` (order 1)
8. `afterCompletion()` fires in reverse order for each interceptor that returned true from preHandle

## Common mistakes

| Mistake | Consequence |
|---|---|
| Returning false from preHandle without setting status | 200 OK with empty body |
| Not removing ThreadLocal in afterCompletion | Memory leak on thread pool reuse |
| Using interceptor for cross-cutting logging (use AOP) | Redundant mechanism |
| Heavy logic in postHandle | Blocks response from being sent |
| Not handling exceptions in afterCompletion | Silent failures |
| Forgetting to register the interceptor | Code never runs |
