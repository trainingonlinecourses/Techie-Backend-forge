---
title: Testing Spring Boot Applications — Unit Tests, Integration Tests, and Test Slices
summary: Why testing matters, unit testing services with Mockito, @SpringBootTest for integration tests, MockMvc for testing REST endpoints without starting the server, @DataJpaTest for repository tests, @MockBean for replacing dependencies, and test organization best practices with line-by-line walkthroughs.
order: 13
minutes: 35
topics: [testing, junit5, mockito, mockmvc, spring-boot-test, datajpatest, mockbean, test-slice, integration-test]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/html/features.html#features.testing
  - https://docs.spring.io/spring-framework/reference/testing.html
---

# Testing Spring Boot Applications — Unit Tests, Integration Tests, and Test Slices

## Why test?

**Beginner mental model:** Tests are like a safety net for trapeze artists. Without them, you might fly high — but one mistake sends you crashing. With tests, you can refactor, add features, and fix bugs with confidence.

**Types of tests:**
- **Unit tests**: Test one class in isolation (fast, no Spring context needed).
- **Integration tests**: Test multiple classes working together (with Spring context, database).
- **End-to-end tests**: Test the full system including HTTP requests (slowest, most comprehensive).

## Unit testing with JUnit 5 + Mockito


**What this code does — step by step:**

1. @ExtendWith(MockitoExtension.class) — enables Mockito annotations. We're testing OrderService IN ISOLATION — mocking all dependencies
2. @Mock — creates a fake/mock version of OrderRepository. It does nothing by default — we configure its behavior manually
3. @InjectMocks — creates OrderService and injects the mocks into it. This is like: new OrderService(orderRepository, paymentService). But with fake dependencies instead of real ones
4. ARRANGE — set up test data and mock behavior
5. `when(paymentService.charge("Alice", 29.99))` — when charge() is called...
6. `.thenReturn(new PaymentResult(true, "txn_123"));` — ...return success
7. `when(orderRepository.save(any(Order.class)))` — when save() is called...
8. `Order order = invocation.getArgument(0);` — get the Order argument
9. `order.setId(1L);` — simulate database assigning an ID
10. ACT — call the method being tested
11. ASSERT — verify the result is correct
12. `assertNotNull(result);` — result is not null
13. `assertEquals("Alice", result.getCustomerName());` — customer name matches
14. `assertEquals(29.99, result.getTotalAmount());` — amount matches
15. `assertEquals("txn_123", result.getPaymentTxnId());` — payment transaction ID
16. VERIFY — ensure mock methods were called correctly
17. `verify(paymentService).charge("Alice", 29.99);` — charge was called once
18. `verify(orderRepository).save(any(Order.class));` — save was called once
19. ARRANGE — payment service returns failure
20. `.thenReturn(new PaymentResult(false, null));` — payment failed
21. ACT + ASSERT — expect exception
22. `() -> orderService.createOrder(request));` — should throw
23. `assertEquals("Payment declined", ex.getMessage());` — with correct message
24. VERIFY — save was NEVER called (payment failed first)

The same code, clean:

```java
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private PaymentService paymentService;

    @InjectMocks
    private OrderService orderService;

    @Test
    @DisplayName("should create order when payment succeeds")
    void createOrder_success() {
        CreateOrderRequest request = new CreateOrderRequest("Alice", List.of("Widget"), 29.99);
        when(paymentService.charge("Alice", 29.99))
            .thenReturn(new PaymentResult(true, "txn_123"));
        when(orderRepository.save(any(Order.class)))
            .thenAnswer(invocation -> {
                Order order = invocation.getArgument(0);
                order.setId(1L);
                return order;
            });

        Order result = orderService.createOrder(request);

        assertNotNull(result);
        assertEquals("Alice", result.getCustomerName());
        assertEquals(29.99, result.getTotalAmount());
        assertEquals("txn_123", result.getPaymentTxnId());

        verify(paymentService).charge("Alice", 29.99);
        verify(orderRepository).save(any(Order.class));
    }

    @Test
    @DisplayName("should throw exception when payment fails")
    void createOrder_paymentFails() {
        CreateOrderRequest request = new CreateOrderRequest("Alice", List.of("Widget"), 29.99);
        when(paymentService.charge("Alice", 29.99))
            .thenReturn(new PaymentResult(false, null));

        PaymentException ex = assertThrows(PaymentException.class,
            () -> orderService.createOrder(request));
        assertEquals("Payment declined", ex.getMessage());

        verify(orderRepository, never()).save(any());
    }
}
```

## @SpringBootTest — full integration test


**What this code does — step by step:**

