---
title: The Modern HttpClient — HTTP/2, Async, and Clean APIs
module: java-networking
order: 3
minutes: 26
topics: ["HttpClient", "HttpRequest", "HttpResponse", "async", "HTTP/2", "WebSocket"]
docs:
  - title: "HttpClient (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/java/net/http/HttpClient.html"
  - title: "HTTP Client API (Dev.java)"
    url: "https://dev.java/learn/java-io/http-client/"
summary: For twenty years, Java's builtin HTTP story was HttpURLConnection — functional but clunky: verbose, no HTTP/2, awkward async, and easy to misuse. J...
---

# The Modern HttpClient — HTTP/2, Async, and Clean APIs

## The Concept: The HTTP Client Java Always Needed

For twenty years, Java's built-in HTTP story was `HttpURLConnection` — functional but clunky: verbose, no HTTP/2, awkward async, and easy to misuse. Java 11 shipped the answer: **`java.net.http.HttpClient`**, a modern, fluent, production-grade client built into the JDK. It supports HTTP/1.1 and HTTP/2, synchronous and asynchronous calls, WebSockets, clean request/response objects, and reactive-style body handling — with no external dependencies.

**The mental model:** if `HttpURLConnection` is a rotary phone, `HttpClient` is a smartphone. You configure one `HttpClient` once (timeouts, redirects, HTTP version, executor), then build `HttpRequest` objects fluently and *send* them. Sending returns an `HttpResponse<T>` whose body you can read as a `String`, bytes, a file, or a custom handler. It's the difference between low-level mechanics and a designed API.

## The Three Objects: HttpClient, HttpRequest, HttpResponse

```java
import java.net.URI;
import java.net.http.*;
import java.time.Duration;

public class HttpClientDemo {
    public static void main(String[] args) throws Exception {
        // 1. The CLIENT — configured once, reused for many requests.
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))   // TCP handshake bound
                .followRedirects(HttpClient.Redirect.NORMAL) // follow 3xx
                .version(HttpClient.Version.HTTP_2)      // prefer HTTP/2
                .build();

        // 2. The REQUEST — fluent builder, one per call.
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.example.com/users?page=1"))
                .header("Accept", "application/json")    // any headers
                .timeout(Duration.ofSeconds(10))         // whole-request bound
                .GET()
                .build();

        // 3. The RESPONSE — status, headers, and a typed body.
        HttpResponse<String> response =
                client.send(request, HttpResponse.BodyHandlers.ofString());

        System.out.println("Status : " + response.statusCode());   // 200
        System.out.println("Body   : " + response.body());
        System.out.println("Version: " + response.version());      // HTTP_2
    }
}
```

**Walking through it:** the `HttpClient` builder sets *client-wide* policy: connect timeout, redirect strategy (`NORMAL` follows redirects only for GET; `ALWAYS` follows for all verbs; `NEVER` for manual control), and preferred protocol version. The `HttpRequest` builder sets *per-request* details: URI, headers, and a whole-request timeout that aborts if the response doesn't complete. `send(request, handler)` is **synchronous** — the calling thread blocks until the response arrives, and `BodyHandlers.ofString()` tells the client to assemble the body into a `String`. The result is a typed `HttpResponse<String>` with everything at your fingertips.

## Synchronous vs Asynchronous — send vs sendAsync

The client's superpower is `sendAsync`, which returns immediately with a **`CompletableFuture`** — a promise that completes when the response arrives:

```java
import java.net.URI;
import java.net.http.*;
import java.util.concurrent.CompletableFuture;

public class AsyncDemo {
    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newHttpClient();

        // Fire THREE requests concurrently — no thread blocks waiting.
        CompletableFuture<HttpResponse<String>> f1 =
                client.sendAsync(build("https://api.example.com/a"), BodyHandlers.ofString());
        CompletableFuture<HttpResponse<String>> f2 =
                client.sendAsync(build("https://api.example.com/b"), BodyHandlers.ofString());
        CompletableFuture<HttpResponse<String>> f3 =
                client.sendAsync(build("https://api.example.com/c"), BodyHandlers.ofString());

        // Compose them: when ALL complete, combine their bodies.
        CompletableFuture<String> combined = CompletableFuture
                .allOf(f1, f2, f3)
                .thenApply(v -> f1.join().body() + f2.join().body() + f3.join().body());

        System.out.println(combined.get());   // block ONLY at the end
    }

    static HttpRequest build(String url) {
        return HttpRequest.newBuilder(URI.create(url)).GET().build();
    }
}
```

