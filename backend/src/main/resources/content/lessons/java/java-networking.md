---
title: Java Networking — Sockets, HTTP, and URL Handling
summary: TCP/UDP sockets, HttpClient for REST calls, URL/URLConnection for simple fetches, and how organizations build reliable networked systems. Beginner-friendly with line-by-line code.
order: 39
minutes: 20
topics: [networking, TCP, UDP, socket, HttpClient, URL, URLConnection, DNS, timeout, retry]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/java/net/http/HttpClient.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/Socket.html
---

# Java Networking — Sockets, HTTP, and URL Handling

## What is Java Networking? (From Zero)

Networking in Java means **communicating between programs over a network** — whether it's two services talking to each other, a client calling an API, or a server accepting connections. Java provides several layers of networking APIs, from low-level sockets to high-level HTTP clients.

### The Networking Stack in Java

| Layer | API | Use Case |
|---|---|---|
| **Low-level** | `Socket`, `ServerSocket` | TCP connections, custom protocols |
| **HTTP** | `HttpClient` (Java 11+) | REST API calls, webhooks, microservice communication |
| **Simple fetch** | `URL`, `URLConnection` | Quick file downloads, simple GET requests |
| **NIO** | `java.nio.channels` | High-performance, non-blocking I/O (Netty uses this) |

---

## The Code — Line by Line

### 1. HttpClient (The Modern Way — Java 11+)

This is what you'll use 90% of the time in modern Java applications:


**What this code does — step by step:**

1. `.connectTimeout(Duration.ofSeconds(5))` — Fail fast if server is unreachable
2. `.version(HttpClient.Version.HTTP_2)` — Use HTTP/2 (multiplexed connections)
3. `.followRedirects(HttpClient.Redirect.NORMAL)` — Follow 3xx redirects automatically
4. === GET request ===
5. `.uri(URI.create("https://api.example.com/users/" + userId))` — Target URL
6. `.header("Accept", "application/json")` — We want JSON back
7. `.header("Authorization", "Bearer " + token)` — Auth header
8. `.GET()` — HTTP method
9. `.timeout(Duration.ofSeconds(10))` — Per-request timeout
10. `HttpResponse.BodyHandlers.ofString());` — Parse body as String
11. `return response.body();` — The JSON string
12. `return null;` — Not found
13. === POST request with JSON body ===
14. `String json = objectMapper.writeValueAsString(req);` — Serialize to JSON
15. `.header("Content-Type", "application/json")` — Tell server we're sending JSON
16. `.POST(HttpRequest.BodyPublishers.ofString(json))` — Send the JSON body
17. `return objectMapper.readValue(response.body(), Order.class);` — Parse response
18. === Async request (non-blocking) ===
19. `return client.sendAsync(request, HttpResponse.BodyHandlers.ofString())` — Non-blocking
20. `.thenApply(HttpResponse::body);` — Extract body from response

The same code, clean:

```java
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

@Service
public class ExternalApiService {

    private final HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .version(HttpClient.Version.HTTP_2)
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build();

    public String fetchUser(String userId) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("https://api.example.com/users/" + userId))
            .header("Accept", "application/json")
            .header("Authorization", "Bearer " + token)
            .GET()
            .timeout(Duration.ofSeconds(10))
            .build();

        HttpResponse<String> response = client.send(request,
            HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 200) {
            return response.body();
        } else if (response.statusCode() == 404) {
            return null;
        } else {
            throw new ApiException("API returned " + response.statusCode());
        }
    }

    public Order createOrder(OrderRequest req) throws Exception {
        String json = objectMapper.writeValueAsString(req);

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("https://api.example.com/orders"))
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(json))
            .timeout(Duration.ofSeconds(15))
            .build();

        HttpResponse<String> response = client.send(request,
            HttpResponse.BodyHandlers.ofString());

        return objectMapper.readValue(response.body(), Order.class);
    }

    public CompletableFuture<String> fetchUserAsync(String userId) {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("https://api.example.com/users/" + userId))
            .GET()
            .build();

        return client.sendAsync(request, HttpResponse.BodyHandlers.ofString())
            .thenApply(HttpResponse::body);
    }
}
```

**Line-by-line explained:**
- `HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))` — If the server doesn't respond within 5 seconds, throw an exception instead of hanging forever.
- `.version(HTTP_2)` — HTTP/2 allows multiple requests over a single connection (multiplexing), which is faster for multiple parallel calls.
- `HttpRequest.newBuilder()...GET()...build()` — Fluent builder pattern: chain methods to configure the request.
- `client.send(request, BodyHandlers.ofString())` — **Blocking** call: waits for the response. Use `sendAsync()` for non-blocking.
- `client.sendAsync(...).thenApply(...)` — **Non-blocking** call: returns immediately with a `CompletableFuture`. The response arrives later.

### 2. Low-Level TCP Socket


**What this code does — step by step:**

1. Server side: listens for connections
2. `ServerSocket serverSocket = new ServerSocket(8080);` — Listen on port 8080
3. `Socket clientSocket = serverSocket.accept();` — BLOCKS until a client connects. Handle each connection in a new thread:
4. `String line = in.readLine();` — Read a line from the client
5. `out.println("Echo: " + line);` — Send response back

