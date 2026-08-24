---
title: Testing Spring Boot Applications — Unit Tests, Integration Tests, and Test Slices
summary: Why testing matters, unit testing services with Mockito, @SpringBootTest for integration tests, MockMvc for testing REST endpoints without starting the server, @DataJpaTest for repository tests, @MockBean for replacing dependencies, and test organization best practices with line-by-line walkthroughs.
order: 3
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

```java
// @ExtendWith(MockitoExtension.class) — enables Mockito annotations
// We're testing OrderService IN ISOLATION — mocking all dependencies
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    // @Mock — creates a fake/mock version of OrderRepository
    // It does nothing by default — we configure its behavior manually
    @Mock
    private OrderRepository orderRepository;

    @Mock
    private PaymentService paymentService;

    // @InjectMocks — creates OrderService and injects the mocks into it
    // This is like: new OrderService(orderRepository, paymentService)
    // but with fake dependencies instead of real ones
    @InjectMocks
    private OrderService orderService;

    @Test
    @DisplayName("should create order when payment succeeds")
    void createOrder_success() {
        // ARRANGE — set up test data and mock behavior
        CreateOrderRequest request = new CreateOrderRequest("Alice", List.of("Widget"), 29.99);
        when(paymentService.charge("Alice", 29.99))     // when charge() is called...
            .thenReturn(new PaymentResult(true, "txn_123"));  // ...return success
        when(orderRepository.save(any(Order.class)))     // when save() is called...
            .thenAnswer(invocation -> {
                Order order = invocation.getArgument(0);  // get the Order argument
                order.setId(1L);                           // simulate database assigning an ID
                return order;
            });

        // ACT — call the method being tested
        Order result = orderService.createOrder(request);

        // ASSERT — verify the result is correct
        assertNotNull(result);                              // result is not null
        assertEquals("Alice", result.getCustomerName());   // customer name matches
        assertEquals(29.99, result.getTotalAmount());       // amount matches
        assertEquals("txn_123", result.getPaymentTxnId()); // payment transaction ID

        // VERIFY — ensure mock methods were called correctly
        verify(paymentService).charge("Alice", 29.99);     // charge was called once
        verify(orderRepository).save(any(Order.class));     // save was called once
    }

    @Test
    @DisplayName("should throw exception when payment fails")
    void createOrder_paymentFails() {
        // ARRANGE — payment service returns failure
        CreateOrderRequest request = new CreateOrderRequest("Alice", List.of("Widget"), 29.99);
        when(paymentService.charge("Alice", 29.99))
            .thenReturn(new PaymentResult(false, null));  // payment failed

        // ACT + ASSERT — expect exception
        PaymentException ex = assertThrows(PaymentException.class,
            () -> orderService.createOrder(request));       // should throw
        assertEquals("Payment declined", ex.getMessage());  // with correct message

        // VERIFY — save was NEVER called (payment failed first)
        verify(orderRepository, never()).save(any());
    }
}
```

## @SpringBootTest — full integration test

```java
// @SpringBootTest loads the ENTIRE Spring context — database, beans, everything
// It's slow (2-10 seconds) but tests the real wiring
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class UserControllerIntegrationTest {

    @Autowired
    private TestRestTemplate restTemplate;  // HTTP client for testing (auto-configured)

    @Autowired
    private UserRepository userRepository;  // real database repository

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();  // clean database before each test
    }

    @Test
    void shouldCreateAndRetrieveUser() {
        // Create a user
        CreateUserRequest request = new CreateUserRequest("Alice", "alice@example.com", "password123");
        ResponseEntity<UserResponse> createResponse = restTemplate.postForEntity(
            "/api/users", request, UserResponse.class);

        assertEquals(201, createResponse.getStatusCodeValue());          // HTTP 201 Created
        assertNotNull(createResponse.getBody().id());                     // ID was assigned

        // Retrieve the user
        Long id = createResponse.getBody().id();
        ResponseEntity<UserResponse> getResponse = restTemplate.getForEntity(
            "/api/users/" + id, UserResponse.class);

        assertEquals(200, getResponse.getStatusCodeValue());             // HTTP 200 OK
        assertEquals("Alice", getResponse.getBody().name());             // name matches
        assertEquals("alice@example.com", getResponse.getBody().email());
    }

    @Test
    void shouldReturn404ForNonexistentUser() {
        ResponseEntity<UserResponse> response = restTemplate.getForEntity(
            "/api/users/999", UserResponse.class);

        assertEquals(404, response.getStatusCodeValue());                // HTTP 404 Not Found
    }
}
```

## @WebMvcTest — testing controllers without the database

