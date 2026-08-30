---
title: HTTP Interface Clients — REST Calls as Java Interfaces
module: spring-rest-clients
order: 4
minutes: 23
topics: ["@HttpExchange", "HTTP interface", "declarative client", "typed API", "proxy"]
docs:
  - title: "HTTP Interface (Spring docs)"
    url: "https://docs.spring.io/spring-framework/reference/integration/rest-clients.html#rest-http-interface"
summary: All the clients so far (RestClient, WebClient) make you write the request mechanics at every call site: URI, method, retrieve, convert. HTTP interf...
---

# HTTP Interface Clients — REST Calls as Java Interfaces

## The Concept: The API Client That Looks Like a Contract

All the clients so far (RestClient, WebClient) make you write the request mechanics at every call site: URI, method, retrieve, convert. **HTTP interfaces** (Spring 6.1) take the next step: you declare the remote API as a **plain Java interface**, annotate its methods, and Spring *generates the implementation* for you.

```java
// The whole remote API, declared:
public interface CourseApi {

    @GetExchange("/api/courses/{id}")
    Course getCourse(@PathVariable long id);

    @PostExchange("/api/courses")
    Course createCourse(@RequestBody CourseRequest request);

    @GetExchange("/api/courses")
    List<Course> listCourses();
}
```

This is the **declarative client** pattern (think Feign, but built into Spring): the interface *is* the API contract — readable, typed, testable. Spring's `HttpServiceProxyFactory` turns the interface into a working client backed by `RestClient` (or `WebClient`).

## The Annotations

| Annotation | HTTP verb |
|---|---|
| `@HttpExchange` | Base (method-level verb can be set) |
| `@GetExchange` | GET |
| `@PostExchange` | POST |
| `@PutExchange` | PUT |
| `@DeleteExchange` | DELETE |
| `@PatchExchange` | PATCH |

Parameter annotations mirror server-side MVC: `@PathVariable`, `@RequestBody`, `@RequestParam`, `@RequestHeader`.

## The Code Walkthrough

```java
// ---- 1. Declare the remote API ----
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.service.annotation.GetExchange;
import org.springframework.web.service.annotation.PostExchange;

public interface CourseApi {

    @GetExchange("/api/courses/{id}")
    Course getCourse(@PathVariable long id);

    @GetExchange("/api/courses")
    List<Course> listCourses(@RequestParam(value = "page", required = false) int page);

    @PostExchange("/api/courses")
    Course createCourse(@RequestBody CourseRequest request);
}

// ---- 2. Generate the implementation once (Spring Boot 3.4+ auto-detects) ----
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.support.RestClientAdapter;
import org.springframework.web.service.invoker.HttpServiceProxyFactory;

@Configuration
public class ApiClientConfig {

    @Bean
    public CourseApi courseApi(RestClient.Builder builder) {
        RestClient restClient = builder.baseUrl("https://catalog.example.com").build();

        HttpServiceProxyFactory factory = HttpServiceProxyFactory
                .builderFor(RestClientAdapter.create(restClient))
                .build();

        return factory.createClient(CourseApi.class);
    }
}

// ---- 3. Use it — no request mechanics anywhere ----
@Service
public class CatalogService {

    private final CourseApi api;              // injected, looks like a local service

    public CatalogService(CourseApi api) { this.api = api; }

    public Course showCourse(long id) {
        return api.getCourse(id);             // one call, fully typed
    }
}
```

### Walking Through Each Part

**Part 1 — the interface.** The annotations describe the HTTP call: `@GetExchange("/api/courses/{id}")` + `@PathVariable long id` means "GET that URI with the id substituted". `@RequestBody` on the create method means "serialize this to JSON in the body". The interface reads like the API documentation — because it *is* the contract.

**Part 2 — the proxy factory.** `HttpServiceProxyFactory` builds a proxy that implements the interface by translating each annotated method into a RestClient call. Configure the backing client (base URL, timeouts, interceptors — everything from the previous lesson still applies) once; the proxy uses it. (In Spring Boot 3.4+, interfaces with `@HttpExchange` methods are auto-detected and can be injected directly — the manual factory is for older versions or custom setups.)

**Part 3 — usage.** `api.getCourse(id)` — the caller sees a plain Java method. No URI strings, no `retrieve()`, no parsing. The mechanics live entirely in the generated proxy. Swapping the *implementation* (mock for tests, different base URL per env) means changing the bean — callers never notice.

## Why This Pattern Wins

1. **Readability** — the API client reads like a contract, not like HTTP plumbing.
2. **Testability** — mock the interface in unit tests (`Mockito.mock(CourseApi.class)`), no HTTP at all.
3. **Single source of truth** — the interface *is* the client; server and client can even share the interface (via a shared module) so they can't drift.
4. **Consistency** — the proxy applies the same RestClient config (timeouts, retries, headers) to every method automatically.
5. **Migration** — it sits on RestClient/WebClient, so all the resilience and observability tooling from earlier lessons composes.

## Real-World Shape — Many Methods, One Client

```java
public interface PaymentGatewayApi {

    @GetExchange("/v1/payments/{id}")
    Payment getPayment(@PathVariable String id);

    @PostExchange("/v1/payments")
    Payment initiate(@RequestBody PaymentRequest request);

    @PostExchange("/v1/payments/{id}/refund")
    Refund refund(@PathVariable String id, @RequestBody RefundRequest request);

    @GetExchange("/v1/payments")
    List<Payment> list(@RequestParam int page, @RequestParam int size);
}
```

One interface = one third-party integration's whole surface, discoverable and typed.

## When NOT to Use It

- **One-off calls** — a single health ping doesn't need an interface; use RestClient inline.
- **Highly dynamic requests** — URIs built from many parts, conditional headers, streaming uploads: the declarative style fights you. RestClient's fluent API handles ad-hoc flexibility better.
- **Non-JSON or binary protocols** — HTTP interfaces are built around JSON-ish exchange patterns.

## Common Beginner Pitfalls

1. **Not registering the factory** — the interface does nothing until a proxy is created; add the `@Bean` (or rely on Boot 3.4 auto-detection).
2. **Shared-interface drift** — sharing the interface between server and client means the `@GetMapping` on the server and `@GetExchange` on the client must both exist; keep them consistent.
3. **Response types that don't match** — the proxy converts via Jackson; mismatched field names/types fail at runtime (deserialize-time), so test with real payloads.
4. **Throwing away error mapping** — the `defaultStatusHandler` config from the RestClient still applies; keep it or errors surface as generic exceptions.
5. **Interfaces with methods the server doesn't have** — extra methods are just unused; missing ones fail when called. Keep the interface in sync with the API.

## Key Takeaways

- HTTP interfaces declare a remote API as a Java interface with `@HttpExchange`-family annotations.
- Spring generates the client via `HttpServiceProxyFactory` backed by RestClient/WebClient.
- Callers see plain typed methods — no HTTP mechanics at the call site.
- Test with a mock; configure timeouts/retries once on the backing client.
- Use for stable, JSON-based integrations; use RestClient for ad-hoc or dynamic calls.
