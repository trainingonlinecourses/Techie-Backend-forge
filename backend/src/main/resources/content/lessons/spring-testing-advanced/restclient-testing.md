---
title: Testing HTTP Clients (RestClient/WebClient)
module: spring-testing-advanced
order: 3
minutes: 20
topics: ["MockRestServiceServer", "@RestClientTest", "MockWebServer", "stubbing", "verification"]
docs:
  - title: "RestClient testing"
    url: "https://docs.spring.io/spring-framework/reference/testing/spring-mvc-test-framework.html"
---

# Testing HTTP Clients (RestClient/WebClient)

Your service calls other services. Those calls must be tested — but never against the real network. This lesson covers the three ways to stub HTTP: `MockRestServiceServer`, `@RestClientTest`, and `MockWebServer`, with verification that your client sends the right requests.

## @RestClientTest: The Slice for Clients

```java
@RestClientTest(PaymentGatewayClient.class)
class PaymentGatewayClientTest {

    @Autowired PaymentGatewayClient client;
    @Autowired MockRestServiceServer server;
}
```

`@RestClientTest` wires a `MockRestServiceServer` bound to your client's `RestTemplate`/`RestClient` — no real HTTP, no configuration.

## Stubbing Responses

```java
@Test
void chargesCardSuccessfully() {
    server.expect(requestTo("/v1/charges"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(header("Authorization", "Bearer sk-test"))
        .andExpect(jsonPath("$.amount").value(2500))
        .andRespond(withSuccess(
            "{\"id\":\"ch_123\",\"status\":\"succeeded\"}",
            MediaType.APPLICATION_JSON));

    Charge charge = client.charge(2500, "tok_visa");

    assertEquals("ch_123", charge.id());
    assertEquals("succeeded", charge.status());
    server.verify();   // all expectations met
}
```

## Expecting the Request: Assertions on What You Send

The `.andExpect(...)` block asserts the **outgoing** request — the strongest value of `MockRestServiceServer`:

```java
server.expect(requestTo("/v1/charges"))
    .andExpect(method(HttpMethod.POST))
    .andExpect(header("Authorization", startsWith("Bearer")))
    .andExpect(header("Idempotency-Key", notNullValue()))
    .andExpect(content().contentType(MediaType.APPLICATION_JSON))
    .andExpect(jsonPath("$.amount").value(2500))
    .andExpect(jsonPath("$.currency").value("USD"));
```

If your client stops sending the auth header or the idempotency key, the test fails — that's a regression guard no real-API test can give you.

## Responding With Errors

```java
@Test
void handlesGatewayTimeout() {
    server.expect(requestTo("/v1/charges"))
        .andRespond(withStatus(HttpStatus.GATEWAY_TIMEOUT));

    assertThrows(PaymentGatewayTimeoutException.class,
        () -> client.charge(2500, "tok_visa"));
}

@Test
void retriesOn502() {
    server.expect(requestTo("/v1/charges")).andRespond(withStatus(HttpStatus.BAD_GATEWAY));
    server.expect(requestTo("/v1/charges"))
        .andRespond(withSuccess("{\"id\":\"ch_2\"}", MediaType.APPLICATION_JSON));

    Charge charge = client.charge(2500, "tok_visa");
    assertEquals("ch_2", charge.id());
    server.verify();   // both requests happened
}
```

## MockWebServer (OkHttp) — For Raw Control

`MockWebServer` (from OkHttp) gives a real HTTP server on localhost — useful when your client uses a `WebClient` or raw sockets:

```xml
<dependency>
    <groupId>com.squareup.okhttp3</groupId>
    <artifactId>mockwebserver</artifactId>
    <scope>test</scope>
</dependency>
```

```java
class WebClientIntegrationTest {

    private MockWebServer server;
    private WebClient client;

    @BeforeEach
    void setUp() {
        server = new MockWebServer();
        server.start();
        client = WebClient.builder()
            .baseUrl(server.url("/").toString())
            .build();
    }

    @AfterEach
    void tearDown() throws IOException {
        server.shutdown();
    }

    @Test
    void fetchesCourse() throws JsonProcessingException {
        server.enqueue(new MockResponse()
            .setBody("{\"id\":1,\"title\":\"Spring\"}")
            .setHeader("Content-Type", "application/json")
            .setResponseCode(200));

        Mono<CourseDto> mono = client.get()
            .uri("/courses/1")
            .retrieve()
            .bodyToMono(CourseDto.class);

        CourseDto dto = mono.block();
        assertEquals("Spring", dto.title());

        RecordedRequest request = server.takeRequest();
        assertEquals("/courses/1", request.getPath());
        assertEquals("GET", request.getMethod());
    }
}
```

## Testing Retry and Circuit Breaker

The real value of stubbed HTTP: test the resilience logic deterministically.

```java
@Test
void circuitBreakerOpensAfterFailures() {
    // 3 failures → breaker opens
    for (int i = 0; i < 3; i++) {
        server.expect(requestTo("/v1/charges"))
            .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        assertThrows(PaymentException.class, () -> client.charge(1, "tok"));
    }
    // next call short-circuits: no request should reach the server
    assertThrows(CircuitOpenException.class, () -> client.charge(1, "tok"));
}
```

## Timeouts

```java
@Test
void timesOutWhenServerIsSlow() {
    server.expect(requestTo("/slow"))
        .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON)
            .withBodyDelay(5, TimeUnit.SECONDS));   // delayed response

    // client with 2s timeout fails
    assertThrows(ResourceAccessException.class,
        () -> slowClient.fetch());
}
```

## Testing the Client's Error Mapping

```java
@Test
void maps404ToNotFoundDomainException() {
    server.expect(requestTo("/v1/courses/999"))
        .andRespond(withStatus(HttpStatus.NOT_FOUND));

    assertThrows(CourseNotFoundException.class,
        () -> client.getCourse(999L));
}

@Test
void mapsValidation422ToClientError() {
    server.expect(requestTo("/v1/charges"))
        .andRespond(withStatus(HttpStatus.UNPROCESSABLE_ENTITY)
            .body("{\"error\":\"card declined\"}"));

    assertThrows(CardDeclinedException.class,
        () -> client.charge(2500, "tok_visa"));
}
```

## Verification: The Secret Weapon

```java
server.verify();                    // all expectations consumed, in order
server.verify(1, requestTo("/x"));  // exactly one request to /x
server.verify(0, requestTo("/y"));  // never called /y
```

`verify(0, ...)` is how you assert *absence* — "the client did NOT retry after success", "the client did NOT call the legacy endpoint".

## Best Practices

| Practice | Why |
|----------|-----|
| Assert the outgoing request | Catches missing headers/keys — the real regressions |
| Test error responses | Retry/fallback logic lives there |
| Verify request counts | Catches duplicate calls and missing retries |
| Use delays | Test timeouts deterministically |
| Keep responses as fixtures | Readable, realistic |

## Summary

`MockRestServiceServer` + `@RestClientTest` give you request-level assertions with zero network. `MockWebServer` gives raw control for WebClient/raw clients. Together they test the whole client contract: what you send, how you handle every response, and whether retries and circuit breakers behave — deterministically, in milliseconds.
