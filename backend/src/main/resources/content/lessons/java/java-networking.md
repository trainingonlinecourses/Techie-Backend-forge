---
title: Networking: Sockets & the HTTP Client
summary: TCP/UDP sockets, the modern java.net.http.HttpClient with HTTP/2 and virtual threads, and how Java applications talk to each other.
order: 15
minutes: 18
topics: [sockets, httpclient, http2, tcp, webclient-alternative]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/java/net/http/package-summary.html
  - https://docs.oracle.com/javase/tutorial/networking/sockets/index.html
---

# Networking: Sockets & the HTTP Client

## The stack in one picture

```
Application  (your code)
   |  java.net.http.HttpClient / ServerSocket / Socket
TCP / UDP    (reliable byte stream / fast datagrams)
IP           (routing)
```

Three tools cover almost everything:

| Tool | Use for |
|---|---|
| `Socket` / `ServerSocket` | Raw TCP — protocols you own (Redis, custom binary protocols) |
| `DatagramSocket` | UDP — low-latency, loss-tolerant (logs, metrics, gaming) |
| `java.net.http.HttpClient` | HTTP/1.1, HTTP/2, WebSocket — calling REST APIs and services |

## HTTP Client — the modern way (Java 11+)

```java
HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .version(HttpClient.Version.HTTP_2)          // auto-fallback to 1.1
        .build();

HttpRequest req = HttpRequest.newBuilder(URI.create("https://api.example.com/orders"))
        .timeout(Duration.ofSeconds(30))
        .header("Authorization", "Bearer " + token)
        .GET()
        .build();

// Blocking (fine on a worker thread — with virtual threads this scales)
HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());

// Async (non-blocking, CompletableFuture based)
CompletableFuture<HttpResponse<String>> future =
        client.sendAsync(req, HttpResponse.BodyHandlers.ofString());
```

Key points teams hit in production:

- **Set timeouts everywhere** — connect *and* request; a missing timeout hangs a thread forever.
- **Reuse one `HttpClient`** — it owns a connection pool; creating one per request defeats HTTP/2 multiplexing and leaks connections.
- **Body handlers**: `ofString()`, `ofByteArray()`, `ofInputStream()` (streaming), `ofLines()`.
- **Retry with idempotent requests only** — retrying a `POST` can double-charge; see the idempotency-key pattern.
- On Java 21, `client.send` inside a **virtual thread** gives blocking simplicity with thread-per-request scalability.

## Raw TCP: a minimal echo server

```java
try (ServerSocket server = new ServerSocket(8080)) {
    while (true) {
        Socket conn = server.accept();
        Thread.startVirtualThread(() -> handle(conn)); // one virtual thread per client
    }
}

void handle(Socket conn) {
    try (var in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
         var out = conn.getWriter()) {
        out.println("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok");
    }
}
```

## The production checklist

1. **Separate connect vs read timeouts** — connect should fail fast (2–10s), reads can be longer (30–60s).
2. **Bound the thread pool** that owns blocking calls — or use virtual threads.
3. **Backoff + jitter on retries** — retry 2–3 times, exponential backoff with random jitter.
4. **Circuit break** downstream calls (see Resilience4j in the Spring Cloud module) so a dead dependency doesn't pile up threads.
5. **Never trust the wire** — validate responses, use TLS (`https:`), verify certs (default) unless you have a very good reason not to.

## Key takeaways

- `HttpClient` + `BodyHandlers` covers almost all HTTP needs — skip raw `URLConnection`.
- One shared client, explicit timeouts, virtual-thread-friendly blocking calls.
- Raw sockets only for custom protocols; UDP only where loss is acceptable.

Official docs: [java.net.http package](https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/java/net/http/package-summary.html) · [Socket tutorial](https://docs.oracle.com/javase/tutorial/networking/sockets/index.html)
