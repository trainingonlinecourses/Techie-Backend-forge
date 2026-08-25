---
title: RestClient — Modern HTTP Client (Spring 6.1)
summary: Fluent API for synchronous HTTP calls, replacing RestTemplate, request interceptors, error handling, and calling external microservices.
order: 45
minutes: 16
topics: [restclient, resttemplate, http-client, microservices, external-api, request-interceptor]
docs:
  - https://docs.spring.io/spring-framework/reference/integration/rest-clients.html#rest-restclient
  - https://www.javaguides.net/2024/05/spring-boot-restclient-tutorial.html
---

# Spring RestClient — Modern HTTP Client

## What Is RestClient?

**RestClient** (introduced in Spring 6.1) is a synchronous HTTP client that provides a modern, fluent API for making REST calls. It replaces the older `RestTemplate` with a cleaner, more readable interface.

Think of it as a **postman for your code** — you build requests step by step and send them to external APIs.

---

## Why RestClient Over RestTemplate?

```java
// ❌ Old way — RestTemplate (verbose, hard to read)
RestTemplate restTemplate = new RestTemplate();

// Simple GET
User user = restTemplate.getForObject("https://api.example.com/users/1", User.class);

// POST with headers
HttpHeaders headers = new HttpHeaders();
headers.setContentType(MediaType.APPLICATION_JSON);
HttpEntity<String> entity = new HttpEntity<>("{\"name\":\"Alice\"}", headers);
ResponseEntity<User> response = restTemplate.postForEntity(
    "https://api.example.com/users", entity, User.class
);
```

```java
// ✅ New way — RestClient (clean, fluent, readable)
RestClient client = RestClient.create("https://api.example.com");

// Simple GET
User user = client.get()
    .uri("/users/1")
    .retrieve()
    .body(User.class);

// POST with headers
User user = client.post()
    .uri("/users")
    .contentType(MediaType.APPLICATION_JSON)
    .body(Map.of("name", "Alice"))
    .retrieve()
    .body(User.class);
```

---

## Basic Usage

### Creating a RestClient

```java
// Option 1: Simple creation
RestClient client = RestClient.create("https://api.example.com");

// Option 2: With default headers
RestClient client = RestClient.builder()
    .baseUrl("https://api.example.com")
    .defaultHeader("Authorization", "Bearer " + token)
    .defaultHeader("Accept", MediaType.APPLICATION_JSON_VALUE)
    .build();
```

### GET Requests

```java
RestClient client = RestClient.create("https://jsonplaceholder.typicode.com");

// Simple GET
String body = client.get()
    .uri("/posts/1")
    .retrieve()
    .body(String.class);

// GET with path variables
Post post = client.get()
    .uri("/posts/{id}", 1)
    .retrieve()
    .body(Post.class);

// GET with query parameters
List<Post> posts = client.get()
    .uri(uriBuilder -> uriBuilder
        .path("/posts")
        .queryParam("userId", 1)
        .queryParam("_limit", 10)
        .build())
    .retrieve()
    .body(new ParameterizedTypeReference<List<Post>>() {});
```

### POST Requests

```java
// POST with JSON body
Post newPost = client.post()
    .uri("/posts")
    .contentType(MediaType.APPLICATION_JSON)
    .body(Map.of(
        "title", "Hello World",
        "body", "This is a new post",
        "userId", 1
    ))
    .retrieve()
    .body(Post.class);

// POST and get the full response (including status code, headers)
ResponseEntity<Post> response = client.post()
    .uri("/posts")
    .contentType(MediaType.APPLICATION_JSON)
    .body(Map.of("title", "Hello"))
    .toEntity(Post.class);

int statusCode = response.getStatusCode().value();  // 201
Post created = response.getBody();
```

### PUT and DELETE

```java
// PUT — update entire resource
client.put()
    .uri("/posts/1")
    .contentType(MediaType.APPLICATION_JSON)
    .body(Map.of("title", "Updated Title", "body", "Updated body", "userId", 1))
    .retrieve()
    .toBodilessEntity();  // No response body expected

// PATCH — partial update
client.patch()
    .uri("/posts/1")
    .contentType(MediaType.APPLICATION_JSON)
    .body(Map.of("title", "Only Title Updated"))
    .retrieve()
    .toBodilessEntity();

// DELETE
client.delete()
    .uri("/posts/1")
    .retrieve()
    .toBodilessEntity();
```

---

## Error Handling

### Custom Error Handling

```java
RestClient client = RestClient.create("https://api.example.com");

try {
    User user = client.get()
        .uri("/users/{id}", 999)
        .retrieve()
        .body(User.class);
} catch (HttpClientErrorException.NotFound e) {
    // 404 — user not found
    System.out.println("User not found: " + e.getResponseBodyAsString());
} catch (HttpClientErrorException e) {
    // Any 4xx error
    System.out.println("Client error: " + e.getStatusCode());
} catch (HttpServerErrorException e) {
    // Any 5xx error
    System.out.println("Server error: " + e.getStatusCode());
}
```

### Handling Errors with ResponseEntity