1. @SpringBootTest loads the ENTIRE Spring context — database, beans, everything. It's slow (2-10 seconds) but tests the real wiring
2. `private TestRestTemplate restTemplate;` — HTTP client for testing (auto-configured)
3. `private UserRepository userRepository;` — real database repository
4. `userRepository.deleteAll();` — clean database before each test
5. Create a user
6. `assertEquals(201, createResponse.getStatusCodeValue());` — HTTP 201 Created
7. `assertNotNull(createResponse.getBody().id());` — ID was assigned
8. Retrieve the user
9. `assertEquals(200, getResponse.getStatusCodeValue());` — HTTP 200 OK
10. `assertEquals("Alice", getResponse.getBody().name());` — name matches
11. `assertEquals(404, response.getStatusCodeValue());` — HTTP 404 Not Found

The same code, clean:

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class UserControllerIntegrationTest {

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private UserRepository userRepository;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();
    }

    @Test
    void shouldCreateAndRetrieveUser() {
        CreateUserRequest request = new CreateUserRequest("Alice", "alice@example.com", "password123");
        ResponseEntity<UserResponse> createResponse = restTemplate.postForEntity(
            "/api/users", request, UserResponse.class);

        assertEquals(201, createResponse.getStatusCodeValue());
        assertNotNull(createResponse.getBody().id());

        Long id = createResponse.getBody().id();
        ResponseEntity<UserResponse> getResponse = restTemplate.getForEntity(
            "/api/users/" + id, UserResponse.class);

        assertEquals(200, getResponse.getStatusCodeValue());
        assertEquals("Alice", getResponse.getBody().name());
        assertEquals("alice@example.com", getResponse.getBody().email());
    }

    @Test
    void shouldReturn404ForNonexistentUser() {
        ResponseEntity<UserResponse> response = restTemplate.getForEntity(
            "/api/users/999", UserResponse.class);

        assertEquals(404, response.getStatusCodeValue());
    }
}
```

## @WebMvcTest — testing controllers without the database


**What this code does — step by step:**

1. @WebMvcTest loads ONLY the web layer — controllers, filters, converters. It does NOT load services, repositories, or database connections. Much faster than @SpringBootTest (500ms vs 5 seconds)
2. `private MockMvc mockMvc;` — simulates HTTP requests without starting a real server
3. @MockBean creates a mock UserService and places it in the Spring context. The controller gets this mock instead of the real UserService
4. ARRANGE — mock the service
5. ACT + ASSERT — perform HTTP request and verify response
6. `get("/api/users/1")` — simulate GET /api/users/1
7. `.accept(MediaType.APPLICATION_JSON))` — accept JSON response
8. `.andExpect(status().isOk())` — expect HTTP 200
9. `.andExpect(jsonPath("$.name").value("Alice"))` — JSON field "name" = "Alice"
10. `.andExpect(status().isNotFound());` — expect HTTP 404
11. `post("/api/users")` — simulate POST /api/users
12. `.contentType(MediaType.APPLICATION_JSON)` — send JSON body
13. `.andExpect(status().isCreated())` — expect HTTP 201

The same code, clean:

```java
@WebMvcTest(UserController.class)
class UserControllerWebTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;

    @Test
    void shouldReturnUserWhenFound() throws Exception {
        when(userService.findById(1L))
            .thenReturn(new UserResponse(1L, "Alice", "alice@example.com", Instant.now()));

        mockMvc.perform(
                get("/api/users/1")
                    .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Alice"))
            .andExpect(jsonPath("$.email").value("alice@example.com"));
    }

    @Test
    void shouldReturn404WhenUserNotFound() throws Exception {
        when(userService.findById(999L))
            .thenThrow(new UserNotFoundException(999L));

        mockMvc.perform(get("/api/users/999"))
            .andExpect(status().isNotFound());
    }

    @Test
    void shouldCreateUser() throws Exception {
        CreateUserRequest request = new CreateUserRequest("Bob", "bob@example.com", "password123");
        UserResponse response = new UserResponse(2L, "Bob", "bob@example.com", Instant.now());

        when(userService.create(any(CreateUserRequest.class))).thenReturn(response);

        mockMvc.perform(
                post("/api/users")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"Bob\",\"email\":\"bob@example.com\",\"password\":\"password123\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value(2))
            .andExpect(jsonPath("$.name").value("Bob"));
    }
}
```

## @DataJpaTest — testing repositories with a real database


**What this code does — step by step:**

1. @DataJpaTest loads ONLY the data layer — entities, repositories, database. It uses an embedded H2 database by default (in-memory, fast)
2. `private TestEntityManager entityManager;` — for direct database operations in tests
3. ARRANGE — persist a user directly
4. `entityManager.persistAndFlush(user);` — save to H2 database
5. ACT
6. ASSERT

The same code, clean:

```java
@DataJpaTest
class UserRepositoryTest {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TestEntityManager entityManager;

    @Test
    void shouldFindByEmail() {
        User user = new User("Alice", "alice@example.com", 30);
        entityManager.persistAndFlush(user);

        Optional<User> found = userRepository.findByEmail("alice@example.com");

        assertTrue(found.isPresent());
        assertEquals("Alice", found.get().getName());
    }

    @Test
    void shouldReturnEmptyForUnknownEmail() {
        Optional<User> found = userRepository.findByEmail("unknown@example.com");
        assertFalse(found.isPresent());
    }
}
```

## @MockBean — replacing beans in the test context


**What this code does — step by step:**

1. @MockBean replaces the real EmailService with a mock in the Spring context. This prevents ACTUAL emails from being sent during tests!
2. Arrange
3. Act
4. Verify — email was sent with the correct arguments

The same code, clean:

```java
@SpringBootTest
class NotificationServiceTest {

    @MockBean
    private EmailService emailService;

    @Autowired
    private NotificationService notificationService;

    @Test
    void shouldSendWelcomeEmail() {
        when(emailService.send(anyString(), anyString(), anyString()))
            .thenReturn(true);

        notificationService.sendWelcome("alice@example.com");

        verify(emailService).send(
            eq("alice@example.com"),
            eq("Welcome to our platform!"),
            contains("Alice")
        );
    }
}
```

## Test organization — best practices


**What this code does — step by step:**

1. DIRECTORY STRUCTURE: src/test/java/. ├── com/backendforge/academy/. │ ├── unit/ ← pure unit tests (no Spring). │ │ ├── OrderServiceTest.java. │ │ └── PaymentValidatorTest.java. │ ├── integration/ ← @SpringBootTest tests. │ │ ├── UserRepositoryIntegrationTest.java. │ │ └── OrderFlowIntegrationTest.java. │ └── web/ ← @WebMvcTest tests. │ ├── UserControllerWebTest.java. │ └── GlobalExceptionHandlerTest.java
2. NAMING CONVENTION: shouldExpectedBehaviorWhenCondition()

The same code, clean:

```java
@Test
void shouldReturnOrderWhenValidIdProvided() { ... }

@Test
void shouldThrowExceptionWhenOrderNotFound() { ... }

@Test
void shouldRejectInvalidEmail() { ... }
```

## How we use it in organizations

### Scenario 1: Test-driven development (TDD) for a new feature


**What this code does — step by step:**

1. Step 1: Write a failing test FIRST
2. `assertEquals(Money.of(80.00), discounted);` — 20% discount for premium
3. Step 2: Run the test — it FAILS (discountService doesn't exist yet). Step 3: Write the MINIMUM code to make the test pass. Step 4: Refactor — clean up without breaking the test

The same code, clean:

```java
@Test
void shouldCalculateDiscountForPremiumUsers() {
    User premiumUser = new User("Alice", UserTier.PREMIUM);
    Money originalPrice = Money.of(100.00);

    Money discounted = discountService.calculate(originalPrice, premiumUser);

    assertEquals(Money.of(80.00), discounted);
}
```

### Scenario 2: Testing error scenarios


**What this code does — step by step:**

1. `"alice@example.com, true",` — valid email
2. `"bob@test.org, true",` — valid email
3. `"not-an-email, false",` — no @
4. `"@missing.com, false",` — no local part
5. `"missing@.com, false",` — no domain
6. `"'', false"` — empty

The same code, clean:

```java
@ParameterizedTest
@CsvSource({
    "alice@example.com, true",
    "bob@test.org, true",
    "not-an-email, false",
    "@missing.com, false",
    "missing@.com, false",
    "'', false"
})
void shouldValidateEmail(String email, boolean expected) {
    assertEquals(expected, emailValidator.isValid(email));
}
```

### Scenario 3: Test data builders — readable test setup

// Instead of creating complex objects manually:
public class UserTestFixture {
    public static User.UserBuilder aUser() {
        return User.builder()
            .name("Test User")
            .email("test@example.com")
            .age(25)
            .tier(UserTier.STANDARD);
    }
}

// Usage in tests — readable and maintainable
@Test
void shouldUpgradePremiumUser() {
    User user = aUser().tier(UserTier.PREMIUM).build();  // override only what matters
    // ... test logic
}

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Testing implementation details | Tests break when refactoring | Test behavior, not implementation |
| Too many @SpringBootTest | Slow test suite | Use @WebMvcTest or @DataJpaTest when possible |
| Not mocking external services | Tests call real APIs, send real emails | Always mock external dependencies |
| Test methods that depend on each other | Fragile test suite | Each test should be independent |
| Catching exceptions in tests | Hides test failures | Let exceptions propagate, use assertThrows |
| Using @Autowired for everything in tests | Slow, loads unnecessary context | Use @MockBean for dependencies you don't need |

## References

- [Codecademy — Learn Java course](https://www.codecademy.com/learn/learn-java)
- [docs.spring.io/spring-boot/reference](https://docs.spring.io/spring-boot/reference/)
