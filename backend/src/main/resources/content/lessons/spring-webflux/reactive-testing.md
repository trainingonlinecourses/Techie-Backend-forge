---
title: Testing Reactive Code — StepVerifier and Beyond
summary: Testing Mono and Flux with StepVerifier, virtual time, test publishers, WebTestClient, and the patterns that catch reactive bugs before production. Beginner-friendly with line-by-line code.
order: 10
minutes: 22
topics: [reactive testing, StepVerifier, virtual time, test publisher, WebTestClient, reactive assertions, backpressure testing]
docs:
  - https://projectreactor.io/docs/core/release/reference/#testing
  - https://docs.spring.io/spring-framework/reference/web/webflux-webfn.html
---

# Testing Reactive Code — StepVerifier and Beyond

## Why Reactive Testing is Different (From Zero)

In imperative code, you call a method and check the result:

```java
// Imperative: simple and straightforward
User user = userService.findById("123");
assertEquals("Alice", user.getName());
```

In reactive code, the result is a **Mono/Flux** — nothing happens until you subscribe. You can't just call `.getName()` on a `Mono<User>`. You need special tools to test reactive streams.

### The Testing Toolkit

| Tool | What It Does | When to Use |
|---|---|---|
| **StepVerifier** | Verify Mono/Flux emission sequence | Unit testing reactive logic |
| **WebTestClient** | Test WebFlux endpoints | Integration testing HTTP endpoints |
| **Reactor Test** | Test with virtual time | Testing timeouts, delays, intervals |
| **TestPublisher** | Manually control a stream | Testing backpressure, error scenarios |

---

## The Code — Line by Line

### 1. StepVerifier — The Core Testing Tool

```java
class UserServiceTest {

    private UserService userService;

    @Test
    void shouldFindUserById() {
        // Step 1: Create the reactive chain
        Mono<User> result = userService.findById("user-123");

        // Step 2: Verify the emissions
        StepVerifier.create(result)
            .assertNext(user -> {                                 // Expect one item
                assertThat(user.getId()).isEqualTo("user-123");
                assertThat(user.getName()).isEqualTo("Alice");
                assertThat(user.getEmail()).isEqualTo("alice@example.com");
            })
            .verifyComplete();                                    // Then the stream completes
    }

    @Test
    void shouldReturnEmptyForNonexistentUser() {
        Mono<User> result = userService.findById("nonexistent");

        StepVerifier.create(result)
            .verifyComplete();                                    // Expect empty (no items, just complete)
    }

    @Test
    void shouldFindMultipleCourses() {
        Flux<Course> result = courseService.findByUserId("user-123");

        StepVerifier.create(result)
            .assertNext(course -> assertThat(course.getTitle()).isEqualTo("Java Basics"))
            .assertNext(course -> assertThat(course.getTitle()).isEqualTo("Spring Boot"))
            .assertNext(course -> assertThat(course.getTitle()).isEqualTo("Microservices"))
            .verifyComplete();                                    // 3 items, then complete
    }

    @Test
    void shouldHandleErrorGracefully() {
        Mono<User> result = userService.findById("invalid");

        StepVerifier.create(result)
            .verifyError(NotFoundException.class);                // Expect this specific error
    }
}
```

**Line-by-line explained:**
- `StepVerifier.create(reactiveChain)` — Creates a test harness for the reactive chain.
- `.assertNext(item -> ...)` — Expects the next emitted item and lets you assert on it.
- `.verifyComplete()` — Expects the stream to complete normally (no errors).
- `.verifyError(NotFoundException.class)` — Expects the stream to fail with this error.
- **Nothing happens until StepVerifier subscribes** — that's when the reactive chain actually executes.

### 2. Testing with Virtual Time

