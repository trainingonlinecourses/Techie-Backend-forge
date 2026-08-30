---
title: RestClient Configuration — Timeouts, Errors, and Interceptors
module: spring-rest-clients
order: 2
minutes: 25
topics: ["timeouts", "onStatus", "interceptors", "error handlers", "ClientHttpRequestInterceptor"]
summary: A bare RestClient call works great when the server responds quickly with 200. Production is when the server is slow, down, or returns errors — and ...
docs:
  - title: "RestClient customization"
    url: "https://docs.spring.io/spring-framework/reference/integration/rest-clients.html#rest-restclient-customization"
---

# RestClient Configuration — Timeouts, Errors, and Interceptors

## The Concept: A Client Is Only as Good as Its Failure Behavior

A bare `RestClient` call works great when the server responds quickly with 200. Production is when the server is *slow*, *down*, or returns *errors* — and that's exactly when configuration decides whether your app survives:

- **Timeouts** — without them, a hung server blocks your thread forever.
- **Error mapping** — turning HTTP status codes into meaningful domain exceptions.
- **Interceptors** — cross-cutting behavior for every request: logging, auth headers, correlation IDs, retries.

## The Code Walkthrough

```java
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.time.Duration;

@Configuration
public class RestClientConfig {

    @Bean
    public RestClient catalogClient(RestClient.Builder builder) {
        return builder
                .baseUrl("https://catalog.example.com")

                // ---- 1. Timeouts on the underlying HTTP client ----
                .requestFactory(ClientHttpRequestFactorySettings.defaults()
                        .withConnectTimeout(Duration.ofSeconds(3))
                        .withReadTimeout(Duration.ofSeconds(10)))

                // ---- 2. Log every request/response (debug) ----
                .requestInterceptor(loggingInterceptor())

                // ---- 3. Map HTTP errors to domain exceptions ----
                .defaultStatusHandler(HttpStatusCode::is4xxClientError, (req, res) -> {
                    throw new CatalogNotFoundException(
                            "Catalog returned " + res.getStatusCode() + " for " + req.getURI());
                })
                .build();
    }

    // An interceptor that logs each outgoing request
    private ClientHttpRequestInterceptor loggingInterceptor() {
        return (request, body, execution) -> {
            System.out.println("→ " + request.getMethod() + " " + request.getURI());
            long start = System.nanoTime();
            var response = execution.execute(request, body);      // perform the call
            System.out.println("← " + response.getStatusCode() + " in "
                    + (System.nanoTime() - start) / 1_000_000 + "ms");
            return response;
        };
    }
}
```

### Walking Through Each Part

**Part 1 — timeouts.** `ClientHttpRequestFactorySettings` configures the underlying HTTP client (the JDK client, Apache, or Jetty — Boot's default is the JDK `HttpClient`). `withConnectTimeout` bounds how long establishing the connection may take; `withReadTimeout` bounds how long a response may take once connected. **Without these, a dead server hangs your request indefinitely.** Choose values per service: a fast internal API → 2–5s; a slow third party → 10–30s.

**Part 2 — the interceptor.** A `ClientHttpRequestInterceptor` wraps every request: it sees the request, can modify it (add headers), then calls `execution.execute` to proceed down the chain, and sees the response on the way back. The "filter" concept for HTTP clients. Uses: logging (shown), auth-token injection, correlation-ID propagation, retry logic.

**Part 3 — default status handler.** `defaultStatusHandler` replaces the default throw-on-4xx/5xx with your own mapping: 4xx becomes `CatalogNotFoundException` (a domain exception) instead of a generic `HttpClientErrorException`. You can add multiple handlers — one per status class or specific codes — letting callers catch *meaningful* exceptions.

## The Failure Matrix — What to Do per Scenario

| Server behavior | Without config | With config |
|---|---|---|
| Slow (3s latency) | Thread blocked indefinitely | `readTimeout` bounds it → exception → fallback |
| Down (no connection) | `ConnectException` after OS timeout (long) | `connectTimeout=3s` fails fast |
| 404 on a `findById` | Generic exception | Specific `NotFound` exception or null |
| 500/503 | Generic exception | Map to `UnavailableException` + retry |
| Needs auth header | Must set per call | Interceptor injects it everywhere |

## Retries and Resilience

Retry logic (covered in depth in the resilience module) composes with RestClient in two ways:

1. **Spring Retry** (`@Retryable` around the service method) — simple, annotation-driven.
2. **Resilience4j `Retry`** around the client — circuit breakers, bulkheads, rate limits.

A minimal interceptor-based retry:

```java
ClientHttpRequestInterceptor retryInterceptor() {
    return (request, body, execution) -> {
        for (int attempt = 1; ; attempt++) {
            try {
                return execution.execute(request, body);
            } catch (RestClientResponseException e) {
                if (attempt >= 3 || e.getStatusCode().value() >= 500 == false) throw e;
                // retry only on 5xx, up to 3 attempts
            }
        }
    };
}
```

**Important:** retry only **idempotent** requests (GET, PUT, DELETE — safe to repeat). Never blindly retry a POST that creates a resource without idempotency keys (see the idempotency lesson in REST best practices).

## Headers You Should Always Consider

```java
// Set once on the client:
.defaultHeader("Accept", "application/json")
.defaultHeader("User-Agent", "academy-backend/1.0")
.defaultHeader("X-Correlation-Id", () -> java.util.UUID.randomUUID().toString())
```

The `X-Correlation-Id` (or `traceparent`) header is how you **correlate logs across services**: your app generates an ID per inbound request and passes it to outbound calls, so logs from service A and service B can be stitched together. Propagate it via an interceptor (Part 2) so every outbound call carries it automatically.

## Common Beginner Pitfalls

1. **No timeouts** — the #1 production incident for HTTP clients. Always set connect + read timeouts.
2. **Retrying POSTs** — duplicate resource creation. Retry only idempotent calls or use idempotency keys.
3. **Generic exceptions escaping** — catch `RestClientResponseException` subclasses and map to domain exceptions with `defaultStatusHandler`.
4. **Interceptors that forget to `execution.execute`** — returning without calling execute swallows the request entirely (or hangs).
5. **Logging bodies with secrets** — the logging interceptor above logs URIs; if you log bodies, redact tokens/passwords first.
6. **One timeout for all services** — a 30s timeout for a 50ms internal API delays failure detection; tune per client.

## Key Takeaways

- Timeouts (`connectTimeout`/`readTimeout`) are mandatory — a hung call blocks a thread forever.
- `defaultStatusHandler` maps HTTP errors to domain exceptions at the client boundary.
- Interceptors add cross-cutting behavior: logging, auth, correlation IDs, retries.
- Retry idempotent requests only (GET/PUT/DELETE), never bare POSTs.
- Propagate correlation IDs so multi-service failures are traceable.
- Configure per-client, not one-size-fits-all.
