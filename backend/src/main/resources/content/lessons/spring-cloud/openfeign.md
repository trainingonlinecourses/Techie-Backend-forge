---
title: Spring Cloud OpenFeign
summary: Declarative HTTP clients that plug into discovery and load balancing — @FeignClient, fallbacks, and how Feign compares to RestClient interfaces.
order: 9
minutes: 15
topics: [openfeign, declarative client, load balancing, fallback, service discovery]
docs:
  - https://docs.spring.io/spring-cloud-openfeign/reference/
---

# Spring Cloud OpenFeign

## What Feign is

Feign turns an **interface** into a working HTTP client — no implementation, no `RestClient` boilerplate. In a Spring Cloud world it also wires into **service discovery and client-side load balancing**: the interface names a *service* (`payments`), and Feign resolves it through Eureka/Consul and round-robins across instances.

```java
@FeignClient(name = "payments", fallback = PaymentClientFallback.class)
public interface PaymentClient {

    @GetMapping("/payments/{id}")
    Payment get(@PathVariable long id);

    @PostMapping("/payments")
    Payment create(@RequestBody CreatePaymentRequest req);
}

// Usage — a typed method call:
Payment p = paymentClient.get(order.paymentId());
```

## The pieces

- **`@FeignClient(name = "payments")`** — `name` is the service id: with Eureka (the service-discovery lesson), Feign resolves it via the discovery client; without discovery, `url = "https://payments.internal"` points at a fixed host.
- **`@RequestMapping` family on the interface** — `@GetMapping`, `@PostMapping`, `@PathVariable`, `@RequestBody`, `@RequestHeader` — the same annotations you know from controllers, mirrored on the client.
- **Decoder/encoder** — Spring's Jackson converters handle JSON; Feign config per client via `configuration = PaymentClientConfig.class` (timeouts, interceptors, log level).

```yaml
feign:
  client:
    config:
      payments:
        connect-timeout: 2000
        read-timeout: 8000
        loggerLevel: basic
```

## Fallbacks and resilience

Feign plugs into **Resilience4j** (the circuit-breaker lesson) with zero custom wiring:

```java
@FeignClient(name = "payments", fallback = PaymentClientFallback.class)
public interface PaymentClient { ... }

@Component
public class PaymentClientFallback implements PaymentClient {   // must implement the interface
    public Payment get(long id) { return Payment.UNKNOWN; }      // fail-soft when the breaker is open
    public Payment create(CreatePaymentRequest req) { throw new PaymentsUnavailableException(); }
}
```

```yaml
feign.circuitbreaker.enabled: true
```

The circuit breaker opens on repeated failures → calls route to the fallback → the app degrades gracefully instead of queueing threads against a dead service. **Fallbacks must be honest**: return a *meaningful* degraded value or throw a domain exception (the rest-clients lesson's rule: never let upstream error shapes leak).

## Feign vs. Spring 6 HTTP interfaces (RestClient)

Both are "interface = client" — the difference is the ecosystem wiring:

| | Spring 6 HTTP interfaces | OpenFeign |
|---|---|---|
| Transport | `RestClient` / `WebClient` | its own (Java 11 HTTP client by default) |
| Discovery + LB | manual (resolve URI) | **automatic** via Spring Cloud |
| Circuit breaker | wrap yourself | integrated (`feign.circuitbreaker.enabled`) |
| Best when | plain Spring app, or reactive stack | **Spring Cloud microservices with discovery** |

Rule: inside a Spring Cloud/Eureka stack, Feign is the idiomatic client; in a plain Boot app (or reactive), HTTP interfaces are lighter. The contract-first mindset is identical — and OpenAPI + the generator produces either one (the openapi lesson).

## The Feign-specific traps

1. **Overloads and generics** — Feign proxies need concrete method signatures; `List<Payment>` returns work, but wildcard generics don't — keep interfaces concrete.
2. **`url` vs discovery** — setting `url` disables load balancing; don't hard-code a URL in a Eureka world (that's the point of the name).
3. **Feign inheritance** — sharing interfaces between client and server (`@FeignClient` on a controller interface) couples them; prefer standalone client contracts (the contract can still be generated from OpenAPI).
4. **Feign + `@RequestHeader`** — headers set in a filter (auth token, correlation id) must be propagated explicitly (a `RequestInterceptor` is the standard spot).

```java
@Bean
RequestInterceptor authHeader() {            // attach the token to every Feign call
    return template -> template.header("Authorization", "Bearer " + currentToken());
}
```

## Testing Feign clients

```java
// Mock the interface (Mockito) — it's just an interface:
PaymentClient client = mock(PaymentClient.class);
when(client.get(42L)).thenReturn(payment);

// Or WireMock for real HTTP behavior at the boundary:
// stub the /payments/{id} endpoint, assert request/response shapes.
```

Unit tests mock it; boundary tests use a real stub server (WireMock/MockWebServer). The interface design makes both trivial — the same pattern as the rest-clients lesson.

## Key takeaways

- `@FeignClient(name = "service")` = typed interface client + discovery + load balancing in one.
- Enable circuit breakers (`feign.circuitbreaker.enabled`) + fallback implementations for graceful degradation.
- Feign is the idiomatic client inside Spring Cloud; HTTP interfaces for plain Boot/reactive.
- Don't hard-code URLs in a discovery world; propagate auth/correlation headers via `RequestInterceptor`.

Official docs: [Spring Cloud OpenFeign](https://docs.spring.io/spring-cloud-openfeign/reference/)
