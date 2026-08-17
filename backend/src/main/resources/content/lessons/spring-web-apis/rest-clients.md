---
title: HTTP Clients — RestClient, WebClient & HTTP Interfaces
summary: Calling other services from Spring — the modern RestClient, reactive WebClient, and Spring 6 HTTP interface clients, with timeouts, retries and error handling.
order: 1
minutes: 15
topics: [restclient, webclient, http interface, http clients, error handling]
docs:
  - https://docs.spring.io/spring-framework/reference/integration/rest-clients.html
  - https://docs.spring.io/spring-framework/reference/web/webflux-webclient.html
---

# HTTP Clients — RestClient, WebClient & HTTP Interfaces

## Choosing a client

| Client | Model | Use |
|---|---|---|
| `RestClient` (Spring 6.1) | synchronous, fluent, typed | **the default** for service-to-service calls |
| `WebClient` | reactive (Mono/Flux) | reactive stacks, streaming, high concurrency |
| `RestTemplate` | legacy sync | only in old code — don't start new code with it |
| `RestClient.Builder` + interface | declarative | the Spring 6 HTTP interface — a typed client from an interface |

## RestClient: the modern synchronous client

```java
@Service
public class PaymentClient {
    private final RestClient client;

    public PaymentClient(RestClient.Builder builder) {
        this.client = builder
            .baseUrl("https://payments.internal/api")
            .defaultHeader("X-Tenant", "acme")
            .build();
    }

    public Payment create(CreatePaymentRequest req) {
        return client.post().uri("/payments")
            .contentType(MediaType.APPLICATION_JSON)
            .body(req)
            .retrieve()
            .body(Payment.class);            // Jackson deserialization, typed
    }
}
```

- **Timeouts are the first thing to configure** — no timeout means a hung upstream hangs your thread:

```java
client = builder.requestFactory(new JdkClientHttpRequestFactory(
    clientHttpRequestFactorySettings().withConnectTimeout(Duration.ofSeconds(2))
                                     .withReadTimeout(Duration.ofSeconds(10))))
```

- **Error handling** — `retrieve()` throws `RestClientResponseException` on 4xx/5xx; decide the strategy:

```java
.retrieve()
.onStatus(s -> s.value() >= 500, (req, res) -> { throw new UpstreamDownException(res.getStatusText()); })
.body(Payment.class);

// Or the "exchange" variant for full control (also lets you read the error body):
.exchange((req, res) -> res.getStatusCode().is2xxSuccessful()
    ? res.bodyTo(Payment.class)
    : handleError(res));
```

- **Retry** — RestClient itself doesn't retry; wrap with **Spring Retry** (`@Retryable` on the calling service method or a `RetryTemplate`) for idempotent calls (GETs, PUTs with idempotency keys — never blind POSTs).

## WebClient: the reactive client

```java
Mono<Payment> payment = WebClient.create("https://payments.internal/api")
    .post().uri("/payments").bodyValue(req)
    .retrieve()
    .bodyToMono(Payment.class);

// Streaming a feed:
Flux<Event> events = client.get().uri("/events")
    .retrieve().bodyToFlux(Event.class);
```

Blocking-free end to end (Netty, no thread-per-request), streaming bodies, backpressure — the WebFlux module covers the model; here the point is: in a **reactive** stack, use WebClient; in a servlet stack, RestClient is simpler and debuggable.

## HTTP interfaces: a typed client from an interface (Spring 6)

The cleanest option of all — declare the contract, get the implementation:

```java
public interface PaymentApi {
    @GetExchange("/payments/{id}")
    Payment getPayment(@PathVariable long id);

    @PostExchange("/payments")
    Payment create(@RequestBody CreatePaymentRequest req);
}

@Bean
PaymentApi paymentApi(RestClient.Builder builder) {     // or WebClient for reactive
    return HttpServiceProxyFactory
        .builderFor(RestClientAdapter.create(builder.build()))
        .build().createClient(PaymentApi.class);
}
```

One interface = both the client contract and (with OpenAPI tooling) the source of truth. `@GetExchange`/`@PostExchange`/`@PutExchange`/`@DeleteExchange` mirror the annotation family you already know from controllers — the HTTP interface is the natural fit when you and the upstream share a contract.

## Resilience is the job, not the call

Calling another service is where production incidents start:

1. **Timeout at two levels** — connect + read timeouts (a hung connection and a slow response are different failures).
2. **Retry only idempotent calls**, with backoff — and give POSTs an idempotency key so retries are safe.
3. **Circuit-breaker on the caller** — when the upstream is down, fail fast instead of piling threads into a dying service (the Resilience4j lesson in Spring Cloud).
4. **Observe** — Micrometer traces every client call; log upstream status and latency per endpoint.
5. **Never let the upstream's exception shape leak** — map 4xx/5xx to your domain exceptions (the controller advice translates them to your API's error contract).

## Key takeaways

- `RestClient` is the sync default; `WebClient` for reactive/streaming; HTTP interfaces for typed contracts.
- Configure connect + read timeouts on day one; retry idempotent calls with backoff.
- Handle non-2xx explicitly (`onStatus`/`exchange`) and map upstream errors to your domain exceptions.
- Resilience (timeouts, retries, circuit breaking) is a property of the *caller* — build it into the client.

Official docs: [REST Clients](https://docs.spring.io/spring-framework/reference/integration/rest-clients.html) · [WebClient](https://docs.spring.io/spring-framework/reference/web/webflux-webclient.html)
