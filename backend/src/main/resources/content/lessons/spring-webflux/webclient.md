---
title: WebClient — The Reactive HTTP Client
summary: Fluent non-blocking HTTP calls, retrieve vs exchange, bodyToMono/bodyToFlux, filters and timeouts.
order: 4
minutes: 18
topics: [webclient, http-client, non-blocking, reactor, resttemplate]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webflux-webclient.html
  - https://docs.spring.io/spring-boot/reference/io/webclient.html
---

# WebClient — The Reactive HTTP Client

## Why WebClient

`RestTemplate` (and now `RestClient`) blocks the calling thread while waiting for the response. In a reactive service that's fatal — one blocking call poisons the whole event loop. **`WebClient`** is the non-blocking HTTP client: it returns `Mono`/`Flux` and performs the I/O without occupying a thread.

| | RestTemplate / RestClient | WebClient |
|---|---|---|
| Model | Blocking | Non-blocking, reactive |
| Return type | `T` directly | `Mono<T>` / `Flux<T>` |
| Use in WebFlux | ❌ never | ✅ always |
| Use in servlet | ✅ fine | Optional (for non-blocking fan-out) |

## Basic usage

```java
// Configuration — a shared bean with timeouts (Boot auto-configures WebClient.Builder)
@Configuration
public class WebClientConfig {

    @Bean
    public WebClient apiClient(WebClient.Builder builder) {
        return builder
                .baseUrl("https://api.example.com")
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }
}
```

```java
@Service
public class CustomerAggregator {

    private final WebClient api;

    public CustomerAggregator(WebClient api) { this.api = api; }

    public Mono<Customer> findCustomer(String id) {
        return api.get()
                .uri("/customers/{id}", id)
                .retrieve()                                          // auto error-to-WebClientResponseException
                .bodyToMono(Customer.class)                          // one item → Mono
                .timeout(Duration.ofSeconds(3));                     // never wait forever
    }

    public Flux<Customer> allCustomers() {
        return api.get().uri("/customers").retrieve().bodyToFlux(Customer.class);
    }
}
```

## retrieve vs exchange — and error handling

- **`retrieve()`** — the simple path; non-2xx responses throw `WebClientResponseException` (and you can map them with `onStatus`).
- **`exchangeToMono`/`exchangeToFlux`** — full access to the response (status, headers, body) for custom logic; *slightly* more verbose and easy to leak connections if you don't consume the body.

```java
Mono<Customer> c = api.get().uri("/customers/{id}", id)
        .retrieve()
        .onStatus(HttpStatusCode::is4xxClientError,
                res -> Mono.error(new CustomerLookupException("not found: " + id)))
        .bodyToMono(Customer.class);
```

## Filters — cross-cutting concern injection

```java
WebClient client = builder
        .filter((request, next) -> next.exchange(request)          // auth header on every call
                .doOnNext(res -> log.debug("{} {}", res.statusCode(), request.url())))
        .filter(ExchangeFilterFunctions.basicAuthentication("svc", secret))
        .build();
```

Filters compose like servlet filters: auth, logging, trace-id propagation, retries.

## Parallel fan-out — where WebClient shines

```java
// Fetch all customers' orders concurrently — no thread pool needed:
Flux<CustomerOrders> enriched = customerIds
        .flatMap(id -> api.get().uri("/customers/{id}/orders", id)
                .retrieve()
                .bodyToFlux(Order.class)
                .collectList()
                .map(orders -> new CustomerOrders(id, orders)), 8); // concurrency 8
```

`flatMap` with a concurrency limit (8) fans out bounded parallel HTTP calls — servlet would need a thread pool of the same size; reactive needs none.

> **Why it matters (organizational view)** — The rule: **WebClient for every outbound call in a reactive service, RestClient for servlet services** — and standardize the wrapper: a typed client (not raw `WebClient` scattered in controllers), default timeouts on every client bean, and trace-id propagation via filters. Raw `WebClient` usage in controllers is a review smell. Also ban `restTemplate`/`RestClient`/`HttpClient` blocking calls inside WebFlux services — they stall the event loop and destroy the concurrency model (see the production lesson).

## Key takeaways

- `WebClient` = non-blocking HTTP client returning `Mono`/`Flux`; never block inside WebFlux.
- `retrieve()` + `bodyToMono`/`bodyToFlux` is the 95% case; `exchangeToMono` for custom handling.
- `.timeout()` on every external call; `.onStatus` maps HTTP errors to typed exceptions.
- Filters for auth, logging, trace propagation.
- `flatMap` + concurrency limit = bounded parallel fan-out without thread pools.

## Official docs

- [Spring Framework — WebClient](https://docs.spring.io/spring-framework/reference/web/webflux-webclient.html)
- [Spring Boot — WebClient](https://docs.spring.io/spring-boot/reference/io/webclient.html)
- [WebClient Exchange vs Retrieve](https://docs.spring.io/spring-framework/reference/web/webflux-webclient.html#webflux-client-builder)