The same code, clean:

```java
public class SimpleServer {
    public static void main(String[] args) throws IOException {
        ServerSocket serverSocket = new ServerSocket(8080);
        System.out.println("Server listening on port 8080");

        while (true) {
            Socket clientSocket = serverSocket.accept();
            new Thread(() -> handleClient(clientSocket)).start();
        }
    }

    private static void handleClient(Socket socket) {
        try (BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream()));
             PrintWriter out = new PrintWriter(socket.getOutputStream(), true)) {

            String line = in.readLine();
            System.out.println("Received: " + line);

            out.println("Echo: " + line);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}
```

**Line-by-line explained:**
- `new ServerSocket(8080)` — Opens a TCP listener on port 8080. Other programs can connect to this port.
- `serverSocket.accept()` — **Blocks** (waits) until a client connects. Returns a `Socket` for communication.
- `new Thread(() -> handleClient(...)).start()` — Handle each client in its own thread so we can accept multiple clients.
- `BufferedReader` / `PrintWriter` — Wrap the socket's streams for easy line-by-line reading/writing.

### 3. Simple URL Fetch


**What this code does — step by step:**

1. Quick and dirty HTTP fetch (for simple use cases):
2. `new InputStreamReader(url.openStream()))) {` — Opens the connection
3. `while ((line = reader.readLine()) != null) {` — Read line by line
4. `response.append(line);` — Build the response string
5. The try-with-resources closes the reader (and the connection) automatically

The same code, clean:

```java
public String fetchUrl(String urlString) throws IOException {
    URL url = new URL(urlString);
    try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(url.openStream()))) {

        StringBuilder response = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            response.append(line);
        }
        return response.toString();
    }
}
```

**Line-by-line explained:**
- `new URL(urlString)` — Parses the URL string into a URL object.
- `url.openStream()` — Opens an InputStream to the URL's content. This makes the actual HTTP request.
- `BufferedReader` wraps the stream for efficient line-by-line reading.
- Try-with-resources (`try (...)`) ensures the connection is closed, even if an exception occurs.

---

## Real-World Scenarios

### Scenario 1: Microservice Communication with Retry

@Service
public class OrderService {
    private final HttpClient client;
    private final ObjectMapper mapper;

    @Retryable(maxAttempts = 3, backoff = @Backoff(delay = 1000))
    public PaymentResult chargePayment(String orderId, BigDecimal amount) {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("http://payment-service/api/charge"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(
                mapper.writeValueAsString(new ChargeRequest(orderId, amount))
            ))
            .timeout(Duration.ofSeconds(5))     // 5-second timeout
            .build();

        HttpResponse<String> response = client.send(request,
            HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 200) {
            return mapper.readValue(response.body(), PaymentResult.class);
        } else if (response.statusCode() >= 500) {
            throw new ServiceUnavailableException("Payment service error");  // Triggers retry
        } else {
            throw new ClientException("Bad request: " + response.statusCode());  // No retry
        }
    }
}

### Scenario 2: Health Check Client

@Component
public class HealthChecker {
    private final HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(3))
        .build();

    @Scheduled(fixedRate = 30000)   // Every 30 seconds
    public void checkServices() {
        Map<String, Boolean> health = new HashMap<>();
        health.put("payment", check("http://payment-service/actuator/health"));
        health.put("inventory", check("http://inventory-service/actuator/health"));

        if (health.values().stream().anyMatch(v -> !v)) {
            alertService.send("Service down: " + health);
        }
    }

    private boolean check(String url) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .GET()
                .timeout(Duration.ofSeconds(3))
                .build();
            HttpResponse<String> resp = client.send(request,
                HttpResponse.BodyHandlers.ofString());
            return resp.statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }
}

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| No timeout on requests | App hangs forever if remote service is down | Always set `connectTimeout` + per-request `timeout` |
| Not closing connections | Connection pool exhaustion, file descriptor leaks | Use try-with-resources |
| Using deprecated `HttpURLConnection` | Verbose, error-prone, no HTTP/2 | Use `HttpClient` (Java 11+) |
| Catching all exceptions silently | Network errors get swallowed, no retries/alerts | Log errors, throw for retry logic |
| Creating a new `HttpClient` per request | New TCP connection every time, slow | Create one `HttpClient` instance and reuse |

---

## Key Takeaways

- **Use `HttpClient` (Java 11+)** for all HTTP communication — it's modern, supports HTTP/2, and is non-blocking.
- **Always set timeouts** — connect timeout + per-request timeout. A missing timeout can hang your entire service.
- **Use `sendAsync()`** for non-blocking calls — returns `CompletableFuture` for better throughput.
- **Reuse `HttpClient` instances** — they manage connection pools internally.
- **Low-level sockets** are rarely needed in business applications — Spring Boot's web stack handles networking for you.

Official docs: [HttpClient](https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/java/net/http/HttpClient.html) · [Socket](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/Socket.html)

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/)
