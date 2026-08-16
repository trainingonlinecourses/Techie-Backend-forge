---
title: Spring Cloud Gateway — Routing & Edge Filters
summary: Routes, predicates, filters, path rewriting, auth at the edge, circuit breaking on routes and CORS.
order: 4
minutes: 20
topics: [gateway, routes, predicates, filters, edge]
docs:
  - https://docs.spring.io/spring-cloud-gateway/reference/
  - https://docs.spring.io/spring-cloud-gateway/reference/spring-cloud-gateway.html
---

# Spring Cloud Gateway — Routing & Edge Filters

## Why a gateway

The gateway is the **single entry point** to your services: external clients talk to it, it routes to services by name (via discovery), and cross-cutting concerns — authn, rate limiting, CORS, request logging — live *here*, not in every service.

```
client ──▶ GATEWAY (:9090) ──lb://ORDER-SERVICE──▶ order-service
                  │             lb://INVENTORY-SERVICE──▶ inventory-service
                  └── auth check, rate limit, tracing, logging (edge filters)
```

Spring Cloud Gateway is **reactive** (WebFlux-based) — no Tomcat/Spring MVC in the gateway app; it proxies requests efficiently without blocking threads.

## 1. The dependency (and what NOT to add)

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-gateway</artifactId>
</dependency>
```

**Do not** add `spring-boot-starter-web` to a gateway — WebFlux and MVC conflict.

## 2. Routes

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: orders
          uri: lb://ORDER-SERVICE                 # resolved via Eureka + load balancer
          predicates:
            - Path=/api/orders/**
          filters:
            - StripPrefix=1
        - id: inventory
          uri: lb://INVENTORY-SERVICE
          predicates:
            - Path=/api/inventory/**
```

A route = **id + uri + predicates (when to match) + filters (what to do)**.

## 3. Predicates: when a route matches

| Predicate | Example |
|---|---|
| `Path` | `Path=/api/orders/**` |
| `Method` | `Method=GET,POST` |
| `Header` | `Header=X-Request-Id, \d+` |
| `Query` | `Query=page, \d+` |
| `Cookie`, `Host`, `RemoteAddr` | ... |

Predicates combine with `and`/`or` logic (comma-separated = AND, `or` between pairs).

## 4. Filters: modify the request/response

Built-in filters handle the boring but critical stuff:

```yaml
filters:
  - StripPrefix=1                     # /api/orders/x → /orders/x on the target
  - AddRequestHeader=X-Gateway, true
  - RewritePath=/api/(?<seg>.*), /$\{seg}
  - CircuitBreaker=name=ordersCB,fallbackUri=forward:/fallback/orders
  - RequestRateLimiter=redis-rate-limiter.replenishRate=10,redis-rate-limiter.burstCapacity=20
  - Retry=retries=2,statuses=SERVICE_UNAVAILABLE
```

## 5. A custom global filter (auth at the edge)

```java
@Component
public class AuthHeaderFilter implements GlobalFilter, Ordered {

    private final JwtValidator validator;   // your token check

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String token = exchange.getRequest().getHeaders().getFirst("Authorization");
        if (token == null || !validator.isValid(token)) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }
        // propagate the authenticated identity downstream
        exchange.getRequest().mutate().header("X-User-Id", validator.userId(token));
        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        return -100;   // run early in the filter chain
    }
}
```

Edge auth options: (a) validate JWTs in a GlobalFilter, (b) `spring-cloud-starter-oauth2-resource-server` on the gateway, (c) let an external gateway (Kong, Istio, cloud LB) do it. The org standard: **authenticate at the edge, propagate identity via headers, authorize per-service with method security**.

## 6. Circuit breaking routes

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: orders
          uri: lb://ORDER-SERVICE
          predicates: [Path=/api/orders/**]
          filters:
            - name: CircuitBreaker
              args:
                name: ordersCB
                fallbackUri: forward:/fallback/orders
```

```java
@RestController
public class FallbackController {
    @GetMapping("/fallback/orders")
    public Map<String, String> fallback() {
        return Map.of("status", "TEMPORARILY_UNAVAILABLE",
                      "message", "Orders service is busy right now — try again shortly.");
    }
}
```

When the breaker opens, the gateway returns the fallback **without the client ever seeing a 500** — graceful degradation at the front door.

## 7. Discovery locator (zero-route gateway)

```yaml
spring:
  cloud:
    gateway:
      discovery:
        locator:
          enabled: true          # auto-routes for every registered service
          lower-case-service-id: true
```

Every Eureka service becomes reachable at `/service-id/**`. Great for dev; explicit routes are better for production control.

> **Why it matters (organizational view)** — The gateway is where edge policy lives in one place: one auth check, one rate limit, one CORS config, one fallback story — instead of duplicated code in 30 services. Org rules: only the gateway is public; services reject non-gateway traffic (network policy); routes are versioned config in Git; and every route has a circuit breaker + timeout so a slow service can't take the whole API down.

## Key takeaways

- Gateway = routes (id + uri + predicates + filters) over `lb://` names.
- Reactive (WebFlux) — never add `spring-boot-starter-web`.
- Edge filters: auth, rate limiting, CORS, logging, rewriting.
- `CircuitBreaker` filter + fallback URI = graceful degradation at the door.

**Official docs:** [Spring Cloud Gateway](https://docs.spring.io/spring-cloud-gateway/reference/) · [Gateway routing](https://docs.spring.io/spring-cloud-gateway/reference/spring-cloud-gateway.html)
