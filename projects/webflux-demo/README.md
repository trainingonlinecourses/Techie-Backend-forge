# WebFlux Demo — A Fully Reactive API

A runnable Spring WebFlux application demonstrating the Spring WebFlux module end to end:

- **Annotation controller** (`/api/customers`) — controller methods returning `Mono`/`Flux`
- **Functional endpoints** (`/api/fn/customers`) — `RouterFunction` + handler functions
- **Reactive data** — Spring Data R2DBC with `ReactiveCrudRepository` over in-memory H2
- **Streaming** — Server-Sent Events (`/api/quotes/stream`)
- **WebClient** — non-blocking aggregation (`/api/summary` calls this app's own API)

## Run it

```bash
cd projects/webflux-demo
mvn spring-boot:run        # port 9096 — no Kafka or DB server needed (H2 in-memory)
```

## Try it

```bash
# Reactive CRUD
curl -X POST localhost:9096/api/customers -H 'Content-Type: application/json' \
  -d '{"name":"Ada Lovelace","email":"ada@example.com"}'
curl localhost:9096/api/customers                      # Flux<Customer> → JSON array
curl -i localhost:9096/api/customers/1                 # Mono<Customer>; missing id → 404

# Functional endpoints — same CRUD via RouterFunction
curl -X POST localhost:9096/api/fn/customers -H 'Content-Type: application/json' \
  -d '{"name":"Grace Hopper","email":"grace@example.com"}'
curl localhost:9096/api/fn/customers

# WebClient aggregation (non-blocking call to its own API)
curl localhost:9096/api/summary                        # {"count":2,"customers":[...]}

# Server-Sent Events — an infinite reactive stream
curl -N localhost:9096/api/quotes/stream               # data:{"text":"quote-0"} ...
```

## Tests

```bash
mvn test
```

Six tests against the running Netty server: CRUD via `WebTestClient`, 404 handling,
functional routes, `WebClient` aggregation, SSE streaming, and `StepVerifier`
backpressure on the quote stream.

## Project layout

| Package | Responsibility |
|---|---|
| `customer` | R2DBC entity + `ReactiveCrudRepository`, annotation controller, functional handler/router |
| `quote` | Infinite `Flux` stream + SSE controller |
| `summary` | `WebClient`-based aggregation endpoint (self-call via `WebClient.Builder`) |

Official docs: [Spring WebFlux](https://docs.spring.io/spring-framework/reference/web/webflux.html),
[Project Reactor](https://projectreactor.io/docs/core/release/reference/),
[Spring Data R2DBC](https://docs.spring.io/spring-data/r2dbc/reference/).
