---
title: Mockito — Stubbing Collaborators
summary: Mocks, stubs, spies and verification — isolating the unit under test, the when/then/verify grammar, and the over-mocking anti-pattern.
order: 3
minutes: 15
topics: [mockito, mocking, stubbing, verification, test doubles]
docs:
  - https://site.mockito.org/
  - https://javadoc.io/doc/org.mockito/mockito-core/latest/org/mockito/Mockito.html
---

# Mockito — Stubbing Collaborators

## Why mocks

A unit test exercises **one class in isolation**. The collaborators (repositories, HTTP clients, clocks) are replaced with **test doubles** — controllable stand-ins — so the test is fast, deterministic, and fails for the unit's reasons, not the infrastructure's. Mockito is the standard double library.

```java
class OrderServiceTest {

    @Mock OrderRepository repo;          // a fake collaborator
    @Mock PaymentClient payments;
    @InjectMocks OrderService service;   // service gets the mocks injected

    @BeforeEach
    void setUp() { MockitoAnnotations.openMocks(this); }   // or @ExtendWith(MockitoExtension.class)

    @Test
    void persistsAnOrderOnCreate() {
        when(repo.save(any(Order.class))).thenAnswer(inv -> inv.<Order>getArgument(0));

        Order o = service.create(new CreateOrderRequest("ada", ...));

        verify(repo).save(o);                        // the collaborator was called with o
        verify(payments, never()).charge(any());     // and nothing else happened
    }
}
```

`@ExtendWith(MockitoExtension.class)` replaces the manual `openMocks` — the cleaner Spring/Boot idiom.

## The when/then grammar

```java
// Stub return values:
when(repo.findById(42L)).thenReturn(Optional.of(order));
when(repo.findById(99L)).thenReturn(Optional.empty());
when(clock.instant()).thenReturn(Instant.parse("2026-08-17T10:00:00Z"));   // time travel!

// Stub exceptions:
when(payments.charge(any())).thenThrow(new UpstreamException("card declined"));

// Stub by argument matchers (ALL args must be matchers):
when(repo.findByStatus(any(OrderStatus.class))).thenReturn(List.of(o1, o2));

// Chain responses:
when(repo.findById(1L)).thenReturn(Optional.of(o)).thenThrow(new RuntimeException());
```

**Stub only what the test needs** — unstubbed methods return the "zero" (null/empty/false), which immediately exposes a missing dependency instead of silently passing.

## Verification: the "did it happen" grammar

```java
verify(repo).save(o);                              // called exactly once with o
verify(repo, times(2)).save(o);
verify(payments, never()).charge(any());
verify(payments, atLeastOnce()).charge(any());
verifyNoInteractions(notificationService);         // nothing touched this collaborator at all
verifyNoMoreInteractions(repo);                    // no unexpected calls beyond what you verified
```

- `verify(...)` is about **behavior** ("the payment was attempted"), `when(...)` is about **data** ("it returns this"). Only verify what you'd assert as a business rule — over-verifying pins implementation details and makes every refactor a test rewrite.
- `verifyNoMoreInteractions` is powerful and brittle — use it sparingly, where silent extra calls would be a real bug (e.g. a duplicate charge).

## Spies: real object, selective stubbing

A **spy** wraps a real object — real methods run unless stubbed:

```java
OrderService real = new OrderService(repo, payments);
OrderService spy = spy(real);

doReturn(true).when(spy).isEligibleForRefund(any());   // stub one method, run the rest for real
spy.cancel(42L);                                       // real logic + stubbed guard
```

Use spies to test **real logic with one injected seam** — but a test that needs a spy is often a sign the class has too many internal seams (a candidate for extracting a collaborator).

## Mockito + Spring tests

In Spring tests, Mockito mocks replace real beans for the *unit-under-test slice*:

```java
@WebMvcTest(OrderController.class)                 // only the web layer
class OrderControllerTest {
    @MockBean OrderService service;                 // mocked into the context
    // MockMvc performs requests; service interactions are stubbed/verified
}
```

(`@MockitoBean` in Boot 3.4+ is the newer name; `@MockBean` still works.) The rule from the testing pyramid: mock at the **service boundary** in slice tests, use real beans (Testcontainers) in `@SpringBootTest` integration tests.

## The over-mocking anti-pattern

Mocking everything makes tests **green but meaningless**: they verify your code calls itself correctly and assert nothing real. Signs:

- A test that stubs 6 collaborators and verifies 8 calls — it's testing the wiring, not the logic.
- A test that must change whenever the class's *internals* change.
- An "integration test" that mocks the database — that's a unit test wearing a costume.

The discipline: **mock at the architecture boundary** (I/O: repos, HTTP, clock), keep domain logic real, and let integration tests (Testcontainers, real Spring context) cover the boundary.

## Key takeaways

- Mocks isolate the unit; `@ExtendWith(MockitoExtension.class)` + `@Mock`/`@InjectMocks`.
- `when(...).thenReturn/throw` stubs data; `verify(...)` asserts behavior — use each for its purpose.
- Spies run real code with selective stubs; prefer real collaborators where feasible.
- Mock at the architecture boundary, not everywhere — an over-mocked test proves nothing.
- In Spring: `@MockBean`/`@MockitoBean` for slice tests, real beans for integration tests.

Official docs: [Mockito](https://site.mockito.org/) · [Mockito API](https://javadoc.io/doc/org.mockito/mockito-core/latest/org/mockito/Mockito.html)
