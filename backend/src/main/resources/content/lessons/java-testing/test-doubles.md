---
title: Test Doubles — Mocks, Stubs, Fakes, and Spies
summary: The five types of test doubles, when to use each, Mockito deep dive, and how organizations build reliable test suites without hitting real databases or APIs.
order: 6
minutes: 22
topics: [test doubles, mocks, stubs, fakes, spies, mockito, verification, argument captor, BDD]
docs:
  - https://site.mockito.org/
  - https://docs.spring.io/spring-framework/reference/testing.html
---

# Test Doubles — Mocks, Stubs, Fakes, and Spies

## What are Test Doubles? (From Zero)

When testing a class, you often don't want to use real dependencies — a real database is slow, a real payment API costs money, a real email service sends real emails. **Test doubles** are fake objects that stand in for real dependencies during testing.

Think of it like a movie stunt double — they look like the real actor, do the important moves, but it's safe (no one gets hurt, no real money spent).

### The Five Types

| Double | What it does | When to use |
|---|---|---|
| **Dummy** | Passed around but never used | Filling parameter lists |
| **Stub** | Returns predefined data | When you need known inputs/outputs |
| **Spy** | Wraps a real object, records calls | When you need to verify interactions on real code |
| **Mock** | Fake object that you verify interactions against | When behavior (calls, args) matters more than state |
| **Fake** | Working implementation of an interface (but simplified) | When you need a lightweight substitute (in-memory DB) |

---

## The Code — Line by Line

### 1. Stub (Predefined Responses)

```java
// The real dependency:
public interface UserRepository {
    Optional<User> findById(String id);
    User save(User user);
}

// A stub: returns whatever you tell it to
@Test
void shouldProcessOrder() {
    // Arrange: create a stub that always returns a specific user
    UserRepository stub = Mockito.mock(UserRepository.class);
    Mockito.when(stub.findById("user-123"))                         // When findById is called
        .thenReturn(Optional.of(new User("user-123", "Alice")));   // Return this user

    // Act: use the stub in your service
    OrderService service = new OrderService(stub);
    Order order = service.createOrder("user-123", List.of(item1));

    // Assert: verify the result
    assertThat(order.getUserId()).isEqualTo("user-123");
    assertThat(order.getStatus()).isEqualTo(OrderStatus.CREATED);
}
```

**Line-by-line explained:**
- `Mockito.mock(UserRepository.class)` — Creates a fake implementation of `UserRepository`. Every method returns null/empty by default.
- `Mockito.when(stub.findById("user-123")).thenReturn(...)` — **Stubbing**: when this specific method is called with this specific argument, return this specific value.
- The test never touches a real database — it uses the stub's predefined response.

### 2. Mock (Verify Interactions)

```java
@Test
void shouldSendEmailWhenOrderCreated() {
    // Arrange: create a mock
    EmailService mockEmail = Mockito.mock(EmailService.class);

    // Act: use the mock in the service under test
    OrderService service = new OrderService(userRepo, mockEmail);
    service.createOrder("user-123", List.of(item1));

    // Assert: verify the mock was called with the right arguments
    Mockito.verify(mockEmail)                                      // Check this mock
        .sendOrderConfirmation(                                    // This method was called
            Mockito.eq("user-123"),                                // With this argument
            Mockito.argThat(order ->                               // And this argument matches
                order.getStatus() == OrderStatus.CREATED &&
                order.getTotal().compareTo(BigDecimal.ZERO) > 0
            )
        );
    // If sendOrderConfirmation was NOT called → test fails!
    // If called with wrong arguments → test fails!
}
```

**Line-by-line explained:**
- `Mockito.verify(mockEmail)` — Now we're in **verification mode**. We're checking that a method WAS called.
- `.sendOrderConfirmation(Mockito.eq("user-123"), ...)` — Assert the first argument was exactly "user-123".
- `Mockito.argThat(order -> ...)` — Custom argument matcher — the second argument must satisfy this condition.
- **Mocks verify behavior** (was this method called?), while **stubs verify state** (did this return the right thing?).

### 3. Spy (Record Calls on Real Objects)

```java
@Test
void shouldCacheUserAfterFirstLookup() {
    // Arrange: spy on a REAL repository
    UserRepository realRepo = new JdbcUserRepository(dataSource);
    UserRepository spy = Mockito.spy(realRepo);    // Wraps real object, records all calls

    OrderService service = new OrderService(spy, emailService);

    // Act: call twice
    service.createOrder("user-123", List.of(item1));
    service.createOrder("user-123", List.of(item2));

    // Assert: findById was called only ONCE (second call used cache)
    Mockito.verify(spy, Mockito.times(1))          // Only once
        .findById("user-123");
}
```

**Line-by-line explained:**
- `Mockito.spy(realRepo)` — Creates a wrapper around the REAL `JdbcUserRepository`. All calls go through to the real object.
- But we can still verify: `Mockito.verify(spy, Mockito.times(1)).findById(...)` checks it was called exactly once.
- **Spies are for testing caching** — if the cache works, the real method shouldn't be called again.

