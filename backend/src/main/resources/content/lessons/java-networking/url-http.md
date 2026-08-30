---
title: URL and HttpURLConnection — Talking to Web Servers
module: java-networking
order: 2
minutes: 24
topics: ["URL", "HttpURLConnection", "HTTP client", "requests", "responses"]
docs:
  - title: "URL (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/URL.html"
  - title: "HttpURLConnection (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/HttpURLConnection.html"
summary: The previous lesson built a raw socket conversation. HTTP — the protocol of the web — is nothing more than a specific dialect spoken over that same...
---

# URL and HttpURLConnection — Talking to Web Servers

## The Concept: HTTP Is Just a Protocol on a Socket

The previous lesson built a raw socket conversation. HTTP — the protocol of the web — is nothing more than a *specific dialect* spoken over that same socket. The client sends a structured text request ("GET /page HTTP/1.1", headers, optional body); the server replies with a structured response ("HTTP/1.1 200 OK", headers, body). Java's `java.net` package wraps this protocol in easy objects: `URL` describes a web address, and `HttpURLConnection` performs the request.

**The mental model:** `URL` is the *address* — it parses "https://user:pass@host:port/path?query#fragment" into its parts. `HttpURLConnection` is the *phone call* — it connects to the server, speaks the HTTP dialect, and hands you the response. It's the old-school, low-level way to do HTTP in Java; modern code prefers `HttpClient` (next lesson), but `HttpURLConnection` is still everywhere in legacy code and teaches the mechanics best.

## Anatomy of a URL

```java
import java.net.*;

public class UrlDemo {
    public static void main(String[] args) throws Exception {
        URL url = new URL("https://api.example.com:8443/users?page=2&size=10#top");

        System.out.println("Protocol : " + url.getProtocol());    // https
        System.out.println("Host     : " + url.getHost());        // api.example.com
        System.out.println("Port     : " + url.getPort());        // 8443
        System.out.println("Path     : " + url.getPath());        // /users
        System.out.println("Query    : " + url.getQuery());       // page=2&size=10
        System.out.println("Fragment : " + url.getRef());         // top

        // A default port (80 for http, 443 for https) reports -1:
        URL plain = new URL("https://example.com/");
        System.out.println("Default port: " + plain.getPort());   // -1

        // openConnection() hands you a connection OBJECT (not yet connected).
        // It's a URLConnection; for http/https you cast to HttpURLConnection.
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        System.out.println("Connection class: " + conn.getClass().getName());
    }
}
```

**Walking through it:** `URL`'s constructor parses the string into components — this is your tool for understanding, building, and validating web addresses. Note `getPort()` returns `-1` when the URL omits the port, meaning "use the protocol default." `openConnection()` doesn't connect yet — it returns a lazily-initialized connection object you configure before actually sending.

## Making a GET Request, End to End

```java
import java.io.*;
import java.net.*;

public class GetDemo {
    public static void main(String[] args) throws IOException {
        URL url = new URL("https://api.example.com/users?page=1");

        // 1. Open the connection and configure it.
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");                 // which verb
        conn.setConnectTimeout(5000);                 // 5s to establish TCP
        conn.setReadTimeout(5000);                    // 5s to receive data
        conn.setRequestProperty("Accept", "application/json"); // headers

        // 2. Send the request and read the status.
        int status = conn.getResponseCode();          // e.g., 200, 404
        System.out.println("Status: " + status + " " + conn.getResponseMessage());

        // 3. Read the response body.
        //    Streams: error bodies come from getErrorStream(), success
        //    bodies from getInputStream(). A common gotcha.
        InputStream body = status >= 400
                ? conn.getErrorStream() : conn.getInputStream();

        try (BufferedReader reader = new BufferedReader(
                     new InputStreamReader(body))) {
            String line;
            StringBuilder sb = new StringBuilder();
            while ((line = reader.readLine()) != null) sb.append(line);
            System.out.println("Body: " + sb);
        }

        // 4. Disconnect (releases the connection back to the pool).
        conn.disconnect();
    }
}
```

**Walking through it, piece by piece:**

- `setRequestMethod("GET")` selects the HTTP verb. Other verbs: `POST`, `PUT`, `DELETE`, `PATCH`. (For `POST`/`PUT` with a body you'd also call `setDoOutput(true)` and write to `getOutputStream()`.)

- The **timeouts** are the difference between a robust client and a hanging one: `setConnectTimeout` bounds the TCP handshake; `setReadTimeout` bounds the wait for response bytes. Without them, a dead server hangs your thread indefinitely.

- `getResponseCode()` *sends* the request and returns the status. Status codes are the server's verdict: 2xx success, 3xx redirect, 4xx client error (404 not found, 401 unauthorized), 5xx server error. Your code should branch on them.

- The **error-stream gotcha**: a 404 or 500 response still has a body (the error page), but you must read it from `getErrorStream()`, not `getInputStream()` — the latter throws `FileNotFoundException` (or similar) for error statuses. The `status >= 400 ? getErrorStream() : getInputStream()` pattern handles both.

- `disconnect()` returns the underlying socket to the connection pool (Java keeps a small pool of reused connections — that's why you see "keep-alive" behavior).

## POSTing JSON Data

```java
import java.io.*;
import java.net.*;

public class PostDemo {
    public static void main(String[] args) throws IOException {
        URL url = new URL("https://api.example.com/users");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();

        // For POST we must enable output and set the method.
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Accept", "application/json");

        String json = "{\"name\":\"Ada\",\"role\":\"admin\"}";

        // Write the request body. getOutputStream() is what actually
        // initiates the request when you write/flush.
        try (OutputStream os = conn.getOutputStream()) {
            os.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }

        int status = conn.getResponseCode();
        System.out.println("Status: " + status);

        // Read the response — same error/success split as GET.
        InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
        if (in != null) {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(in))) {
                r.lines().forEach(System.out::println);
            }
        }
        conn.disconnect();
    }
}
```

**Walking through it:** `setDoOutput(true)` tells the connection you'll write a body (it switches the method semantics for POST/PUT). The `Content-Type: application/json` header declares the body's format — servers use it to parse. Writing to `getOutputStream()` and closing it sends the request. This is exactly what every HTTP client library does internally — including the modern `HttpClient`, just with cleaner syntax.

## The Headers You Should Always Set

- `Accept` — what formats you can receive (`application/json`, `text/html`).
- `Content-Type` — the format of a request body you send.
- `Authorization` — credentials: `Bearer <token>` for JWT/OAuth, `Basic base64(user:pass)` for basic auth.
- `User-Agent` — identifies your client; some APIs reject missing or default agents.
- `Cache-Control` — participates in HTTP caching behavior.

## Recap

`URL` parses web addresses into components; `HttpURLConnection` performs HTTP requests over the underlying sockets. The flow is always the same: open → configure (method, timeouts, headers) → send → check status → read the success or error stream → disconnect. The two gotchas that trip everyone are the **error-stream split** (error bodies come from `getErrorStream()`) and **missing timeouts** (hanging threads). Modern production code prefers `java.net.http.HttpClient` for its cleaner API, HTTP/2 support, and async modes — which is the next lesson — but the mechanics you just learned are exactly what that client automates.