```java
class DelayedServiceTest {

    @Test
    void shouldTimeoutAfterDelay() {
        Mono<String> result = delayedService.fetchWithTimeout(Duration.ofSeconds(5));

        // Use virtual time to avoid waiting 5 real seconds:
        StepVerifier.withVirtualTime(() -> result)
            .thenAwait(Duration.ofSeconds(5))                    // Fast-forward 5 seconds
            .assertNext(data -> assertThat(data).isNotEmpty())
            .verifyComplete();
    }

    @Test
    void shouldEmitEventsOverTime() {
        Flux<Long> ticks = Flux.interval(Duration.ofSeconds(1)).take(5);

        StepVerifier.withVirtualTime(() -> ticks)
            .thenAwait(Duration.ofSeconds(5))                    // Fast-forward 5 seconds
            .expectNext(0L, 1L, 2L, 3L, 4L)                    // 5 ticks at 1s intervals
            .verifyComplete();
    }

    @Test
    void shouldRetryWithBackoff() {
        Mono<String> result = unreliableService.fetchWithRetry(3);

        StepVerifier.withVirtualTime(() -> result)
            .thenAwait(Duration.ofSeconds(7))                    // 1s + 2s + 4s = 7s total
            .assertNext(data -> assertThat(data).isEqualTo("success"))
            .verifyComplete();
    }
}
```

**Line-by-line explained:**
- `StepVerifier.withVirtualTime(() -> ...)` — Creates a StepVerifier that uses virtual time.
- `.thenAwait(Duration)` — Fast-forwards the virtual clock without waiting real time.
- Perfect for testing timeouts, delays, intervals, and retry backoff without slow tests.

### 3. WebTestClient — Testing WebFlux Endpoints

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OrderControllerIntegrationTest {

    @Autowired
    private WebTestClient webTestClient;

    @Test
    void shouldGetOrderById() {
        webTestClient.get()
            .uri("/api/orders/{id}", "order-123")
            .header("Authorization", "Bearer " + validToken)
            .exchange()                                           // Make the request
            .expectStatus().isOk()                                // Assert HTTP 200
            .expectBody(Order.class)
            .value(order -> {                                     // Assert response body
                assertThat(order.getId()).isEqualTo("order-123");
                assertThat(order.getStatus()).isEqualTo("PAID");
                assertThat(order.getTotal()).isPositive();
            });
    }

    @Test
    void shouldReturn401WithoutToken() {
        webTestClient.get()
            .uri("/api/orders/{id}", "order-123")
            .exchange()
            .expectStatus().isUnauthorized();                     // Assert HTTP 401
    }

    @Test
    void shouldCreateOrder() {
        OrderRequest request = new OrderRequest("user-123", List.of(new OrderItem("LAPTOP", 1)));

        webTestClient.post()
            .uri("/api/orders")
            .header("Authorization", "Bearer " + validToken)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(request)
            .exchange()
            .expectStatus().isCreated()                           // Assert HTTP 201
            .expectBody(Order.class)
            .value(order -> {
                assertThat(order.getId()).isNotNull();
                assertThat(order.getStatus()).isEqualTo("PENDING");
            });
    }

    @Test
    void shouldStreamSSE() {
        webTestClient.get()
            .uri("/api/events/stream")
            .header("Authorization", "Bearer " + validToken)
            .accept(MediaType.TEXT_EVENT_STREAM)
            .exchange()
            .expectStatus().isOk()
            .expectHeader().contentType(MediaType.TEXT_EVENT_STREAM)
            .returnResult(Event.class)
            .getResponseBody()
            .take(3)                                              // Take first 3 events
            .as(StepVerifier::create)
            .assertNext(event -> assertThat(event.getType()).isNotEmpty())
            .assertNext(event -> assertThat(event.getType()).isNotEmpty())
            .assertNext(event -> assertThat(event.getType()).isNotEmpty())
            .verifyComplete();
    }
}
```

### 4. TestPublisher — Manual Stream Control

```java
class BackpressureTest {

