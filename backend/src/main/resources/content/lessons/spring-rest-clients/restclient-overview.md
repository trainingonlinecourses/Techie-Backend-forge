---
title: RestClient — The Modern Way to Call REST APIs
module: spring-rest-clients
order: 1
minutes: 24
topics: ["RestClient", "HTTP client", "JSON", "RestTemplate", "API consumption"]
docs:
  - title: "RestClient (Spring docs)"
    url: "https://docs.spring.io/spring-framework/reference/integration/rest-clients.html#rest-restclient"
---

# RestClient — The Modern Way to Call REST APIs

## The Concept: Your App as a Client

So far your Spring app has been the *server* (accepting requests). But backend services constantly call **other** services: the frontend calls your API, your API calls an external provider, microservices call each other. For that direction — **outbound HTTP** — you need an HTTP client.

Spring's history here:

- **`RestTemplate`** (Spring 3) — the original, synchronous client. Powerful but clunky and aging.
- **`WebClient`** (Spring 5) — the reactive client. Excellent for reactive apps; awkward when you just want a simple blocking call.
- **`RestClient`** (Spring 6.1, Boot 3.2) — the modern answer: the clean fluent API of `WebClient` with the *synchronous* model of `RestTemplate`. It's now **the recommended default** for calling REST APIs in Spring MVC apps.

`RestClient` lets you write: "GET this URL, turn the JSON into this type" in a fluent chain:

```java
String result = restClient.get()
        .uri("/api/courses/{id}", 42)
        .retrieve()
        .body(String.class);
```

## The Core Operations

| HTTP verb | RestClient call |
|---|---|
| GET | `.get().uri(...).retrieve().body(Type.class)` |
| POST | `.post().uri(...).body(payload).retrieve().body(Type.class)` |
| PUT | `.put().uri(...).body(payload).retrieve().toBodilessEntity()` |
| DELETE | `.delete().uri(...).retrieve().toBodilessEntity()` |
| PATCH | `.patch().uri(...).body(payload).retrieve().body(Type.class)` |

Every call follows the same shape: **method → URI → (optional body) → retrieve → convert**.

## The Code Walkthrough

```java
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class CourseCatalogClient {

    private final RestClient restClient;

    public CourseCatalogClient(RestClient.Builder builder) {
        // Configure once, reuse everywhere
        this.restClient = builder
                .baseUrl("https://catalog.example.com")
                .defaultHeader("Accept", MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    // ---- GET: fetch and convert to a typed object ----
    public Course getCourse(long id) {
        return restClient.get()
                .uri("/api/courses/{id}", id)
                .retrieve()
                .body(Course.class);
    }

    // ---- GET: fetch a list ----
    public List<Course> listCourses() {
        return restClient.get()
                .uri("/api/courses")
                .retrieve()
                .body(new ParameterizedTypeReference<List<Course>>() {});
    }

    // ---- POST: send JSON, get the created object ----
    public Course createCourse(CourseRequest request) {
        return restClient.post()
                .uri("/api/courses")
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)                    // Jackson serializes to JSON
                .retrieve()
                .body(Course.class);              // Jackson deserializes response
    }

    // ---- Error handling: 404 → null or a custom exception ----
    public Course findOrNull(long id) {
        try {
            return restClient.get()
                    .uri("/api/courses/{id}", id)
                    .retrieve()
                    .body(Course.class);
        } catch (HttpClientErrorException.NotFound e) {
            return null;
        }
    }
}
```

### Walking Through Each Part

**The builder** — `RestClient.Builder` (inject it; Boot configures it with your `ObjectMapper` and default settings). Configure shared things once: `baseUrl` (relative URIs in calls), default headers. The client is a thread-safe singleton — build once, share.

**The GET** — `.uri("/api/courses/{id}", id)` — the `{id}` placeholder is filled by the varargs. `.retrieve()` performs the exchange; `.body(Course.class)` tells Jackson to map the JSON to your type. Clean and declarative.

**The list GET** — generics need `ParameterizedTypeReference` (a trick to preserve `List<Course>` at runtime, since Java erases generics — without it, Jackson can't know the element type).

**The POST** — `.body(request)` serializes your object to JSON (Jackson), `contentType` sets the header; the response is deserialized back. One round trip, typed both ways.

**The 404** — `RestClient` throws `HttpClientErrorException.NotFound` on 4xx by default; catch it (or use `onStatus` for custom mapping, next lesson). This is the sync-model simplicity: exceptions, not callbacks.

## RestClient vs WebClient vs RestTemplate

| | RestClient | WebClient | RestTemplate |
|---|---|---|---|
| Model | Synchronous (blocking) | Reactive (non-blocking) | Synchronous |
| When to use | **Default** for MVC apps | Reactive/WebFlux apps, high concurrency | Legacy code only |
| API style | Fluent | Fluent | Verbose |
| Status | Current recommendation | For reactive stacks | Deprecated in spirit |

Rule: **new code in a Spring MVC app → `RestClient`.** If your stack is WebFlux/reactive → `WebClient`. Never start new code with `RestTemplate`.

## Common Beginner Pitfalls

1. **Building a new `RestClient` per call** — build once (singleton); it's thread-safe and holds connection pooling.
2. **Forgetting `ParameterizedTypeReference` for lists/maps** — `.body(List.class)` gives an untyped list that fails at runtime when cast.
3. **Not handling non-2xx** — default behavior throws on 4xx/5xx; catch specifically or map with `onStatus`.
4. **Hardcoding URLs** — use `baseUrl` + relative URIs so environments can differ via config.
5. **Blocking in a reactive stack** — if you're on WebFlux, `RestClient` blocks an event-loop thread; use `WebClient`.
6. **Ignoring timeouts** — without `connectTimeout`/`readTimeout`, a dead server hangs your call (configurable via the builder, next lesson).

## Key Takeaways

- `RestClient` is Spring's modern synchronous HTTP client — fluent like `WebClient`, blocking like `RestTemplate`.
- Build once via `RestClient.Builder` (baseUrl, headers), inject, reuse.
- Every call: method → URI → body → `retrieve()` → typed `.body(...)`.
- Use `ParameterizedTypeReference` for generic response types.
- 4xx/5xx throw by default — catch or map with `onStatus`.
- Choose `RestClient` for MVC apps, `WebClient` for reactive ones, never `RestTemplate` for new code.
