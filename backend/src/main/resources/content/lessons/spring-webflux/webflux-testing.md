---
title: Testing Reactive Code — StepVerifier & WebTestClient
summary: Verifying Mono/Flux with StepVerifier, virtual time, and testing WebFlux endpoints with WebTestClient.
order: 6
minutes: 16
topics: [stepverifier, webtestclient, testing, reactor-test, webflux]
docs:
  - https://projectreactor.io/docs/test/release/reference/
  - https://docs.spring.io/spring-framework/reference/testing/webtestclient.html
---

# Testing Reactive Code — StepVerifier & WebTestClient

## Why reactive testing is different

You can't assert on a `Mono`'s value before it arrives, and `block()`-ing your way through a test is the antipattern the whole stack avoids. Reactor ships **`StepVerifier`** for streams and Spring ships **`WebTestClient`** for endpoints — both non-blocking.

## StepVerifier — assert on the stream

```java
@Test
void flux_emits_in_order() {
    StepVerifier.create(Flux.just("a", "b", "c"))
            .expectNext("a", "b", "c")
            .expectComplete()
            .verify();
}

@Test
void error_chain() {
    StepVerifier.create(service.load("missing"))
            .expectError(CustomerNotFound.class)
            .verify();
}
```

Useful signals:

- `expectNext(...)` / `expectNextCount(n)` — assert values
- `expectComplete()` / `expectError(Class)` — terminal signal
- `thenConsumeWhile(predicate)` — consume and check a batch
- `verify()` (blocking, in the test thread — fine) or `verify(Duration)` (fail if it exceeds)

## Virtual time — test infinite streams instantly

`Flux.interval(1s)` in a real test would make you wait forever. `StepVerifier.withVirtualTime` jumps the clock:

```java
@Test
void backpressure_ticks() {
    StepVerifier.withVirtualTime(() -> Flux.interval(Duration.ofSeconds(1)).take(3))
            .expectSubscription()
            .thenAwait(Duration.ofSeconds(3))   // fast-forward
            .expectNextCount(3)
            .expectComplete()
            .verify();
}
```

## WebTestClient — test endpoints like a client

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient
class CustomerApiTest {

    @Autowired WebTestClient client;

    @Test
    void create_and_fetch_customer() {
        client.post().uri("/api/customers")
                .bodyValue(new Customer("Ada", "ada@example.com"))
                .exchange()
                .expectStatus().isCreated();

        client.get().uri("/api/customers")
                .exchange()
                .expectStatus().isOk()
                .expectBodyList(Customer.class)
                .hasSize(1);
    }

    @Test
    void missing_customer_is_404() {
        client.get().uri("/api/customers/999")
                .exchange()
                .expectStatus().isNotFound()
                .expectBody().jsonPath("$.title").isEqualTo("Customer not found");
    }
}
```

`WebTestClient` binds to the running server (RANDOM_PORT) or in-process; it asserts on status, headers, JSON paths, and bodies — and it's fully reactive under the hood.

## Streaming responses

```java
@Test
void sse_stream_emits() {
    Flux<Quote> quotes = client.get().uri("/api/quotes/stream")
            .accept(MediaType.TEXT_EVENT_STREAM)
            .exchange()
            .expectStatus().isOk()
            .returnResult(Quote.class)
            .getResponseBody();

    StepVerifier.create(quotes.take(3))
            .expectNextCount(3)
            .verifyComplete();
}
```

## Test slices

- `@WebFluxTest(controllers = CustomerController.class)` — controller slice with mocked collaborators (use `@MockBean` for the repository); fast, no server.
- `@DataR2dbcTest` — repository slice against an R2DBC DB.
- Full `@SpringBootTest(RANDOM_PORT)` — the real deal: Netty + R2DBC + WebClient, what the demo project uses.

> **Why it matters (organizational view)** — Standardize the test recipe so the org gets fast, non-flaky suites: `StepVerifier` for any logic on streams, `WebTestClient` for endpoints, `@WebFluxTest` slices for controller logic, and full-context tests for the critical paths. Two review rules: **no `block()` inside server code** (tests only) and **no `Thread.sleep` to "wait for the stream"** — that's what `thenAwait`/virtual time is for. A reactive test that needs sleeps is a design smell.

## Key takeaways

- `StepVerifier` asserts on `Mono`/`Flux` values, errors, and completion without blocking.
- `withVirtualTime` + `thenAwait` tests time-based streams instantly.
- `WebTestClient` tests endpoints like a real client: status, JSON paths, bodies, SSE.
- Use slices (`@WebFluxTest`) for speed, full context for critical paths.
- `block()` is test-only; sleeps are never the answer.

## Official docs

- [Reactor Test — StepVerifier](https://projectreactor.io/docs/test/release/reference/)
- [Spring Framework — WebTestClient](https://docs.spring.io/spring-framework/reference/testing/webtestclient.html)
- [Spring Boot — Testing WebFlux](https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html#testing.spring-boot-applications.autoconfigured-spring-boot-tests)
