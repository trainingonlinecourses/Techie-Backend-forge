---
title: Spring WebFlux — Controllers & Functional Endpoints
summary: Annotation-based controllers returning Mono/Flux, RouterFunction endpoints, Netty, and streaming responses.
order: 3
minutes: 20
topics: [webflux, controller, routerfunction, netty, sse, functional-endpoints]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webflux-controller.html
  - https://docs.spring.io/spring-framework/reference/web/webflux-functional.html
---

# Spring WebFlux — Controllers & Functional Endpoints

## The stack

WebFlux runs on **Netty** (or servlet 3.1+ containers in servlet mode) with a **reactive web layer**: request → routing → handler → `Mono`/`Flux` response, all non-blocking. You write endpoints in one of two styles — both are first-class.

## Style 1 — Annotation controllers (familiar, most common)

```java
@RestController
@RequestMapping("/api/customers")
public class CustomerController {

    private final CustomerRepository repo;

    public CustomerController(CustomerRepository repo) { this.repo = repo; }

    @GetMapping
    public Flux<Customer> all() {
        return repo.findAll();                    // stream of all customers
    }

    @GetMapping("/{id}")
    public Mono<Customer> byId(@PathVariable Long id) {
        return repo.findById(id)
                .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND)));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<Customer> create(@RequestBody Customer customer) {
        return repo.save(customer);
    }
}
```

Controller methods return `Mono<T>` (one thing) or `Flux<T>` (many things); Spring adapts them to the HTTP response automatically. One crucial difference from servlet: **`@RequestBody` is read reactively** — the request body becomes the argument without ever blocking a thread.

## Style 2 — Functional endpoints (RouterFunction)

```java
@Configuration
public class CustomerRouter {

    @Bean
    public RouterFunction<ServerResponse> routes(CustomerHandler handler) {
        return RouterFunctions.route()
                .GET("/api/fn/customers", handler::all)
                .GET("/api/fn/customers/{id}", handler::byId)
                .POST("/api/fn/customers", handler::create)
                .build();
    }
}
```

```java
@Component
public class CustomerHandler {

    private final CustomerRepository repo;

    public Mono<ServerResponse> all(ServerRequest req) {
        return ServerResponse.ok().body(repo.findAll(), Customer.class);
    }

    public Mono<ServerResponse> byId(ServerRequest req) {
        return repo.findById(Long.valueOf(req.pathVariable("id")))
                .flatMap(c -> ServerResponse.ok().bodyValue(c))
                .switchIfEmpty(ServerResponse.notFound().build());
    }
}
```

Functional style shines for: small gateways, route tables that are config-like, and programmatic composition (add auth/validation per route). Most applications are fine with annotation controllers; use functional where the routing *is* the feature.

## Streaming responses — SSE

WebFlux streams a `Flux` to the client with **Server-Sent Events** — the browser- and HTTP-friendly push protocol:

```java
@GetMapping(value = "/api/quotes/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<Quote> quotes() {
    return Flux.interval(Duration.ofMillis(200)).map(i -> new Quote("quote-" + i));
}
```

The response stays open and pushes events as the `Flux` produces them — no polling, no WebSocket handshake. Use SSE for feeds, notifications, and live dashboards; use WebSocket when the client must also push back.

## Error handling & ProblemDetail

WebFlux supports RFC 7807 problem details like servlet does:

```java
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(CustomerNotFound.class)
    public ProblemDetail handle(CustomerNotFound ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
        pd.setTitle("Customer not found");
        return pd;
    }
}
```

`Mono.error(...)` / thrown exceptions in reactive chains are routed to `@RestControllerAdvice` the same way as servlet.

> **Why it matters (organizational view)** — Pick ONE endpoint style per service and stay consistent — mixing annotation and functional routes across a codebase doubles the review/onboarding surface. Standardize the error contract (ProblemDetail) and the streaming approach (SSE via `text/event-stream`) so clients treat all services the same. Also: enable the Reactor **context propagation** with your tracer (Micrometer Tracing) — without it, trace ids don't flow across threads in reactive chains, and debugging reactive incidents becomes guesswork.

## Key takeaways

- WebFlux = Netty + reactive web layer; controller methods return `Mono`/`Flux`.
- Two styles: annotation controllers (default) and `RouterFunction` functional endpoints.
- Stream `Flux` to clients with SSE (`text/event-stream`).
- Errors: `@RestControllerAdvice` + ProblemDetail; `Mono.error` routes there like exceptions.
- Propagate trace context across reactive threads — non-negotiable for debugging.

## Official docs

- [WebFlux — Annotated Controllers](https://docs.spring.io/spring-framework/reference/web/webflux-controller.html)
- [WebFlux — Functional Endpoints](https://docs.spring.io/spring-framework/reference/web/webflux-functional.html)
- [WebFlux — HTTP Streaming](https://docs.spring.io/spring-framework/reference/web/webflux.html#webflux-codecs-streaming)
