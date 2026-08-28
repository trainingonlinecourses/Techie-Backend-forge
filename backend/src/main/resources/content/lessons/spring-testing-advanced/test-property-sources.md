---
title: Test Property Sources — Configuring Test Environments
summary: @TestPropertySource, @DynamicPropertySource, test profiles, and how to isolate tests from external dependencies like databases and APIs. Beginner-friendly with line-by-line code.
order: 8
minutes: 18
topics: [test properties, @TestPropertySource, @DynamicPropertySource, test profiles, test configuration, property override]
docs:
  - https://docs.spring.io/spring-framework/reference/testing.html#testcontext-ctx-management-env-profiles
  - https://docs.spring.io/spring-boot/reference/testing/spring-boot-tests.html#autoconfigured-tests
---

# Test Property Sources — Configuring Test Environments

## Why Test Properties Matter (From Zero)

Your `application.yml` has production database URLs, API keys, and service endpoints. When running tests, you don't want to connect to the production database or call the real payment API. **Test property sources** let you override specific properties for tests without affecting the main configuration.

Think of it like a hotel room: the main config is the hotel's standard room setup, but test configs are like sticky notes that say "use this soap instead" or "turn off the TV."

---

## The Code — Line by Line

### 1. @TestPropertySource (Static Properties)

```java
@SpringBootTest
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:testdb",        // Override: in-memory database
    "spring.datasource.driver-class-name=org.h2.Driver", // Override: H2 driver
    "app.jwt.secret=test-secret-key-for-testing-only",   // Override: test JWT secret
    "app.payment.gateway.url=http://localhost:9999"       // Override: mock payment service
})
class OrderServiceTest {

    @Autowired
    private OrderService orderService;

    @Test
    void shouldCreateOrder() {
        // This test uses the TEST properties, not production
        // H2 in-memory database, not PostgreSQL
        // Mock payment URL, not real Stripe
    }
}
```

**Line-by-line explained:**
- `@TestPropertySource(properties = {...})` — Overrides specific properties for this test class only. The main `application.yml` is still loaded for everything else.
- `spring.datasource.url=jdbc:h2:mem:testdb` — Tests use an in-memory H2 database. Fast, isolated, no cleanup needed.
- `app.jwt.secret=test-secret-key...` — Use a test JWT secret. Don't use the production secret in tests!

### 2. @DynamicPropertySource (For Containers)

```java
@SpringBootTest
@Testcontainers
class OrderServiceIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
        .withDatabaseName("testdb")
        .withUsername("test")
        .withPassword("test");

    @Container
    static GenericContainer<?> redis = new GenericContainer<>("redis:7")
        .withExposedPorts(6379);

    @DynamicPropertySource    // Properties are set at RUNTIME (after containers start)
    static void configureProperties(DynamicPropertyRegistry registry) {
        // PostgreSQL — random port assigned by Testcontainers
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);

        // Redis — random port assigned by Testcontainers
        registry.add("spring.data.redis.host", redis::getHost);
        registry.add("spring.data.redis.port", () -> redis.getMappedPort(6379));
    }
}
```

**Line-by-line explained:**
- `@Testcontainers` — Enables Testcontainers support in Spring Boot.
- `@Container` — Starts a PostgreSQL and Redis container before tests, stops after.
- `@DynamicPropertySource` — Sets properties that depend on container runtime (random ports, generated credentials).
- `registry.add("spring.datasource.url", postgres::getJdbcUrl)` — The JDBC URL is only known AFTER the container starts, so we use a dynamic property.

### 3. Test Profiles

```java
// application-test.yml — dedicated test configuration
spring:
  datasource:
    url: jdbc:h2:mem:testdb
    driver-class-name: org.h2.Driver
  jpa:
    hibernate:
      ddl-auto: create-drop                # Create schema fresh for each test run
    show-sql: true                          # Log SQL in tests for debugging

app:
  payment:
    gateway:
      url: http://localhost:9999            # Mock payment service
    mock-enabled: true                      # Enable payment mocking

logging:
  level:
    com.example.academy: DEBUG              # Verbose logging for debugging
```

```java
@SpringBootTest
@ActiveProfiles("test")                     // Activate the test profile
class PaymentServiceTest {

    @Test
    void shouldMockPaymentGateway() {
        // Uses application-test.yml properties
        // Mock payment service is enabled
        // H2 in-memory database
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Database Per Developer

```java
@SpringBootTest
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:postgresql://localhost:5432/test_${user.name}"
    // Each developer gets their own database:
    // test_alice, test_bob, test_charlie
})
class DeveloperIntegrationTest {
    // No conflicts between developers running tests simultaneously
}
```

### Scenario 2: Mock External Services

```java
@SpringBootTest
@TestPropertySource(properties = {
    "app.services.payment.url=http://localhost:8082",
    "app.services.email.url=http://localhost:8083",
    "app.services.sms.url=http://localhost:8084"
})
@Testcontainers
class EndToEndTest {

    @Container
    static MockServerContainer paymentMock = new MockServerContainer("mockserver/mockserver:latest");

    @Container
    static MockServerContainer emailMock = new MockServerContainer("mockserver/mockserver:latest");

    @DynamicPropertySource
    static void mockServices(DynamicPropertyRegistry registry) {
        registry.add("app.services.payment.url", () ->
            "http://" + paymentMock.getHost() + ":" + paymentMock.getServerPort());
        registry.add("app.services.email.url", () ->
            "http://" + emailMock.getHost() + ":" + emailMock.getServerPort());
    }
}
```

### Scenario 3: CI/CD Pipeline Properties

```yaml
# In CI, environment variables override test properties:
# CI environment:
SPRING_DATASOURCE_URL=jdbc:postgresql://ci-db:5432/ci_test
SPRING_DATASOURCE_USERNAME=ci_user
SPRING_DATASOURCE_PASSWORD=ci_password
```

```java
// application.yml uses environment variables:
spring:
  datasource:
    url: ${SPRING_DATASOURCE_URL:jdbc:h2:mem:default}     // Default to H2 if not set
    username: ${SPRING_DATASOURCE_USERNAME:sa}             // Default to 'sa' if not set
    password: ${SPRING_DATASOURCE_PASSWORD:}               // Default to empty if not set
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Hardcoded test URLs | Breaks when ports/config changes | Use `@DynamicPropertySource` for containers |
| Using production secrets in tests | Security risk, tests hit real services | Override secrets with test values |
| Not using @ActiveProfiles("test") | Test loads production config | Always activate the test profile |
| Forgetting @TestPropertySource scope | Properties affect all test classes | Use class-level annotation |
| Not cleaning up test databases | Tests affect each other | Use `create-drop` or `@Transactional` |

---

## Key Takeaways

- **`@TestPropertySource`** overrides specific properties for tests (static, known at compile time).
- **`@DynamicPropertySource`** overrides properties that depend on runtime values (container ports).
- **`@ActiveProfiles("test")`** activates a test-specific configuration file.
- **Testcontainers + Dynamic properties** = real database in tests without hardcoded ports.
- **Always override secrets and URLs** — never use production values in tests.

Official docs: [Test Properties (Spring)](https://docs.spring.io/spring-framework/reference/testing.html) · [Testcontainers (Spring Boot)](https://docs.spring.io/spring-boot/reference/testing/spring-boot-tests.html#autoconfigured-tests)
