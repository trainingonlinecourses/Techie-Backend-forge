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


**What this code does — step by step:**

1. The real dependency:
2. A stub: returns whatever you tell it to
3. Arrange: create a stub that always returns a specific user
4. `Mockito.when(stub.findById("user-123"))` — When findById is called
5. `.thenReturn(Optional.of(new User("user-123", "Alice")));` — Return this user
6. Act: use the stub in your service
7. Assert: verify the result

The same code, clean:

```java
public interface UserRepository {
    Optional<User> findById(String id);
    User save(User user);
}

@Test
void shouldProcessOrder() {
    UserRepository stub = Mockito.mock(UserRepository.class);
    Mockito.when(stub.findById("user-123"))
        .thenReturn(Optional.of(new User("user-123", "Alice")));

    OrderService service = new OrderService(stub);
    Order order = service.createOrder("user-123", List.of(item1));

    assertThat(order.getUserId()).isEqualTo("user-123");
    assertThat(order.getStatus()).isEqualTo(OrderStatus.CREATED);
}
```

**Line-by-line explained:**
- `Mockito.mock(UserRepository.class)` — Creates a fake implementation of `UserRepository`. Every method returns null/empty by default.
- `Mockito.when(stub.findById("user-123")).thenReturn(...)` — **Stubbing**: when this specific method is called with this specific argument, return this specific value.
- The test never touches a real database — it uses the stub's predefined response.

### 2. Mock (Verify Interactions)


**What this code does — step by step:**

1. Arrange: create a mock
2. Act: use the mock in the service under test
3. Assert: verify the mock was called with the right arguments
4. `Mockito.verify(mockEmail)` — Check this mock
5. `.sendOrderConfirmation(` — This method was called
6. `Mockito.eq("user-123"),` — With this argument
7. `Mockito.argThat(order ->` — And this argument matches
8. If sendOrderConfirmation was NOT called → test fails! If called with wrong arguments → test fails!

The same code, clean:

```java
@Test
void shouldSendEmailWhenOrderCreated() {
    EmailService mockEmail = Mockito.mock(EmailService.class);

    OrderService service = new OrderService(userRepo, mockEmail);
    service.createOrder("user-123", List.of(item1));

    Mockito.verify(mockEmail)
        .sendOrderConfirmation(
            Mockito.eq("user-123"),
            Mockito.argThat(order ->
                order.getStatus() == OrderStatus.CREATED &&
                order.getTotal().compareTo(BigDecimal.ZERO) > 0
            )
        );
}
```

**Line-by-line explained:**
- `Mockito.verify(mockEmail)` — Now we're in **verification mode**. We're checking that a method WAS called.
- `.sendOrderConfirmation(Mockito.eq("user-123"), ...)` — Assert the first argument was exactly "user-123".
- `Mockito.argThat(order -> ...)` — Custom argument matcher — the second argument must satisfy this condition.
- **Mocks verify behavior** (was this method called?), while **stubs verify state** (did this return the right thing?).

### 3. Spy (Record Calls on Real Objects)


**What this code does — step by step:**

1. Arrange: spy on a REAL repository
2. `UserRepository spy = Mockito.spy(realRepo);` — Wraps real object, records all calls
3. Act: call twice
4. Assert: findById was called only ONCE (second call used cache)
5. `Mockito.verify(spy, Mockito.times(1))` — Only once

The same code, clean:

```java
@Test
void shouldCacheUserAfterFirstLookup() {
    UserRepository realRepo = new JdbcUserRepository(dataSource);
    UserRepository spy = Mockito.spy(realRepo);

    OrderService service = new OrderService(spy, emailService);

    service.createOrder("user-123", List.of(item1));
    service.createOrder("user-123", List.of(item2));

    Mockito.verify(spy, Mockito.times(1))
        .findById("user-123");
}
```

**Line-by-line explained:**
- `Mockito.spy(realRepo)` — Creates a wrapper around the REAL `JdbcUserRepository`. All calls go through to the real object.
- But we can still verify: `Mockito.verify(spy, Mockito.times(1)).findById(...)` checks it was called exactly once.
- **Spies are for testing caching** — if the cache works, the real method shouldn't be called again.

### 4. Fake (Working Implementation)


**What this code does — step by step:**

1. A fake: simplified but working implementation
2. `return Optional.ofNullable(store.get(id));` — Simple map lookup
3. `store.put(user.getId(), user);` — Simple map store
4. Usage in tests:
5. `UserRepository fake = new InMemoryUserRepository();` — No database needed!

The same code, clean:

```java
public class InMemoryUserRepository implements UserRepository {
    private final Map<String, User> store = new ConcurrentHashMap<>();

    @Override
    public Optional<User> findById(String id) {
        return Optional.ofNullable(store.get(id));
    }

    @Override
    public User save(User user) {
        store.put(user.getId(), user);
        return user;
    }
}

@Test
void shouldPersistUser() {
    UserRepository fake = new InMemoryUserRepository();
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


**What this code does — step by step:**

1. `PaymentGateway gateway;` — Mock the external payment API
2. `OrderRepository orderRepo;` — Mock the database
3. `PaymentService paymentService;` — Real service under test
4. Arrange: stub the gateway
5. Act
6. Assert: verify interactions
7. Arrange: stub the gateway to fail
8. Act & Assert
9. `"PAYMENT_FAILED".equals(order.getStatus())` — Order marked as failed

The same code, clean:

```java
@SpringBootTest
class PaymentServiceTest {

    @MockBean
    PaymentGateway gateway;

    @MockBean
    OrderRepository orderRepo;

    @Autowired
    PaymentService paymentService;

    @Test
    void shouldProcessPaymentSuccessfully() {
        when(gateway.charge(any(PaymentRequest.class)))
            .thenReturn(new PaymentResult("txn-123", "SUCCESS"));

        when(orderRepo.findById("order-1"))
            .thenReturn(Optional.of(new Order("order-1", BigDecimal.valueOf(99.99))));

        PaymentResult result = paymentService.processPayment("order-1");

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
        when(gateway.charge(any()))
            .thenThrow(new PaymentDeclinedException("Insufficient funds"));

        assertThatThrownBy(() -> paymentService.processPayment("order-1"))
            .isInstanceOf(PaymentDeclinedException.class);

        verify(orderRepo).save(argThat(order ->
            "PAYMENT_FAILED".equals(order.getStatus())
        ));
    }
}
```

### Scenario 2: Argument Captor (Capture and Inspect)

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

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [junit.org/junit5/docs/current/user-guide](https://junit.org/junit5/docs/current/user-guide/)
