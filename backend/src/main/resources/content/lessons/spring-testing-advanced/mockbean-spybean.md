---
title: @MockBean & @SpyBean — Replacing Real Beans in Tests
summary: When to mock a bean in a Spring context, @MockBean vs @SpyBean semantics, reset behavior, and why @MockitoBean/@MockitoSpyBean replaced them in Boot 3.4+.
order: 7
minutes: 16
topics: [mockbean, spybean, mockitobean, bean-replacement, test-doubles, spring-boot-3-4]
docs:
  - https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html#testing.spring-boot-applications.mocking-beans
  - https://github.com/spring-projects/spring-framework/wiki/Spring-Framework-6.2-Upgrade-Notes
---

# @MockBean & @SpyBean — Replacing Real Beans in Tests

## The concept: swapping a bean for a test double

A `@SpringBootTest` boots the *whole* context — including the bean that calls Stripe, reads Kafka, or sends email. For tests that don't care about those integrations, you replace the bean with a **mock**: same type, scripted behavior, zero side effects.

```java
@SpringBootTest
class CheckoutServiceTest {
    @MockBean PaymentGateway paymentGateway;   // replaces the real bean in the context

    @Test
    void chargeFailsWhenGatewayDown() {
        when(paymentGateway.charge(any())).thenThrow(new GatewayUnavailableException());

        assertThatThrownBy(() -> checkoutService.charge(new OrderRequest()))
            .isInstanceOf(GatewayUnavailableException.class);
    }
}
```

`@MockBean` (from `spring-boot-test`) **removes the real bean definition from the context and registers a Mockito mock in its place** — every bean that injected `PaymentGateway` now receives the mock. This is the standard way to isolate a Spring integration test from real external systems.

## @MockBean vs @SpyBean

- **`@MockBean`** — a full mock: all methods return defaults (null/0/false) unless stubbed. Best for *outputs you control* (gateways, repositories you don't want touching the DB, email senders).
- **`@SpyBean`** — wraps the *real* bean: real methods run by default, individual methods can be stubbed. Best for *real logic with a few overrides* — e.g., the real `OrderService` but a stubbed `orderRepo.save` (avoiding DB writes while testing the real service logic).

```java
@SpringBootTest
class OrderFlowTest {
    @SpyBean OrderService orderService;              // real logic
    @MockBean OrderRepository orderRepository;       // no DB

    @Test
    void duplicateOrderThrows() {
        when(orderRepository.findByRef(any())).thenReturn(Optional.of(existingOrder()));
        // orderService.placeOrder() runs REAL logic against the mock repository
        assertThatThrownBy(() -> orderService.placeOrder("ref-1"))
            .isInstanceOf(DuplicateOrderException.class);
    }
}
```

## Reset semantics — the trap

`@MockBean` mocks are **reset after each test method** (Boot's default: `@AfterEach` resets mocks with `Mockito.reset()`). That means:

- Stubs from test A **do not leak** into test B — good for isolation.
- But *verifications* also reset — each test sets up its own stubs. Long `when(...)` setup blocks at the top of every test are the norm; extract a `setupBaseMocks()` helper.

If you *don't* want resets (rare — usually a sign of poor isolation), `@MockBean(reset = MockReset.NONE)` opts out.

## How we use it in an organization: the scenarios

**Scenario 1 — isolate from external SaaS.** Stripe, Twilio, SendGrid, the CRM — `@MockBean` the client bean so CI runs offline, fast, and free. The real integration gets its own thin, opt-in `@Tag("integration")` test suite with Testcontainers/WireMock.

**Scenario 2 — avoid the DB in service tests.** `@MockBean` the repository in a `@SpringBootTest` when you specifically test service orchestration, not persistence. (For repository behavior itself, use `@DataJpaTest` with a real DB — see the test-slices lesson.)

**Scenario 3 — assert side effects happened.** Mock + verify — the "did we call the audit service?" assertion:

```java
verify(auditService).record(eq("ORDER_CREATED"), any(Order.class));
```

**Scenario 4 — stub time and randomness.** `@MockBean Clock` (return a fixed Instant) makes date-dependent logic deterministic in tests.

## The Boot 3.4 change: @MockitoBean / @MockitoSpyBean

Spring Boot 3.4 introduced **`@MockitoBean`** and **`@MockitoSpyBean`** (from `org.springframework.test.context.bean.override.mockito`), and `@MockBean`/`@SpyBean` are deprecated. Why: the new annotations use Spring Framework 6.2's **`BeanOverride`** mechanism — they override the bean without rebuilding the whole context, work with cached contexts, and behave more predictably across slices. The migration is mechanical:

```java
// Old (deprecated in Boot 3.4+):
@MockBean PaymentGateway paymentGateway;
// New:
@MockitoBean PaymentGateway paymentGateway;
```

If your project is on Boot 3.4+, write new tests with `@MockitoBean`; the behavior is the same, the machinery is cleaner.

## Pitfalls

- **Over-mocking** — mocking *everything* produces tests that pass while the real wiring is broken. Mock only the boundary beans (external systems); keep your own code real.
- **`@MockBean` on a bean that's also used in `@Configuration` logic** — replacement happens *after* context processing in some orders; if a config class reads the bean at startup (e.g., an `@PostConstruct` that calls the gateway), the mock can't help — that startup call still happens against the real bean (or must be excluded).
- **Verification without stubbing** — a mock that's never stubbed returns defaults silently; tests can pass vacuously. Assert real behavior with `verify` and meaningful assertions.
- **Reset surprises** — know the reset-after-each-test default; don't assume stubs persist.
- **Slice tests vs mocks** — in `@WebMvcTest`, `@MockBean` services is the *intended* pattern (controllers only); in `@SpringBootTest`, prefer mocking only true external boundaries.

## Key takeaways

- `@MockBean` replaces a real bean with a mock; `@SpyBean` wraps the real bean with selectable stubs.
- Mocks reset after each test — stubs are per-test; extract shared setup.
- Mock the *boundaries* (external systems), keep your own code real for meaningful tests.
- `@MockitoBean`/`@MockitoSpyBean` are the Boot 3.4+ replacements — prefer them in new code.
- Use `verify` to assert side effects, not just stub returns.