```java
// Get the full response including error status
ResponseEntity<User> response = client.get()
    .uri("/users/{id}", 999)
    .toEntity(User.class);

if (response.getStatusCode().is4xxClientError()) {
    System.out.println("Client error: " + response.getStatusCode());
} else if (response.getStatusCode().is5xxServerError()) {
    System.out.println("Server error: " + response.getStatusCode());
} else {
    User user = response.getBody();
}
```

---

## Advanced Features

### Request Interceptors

```java
RestClient client = RestClient.builder()
    .baseUrl("https://api.example.com")
    .requestInterceptor((request, body, execution) -> {
        // Add auth token to every request
        request.getHeaders().set("Authorization", "Bearer " + getToken());
        System.out.println("Request: " + request.getMethod() + " " + request.getURI());
        return execution.execute(request, body);
    })
    .build();
```

### Request/Response Logging

```java
RestClient client = RestClient.builder()
    .baseUrl("https://api.example.com")
    .requestInterceptor(new LoggingInterceptor())
    .build();

// Custom interceptor
public class LoggingInterceptor implements ClientHttpRequestInterceptor {
    private static final Logger log = LoggerFactory.getLogger(LoggingInterceptor.class);

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution) {
        log.info("Request: {} {} with body: {}", request.getMethod(), request.getURI(), new String(body));
        ClientHttpResponse response = execution.execute(request, body);
        log.info("Response status: {}", response.getStatusCode());
        return response;
    }
}
```

### Custom Headers Per Request

```java
User user = client.get()
    .uri("/users/1")
    .header("X-Request-Id", UUID.randomUUID().toString())
    .header("Accept-Language", "en-US")
    .retrieve()
    .body(User.class);
```

---

## In an Organization

### Scenario 1: Calling an External Payment API

```java
@Service
public class PaymentService {

    private final RestClient paymentClient;

    public PaymentService(RestClient.Builder builder) {
        this.paymentClient = builder
            .baseUrl("https://api.stripe.com/v1")
            .defaultHeader("Authorization", "Bearer " + stripeApiKey)
            .build();
    }

    public PaymentIntent createPayment(BigDecimal amount, String currency) {
        return paymentClient.post()
            .uri("/payment_intents")
            .contentType(MediaType.APPLICATION_FORM_URLENCODED)
            .body("amount=" + amount.multiply(BigDecimal.valueOf(100)).intValue()
                + "&currency=" + currency)
            .retrieve()
            .body(PaymentIntent.class);
    }

    public PaymentIntent retrievePayment(String paymentIntentId) {
        return paymentClient.get()
            .uri("/payment_intents/{id}", paymentIntentId)
            .retrieve()
            .body(PaymentIntent.class);
    }
}
```

### Scenario 2: Calling a Microservice

```java
@Service
public class OrderService {

    private final RestClient userClient;

    public OrderService(RestClient.Builder builder) {
        this.userClient = builder
            .baseUrl("https://user-service.internal:8081")
            .defaultHeader("X-Service-Token", serviceToken)
            .build();
    }

    public OrderSummary createOrder(String userId, List<OrderItem> items) {
        // Validate user exists
        User user = userClient.get()
            .uri("/api/users/{id}", userId)
            .retrieve()
            .body(User.class);

        // Create order
        Order order = orderRepository.save(new Order(userId, items));

        return new OrderSummary(order.getId(), user.getName(), order.getTotal());
    }
}
```

### Scenario 3: Webhook Configuration

```java
@Service
public class WebhookService {

    private final RestClient webhookClient;

    public WebhookService(RestClient.Builder builder) {
        this.webhookClient = builder
            .baseUrl("https://hooks.slack.com")
            .build();
    }

    public void sendSlackNotification(String webhookUrl, String message) {
        webhookClient.post()
            .uri(webhookUrl.replace("https://hooks.slack.com", ""))
            .contentType(MediaType.APPLICATION_JSON)
            .body(Map.of("text", message))
            .retrieve()
            .toBodilessEntity();
    }
}
```

---

## RestClient vs RestTemplate vs WebClient

| Feature | RestTemplate | RestClient | WebClient |
|---------|-------------|------------|-----------|
| Type | Synchronous | Synchronous | Reactive (async) |
| API Style | Template method | Fluent builder | Fluent builder |
| Readability | Verbose | Clean | Clean |
| Spring Version | 3.x+ | 6.1+ | 5.0+ |
| Recommended | ❌ Legacy | ✅ New standard | ✅ For reactive apps |
| Learning Curve | Low | Low | Medium |

**Rule of thumb**: Use `RestClient` for synchronous calls, `WebClient` for reactive/async calls.

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using RestTemplate in new code | Deprecated in Spring 6 | Switch to RestClient |
| Not handling errors | Unhandled exceptions crash the app | Use try-catch or `ResponseEntity` |
| Creating a new RestClient per request | Wasteful, loses connection pooling | Create once as a bean, inject it |
| Hardcoding URLs | Impossible to change environments | Use `@Value` or `@ConfigurationProperties` |
| Not setting timeouts | Requests hang forever | Configure connect/read timeouts |
| Returning raw entities | Exposes internal data | Map to DTOs before returning |
