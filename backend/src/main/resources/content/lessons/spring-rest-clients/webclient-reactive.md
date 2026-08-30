---
title: WebClient — Reactive HTTP Calls
module: spring-rest-clients
order: 3
minutes: 25
topics: ["WebClient", "reactive", "Mono", "Flux", "non-blocking", "WebFlux"]
docs:
  - title: "WebClient (Spring docs)"
    url: "https://docs.spring.io/spring-framework/reference/web/webflux-webclient.html"
summary: A blocking HTTP call (RestClient) occupies a thread for the whole round trip: the thread sits idle waiting for the server. With thousands of concur...
---

# WebClient — Reactive HTTP Calls

## The Concept: Don't Block the Thread, Describe the Future

A blocking HTTP call (RestClient) occupies a thread for the whole round trip: the thread sits idle waiting for the server. With thousands of concurrent calls, you need thousands of threads. **Reactive** clients flip the model: instead of *blocking and waiting*, you **describe what you want** and get a *future-like* object (`Mono` = 0 or 1 result, `Flux` = 0..n results). The actual work happens on shared, non-blocking event-loop threads, and your continuation runs **when the response arrives** — no thread is ever idle-waiting.

```java
// Blocking (RestClient): thread waits
Course course = restClient.get().uri("/api/courses/1").retrieve().body(Course.class);

// Reactive (WebClient): returns immediately with a Mono
Mono<Course> future = webClient.get().uri("/api/courses/1").retrieve().bodyToMono(Course.class);
```

The first call *hangs* the calling thread until data arrives. The second returns in microseconds — the `Mono` is a *promise* that will emit the `Course` (or an error) when the server answers. You attach `.map(...)`, `.flatMap(...)`, `.subscribe(...)` to process the result when it comes.

`WebClient` is the HTTP client of the **reactive stack** (WebFlux) — the same client that serves your reactive controllers.

## Mono and Flux — The Two Shapes

| Type | Emits | Use for |
|---|---|---|
| `Mono<T>` | 0 or 1 value | A single resource (one course, one user) |
| `Flux<T>` | 0..n values | A stream (list of courses, events) |

Both are *lazy*: nothing happens until you **subscribe** (directly or via `block()`, or by returning them from a reactive controller, which subscribes for you).

## The Code Walkthrough

```java
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.Duration;

@Service
public class ReactiveCourseClient {

    private final WebClient webClient;

    public ReactiveCourseClient(WebClient.Builder builder) {
        this.webClient = builder
                .baseUrl("https://catalog.example.com")
                .defaultHeader("Accept", "application/json")
                .build();
    }

    // ---- 1. Mono: single result ----
    public Mono<Course> getCourse(long id) {
        return webClient.get()
                .uri("/api/courses/{id}", id)
                .retrieve()
                .bodyToMono(Course.class);
    }

    // ---- 2. Flux: a stream of results ----
    public Flux<Course> listCourses() {
        return webClient.get()
                .uri("/api/courses")
                .retrieve()
                .bodyToFlux(Course.class);
    }

    // ---- 3. Chaining: process the result without blocking ----
    public Mono<String> getCourseTitle(long id) {
        return getCourse(id)
                .map(Course::title)                 // transform when it arrives
                .timeout(Duration.ofSeconds(5))     // fail fast if the server is slow
                .onErrorReturn("unknown");          // fallback on any error
    }

    // ---- 4. Composing two calls (parallel, then combine) ----
    public Mono<CourseDetail> courseWithAuthor(long id, long authorId) {
        Mono<Course> course = getCourse(id);
        Mono<Author> author = getAuthor(authorId);      // runs concurrently
        return Mono.zip(course, author)                 // wait for both
                .map(tuple -> new CourseDetail(tuple.getT1(), tuple.getT2()));
    }
}
```

### Walking Through Each Part

**Part 1 — `bodyToMono`.** The call returns immediately with a `Mono<Course>`. The server call hasn't happened yet — it starts when something subscribes. The *shape* matches the expected response: one object → `Mono`.

**Part 2 — `bodyToFlux`.** A list of courses streams as a `Flux<Course>`. Elements can be processed *as they arrive* rather than after the whole body downloads — this is what makes reactive clients memory-efficient for large payloads.

**Part 3 — the pipeline.** `map` transforms the value when it arrives (no blocking). `timeout` fails the `Mono` after 5s instead of hanging. `onErrorReturn` substitutes a fallback for any error. This *describes* the whole flow — retry, timeout, fallback — as a declarative chain, something blocking code implements with try/catch spaghetti.

**Part 4 — composing parallel calls.** `Mono.zip(course, author)` runs both requests *concurrently* (no thread waits for the other) and combines them when both arrive. In blocking style, you'd fire two threads and join them — here it's declarative. This is the scalability story: thousands of concurrent external calls on a handful of threads.

## Blocking vs Reactive — Choosing Honestly

| | RestClient (blocking) | WebClient (reactive) |
|---|---|---|
| Mental model | Simple: call → result | `Mono`/`Flux` + subscription semantics |
| Concurrency | Thread per in-flight call | Event loop + callbacks |
| Errors | try/catch | `onError*` operators |
| Debugging | Straightforward stack traces | Operator chains, harder to trace |
| Right stack | Spring MVC (servlet) | Spring WebFlux (reactive) |

**The honest guidance:** if your app is Spring MVC, use `RestClient` — it's simpler and perfectly fine; Tomcat's thread pool handles reasonable concurrency. Reach for `WebClient` when you're on WebFlux (you *must* — blocking an event-loop thread is forbidden), or when you need true backpressure / streaming / very high concurrency. Do **not** add a reactive client to a blocking app "for performance" — you inherit the complexity without the architecture.

## The Blocking Escape Hatch

If you're on WebFlux but need a blocking result in one place (e.g., a `@Scheduled` task), `block()` exists:

```java
Course course = webClient.get().uri("/api/courses/1").retrieve()
        .bodyToMono(Course.class)
        .block(Duration.ofSeconds(5));   // wait (bounded) for the result
```

Never call `block()` inside a reactive pipeline (it blocks an event-loop thread — the exact anti-pattern). Use it only at *imperative boundaries* (scheduled jobs, `@PostConstruct`, plain tests).

## Common Beginner Pitfalls

1. **`block()` inside a reactive chain** — blocks an event-loop thread; the app stalls. Keep pipelines reactive end-to-end.
2. **Forgetting nothing happens until subscribe** — if you build a `Mono` and don't return/subscribe it, the call never fires.
3. **Using WebClient in a servlet app "for speed"** — complexity without benefit; use RestClient.
4. **No `timeout`** — a hung server leaves the `Mono` pending forever; every external call needs a timeout operator.
5. **Treating `Mono` like a value** — you can't `if (mono == ...)`; you transform it with operators and subscribe at the end.
6. **Reusing a subscribed Mono** — a `Mono` is single-subscription; rebuild or cache per call.

## Key Takeaways

- `WebClient` is the reactive HTTP client: non-blocking, `Mono`/`Flux`-based.
- The call returns a *promise*; processing happens via operators (`map`, `flatMap`, `timeout`, `onErrorReturn`).
- `Mono` = 0..1 result; `Flux` = 0..n results; both lazy until subscribed.
- Compose concurrent calls with `zip`/`flatMap` without dedicating threads.
- In WebFlux apps, WebClient is mandatory; in MVC apps, prefer RestClient.
- Always bound timeouts; never `block()` inside a reactive pipeline.
