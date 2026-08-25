---
title: API Gateway Filters — Request Transformation
summary: Pre/post filters, rate limiting, authentication, request/response modification, and routing in Spring Cloud Gateway.
order: 12
minutes: 18
topics: [api-gateway, gateway-filters, rate-limiting, authentication, request-transformation, routing]
docs:
  - https://docs.spring.io/spring-cloud-gateway/docs/current/reference/html/
  - https://docs.spring.io/spring-cloud-gateway/docs/current/reference/html/#gatewayfilter-factories
---

# API Gateway Filters — Request Transformation

## What Are Gateway Filters?

A **Gateway Filter** intercepts requests and responses at the API Gateway level, before they reach your microservices. This is where you handle cross-cutting concerns like authentication, rate limiting, logging, and request modification.

**Think of it like**: a bouncer at a club entrance — checks ID, limits crowd size, and redirects people to the right room.

---

## Filter Types

| Type | Purpose | Example |
|------|---------|---------|
| **Global Filter** | Applies to ALL routes | Authentication, logging |
| **Route Filter** | Applies to specific routes | Rate limiting, header injection |
| **Gateway Filter Factory** | Built-in transformations | AddHeader, RewritePath |

---

## Global Filters

### Authentication Filter

```java
@Component
public class AuthenticationFilter implements GlobalFilter, Ordered {

    private final JwtValidator jwtValidator;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getPath().value();

        // Skip auth for public endpoints
        if (path.startsWith("/api/auth/") || path.startsWith("/api/public/")) {
            return chain.filter(exchange);
        }

        String authHeader = exchange.getRequest().getHeaders().getFirst("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        String token = authHeader.substring(7);

        return jwtValidator.validate(token)
            .flatMap(claims -> {
                // Add user info to headers for downstream services
                ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                    .header("X-User-Id", claims.getSubject())
                    .header("X-User-Role", claims.get("role", String.class))
                    .build();

                return chain.filter(exchange.mutate().request(mutatedRequest).build());
            })
            .onErrorResume(e -> {
                exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                return exchange.getResponse().setComplete();
            });
    }

    @Override
    public int getOrder() {
        return -100;  // Run early in the filter chain
    }
}
```

### Rate Limiting Filter

```java
@Component
public class RateLimitFilter implements GlobalFilter, Ordered {

    private final RedisTemplate<String, String> redisTemplate;
    private final RateLimitConfig config;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String clientId = extractClientId(exchange);
        String path = exchange.getRequest().getPath().value();

        String key = "rate_limit:" + clientId + ":" + path;
        long now = System.currentTimeMillis();
        long windowStart = now - config.getWindowMs();

        // Sliding window rate limiting with Redis
        return redisTemplate.executePipelined((RedisCallback<Object>) connection -> {
            connection.zRemRange(key, 0, windowStart);  // Remove old entries
            connection.zAdd(key, now, String.valueOf(now));  // Add current request
            connection.expire(key, config.getWindowMs() / 1000);
            return null;
        }).then(redisTemplate.opsForZSet().zCard(key))
            .flatMap(count -> {
                if (count > config.getMaxRequests()) {
                    exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
                    exchange.getResponse().getHeaders().add("Retry-After",
                        String.valueOf(config.getWindowMs() / 1000));
                    return exchange.getResponse().setComplete();
                }

                // Add rate limit headers
                ServerHttpResponse response = exchange.getResponse();
                response.getHeaders().add("X-Rate-Limit-Remaining",
                    String.valueOf(config.getMaxRequests() - count));

                return chain.filter(exchange);
            });
    }

    @Override
    public int getOrder() {
        return -90;
    }
}
```

### Logging Filter

```java
@Component
public class LoggingFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(LoggingFilter.class);

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        long startTime = System.currentTimeMillis();
        String requestId = UUID.randomUUID().toString();

        log.info("[{}] → {} {} from {}",
            requestId,
            exchange.getRequest().getMethod(),
            exchange.getRequest().getPath(),
            exchange.getRequest().getRemoteAddress());

        return chain.filter(exchange).then(Mono.fromRunnable(() -> {
            long duration = System.currentTimeMillis() - startTime;
            log.info("[{}] ← {} ({}ms)",
                requestId,
                exchange.getResponse().getStatusCode(),
                duration);
        }));
    }

    @Override
    public int getOrder() {
        return -200;  // Run first
    }
}
```

