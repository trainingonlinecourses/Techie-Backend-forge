---
title: Testing the Spring Way
summary: Unit vs integration vs slice tests, @SpringBootTest, MockMvc, test slices and Testcontainers.
order: 6
minutes: 20
topics: [testing, springboottest, mockmvc, test-slices, testcontainers]
docs:
  - https://docs.spring.io/spring-boot/reference/testing/index.html
  - https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html
---

# Testing the Spring Way

## The test pyramid in a Spring org

```
        ╱ ╲           few, slow, expensive
       ╱ e2e╲         full app + real infra (Testcontainers)
      ╱──────╲
     ╱  slice ╲       medium: @WebMvcTest, @DataJpaTest
    ╱──────────╲
   ╱   unit    ╲      many, fast: plain JUnit, mock dependencies
  ╱──────────────╲
```

## Unit tests — no Spring needed

```java
class AccountServiceTest {
    @Test
    void debit_fails_when_insufficient_funds() {
        AccountRepository repo = mock(AccountRepository.class);
        AccountService service = new AccountService(repo, mock(EventPublisher.class));
        Account a = new Account("iban-1", Money.zero());
        assertThrows(InsufficientFundsException.class, () -> service.debit(a, Money.of(10)));
    }
}
```

Constructor injection is what makes this possible: dependencies are plain parameters.

## Slice tests — a Spring context, narrowed

```java
@WebMvcTest(AccountController.class)          // MVC layer only
class AccountControllerTest {
    @Autowired MockMvc mockMvc;
    @MockitoBean AccountService service;      // Boot 3.4+ replaces @MockBean

    @Test
    void find_returns_account() throws Exception {
        when(service.findByIban("iban-1"))
                .thenReturn(new AccountView("iban-1", "EUR", 100));
        mockMvc.perform(get("/api/accounts/iban-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.iban").value("iban-1"));
    }
}
```

```java
@DataJpaTest                                        // JPA layer only (in-memory DB)
class AccountRepositoryTest {
    @Autowired AccountRepository accounts;

    @Test
    void findByIban_finds_saved_account() {
        accounts.save(anAccount());
        assertThat(accounts.findByIban("iban-1")).isPresent();
    }
}
```

Test slices start a **narrow** Spring context — fast, and they verify real wiring (validation, converters, mapping).

## Full integration tests

```java
@SpringBootTest                                      // whole app context
@AutoConfigureMockMvc
class AccountApiIntegrationTest {
    @Autowired MockMvc mockMvc;

    @Test
    void create_account_end_to_end() throws Exception {
        mockMvc.perform(post("/api/accounts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"iban":"iban-1","currency":"EUR","openingBalance":100}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.iban").value("iban-1"));
    }
}
```

## Real infrastructure: Testcontainers

When you need a real Postgres/Redis (schema differences, constraints, prod parity):

```java
@Testcontainers
@SpringBootTest
class OrderRepositoryTest {
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", postgres::getJdbcUrl);
        r.add("spring.datasource.username", postgres::getUsername);
        r.add("spring.datasource.password", postgres::getPassword);
    }
    // ... real DB tests
}
```

## The 3 rules of Spring testing

1. **Never `@SpringBootTest` by default** — it's slow; use slices for layer tests.
2. **Test behavior, not implementation** — assert on JSON/state, not on which mocks were called.
3. **Controlled time and randomness** — inject `Clock` and `UUID` suppliers so tests are deterministic.

> **Why it matters (organizational view)** — Tests are the safety net for refactoring and the spec for new hires. Org convention: unit tests for services (fast, most of the suite), slice tests for controllers/repositories, a thin layer of integration tests with Testcontainers for the critical paths, and CI running `mvn verify` on every PR. Test speed is a feature — a 5-minute suite gets run; a 30-minute one gets skipped.

## Key takeaways

- Unit test services with mocks; slice-test web/data layers.
- `@WebMvcTest` + MockMvc for controllers; `@DataJpaTest` for repositories.
- `@SpringBootTest` sparingly; Testcontainers for real infra.
- Inject `Clock`/suppliers for deterministic tests.

**Official docs:** [Testing Boot apps](https://docs.spring.io/spring-boot/reference/testing/index.html) · [Test annotations](https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html)
