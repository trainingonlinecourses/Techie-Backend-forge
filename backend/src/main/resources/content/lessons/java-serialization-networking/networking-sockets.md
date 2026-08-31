---
title: Java Networking — Sockets, URLs, and HTTP Clients
summary: From raw Socket and ServerSocket to the modern HttpClient API, covering TCP connections, URL parsing, and the reactive HttpClient introduced in Java 11.
order: 4
minutes: 22
topics: [sockets, tcp, server-socket, httpclient, url-parsing, networking]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/java/net/http/HttpClient.html
---

## The Concept, From Zero

Java networking works at multiple levels. At the lowest level, you have raw TCP sockets — two programs talking to each other over a network. One program listens (ServerSocket), another connects (Socket). Data flows as byte streams.

At a higher level, HTTP lets you make web requests. Java's modern HttpClient (Java 11+) handles GET, POST, WebSocket connections, and async responses.

## The Code

### Raw TCP Socket Server
```java
import java.net.*;
import java.io.*;

public class SimpleServer {
    public static void main(String[] args) throws IOException {
        // Listen on port 8080
        try (ServerSocket server = new ServerSocket(8080)) {
            System.out.println("Server listening on 8080...");

            while (true) {
                // Accept one client connection
                Socket client = server.accept();

                // Handle in a new thread
                new Thread(() -> handleClient(client)).start();
            }
        }
    }

    static void handleClient(Socket client) {
        try (
            BufferedReader in = new BufferedReader(
                new InputStreamReader(client.getInputStream()));
            PrintWriter out = new PrintWriter(
                client.getOutputStream(), true)
        ) {
            String line = in.readLine();
            out.println("Echo: " + line);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}
```

### Modern HttpClient (Java 11+)
```java
import java.net.http.*;
import java.net.URI;
import java.time.Duration;

public class HttpExamples {
    static HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build();

    // Synchronous GET
    public static String get(String url) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("Accept", "application/json")
            .GET()
            .build();

        HttpResponse<String> response = client.send(
            request, HttpResponse.BodyHandlers.ofString());

        return response.body();
    }

    // Asynchronous POST
    public static void postAsync(String url, String json) {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(json))
            .build();

        client.sendAsync(request, HttpResponse.BodyHandlers.ofString())
            .thenApply(HttpResponse::body)
            .thenAccept(body -> System.out.println("Response: " + body))
            .exceptionally(ex -> {
                System.err.println("Error: " + ex.getMessage());
                return null;
            });
    }

    public static void main(String[] args) throws Exception {
        // GET
        String json = get("https://api.example.com/users");
        System.out.println(json);

        // POST
        postAsync("https://api.example.com/users",
            "{\"name\": \"Sateesh\"}");
    }
}
```

## Line-by-Line Explanation

| Line | What It Does | Why It Matters |
|------|-------------|----------------|
| `ServerSocket(8080)` | Opens a TCP listener | Waits for incoming connections on port 8080 |
| `server.accept()` | Blocks until client connects | Returns a Socket representing the connection |
| `new Thread(() -> ...)` | Handles each client in parallel | Server can handle multiple clients |
| `HttpClient.newBuilder()` | Creates configurable client | Sets timeouts, SSL, proxy, etc. |
| `HttpRequest.newBuilder()` | Builds immutable request | Fluent API prevents partial requests |
| `client.sendAsync()` | Non-blocking HTTP call | Returns CompletableFuture for async processing |
| `exceptionally()` | Error handler | Gracefully handles network failures |

## Real-World Scenarios

**Scenario 1: Microservice health check**
```java
public static boolean isServiceAlive(String url) {
    try {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(url + "/actuator/health"))
            .timeout(Duration.ofSeconds(3))
            .GET()
            .build();
        HttpResponse<String> resp = client.send(request,
            HttpResponse.BodyHandlers.ofString());
        return resp.statusCode() == 200;
    } catch (Exception e) {
        return false;
    }
}
```

**Scenario 2: File download with progress**
```java
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create(downloadUrl))
    .GET()
    .build();
client.sendAsync(request, HttpResponse.BodyHandlers.ofFile(
    Path.of("download.zip")))
    .thenAccept(resp -> System.out.println("Downloaded to " + resp.body()));
```

## Key Takeaways

1. **ServerSocket + Socket** = raw TCP — use for custom protocols
2. **HttpClient** (Java 11+) = modern HTTP — use for REST APIs
3. **sendAsync** returns CompletableFuture — chain with thenApply/thenAccept
4. **Timeouts are critical** — always set connectTimeout and request timeout
5. **try-with-resources** ensures sockets and streams are properly closed