**Walking through it:** each `sendAsync` starts a request without blocking the caller — the three requests run *concurrently* (this is where HTTP/2 shines: one connection multiplexes them). `CompletableFuture.allOf(...)` waits for all three; `.thenApply` runs once everything completes and combines the bodies; `combined.get()` is the *only* blocking call, at the very end. The total time is roughly the slowest single request, not the sum — that's the concurrency win. This pattern (async composition) is what reactive frameworks build on, and it's available in plain Java.

## POST with a JSON Body

```java
HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create("https://api.example.com/users"))
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(
                "{\"name\":\"Ada\",\"role\":\"admin\"}"))
        .build();

HttpResponse<String> response = client.send(request,
        HttpResponse.BodyHandlers.ofString());
System.out.println(response.statusCode());
```

`BodyPublishers` is the write-side mirror of `BodyHandlers`: `ofString`, `ofByteArray`, `ofFile`, `ofInputStream`, or `noBody()`. The symmetry is the design's elegance — you publish a request body and handle a response body with parallel APIs.

## Body Handlers in Detail

The body handler decides *what to do with* the response bytes:

```java
HttpResponse<String>   asString  = client.send(req, HttpResponse.BodyHandlers.ofString());
HttpResponse<byte[]>   asBytes   = client.send(req, HttpResponse.BodyHandlers.ofByteArray());
HttpResponse<Path>     asFile    = client.send(req, HttpResponse.BodyHandlers.ofFile(
                                               Path.of("download.zip")));
HttpResponse<Void>     asDiscard = client.send(req, HttpResponse.BodyHandlers.discarding());
```

`ofFile` streams the body straight to disk — perfect for downloads without loading the whole file into memory. `discarding()` keeps only status/headers. For custom needs, `ofInputStream()` hands you the raw stream, and you can implement `BodyHandler`/`BodySubscriber` for full control (that's how streaming/partial responses are built).

## Handling Errors and Timeouts Like a Pro

```java
HttpResponse<String> response;
try {
    response = client.send(request, HttpResponse.BodyHandlers.ofString());
} catch (HttpTimeoutException e) {
    System.out.println("Request timed out");
    return;
} catch (java.io.IOException e) {
    System.out.println("Network failure: " + e.getMessage());
    return;
} catch (InterruptedException e) {
    Thread.currentThread().interrupt();   // restore the flag
    return;
}

// An HTTP error STATUS is not an exception — check it explicitly:
if (response.statusCode() >= 400) {
    System.out.println("Server error " + response.statusCode() +
                       ": " + response.body());
}
```

**The critical distinction:** network *failures* (timeout, refused connection, DNS) throw exceptions; HTTP *error statuses* (404, 500) are returned as normal responses. The client doesn't throw for a 500 — you must inspect `statusCode()`. This catches many newcomers: they expect `send` to throw on 404, and it doesn't. Handle both halves deliberately.

## WebSockets Built In

`HttpClient` also has a first-class WebSocket client — one connection, bidirectional, message-framed:

```java
WebSocket ws = client.newWebSocketBuilder()
        .buildAsync(URI.create("wss://example.com/chat"), listener).join();
ws.sendText("hello", true);   // send a text frame
```

(With a `WebSocket.Listener` handling `onOpen`, `onText`, `onClose`.) For chat, live feeds, and push notifications, this removes the need for third-party WebSocket libraries.

## Choosing HttpClient vs Spring's RestClient

For plain Java, `HttpClient` is the standard. In a Spring Boot app you'll often see `RestTemplate` (legacy), `RestClient` (the modern synchronous choice), or `WebClient` (reactive) — all of which can delegate to `HttpClient` under the hood. The rules: **plain Java / JDK-only** → `HttpClient`; **Spring Boot, synchronous** → `RestClient`; **reactive stack** → `WebClient`. The concepts you've learned here (request builders, status checks, error-vs-status distinction, timeouts) transfer directly to all of them.

## Recap

`java.net.http.HttpClient` is the modern, built-in HTTP client: configure one client (timeouts, redirects, HTTP/2), build fluent requests, and send them synchronously (`send`) or asynchronously (`sendAsync` returning `CompletableFuture`). Body handlers give typed results (`ofString`, `ofFile`, custom), and the API covers POST bodies, WebSockets, and concurrency composition. The two habits to internalize: **network failures throw, HTTP errors don't** — check `statusCode()` — and async + `allOf`/`thenApply` turns N sequential requests into one concurrent batch. Master this client and you have the JDK's full HTTP story in one clean API.