    @Test
    void shouldHandleBackpressure() {
        // Create a controllable publisher
        TestPublisher<Integer> publisher = TestPublisher.create();

        // Create a subscriber that processes items slowly
        List<Integer> processed = new ArrayList<>();

        Flux<Integer> slowProcessor = publisher.flux()
            .delayElements(Duration.ofMillis(100))               // Simulate slow processing
            .subscribeOn(Schedulers.parallel());

        StepVerifier.create(slowProcessor, 1)                    // Request 1 item at a time
            .then(() -> {
                publisher.next(1, 2, 3, 4, 5);                  // Emit 5 items
                publisher.complete();                              // Signal completion
            })
            .thenRequest(1)                                       // Request more items
            .assertNext(item -> assertThat(item).isIn(1, 2, 3, 4, 5))
            .thenRequest(1)
            .assertNext(item -> assertThat(item).isIn(1, 2, 3, 4, 5))
            .verifyComplete();
    }

    @Test
    void shouldHandleErrorInStream() {
        TestPublisher<String> publisher = TestPublisher.create();

        Flux<String> stream = publisher.flux()
            .onErrorReturn("default");                            // Fallback on error

        StepVerifier.create(stream)
            .then(() -> publisher.error(new RuntimeException("boom")))
            .assertNext(item -> assertThat(item).isEqualTo("default"))
            .verifyComplete();
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Testing a Reactive Service

```java
@SpringBootTest
class NotificationServiceTest {

    @Autowired
    private NotificationService notificationService;

    @MockBean
    private EmailClient emailClient;

    @Test
    void shouldSendNotification() {
        // Arrange: mock the email client
        when(emailClient.send(any()))
            .thenReturn(Mono.just(new SendResult("sent")));

        // Act
        Mono<Void> result = notificationService.sendNotification(
            "user-123", "Your order is ready!"
        );

        // Assert
        StepVerifier.create(result)
            .verifyComplete();                                    // Completes without error

        // Verify the email was sent
        verify(emailClient).send(argThat(msg ->
            msg.getTo().equals("user-123") &&
            msg.getBody().contains("order is ready")
        ));
    }
}
```

### Scenario 2: Testing WebSocket

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class WebSocketIntegrationTest {

    @Autowired
    private WebSocketClient webSocketClient;

    @Test
    void shouldReceiveBroadcastMessage() {
        Flux<WebSocketMessage> output = webSocketClient
            .execute(URI.create("ws://localhost:" + port + "/ws/chat"))
            .map(WebSocketMessage::getPayloadAsText);

        StepVerifier.create(output.take(1))
            .assertNext(msg -> assertThat(msg).contains("Welcome"))
            .verifyComplete();
    }
}
```

### Scenario 3: Testing Timeout Behavior

```java
@Test
void shouldTimeoutWhenServiceIsSlow() {
    Mono<String> result = slowService.fetchData()
        .timeout(Duration.ofSeconds(2));                          // 2 second timeout

    StepVerifier.withVirtualTime(() -> result)
        .thenAwait(Duration.ofSeconds(3))                        // Fast-forward past timeout
        .verifyError(TimeoutException.class);                     // Should timeout
}
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Not subscribing to the reactive chain | Nothing executes, test passes vacuously | Use `StepVerifier.create()` to subscribe |
| Using real time for delay tests | Tests take 5+ seconds each | Use `withVirtualTime()` for delays |
| Asserting on Mono without StepVerifier | Can't access the value directly | Always wrap in StepVerifier |
| Not testing error paths | Bugs in error handling go undetected | Use `.verifyError()` for error scenarios |
| Forgetting to verify completion | Stream might hang forever | Always end with `.verifyComplete()` or `.verifyError()` |

---

## Key Takeaways

- **`StepVerifier.create(mono/flux)`** — subscribe to the reactive chain and verify emissions.
- **`.assertNext()` → `.verifyComplete()`** — the standard test pattern: check item, then check completion.
- **`withVirtualTime()`** — test timeouts and delays without waiting real time.
- **`WebTestClient`** — test WebFlux endpoints like MockMvc but reactive.
- **Always test both success AND error paths** — reactive error handling is easy to get wrong.

Official docs: [Testing (Reactor)](https://projectreactor.io/docs/core/release/reference/#testing) · [WebTestClient (Spring)](https://docs.spring.io/spring-framework/reference/web/webflux-webfn.html)