---

## Route-Specific Filters (YAML)

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: user-service
          uri: http://user-service:8081
          predicates:
            - Path=/api/users/**
          filters:
            - StripPrefix=1                    # Remove /api prefix
            - AddRequestHeader=X-Source, gateway
            - AddRequestParameter=region, us-east-1
            - CircuitBreaker=name=userService,fallbackUri=forward:/fallback/users

        - id: order-service
          uri: http://order-service:8082
          predicates:
            - Path=/api/orders/**
          filters:
            - StripPrefix=1
            - name: RequestRateLimiter
              args:
                redis-rate-limiter.replenishRate: 10
                redis-rate-limiter.burstCapacity: 20
                key-resolver: "#{@userKeyResolver}"
```

---

## Custom Gateway Filter Factory

```java
@Component
public class AddUserInfoGatewayFilterFactory extends AbstractGatewayFilterFactory<Object> {

    @Override
    public GatewayFilter apply(Object config) {
        return (exchange, chain) -> {
            String userId = exchange.getRequest().getHeaders().getFirst("X-User-Id");
            String userRole = exchange.getRequest().getHeaders().getFirst("X-User-Role");

            if (userId == null) {
                // Default for unauthenticated requests
                userId = "anonymous";
                userRole = "GUEST";
            }

            ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                .header("X-Processed-By", "gateway")
                .header("X-User-Tier", getUserTier(userId))
                .build();

            return chain.filter(exchange.mutate().request(mutatedRequest).build());
        };
    }

    private String getUserTier(String userId) {
        // Look up user tier from cache/database
        return "PREMIUM";  // Simplified
    }
}
```

---

## In an Organization

### Scenario 1: Multi-Tenant Routing

```java
@Component
public class TenantRoutingFilter implements GlobalFilter, Ordered {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String host = exchange.getRequest().getHeaders().getFirst("Host");
        String tenantId = extractTenantFromHost(host);

        if (tenantId != null) {
            ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                .header("X-Tenant-Id", tenantId)
                .build();

            return chain.filter(exchange.mutate().request(mutatedRequest).build());
        }

        return chain.filter(exchange);
    }

    private String extractTenantFromHost(String host) {
        // mycompany.example.com → mycompany
        if (host != null && host.contains(".")) {
            return host.split("\\.")[0];
        }
        return null;
    }

    @Override
    public int getOrder() {
        return -150;
    }
}
```

### Scenario 2: Request Response Transformation

```java
@Component
public class ResponseTransformationFilter implements GlobalFilter, Ordered {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpResponse originalResponse = exchange.getResponse();
        DataBufferFactory bufferFactory = originalResponse.bufferFactory();

        ServerHttpResponseDecorator decoratedResponse = new ServerHttpResponseDecorator(originalResponse) {
            @Override
            public Mono<Void> writeWith(Publisher<? extends DataBuffer> body) {
                if (body instanceof Flux) {
                    Flux<? extends DataBuffer> fluxBody = (Flux<? extends DataBuffer>) body;
                    return super.writeWith(Flux.fromBuffer(fluxBody)
                        .map(dataBuffer -> {
                            // Add CORS headers
                            getHeaders().add("Access-Control-Allow-Origin", "*");
                            getHeaders().add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
                            return dataBuffer;
                        }));
                }
                return super.writeWith(body);
            }
        };

        return chain.filter(exchange.mutate().response(decoratedResponse).build());
    }

    @Override
    public int getOrder() {
        return -50;
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Authentication in every microservice | Redundant, slow | Handle auth once at gateway |
| Global filter too heavy | Slows all requests | Use route-specific filters when possible |
| Not handling filter errors | Gateway crashes | Wrap filter logic in try-catch/Mono.error |
| Missing CORS in gateway | Frontend can't call API | Handle CORS at gateway level |
| No request timeout | Requests hang forever | Configure per-route timeouts |
| Logging everything | Performance impact | Log selectively, use structured logging |
