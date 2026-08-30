---
title: "RestClient — The Modern Way to Call REST APIs from Spring"
summary: "RestClient basics, timeouts and interceptors, request/response logging, error handling, and how organizations build resilient API clients."
order: 9
minutes: 18
topics: [rest-client, http-client, webclient, timeouts, interceptors, resilience, spring-6]
docs:
  - https://docs.spring.io/spring-framework/reference/integration/rest-clients.html
---

## The Concept, From Zero

### Why RestClient Exists

Spring has three HTTP clients for calling REST APIs:

1. **RestTemplate** (old) — blocking, callback-based, legacy
2. **WebClient** (reactive) — non-blocking, reactive, complex
3. **RestClient** (new in Spring 6.1) — blocking, fluent, modern

**RestClient** is the modern replacement for RestTemplate. It's simpler, fluent, and supports the latest features:

```java
// Old way — RestTemplate
RestTemplate restTemplate = new RestTemplate();
ResponseEntity<User> response = restTemplate.exchange(
    "https://api.example.com/users/{id}",
    HttpMethod.GET,
    null,
    new ParameterizedTypeReference<User>() {},
    userId
);

// New way — RestClient (cleaner, more readable)
RestClient client = RestClient.create("https://api.example.com");

User user = client.get()
    .uri("/users/{id}", userId)
    .retrieve()
    .body(User.class);
```

### Creating RestClient

```java
// Basic — uses default settings
RestClient client = RestClient.create("https://api.example.com");

// With custom settings
RestClient client = RestClient.builder()
    .baseUrl("https://api.example.com")
    .defaultHeader("Authorization", "Bearer " + token)
    .defaultHeader("Accept", MediaType.APPLICATION_JSON_VALUE)
    .requestFactory(new JdkClientHttpRequestFactory())  // Java 11+ HttpClient
    .build();

// With timeouts
RestClient client = RestClient.builder()
    .requestFactory(new JdkClientHttpRequestFactory(
        HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build()
    ))
    .build();
```

### Making Requests

```java
// GET — simple
User user = client.get()
    .uri("/users/{id}", userId)
    .retrieve()
    .body(User.class);

// GET — with query params
List<Order> orders = client.get()
    .uri(uriBuilder -> uriBuilder
        .path("/orders")
        .queryParam("status", "active")
        .queryParam("page", 0)
        .queryParam("size", 20)
        .build())
    .retrieve()
    .body(new ParameterizedTypeReference<List<Order>>() {});

// POST — create
User created = client.post()
    .uri("/users")
    .contentType(MediaType.APPLICATION_JSON)
    .body(newUser)
    .retrieve()
    .body(User.class);

// PUT — update
client.put()
    .uri("/users/{id}", userId)
    .contentType(MediaType.APPLICATION_JSON)
    .body(updatedUser)
    .retrieve()
    .toBodilessEntity();

// DELETE — remove
client.delete()
    .uri("/users/{id}", userId)
    .retrieve()
    .toBodilessEntity();
```

### Error Handling

```java
// Handle specific status codes
User user = client.get()
    .uri("/users/{id}", userId)
    .retrieve()
    .onStatus(HttpStatusCode::is4xxClientError, (req, resp) -> {
        if (resp.getStatusCode().value() == 404) {
            throw new ResourceNotFoundException("User not found: " + userId);
        }
        throw new RestClientException("Client error: " + resp.getStatusCode());
    })
    .onStatus(HttpStatusCode::is5xxServerError, (req, resp) -> {
        throw new ExternalServiceException("Server error: " + resp.getStatusCode());
    })
    .body(User.class);

// Or handle all errors in try-catch
try {
    User user = client.get().uri("/users/{id}", userId)
        .retrieve().body(User.class);
} catch (HttpClientErrorException e) {
    // 4xx error
    log.warn("Client error: {}", e.getResponseBodyAsString());
} catch (HttpServerErrorException e) {
    // 5xx error
    log.error("Server error: {}", e.getResponseBodyAsString());
}
```

### Interceptors (Request/Response Logging)

```java
RestClient client = RestClient.builder()
    .requestInterceptor((request, body, execution) -> {
        log.info("→ {} {} {}bytes", request.getMethod(), request.getURL(), body.length);
        long start = System.currentTimeMillis();
        ClientHttpResponse response = execution.execute(request, body);
        long duration = System.currentTimeMillis() - start;
        log.info("← {} {}ms", response.getStatusCode(), duration);
        return response;
    })
    .build();
```

### Organization Use Cases

**1. Microservice Client**
```java
@Service
public class UserServiceClient {
    private final RestClient client;
    
    public UserServiceClient(@Value("${services.user.url}") String baseUrl) {
        this.client = RestClient.builder()
            .baseUrl(baseUrl)
            .defaultHeader("Accept", "application/json")
            .requestFactory(new JdkClientHttpRequestFactory(
                HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(3))
                    .build()))
            .build();
    }
    
    public Optional<User> findById(Long id) {
        try {
            User user = client.get().uri("/users/{id}", id)
                .retrieve().body(User.class);
            return Optional.ofNullable(user);
        } catch (HttpClientErrorException.NotFound e) {
            return Optional.empty();
        }
    }
}
```

**2. External API Integration**
```java
@Service
public class PaymentGateway {
    private final RestClient client;
    
    public PaymentGateway(PaymentConfig config) {
        this.client = RestClient.builder()
            .baseUrl(config.getBaseUrl())
            .defaultHeader("Authorization", "Bearer " + config.getApiKey())
            .build();
    }
    
    public PaymentResult charge(BigDecimal amount, String currency) {
        return client.post()
            .uri("/v1/charges")
            .body(Map.of("amount", amount, "currency", currency))
            .retrieve()
            .body(PaymentResult.class);
    }
}
```

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| No timeout configured | Hangs forever on slow services | Set connect + read timeouts |
| Not handling errors | Uncaught exceptions crash the app | Use onStatus() or try-catch |
| Creating new client per request | Connection pool waste | Create client once, inject as bean |
| Using RestTemplate | Legacy, no fluent API | Migrate to RestClient |
| Not logging requests | Can't debug in production | Add request interceptor |

### Key Takeaways

1. **RestClient** is the modern Spring HTTP client (replaces RestTemplate)
2. **Fluent API** — .get()/.post()/.put()/.delete() → .uri() → .retrieve() → .body()
3. **Always set timeouts** — connect timeout + read timeout
4. **Handle errors with onStatus()** — map HTTP status to exceptions
5. **Add interceptors** — for logging, auth, metrics
6. **Create once, inject as bean** — reuse connection pool

### Real-World Organization Scenario

A platform calls 12 external services (payment, email, shipping, etc.). Each service has a dedicated RestClient bean with:
- 5-second connect timeout, 30-second read timeout
- Request/response logging interceptor
- Authentication header interceptor
- Metrics interceptor (latency per service)

When a service is slow, the timeout kicks in and the circuit breaker opens. The RestClient is configured once per service and injected into the business logic.
