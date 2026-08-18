---
title: Testing REST APIs — TestRestTemplate and End-to-End Assertions
summary: TestRestTemplate vs MockMvc vs RestAssured, starting the full server with RANDOM_PORT, and asserting status, headers and bodies on a real HTTP stack.
order: 6
minutes: 17
topics: [testresttemplate, restassured, random-port, integration-test, http-testing, bdd]
docs:
  - https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html
  - https://github.com/rest-assured/rest-assured
---

# Testing REST APIs — TestRestTemplate and End-to-End Assertions

## The concept: testing over real HTTP

`@WebMvcTest` + MockMvc tests the MVC layer *in-process* (no real server, mocked services) — fast and precise, but it doesn't prove the *whole stack*: serialization config, filters, security, error handling, and the real container all matter. **End-to-end (E2E) API tests** boot the real server on a random port and talk to it over HTTP — they verify the contract a client actually experiences.

Spring Boot's tool for this is **`TestRestTemplate`** (a `RestTemplate` preset for tests: relative URLs resolved against the test server, no client-side interceptors):

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OrderApiE2eTest {
    @Autowired TestRestTemplate rest;

    @Test
    void createThenFetchOrder() {
        // POST — status and Location asserted on real HTTP
        ResponseEntity<OrderDto> created = rest.postForEntity(
            "/api/orders", new OrderRequest("card"), OrderDto.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(created.getHeaders().getLocation()).isNotNull();

        // GET the new resource — full round trip
        ResponseEntity<OrderDto> fetched = rest.getForEntity(
            created.getHeaders().getLocation().getPath(), OrderDto.class);
        assertThat(fetched.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(fetched.getBody().status()).isEqualTo("CREATED");
    }
}
```

`RANDOM_PORT` boots the real embedded server on an ephemeral port — so tests run in parallel without port collisions and the full web stack (filters, serializers, exception advice, security) is exercised.

## The testing pyramid for APIs

| Layer | Tool | Proves |
|---|---|---|
| Unit | JUnit + Mockito | Service logic, isolated |
| Slice | `@WebMvcTest` + MockMvc | Controller mapping, validation, security rules |
| E2E | `@SpringBootTest(RANDOM_PORT)` + `TestRestTemplate` | Real HTTP stack: serialization, filters, errors |
| Contract (optional) | Pact / Spring Cloud Contract | Consumer-provider agreement |

Teams run all three: unit tests are fast and numerous; a **thin but critical** E2E layer covers the money paths (auth → create → read → error cases). The E2E layer is where "it works in MockMvc but 500s in prod" bugs are caught — they're usually in serialization, filters, or security, which MockMvc-only tests can miss.

## RestAssured — the BDD-style alternative

RestAssured gives a fluent, Given/When/Then syntax many teams prefer for API tests:

```java
@SpringBootTest(webEnvironment = RANDOM_PORT)
class OrderApiTest {
    @LocalServerPort int port;   // inject the random port

    @Test
    void createOrderReturns201() {
        given()
            .port(port)
            .contentType(ContentType.JSON)
            .body(new OrderRequest("card"))
        .when()
            .post("/api/orders")
        .then()
            .statusCode(201)
            .header("Location", containsString("/api/orders/"))
            .body("status", equalTo("CREATED"));
    }
}
```

Choose one style per codebase: `TestRestTemplate` (no extra dependency, explicit) or RestAssured (fluent BDD, more readable assertions on JSON bodies).

## The scenarios that only E2E tests catch

- **Serialization mismatches** — a `LocalDateTime` serialized differently than the client expects; `BigDecimal` as a JSON number vs string. The DTO contract breaks only over real HTTP.
- **Filter/security ordering** — CORS preflight failing, CSRF blocking a test client, a `OncePerRequestFilter` mutating the body. Only the real filter chain shows it.
- **Error handling** — `@ControllerAdvice` mapping: the client sees 400 with the error shape, not a 500 stack trace. E2E asserts the exact error body clients parse.
- **Content negotiation** — `Accept`/`Content-Type` negotiation producing 415/406 when it should.
- **Timeouts and streaming** — async handlers, SSE, `StreamingResponseBody` behavior with real container threading.

## How we use it in an organization: the scenarios

**Scenario 1 — the smoke suite.** A handful of E2E tests per service (health, auth round-trip, one CRUD happy path, one error path) run in CI on every push — fast enough to gate merges, broad enough to catch stack-level regressions.

**Scenario 2 — contract regression for a public API.** The E2E layer doubles as a contract test: when the response shape changes, the test breaks, forcing a version bump or a conscious breaking-change decision.

**Scenario 3 — test against real dependencies (Testcontainers).** `@SpringBootTest(RANDOM_PORT)` + Testcontainers (Postgres, Redis, Kafka) gives a full-stack test that runs against the same infrastructure as prod — the most realistic test before deploy, at the cost of slower CI.

**Scenario 4 — staging smoke checks.** The *same* test class, pointed at a staging URL, becomes the post-deploy smoke test (Spring Boot's `TestRestTemplate` can target any base URL via `RestTemplateBuilder.rootUri(...)`).

## Pitfalls

- **Context reuse hides state** — `@SpringBootTest` caches the context across tests; a test that mutates shared state (a DB row, a cache) leaks into the next. Reset between tests (`@Transactional` per test where the DB supports it, or `@DirtiesContext` sparingly).
- **E2E ≠ no mocks** — for external services (payment gateways, third-party APIs) still stub at the HTTP level (WireMock) — you're testing *your* stack, not the world's.
- **Slow suites** — E2E tests boot the context per class (cached, but still heavy); keep the E2E layer small and focused, and let unit/slice tests carry the bulk.
- **`RANDOM_PORT` + parallel CI** — works because ports are ephemeral; never hardcode a port in E2E tests.
- **Asserting on serialized JSON strings** is brittle — assert on typed DTOs (`OrderDto.class`) or JsonPath expressions, not raw string equality.

## Key takeaways

- E2E API tests boot the real server (`RANDOM_PORT`) and assert over real HTTP.
- `TestRestTemplate` (explicit) or RestAssured (BDD-fluent) — pick one per codebase.
- E2E catches serialization, filter/security ordering, and error-handling bugs MockMvc misses.
- Keep the E2E layer thin and critical; unit + slice tests carry the bulk of coverage.
- Stub external systems (WireMock), reset shared state, and never hardcode ports.
