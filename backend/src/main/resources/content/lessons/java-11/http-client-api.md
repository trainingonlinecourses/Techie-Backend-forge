---
title: HTTP Client API — Modern HTTP in the JDK
summary: What the new HttpClient replaces, building requests, synchronous vs asynchronous calls, WebSocket support, and how organizations use it for microservice communication.
order: 1
minutes: 30
topics: [http-client, httprequest, httpresponse, async-http, websocket, java11]
docs:
  - https://docs.oracle.com/en/java/javase/11/docs/api/java.net.http/java/net/http/HttpClient.html
---

## The Concept, From Zero

Before Java 11, making HTTP requests in Java was painful. `HttpURLConnection` was low-level, verbose, and hard to use. Most teams used third-party libraries like Apache HttpClient or OkHttp.

Java 11 introduced `java.net.http.HttpClient` — a modern, fluent HTTP client built into the JDK:

```java
// OLD: HttpURLConnection — verbose, error-prone
URL url = new URL("https://api.example.com/users");
HttpURLConnection conn = (HttpURLConnection) url.openConnection();
conn.setRequestMethod("GET");
conn.setRequestProperty("Accept", "application/json");
int status = conn.getResponseCode();
BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
String response = reader.lines().collect(Collectors.joining());
reader.close();

// NEW: HttpClient — clean, readable, fluent
HttpClient client = HttpClient.newHttpClient();
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create("https://api.example.com/users"))
    .header("Accept", "application/json")
    .GET()
    .build();
HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
int status = response.statusCode();
String body = response.body();
```

---

## Building Requests

```java
// GET request
HttpRequest get = HttpRequest.newBuilder()
    .uri(URI.create("https://api.example.com/users/123"))
    .header("Accept", "application/json")
    .header("Authorization", "Bearer " + token)
    .GET()
    .build();

// POST with JSON body
HttpRequest post = HttpRequest.newBuilder()
    .uri(URI.create("https://api.example.com/users"))
    .header("Content-Type", "application/json")
    .header("Accept", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString("""
        {"name": "Alice", "email": "alice@example.com"}
        """))
    .build();

// PUT
HttpRequest put = HttpRequest.newBuilder()
    .uri(URI.create("https://api.example.com/users/123"))
    .header("Content-Type", "application/json")
    .PUT(HttpRequest.BodyPublishers.ofString("""
        {"name": "Alice Updated"}
        """))
    .build();

// DELETE
HttpRequest delete = HttpRequest.newBuilder()
    .uri(URI.create("https://api.example.com/users/123"))
    .DELETE()
    .build();
```

---

## Synchronous vs Asynchronous

```java
HttpClient client = HttpClient.newHttpClient();

// SYNCHRONOUS — blocks the current thread
HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.statusCode());
System.out.println(response.body());

// ASYNCHRONOUS — returns CompletableFuture, non-blocking
client.sendAsync(request, HttpResponse.BodyHandlers.ofString())
    .thenApply(HttpResponse::body)
    .thenAccept(System.out::println)
    .join();  // blocks only at .join()

// ASYNCHRONOUS with chaining
client.sendAsync(getUserRequest, HttpResponse.BodyHandlers.ofString())
    .thenApply(response -> parseUser(response.body()))
    .thenCompose(user -> client.sendAsync(
        getOrdersRequest(user.id()), HttpResponse.BodyHandlers.ofString()
    ))
    .thenApply(response -> parseOrders(response.body()))
    .thenAccept(orders -> processOrders(orders))
    .join();
```

---

## Line-by-Line Walkthrough

```java
import java.net.URI;
import java.net.http.*;
import java.time.Duration;

public class HttpClientDemo {
    // Line 1: Create a reusable client with timeout and version
    private final HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))      // connection timeout
        .version(HttpClient.Version.HTTP_2)           // prefer HTTP/2
        .followRedirects(HttpClient.Redirect.NORMAL)  // follow 3xx redirects
        .build();

    // Line 2: Synchronous GET
    public String fetchUser(String userId) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("https://api.example.com/users/" + userId))
            .header("Accept", "application/json")
            .timeout(Duration.ofSeconds(5))
            .GET()
            .build();

        HttpResponse<String> response = client.send(
            request,
            HttpResponse.BodyHandlers.ofString()     // handle body as String
        );

        if (response.statusCode() == 200) {
            return response.body();
        } else {
            throw new RuntimeException("HTTP " + response.statusCode());
        }
    }

    // Line 3: Asynchronous POST with JSON
    public CompletableFuture<User> createUser(CreateUserRequest req) {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("https://api.example.com/users"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(toJson(req)))
            .build();

        return client.sendAsync(request, HttpResponse.BodyHandlers.ofString())
            .thenApply(response -> {
                if (response.statusCode() == 201) {
                    return parseUser(response.body());
                }
                throw new RuntimeException("Create failed: " + response.statusCode());
            });
    }

    // Line 4: Chained async — fetch user, then their orders
    public CompletableFuture<List<Order>> fetchUserOrders(String userId) {
        return client.sendAsync(
                HttpRequest.newBuilder()
                    .uri(URI.create("https://api.example.com/users/" + userId))
                    .GET().build(),
                HttpResponse.BodyHandlers.ofString())
            .thenApply(resp -> parseUser(resp.body()))
            .thenCompose(user -> client.sendAsync(
                HttpRequest.newBuilder()
                    .uri(URI.create("https://api.example.com/orders?userId=" + user.id()))
                    .GET().build(),
                HttpResponse.BodyHandlers.ofString())
            )
            .thenApply(resp -> parseOrders(resp.body()));
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Microservice-to-microservice communication

```java
@Service
public class OrderServiceClient {
    private final HttpClient client;
    private final String userServiceUrl;

    public Optional<User> getUser(String userId) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(userServiceUrl + "/api/users/" + userId))
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(3))
                .GET()
                .build();

            HttpResponse<String> response = client.send(request,
                HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                return Optional.of(objectMapper.readValue(response.body(), User.class));
            }
        } catch (Exception e) {
            log.error("Failed to fetch user {}: {}", userId, e.getMessage());
        }
        return Optional.empty();
    }
}
```

### Scenario 2: Webhook receiver with async processing

```java
public CompletableFuture<Void> processWebhook(String payload) {
    return client.sendAsync(
            HttpRequest.newBuilder()
                .uri(URI.create("https://internal-service/process"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(payload))
                .build(),
            HttpResponse.BodyHandlers.ofString())
        .thenAccept(response -> {
            if (response.statusCode() != 200) {
                log.warn("Webhook processing returned {}", response.statusCode());
            }
        });
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `HttpURLConnection` | Old, verbose, no HTTP/2 | Use `HttpClient` instead |
| Not setting timeouts | Threads hang forever | Always set `connectTimeout` and per-request `timeout` |
| Blocking async calls | `.get()` blocks; use `.join()` | Use `.join()` or `.whenComplete()` |
| Not reusing clients | Creates new connections each time | Create one `HttpClient` and reuse it |
| Ignoring HTTP status codes | Silent failures | Always check `response.statusCode()` |