```java
// @WebMvcTest loads ONLY the web layer — controllers, filters, converters
// It does NOT load services, repositories, or database connections
// Much faster than @SpringBootTest (500ms vs 5 seconds)
@WebMvcTest(UserController.class)
class UserControllerWebTest {

    @Autowired
    private MockMvc mockMvc;  // simulates HTTP requests without starting a real server

    // @MockBean creates a mock UserService and places it in the Spring context
    // The controller gets this mock instead of the real UserService
    @MockBean
    private UserService userService;

    @Test
    void shouldReturnUserWhenFound() throws Exception {
        // ARRANGE — mock the service
        when(userService.findById(1L))
            .thenReturn(new UserResponse(1L, "Alice", "alice@example.com", Instant.now()));

        // ACT + ASSERT — perform HTTP request and verify response
        mockMvc.perform(
                get("/api/users/1")                      // simulate GET /api/users/1
                    .accept(MediaType.APPLICATION_JSON))  // accept JSON response
            .andExpect(status().isOk())                   // expect HTTP 200
            .andExpect(jsonPath("$.name").value("Alice")) // JSON field "name" = "Alice"
            .andExpect(jsonPath("$.email").value("alice@example.com"));
    }

    @Test
    void shouldReturn404WhenUserNotFound() throws Exception {
        when(userService.findById(999L))
            .thenThrow(new UserNotFoundException(999L));

        mockMvc.perform(get("/api/users/999"))
            .andExpect(status().isNotFound());            // expect HTTP 404
    }

    @Test
    void shouldCreateUser() throws Exception {
        CreateUserRequest request = new CreateUserRequest("Bob", "bob@example.com", "password123");
        UserResponse response = new UserResponse(2L, "Bob", "bob@example.com", Instant.now());

        when(userService.create(any(CreateUserRequest.class))).thenReturn(response);

        mockMvc.perform(
                post("/api/users")                        // simulate POST /api/users
                    .contentType(MediaType.APPLICATION_JSON)  // send JSON body
                    .content("{\"name\":\"Bob\",\"email\":\"bob@example.com\",\"password\":\"password123\"}"))
            .andExpect(status().isCreated())               // expect HTTP 201
            .andExpect(jsonPath("$.id").value(2))
            .andExpect(jsonPath("$.name").value("Bob"));
    }
}
```

## @DataJpaTest — testing repositories with a real database

```java
// @DataJpaTest loads ONLY the data layer — entities, repositories, database
// It uses an embedded H2 database by default (in-memory, fast)
@DataJpaTest
class UserRepositoryTest {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TestEntityManager entityManager;  // for direct database operations in tests

    @Test
    void shouldFindByEmail() {
        // ARRANGE — persist a user directly
        User user = new User("Alice", "alice@example.com", 30);
        entityManager.persistAndFlush(user);  // save to H2 database

        // ACT
        Optional<User> found = userRepository.findByEmail("alice@example.com");

        // ASSERT
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

```java
@SpringBootTest
class NotificationServiceTest {

    // @MockBean replaces the real EmailService with a mock in the Spring context
    // This prevents ACTUAL emails from being sent during tests!
    @MockBean
    private EmailService emailService;

    @Autowired
    private NotificationService notificationService;

    @Test
    void shouldSendWelcomeEmail() {
        // Arrange
        when(emailService.send(anyString(), anyString(), anyString()))
            .thenReturn(true);

        // Act
        notificationService.sendWelcome("alice@example.com");

        // Verify — email was sent with the correct arguments
        verify(emailService).send(
            eq("alice@example.com"),
            eq("Welcome to our platform!"),
            contains("Alice")
        );
    }
}
```

## Test organization — best practices

```java
// DIRECTORY STRUCTURE:
// src/test/java/
// ├── com/backendforge/academy/
// │   ├── unit/                          ← pure unit tests (no Spring)
// │   │   ├── OrderServiceTest.java
// │   │   └── PaymentValidatorTest.java
// │   ├── integration/                   ← @SpringBootTest tests
// │   │   ├── UserRepositoryIntegrationTest.java
// │   │   └── OrderFlowIntegrationTest.java
// │   └── web/                           ← @WebMvcTest tests
// │       ├── UserControllerWebTest.java
// │       └── GlobalExceptionHandlerTest.java

// NAMING CONVENTION: shouldExpectedBehaviorWhenCondition()
@Test
void shouldReturnOrderWhenValidIdProvided() { ... }

@Test
void shouldThrowExceptionWhenOrderNotFound() { ... }

@Test
void shouldRejectInvalidEmail() { ... }
```

## How we use it in organizations

### Scenario 1: Test-driven development (TDD) for a new feature

```java
// Step 1: Write a failing test FIRST
@Test
void shouldCalculateDiscountForPremiumUsers() {
    User premiumUser = new User("Alice", UserTier.PREMIUM);
    Money originalPrice = Money.of(100.00);

    Money discounted = discountService.calculate(originalPrice, premiumUser);

    assertEquals(Money.of(80.00), discounted);  // 20% discount for premium
}

// Step 2: Run the test — it FAILS (discountService doesn't exist yet)
// Step 3: Write the MINIMUM code to make the test pass
// Step 4: Refactor — clean up without breaking the test
```

### Scenario 2: Testing error scenarios

```java
@ParameterizedTest
@CsvSource({
    "alice@example.com, true",      // valid email
    "bob@test.org, true",          // valid email
    "not-an-email, false",         // no @
    "@missing.com, false",         // no local part
    "missing@.com, false",         // no domain
    "'', false"                    // empty
})
void shouldValidateEmail(String email, boolean expected) {
    assertEquals(expected, emailValidator.isValid(email));
}
```

### Scenario 3: Test data builders — readable test setup

```java
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
```

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Testing implementation details | Tests break when refactoring | Test behavior, not implementation |
| Too many @SpringBootTest | Slow test suite | Use @WebMvcTest or @DataJpaTest when possible |
| Not mocking external services | Tests call real APIs, send real emails | Always mock external dependencies |
| Test methods that depend on each other | Fragile test suite | Each test should be independent |
| Catching exceptions in tests | Hides test failures | Let exceptions propagate, use assertThrows |
| Using @Autowired for everything in tests | Slow, loads unnecessary context | Use @MockBean for dependencies you don't need |
