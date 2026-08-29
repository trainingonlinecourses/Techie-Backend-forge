---
title: RestTemplate and WebClient — Calling External APIs
summary: RestTemplate vs WebClient, synchronous vs reactive HTTP, error handling with RestTemplate exchange, WebClient with filters and retry, and how organizations build resilient API clients.
order: 35
minutes: 22
topics: [resttemplate, webclient, http-client, api-client, error-handling, retry, resilience, synchronous, reactive]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/html/io.html#io.rest-client
  - https://docs.spring.io/spring-framework/reference/web/webflux-webclient.html
---

# RestTemplate and WebClient — Calling External APIs

## The concept

Your microservice rarely operates alone. It calls payment gateways, email services, inventory APIs, identity providers. You need a robust HTTP client that handles connection pooling, retries, timeouts, and error mapping.

Spring provides two HTTP clients:

1. **RestTemplate** — synchronous, blocking. The classic choice. Simple, well-understood, battle-tested.
2. **WebClient** — modern, supports both synchronous and reactive (non-blocking) modes. Recommended for new projects.

## RestTemplate configuration

```java
@Configuration
public class RestTemplateConfig {

    @Bean
    public RestTemplate restTemplate(RestTemplateBuilder builder) {
        return builder
            .setConnectTimeout(Duration.ofSeconds(5))
            .setReadTimeout(Duration.ofSeconds(10))
            .errorHandler(new CustomErrorHandler())
            .interceptors(new LoggingInterceptor())
            .build();
    }
}
```

```java
@Service
public class InventoryClient {

    private final RestTemplate rest;
    private final String baseUrl;

    public InventoryClient(RestTemplate rest, @Value("${app.inventory.url}") String baseUrl) {
        this.rest = rest;
        this.baseUrl = baseUrl;
    }

    public Inventory checkStock(String productId) {
        return rest.getForObject(baseUrl + "/inventory/{id}", Inventory.class, productId);
    }

    public Reservation reserve(ReservationRequest request) {
        return rest.postForObject(baseUrl + "/reservations", request, Reservation.class);
    }
}
```

## Error handling with RestTemplate

RestTemplate throws `HttpClientErrorException` (4xx) or `HttpServerErrorException` (5xx) by default. A custom error handler maps these to domain exceptions:

```java
public class CustomErrorHandler implements ResponseErrorHandler {

    @Override
    public boolean hasError(ClientHttpResponse response) throws IOException {
        return response.getStatusCode().isError();
    }

    @Override
    public void handleError(ClientHttpResponse response) throws IOException {
        HttpStatus status = response.getStatusCode();
        String body = new String(response.getBody().readAllBytes());

        if (status == HttpStatus.NOT_FOUND) {
            throw new ResourceNotFoundException("Resource not found: " + body);
        }
        if (status.is4xxClientError()) {
            throw new ClientException("Client error " + status + ": " + body);
        }
        if (status.is5xxServerError()) {
            throw new ServerException("Server error " + status + ": " + body);
        }
    }
}
```

## WebClient — the modern choice

```java
@Configuration
public class WebClientConfig {

    @Bean
    public WebClient webClient(WebClient.Builder builder) {
        return builder
            .baseUrl("https://api.inventory.example.com")
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .filter(ExchangeFilterFunctions.basicAuthentication("user", "pass"))
            .filter((request, next) -> {
                // Logging filter
                log.info("Request: {} {}", request.method(), request.url());
                Mono<ClientResponse> response = next.exchange(request);
                return response.doOnNext(r -> log.info("Response: {}", r.statusCode()));
            })
            .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(1024 * 1024))
            .build();
    }
}
```

```java
@Service
public class InventoryClientWebClient {

    private final WebClient webClient;

    public InventoryClientWebClient(WebClient webClient) {
        this.webClient = webClient;
    }

    // Synchronous (blocking)
    public Inventory checkStock(String productId) {
        return webClient.get()
            .uri("/inventory/{id}", productId)
            .retrieve()
            .bodyToMono(Inventory.class)
            .block();  // blocks until response arrives
    }

    // Reactive (non-blocking)
    public Mono<Inventory> checkStockReactive(String productId) {
        return webClient.get()
            .uri("/inventory/{id}", productId)
            .retrieve()
            .bodyToMono(Inventory.class);
    }

    // With error handling
    public Mono<Inventory> checkStockSafe(String productId) {
        return webClient.get()
            .uri("/inventory/{id}", productId)
            .retrieve()
            .onStatus(HttpStatusCode::is4xxClientError, response ->
                response.bodyToMono(ErrorBody.class)
                    .flatMap(body -> Mono.error(new ClientException(body.message())))
            )
            .bodyToMono(Inventory.class)
            .timeout(Duration.ofSeconds(5))
            .retryWhen(Retry.backoff(3, Duration.ofSeconds(1))
                .filter(ex -> ex instanceof ServerException));
    }
}
```

## RestTemplate vs WebClient comparison

| Feature | RestTemplate | WebClient |
|---|---|---|
| Threading model | Blocking (thread-per-request) | Non-blocking (event loop) |
| Reactive support | ❌ | ✅ (Mono/Flux) |
| Sync usage | Native | `.block()` |
| Timeout handling | `setReadTimeout` | `.timeout()` |
| Retry | Manual or `@Retryable` | `.retryWhen()` |
| Streaming | ❌ | ✅ (Flux for SSE/chunked) |
| Recommended for new code | Maintenance only | ✅ Yes |

## How we use it in organizations

### Scenario 1: payment gateway client with circuit breaker

```java
@Service
public class PaymentClient {

    private final WebClient webClient;

    @CircuitBreaker(name = "paymentGateway", fallbackMethod = "fallbackCharge")
    @Retry(name = "paymentGateway")
    public PaymentResult charge(PaymentRequest request) {
        return webClient.post()
            .uri("/v1/charges")
            .bodyValue(request)
            .retrieve()
            .bodyToMono(PaymentResult.class)
            .timeout(Duration.ofSeconds(10))
            .block();
    }

    public PaymentResult fallbackCharge(PaymentRequest request, Throwable t) {
        log.error("Payment gateway unavailable, queueing for retry: {}", t.getMessage());
        return PaymentResult.pending("Payment queued — gateway unavailable");
    }
}
```

### Scenario 2: bulk data fetch with streaming

```java
public Flux<Order> fetchAllOrders() {
    return webClient.get()
        .uri("/api/orders/stream")
        .accept(MediaType.TEXT_EVENT_STREAM)
        .retrieve()
        .bodyToFlux(Order.class);  // each SSE event is one Order
}
```

### Scenario 3: retry with exponential backoff

```java
public Mono<ExternalConfig> fetchConfig() {
    return webClient.get()
        .uri("/config")
        .retrieve()
        .bodyToMono(ExternalConfig.class)
        .retryWhen(Retry.backoff(3, Duration.ofSeconds(1))
            .maxBackoff(Duration.ofSeconds(10))
            .filter(ex -> ex instanceof WebClientResponseException wcre && wcre.getStatusCode().is5xxServerError())
        )
        .timeout(Duration.ofSeconds(30));
}
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Using `block()` in reactive chains | Defeats the purpose of non-blocking |
| No timeout on WebClient calls | Threads hang indefinitely |
| Creating a new WebClient per request | No connection pooling |
| Swallowing HTTP errors | Silent data corruption |
| Not using circuit breaker for external calls | Cascading failures |
