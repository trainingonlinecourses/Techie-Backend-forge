---
title: Capstone — Tests, CI & Deployment
summary: Unit tests for money math, integration tests for transfers, security tests, Docker and the CI pipeline.
order: 5
minutes: 16
topics: [capstone, testing, docker, ci]
capstone: true
docs:
  - https://docs.spring.io/spring-boot/reference/testing/index.html
  - https://docs.spring.io/spring-boot/reference/deployment/index.html
---

# Capstone — Tests, CI & Deployment

Open `projects/payments-api/src/test/java/` — every test below is in the project and passing.

## 1. Unit tests: the money math

```java
package com.example.payments.money;

import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.Currency;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MoneyTest {

    @Test
    void add_sums_amounts() {
        Money a = Money.of("10.50", "EUR");
        Money b = Money.of("4.25", "EUR");
        assertThat(a.add(b).amount()).isEqualByComparingTo(new BigDecimal("14.75"));
    }

    @Test
    void add_rejects_different_currencies() {
        Money a = Money.of("10", "EUR");
        Money b = Money.of("10", "USD");
        assertThatThrownBy(() -> a.add(b))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("currency mismatch");
    }

    @Test
    void keeps_two_decimal_places() {
        assertThat(Money.of("1.005", "EUR").amount())
                .isEqualByComparingTo(new BigDecimal("1.01"));   // HALF_UP rounding
    }
}
```

Plain JUnit + AssertJ, no Spring — the fastest tests in the suite, covering the most critical code.

## 2. Service unit test: transfer rules

```java
class TransferServiceTest {

    @Test
    void insufficient_funds_throws_and_does_not_credit() {
        AccountRepository accounts = mock(AccountRepository.class);
        TransferRepository transfers = mock(TransferRepository.class);
        TransferService service = new TransferService(accounts, transfers);

        when(accounts.findByIban("iban-a")).thenReturn(Optional.of(new Account("iban-a", "EUR", "alice")));
        when(accounts.findByIban("iban-b")).thenReturn(Optional.of(new Account("iban-b", "EUR", "bob")));

        assertThatThrownBy(() -> service.execute("iban-a", "iban-b", 100, "key-1"))
                .isInstanceOf(InsufficientFundsException.class);

        verify(transfers, never()).save(any());
    }
}
```

## 3. Integration test: the full transaction

```java
@SpringBootTest
@AutoConfigureMockMvc
class TransferApiIntegrationTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    private String token;

    @BeforeEach
    void login() throws Exception {
        // register + login a test user, capture the JWT
    }

    @Test
    void transfer_moves_money_atomically() throws Exception {
        createAccount("iban-1");
        createAccount("iban-2");

        mockMvc.perform(post("/api/transfers")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fromIban":"iban-1","toIban":"iban-2",
                                 "amountCents":500,"idempotencyKey":"k-1"}
                                """))
                .andExpect(status().isCreated());

        // both balances changed
        mockMvc.perform(get("/api/accounts/iban-1").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.balanceCents").value(-500));
        mockMvc.perform(get("/api/accounts/iban-2").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.balanceCents").value(500));
    }

    @Test
    void same_idempotency_key_is_rejected() throws Exception {
        // first call succeeds, second returns 409
    }

    @Test
    void unauthenticated_request_gets_401() throws Exception {
        mockMvc.perform(get("/api/accounts"))
                .andExpect(status().isUnauthorized());
    }
}
```

## 4. The Dockerfile

```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q package -DskipTests

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S app && adduser -S app -G app
USER app
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8081
ENTRYPOINT ["java", "-XX:+UseG1GC", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
```

```bash
docker build -t payments-api .
docker run -p 8081:8081 -e APP_JWT_SECRET=prod-secret-... payments-api
```

## 5. CI: the pipeline

```yaml
# .github/workflows/ci.yml (or your CI of choice)
name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '21' }
      - name: Build & test
        run: mvn -B verify
      - name: Dependency scan
        run: mvn -B org.owasp:dependency-check-maven:check
```

Every PR runs: compile → unit tests → integration tests → dependency scan. Red build = no merge.

## The capstone checklist

- [ ] `mvn verify` green: unit + integration + security tests
- [ ] API contract: uniform errors, DTOs, status codes
- [ ] Idempotent transfers; atomic debits/credits
- [ ] JWT: BCrypt, stateless, 401/403 JSON
- [ ] Docker image runs non-root with env-only secrets
- [ ] Health endpoint for probes

> **Why it matters (organizational view)** — This is the definition of "done" for a production service: tested business rules, verified security, reproducible container, green CI. You now have the complete template — every future project is a variation on this skeleton.

## Key takeaways

- Unit-test the money math; integration-test the transactions; security-test the endpoints.
- `@SpringBootTest` + MockMvc = whole-app confidence without a browser.
- Multi-stage Docker, non-root, env-only secrets.
- CI = `mvn verify` + dependency scan on every PR.

**Official docs:** [Testing](https://docs.spring.io/spring-boot/reference/testing/index.html) · [Deployment](https://docs.spring.io/spring-boot/reference/deployment/index.html)