### 4. Fake (Working Implementation)

```java
// A fake: simplified but working implementation
public class InMemoryUserRepository implements UserRepository {
    private final Map<String, User> store = new ConcurrentHashMap<>();

    @Override
    public Optional<User> findById(String id) {
        return Optional.ofNullable(store.get(id));      // Simple map lookup
    }

    @Override
    public User save(User user) {
        store.put(user.getId(), user);                  // Simple map store
        return user;
    }
}

// Usage in tests:
@Test
void shouldPersistUser() {
    UserRepository fake = new InMemoryUserRepository();  // No database needed!
    OrderService service = new OrderService(fake, emailService);

    service.createUser("user-123", "Alice");

    assertThat(fake.findById("user-123"))
        .isPresent()
        .hasValueSatisfying(user -> assertThat(user.getName()).isEqualTo("Alice"));
}
```

**Line-by-line explained:**
- `InMemoryUserRepository` is a **fake** — it implements the real interface but uses an in-memory `ConcurrentHashMap` instead of a database.
- It's a **working** implementation — `save()` actually stores data, `findById()` actually retrieves it.
- Fakes are the most realistic test doubles — they exercise the actual code paths.

---

## Real-World Scenarios

### Scenario 1: Testing Payment Processing

```java
@SpringBootTest
class PaymentServiceTest {

    @MockBean
    PaymentGateway gateway;                    // Mock the external payment API

    @MockBean
    OrderRepository orderRepo;                 // Mock the database

    @Autowired
    PaymentService paymentService;             // Real service under test

    @Test
    void shouldProcessPaymentSuccessfully() {
        // Arrange: stub the gateway
        when(gateway.charge(any(PaymentRequest.class)))
            .thenReturn(new PaymentResult("txn-123", "SUCCESS"));

        when(orderRepo.findById("order-1"))
            .thenReturn(Optional.of(new Order("order-1", BigDecimal.valueOf(99.99))));

        // Act
        PaymentResult result = paymentService.processPayment("order-1");

        // Assert: verify interactions
        assertThat(result.getTransactionId()).isEqualTo("txn-123");
        verify(gateway).charge(argThat(req ->
            req.getAmount().compareTo(BigDecimal.valueOf(99.99)) == 0
        ));
        verify(orderRepo).save(argThat(order ->
            "PAID".equals(order.getStatus())
        ));
    }

    @Test
    void shouldHandlePaymentFailure() {
        // Arrange: stub the gateway to fail
        when(gateway.charge(any()))
            .thenThrow(new PaymentDeclinedException("Insufficient funds"));

        // Act & Assert
        assertThatThrownBy(() -> paymentService.processPayment("order-1"))
            .isInstanceOf(PaymentDeclinedException.class);

        verify(orderRepo).save(argThat(order ->
            "PAYMENT_FAILED".equals(order.getStatus())    // Order marked as failed
        ));
    }
}
```

### Scenario 2: Argument Captor (Capture and Inspect)

```java
@Test
void shouldSendCorrectEmailContent() {
    ArgumentCaptor<EmailMessage> captor = ArgumentCaptor.forClass(EmailMessage.class);

    // ... setup and act ...

    verify(emailService).send(captor.capture());   // Capture the argument

    EmailMessage sent = captor.getValue();         // Inspect what was actually sent
    assertThat(sent.getSubject()).contains("Order Confirmation");
    assertThat(sent.getBody()).contains("Alice");
    assertThat(sent.getRecipients()).contains("alice@example.com");
}
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Mocking everything | Tests don't verify real behavior | Use mocks for external deps, fakes for internal ones |
| Over-specifying mock expectations | Brittle tests that break on refactoring | Verify behavior, not implementation details |
| Using mocks for value objects | Pointless — just create the real object | Use real objects for simple POJOs/records |
| Not resetting mocks between tests | Shared state causes flaky tests | Use `@BeforeEach` with `Mockito.reset()` or `@MockBean` |
| Stubbing in assertion phase | Tests read backwards | Arrange → Act → Assert (AAA pattern) |

---

## Key Takeaways

- **Stubs** return predefined data. **Mocks** verify interactions. **Fakes** are working implementations. **Spies** wrap real objects.
- **Mockito is the standard** for Java mocking — learn `when/thenReturn`, `verify`, `argThat`, and `ArgumentCaptor`.
- **Use the simplest double that works** — don't mock what you can create as a real object.
- **Fakes > Mocks** for internal dependencies — they're more realistic and less brittle.
- **AAA pattern**: Arrange (set up doubles) → Act (call the method) → Assert (verify results + interactions).

Official docs: [Mockito](https://site.mockito.org/) · [Spring Testing](https://docs.spring.io/spring-framework/reference/testing.html)
