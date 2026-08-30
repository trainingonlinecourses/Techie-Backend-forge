---
title: Mockito Injection — @InjectMocks, @Spy, and @Captor
module: mockito-deep
order: 2
minutes: 24
topics: ["@InjectMocks", "@Spy", "@Captor", "argument captors", "dependency injection", "partial mocking"]
summary: The basics lesson covered @Mock and stubbing. The professional workflow adds three more tools: @InjectMocks (wire mocks into the class under test a...
docs:
  - title: "Mockito Annotations (Mockito docs)"
    url: "https://javadoc.io/doc/org.mockito/mockito-core/latest/org/mockito/Mockito.html#7"
  - title: "ArgumentCaptor (Mockito docs)"
    url: "https://javadoc.io/doc/org.mockito/mockito-core/latest/org/mockito/ArgumentCaptor.html"
---

# Mockito Injection — @InjectMocks, @Spy, and @Captor

## The Concept: The Rest of the Toolbox

The basics lesson covered `@Mock` and stubbing. The professional workflow adds three more tools: **`@InjectMocks`** (wire mocks into the class under test automatically), **`@Captor`** (grab and inspect the exact arguments passed), and **`@Spy`** (a real object with mockable parts — partial mocking). Together they remove the boilerplate of hand-wiring and unlock the two testing scenarios the basics can't express: *what exactly was passed?* and *real behavior with one mocked piece*.

## @InjectMocks: Let Mockito Wire the Dependencies

```java
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock OrderRepository orderRepo;
    @Mock PaymentService paymentService;
    @Mock Clock clock;

    // @InjectMocks creates the REAL OrderService and injects the mocks
    // above into it — by constructor first, then setter, then field.
    @InjectMocks
    OrderService orderService;

    @Test
    void placeOrder_chargesPayment() {
        // No hand-wiring needed — orderService already holds the mocks.
        when(paymentService.charge(anyString(), any())).thenReturn(true);

        boolean ok = orderService.placeOrder("cust-1", 49.99);

        assertTrue(ok);
        verify(orderRepo).save(any());
    }
}
```

**Walking through it:** `@InjectMocks` constructs a real `OrderService` and injects the `@Mock` fields by type — **constructor injection preferred**, then setter, then field. The mock fields must match the service's constructor parameters (by type) or its setters/fields. The payoff: no manual `new OrderService(orderRepo, paymentService, clock)` boilerplate, and adding a dependency to the service just means adding a `@Mock` field.

**The caveats that bite:**
- Mockito injects **by type** — two mocks of the same type (two `@Mock RestTemplate`) is ambiguous; the first match wins silently. Prefer distinct types or manual wiring in those cases.
- **Constructor changes silently break injection** — if the service gains a constructor parameter and you forget the `@Mock`, injection fails *at runtime* (NullPointerException inside the service) rather than at compile time. The mitigation: keep the constructor explicit and visible.
- The rule many teams adopt: **prefer explicit constructor wiring** in `@BeforeEach` (`service = new OrderService(repo, payments)`) for clarity, and use `@InjectMocks` for the common case where the wiring is obvious. Both are valid; `@InjectMocks` is less code, explicit wiring is more transparent.

## @Captor: Inspect the Exact Arguments

Sometimes "the code called `save`" isn't enough — you need to *see what it passed*:

```java
@ExtendWith(MockitoExtension.class)
class AuditTest {

    @Mock AuditLog auditLog;
    @Captor ArgumentCaptor<AuditEntry> entryCaptor;

    @Test
    void marksAuditEntryWithUserId() {
        // The code under test calls auditLog.record(entry);
        service.doAction("user-7");

        // Capture the argument that was passed:
        verify(auditLog).record(entryCaptor.capture());

        // Now INSPECT the captured object field by field:
        AuditEntry entry = entryCaptor.getValue();
        assertEquals("user-7", entry.userId());
        assertEquals("ACTION", entry.action());
        assertNotNull(entry.timestamp());
    }
}
```

**Why captors matter:** `argThat(...)` asserts *inline* but you can't easily inspect a complex object's multiple fields. `@Captor` grabs the actual argument object so you can run normal assertions on its fields — the standard way to test "the code built the right DTO/entity/event" without exposing those internals. It's also the tool for *collecting* multiple invocations: `entryCaptor.getAllValues()` returns everything passed across calls.

**The two-flavor note:** with `@Captor`, use `verify(mock).method(captor.capture())` — not `when` — and avoid mixing captors with other matchers in the same call.

## @Spy: Real Object, Mockable Parts

A **spy** is a *real* object that keeps its real behavior — except for the parts you stub. The use case: you want the real logic, but one collaborator call must be replaced (partial mocking):

```java
@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    // A REAL NotificationService — its real methods run.
    @Spy
    NotificationService service;

    @Test
    void retriesFailedNotifications() {
        // Stub ONE method on the real object:
        doReturn(true).when(service).sendViaEmail(anyString());
        // (doReturn, not when().thenReturn() — spies need the do* family
        //  because when() would actually CALL the real method first)

        boolean ok = service.sendWithRetry("hello", 2);

        assertTrue(ok);
        // The REAL retry loop ran; only sendViaEmail was stubbed.
        verify(service, times(1)).sendViaEmail("hello");
    }
}
```

**Walking through it:** `@Spy` creates a genuine `NotificationService` — `sendWithRetry` runs its real retry loop, and only the stubbed `sendViaEmail` is replaced. This is *partial mocking*: real behavior where you want it, controlled behavior where you need it.

**The traps:** with spies, use `doReturn`/`doThrow` (not `when().thenReturn()` — that invokes the real method during stubbing, which can throw or have side effects); and *stub sparingly* — a heavily-stubbed spy is a sign the design should have been a smaller seam. The classic legitimate uses: testing retry loops, timers, or legacy code with an awkward hard-coded dependency.

## @Mock vs @Spy vs Real — The Decision

| | `@Mock` | `@Spy` | Real object |
|---|---|---|---|
| Behavior | none — all stubbed | real, except stubbed parts | fully real |
| Calls recorded | yes | yes | no |
| Use for | collaborators you control | partially mocking a real class | value objects, the class under test (if not a spy) |
| Stubbing style | `when().thenReturn()` or `do*` | **`do*`** (avoid `when`) | n/a |

**The principle:** mock the *collaborators* (things you don't own or don't want), spy the *class under test* only when a specific method must be replaced, and never mock the thing you're really trying to verify.

## Combining the Toolkit

```java
@ExtendWith(MockitoExtension.class)
class FullExampleTest {

    @Mock OrderRepository repo;
    @Mock PaymentGateway gateway;
    @Captor ArgumentCaptor<Order> orderCaptor;
    @InjectMocks OrderService service;

    @Test
    void failedPayment_leavesOrderPending_andLogs() {
        doThrow(new GatewayTimeoutException("timeout")).when(gateway).charge(anyString(), any());

        assertThrows(GatewayTimeoutException.class, () -> service.placeOrder("c1", 10.0));

        // The order was saved as PENDING despite the failure:
        verify(repo).save(orderCaptor.capture());
        assertEquals("PENDING", orderCaptor.getValue().status());
    }
}
```

Every tool in one test: mocks for collaborators, a captor to inspect what was saved, injection to wire it, and real logic in the service under test.

## Recap

The Mockito injection toolbox completes the mocking story: **`@InjectMocks`** auto-wires `@Mock` collaborators into a real class under test (constructor-first, by type — with the caveat that type-ambiguous or constructor-changed wiring fails silently, so keep constructors visible); **`@Captor`** captures the exact arguments passed so you can assert on an object's fields (`verify(mock).method(captor.capture())`); and **`@Spy`** gives a real object with individually mockable parts — using `doReturn`/`doThrow`, never `when()` — for retry loops and legacy seams. The decision rule: mock collaborators, spy the class under test only when necessary, and never mock the behavior you're actually verifying. With these three plus the basics, the full mock-based unit-testing workflow is in your hands.
