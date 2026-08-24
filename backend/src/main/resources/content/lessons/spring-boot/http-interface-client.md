---
title: Spring Boot HTTP Interface Clients — Declarative REST
summary: The declarative HTTP interface pattern, @HttpExchange, WebClient for reactive clients, RestTemplate evolution, interceptors, error handling, and how organizations build resilient service-to-service communication.
order: 36
minutes: 20
topics: [http-interface, declarative-client, resttemplate, webclient, http-exchange, service-client, resilience]
docs:
  - https://docs.spring.io/spring-framework/reference/integration/rest-clients.html
---

# Spring Boot HTTP Interface Clients — Declarative REST

## The concept

Instead of manually constructing HTTP requests with `RestTemplate` or `WebClient`, you define an **interface** that describes the remote API. Spring generates a proxy implementation that translates your method calls into HTTP requests. This is the same pattern Feign, Retrofit, and gRPC use — declare what you want, let the framework handle the plumbing.

```java
// Declare the remote API as a Java interface
@HttpExchange
public interface UserClient {
    @GetExchange("/api/users/{id}")
    User getUser(@PathVariable String id);

    @PostExchange("/api/users")
    User createUser(@RequestBody CreateUserRequest request);
}

// Spring generates the implementation at runtime
@Configuration
public class ClientConfig {
    @Bean
    public UserClient userClient(RestClient.Builder builder) {
        return HttpExchangeAdapter.create(
            builder.baseUrl("https://user-service.internal")
                .requestInterceptor(new AuthInterceptor())
                .build());
    }
}
```

**Why declare interfaces instead of using RestTemplate directly?**
- **Type safety** — Method signature enforces request/response shapes at compile time
- **Testability** — Mock the interface in tests (no HTTP calls)
- **Documentation** — The interface IS the API contract
- **Consistency** — One pattern for all service clients

## The client technology progression

| Technology | Style | Reactive | Status |
|---|---|---|---|
| `RestTemplate` | Imperative, callback | No | Deprecated in Spring 6 |
| `WebClient` | Imperative + Reactive | Yes | Current for reactive |
| `RestClient` | Imperative, fluent | No | New in Spring 6.1 |
| `@HttpExchange` | Declarative interface | Either | New in Spring 6, preferred |

## How we use it in organizations

### Scenario 1: User service client

Call the user service to fetch profile data:

```java
@HttpExchange
public interface UserClient {
    @GetExchange("/api/users/{userId}")
    UserProfile getUserProfile(@PathVariable String userId);

    @GetExchange("/api/users/{userId}/permissions")
    List<String> getPermissions(@PathVariable String userId);
}
```

```java
@Service
public class AuthorizationService {
    private final UserClient userClient;

    public AuthorizationService(UserClient userClient) {
        this.userClient = userClient;
    }

    public boolean hasPermission(String userId, String requiredPermission) {
        List<String> permissions = userClient.getPermissions(userId);
        return permissions.contains(requiredPermission);
    }
}
```

### Scenario 2: Resilient client with Circuit Breaker

Wrap the client with resilience patterns:

```java
@CircuitBreaker(name = "payment-service", fallbackMethod = "paymentFallback")
@Retry(name = "payment-service")
@TimeLimiter(name = "payment-service")
@HttpExchange
public interface PaymentClient {
    @PostExchange("/api/payments")
    PaymentResult processPayment(@RequestBody PaymentRequest request);
}
```

```java
@Service
public class PaymentFacade {
    private final PaymentClient paymentClient;

    public PaymentResult processPayment(PaymentRequest request) {
        return paymentClient.processPayment(request);
    }

    // Fallback when circuit is open or timeout
    public PaymentResult paymentFallback(PaymentRequest request, Exception ex) {
        log.warn("Payment service unavailable, queuing for retry: {}", ex.getMessage());
        retryQueue.enqueue(request);
        return PaymentResult.pending("Payment queued — will process when service recovers");
    }
}
```

### Scenario 3: WebClient for streaming responses

When you need to stream large responses (SSE, paginated data):

```java
@Component
public class DataStreamClient {
    private final WebClient webClient;

    public Flux<DataChunk> streamData(String datasetId) {
        return webClient.get()
            .uri("/api/datasets/{id}/stream", datasetId)
            .accept(MediaType.TEXT_EVENT_STREAM)
            .retrieve()
            .bodyToFlux(DataChunk.class)
            .timeout(Duration.ofSeconds(30))
            .retry(3);
    }

    public Mono<byte[]> downloadFile(String fileId) {
        return webClient.get()
            .uri("/api/files/{id}", fileId)
            .accept(MediaType.APPLICATION_OCTET_STREAM)
            .retrieve()
            .bodyToMono(byte[].class);
    }
}
```

### Scenario 4: Interceptors for authentication

Attach JWT tokens to every request:

```java
@Component
public class ServiceAuthInterceptor implements ClientHttpRequestInterceptor {

    private final TokenService tokenService;

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body,
                                         ClientHttpRequestExecution execution) throws IOException {
        String token = tokenService.getServiceToken();
        request.getHeaders().setBearerAuth(token);
        request.getHeaders().set("X-Forwarded-For", localIpAddress);
        return execution.execute(request, body);
    }
}
```

### Scenario 5: Error handling with custom exceptions

Transform HTTP errors into domain exceptions:

```java
@Component
public class ClientErrorHandler implements ClientHttpResponseErrorHandler {

    @Override
    public boolean hasError(ClientHttpResponse response) throws IOException {
        return response.getStatusCode().isError();
    }

    @Override
    public void handleError(ClientHttpResponse response) throws IOException {
        HttpStatusCode status = response.getStatusCode();
        String body = new String(response.getBody().readAllBytes());

        if (status == HttpStatus.NOT_FOUND) {
            throw new ResourceNotFoundException("Resource not found: " + body);
        } else if (status == HttpStatus.UNAUTHORIZED) {
            throw new AuthenticationException("Service authentication failed");
        } else if (status.is5xxServerError()) {
            throw new ExternalServiceException("Upstream error: " + status, body);
        }
        throw new ExternalServiceException("Client error: " + status);
    }
}
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Using deprecated `RestTemplate` for new code | Technical debt, no reactive support |
| No timeout on clients | Thread hangs indefinitely on slow service |
| Catching all exceptions generically | Masks specific failures |
| No circuit breaker on external calls | Cascading failures when dependency dies |
| Large request/response bodies without streaming | Memory explosion |
| Creating new WebClient per request | Socket leak, connection pool exhaustion |
