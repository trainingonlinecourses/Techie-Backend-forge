---
title: Spring Boot Filters — OncePerRequestFilter and Filter Chains
summary: Servlet filters vs Spring interceptors, OncePerRequestFilter for guaranteed single execution, filter registration and ordering, CORS filters, and the filter patterns that production APIs rely on.
order: 43
minutes: 20
topics: [servlet-filter, once-per-request, filter-chain, cors-filter, security-filter, request-wrapper, logging-filter]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-container/mvc-dispatcher.html
---

# Spring Boot Filters — OncePerRequestFilter and Filter Chains

## The concept

A **Servlet filter** sits at the very edge of your application — before Spring MVC even sees the request. Filters can inspect, modify, or reject every HTTP request and response. They operate on raw `HttpServletRequest` and `HttpServletResponse` objects.

**Filters vs Interceptors:**
- Filters see ALL requests (including static resources, health checks, error pages)
- Interceptors only see controller-mapped requests
- Filters can wrap the request/response (change the body, add headers)
- Interceptors have access to Spring handler metadata

**`OncePerRequestFilter`** is a Spring base class that guarantees a filter executes exactly once per request, even in:
- Forwarded requests
- Included requests
- Async dispatches
- Error dispatches

Without this guarantee, your filter might run multiple times per request, causing duplicate logging, double authentication checks, or corrupted request bodies.

## How we use it in organizations

### Scenario 1: Request logging filter

Log every incoming request with timing, path, and user:

```java
@Component
@Order(1)
public class RequestLoggingFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        long start = System.currentTimeMillis();
        String requestId = UUID.randomUUID().toString().substring(0, 8);
        MDC.put("requestId", requestId);

        // Log the incoming request
        log.info("→ {} {} from {}",
            request.getMethod(),
            request.getRequestURI(),
            request.getRemoteAddr());

        // Add request ID to response headers
        response.setHeader("X-Request-Id", requestId);

        try {
            filterChain.doFilter(request, response);  // proceed to next filter/controller
        } finally {
            long duration = System.currentTimeMillis() - start;
            log.info("← {} {} → {} ({}ms)",
                request.getMethod(),
                request.getRequestURI(),
                response.getStatus(),
                duration);
            MDC.clear();
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // Skip health check endpoints
        return request.getRequestURI().startsWith("/actuator");
    }
}
```

### Scenario 2: Request ID propagation

For distributed tracing, propagate the request ID from upstream services:

```java
@Component
public class TracingFilter extends OncePerRequestFilter {

    private static final String HEADER_TRACE_ID = "X-Trace-Id";
    private static final String HEADER_SPAN_ID = "X-Span-Id";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws IOException, ServletException {
        // Accept trace ID from upstream, or generate new one
        String traceId = Optional.ofNullable(request.getHeader(HEADER_TRACE_ID))
            .orElse(UUID.randomUUID().toString().replace("-", ""));

        String spanId = UUID.randomUUID().toString().substring(0, 8);

        MDC.put("traceId", traceId);
        MDC.put("spanId", spanId);

        try {
            chain.doFilter(request, response);
        } finally {
            response.setHeader(HEADER_TRACE_ID, traceId);
            response.setHeader(HEADER_SPAN_ID, spanId);
            MDC.clear();
        }
    }
}
```

### Scenario 3: Request body logging (with wrapping)

Read the request body for logging without consuming it:

```java
@Component
public class BodyLoggingFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws IOException, ServletException {
        // Only log body for POST/PUT/PATCH
        if (isWriteMethod(request.getMethod())) {
            ContentCachingRequestWrapper wrappedRequest =
                new ContentCachingRequestWrapper(request);
            ContentCachingResponseWrapper wrappedResponse =
                new ContentCachingResponseWrapper(response);

            chain.doFilter(wrappedRequest, wrappedResponse);  // controller sees the wrapper

            // Now read the body for logging
            byte[] body = wrappedRequest.getContentAsByteArray();
            if (body.length > 0) {
                String bodyStr = new String(body, StandardCharsets.UTF_8);
                if (bodyStr.length() > 1000) bodyStr = bodyStr.substring(0, 1000) + "...";
                log.debug("Request body: {}", maskSensitiveFields(bodyStr));
            }

            // MUST copy response body back — the wrapper consumed it
            wrappedResponse.copyBodyToResponse();
        } else {
            chain.doFilter(request, response);
        }
    }

    private boolean isWriteMethod(String method) {
        return "POST".equals(method) || "PUT".equals(method) || "PATCH".equals(method);
    }
}
```

**Critical:** When using `ContentCachingRequestWrapper`, you must call `copyBodyToResponse()` on the response wrapper. Without this, the response body will be empty.

### Scenario 4: Rate limiting filter

Block requests that exceed a per-IP rate limit:

```java
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private final RateLimiter rateLimiter;  // e.g., Bucket4j or Guava RateLimiter

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws IOException, ServletException {
        String clientIp = request.getRemoteAddr();

        if (!rateLimiter.tryAcquire(clientIp)) {
            response.setStatus(429);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"Rate limit exceeded\",\"retryAfter\":\"60s\"}");
            return;  // do NOT proceed to controller
        }

        chain.doFilter(request, response);
    }
}
```

## Filter registration ordering

Spring Boot auto-registers `Filter` beans with a default order. For explicit control:

```java
@Bean
public FilterRegistrationBean<RequestLoggingFilter> loggingFilter() {
    FilterRegistrationBean<RequestLoggingFilter> registration = new FilterRegistrationBean<>();
    registration.setFilter(new RequestLoggingFilter());
    registration.addUrlPatterns("/api/*");
    registration.setOrder(1);  // lowest = first
    return registration;
}

@Bean
public FilterRegistrationBean<BodyLoggingFilter> bodyFilter() {
    FilterRegistrationBean<BodyLoggingFilter> registration = new FilterRegistrationBean<>();
    registration.setFilter(new BodyLoggingFilter());
    registration.addUrlPatterns("/api/*");
    registration.setOrder(2);
    return registration;
}
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Not calling `chain.doFilter()` | Request never reaches the controller |
| Not calling `copyBodyToResponse()` after wrapping | Empty response body |
| Filter throws exception without setting status | 500 with no useful error message |
| Heavy I/O in filter (database calls) | Slow for every single request |
| Modifying the request body without wrapping | Body consumed, controller sees empty body |
| Filter registered too broadly (/*) | Filter runs for static resources, health checks |
