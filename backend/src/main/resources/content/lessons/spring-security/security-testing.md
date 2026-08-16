---
title: Testing Security & OWASP Top 10
summary: @WithMockUser, security-aware MockMvc tests, and the vulnerabilities that actually hit Spring apps.
order: 8
minutes: 16
topics: [security-testing, withmockuser, owasp]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/test/index.html
  - https://owasp.org/www-project-top-ten/
---

# Testing Security & OWASP Top 10

## Testing the chain with MockMvc

```java
@WebMvcTest(AccountController.class)
@Import(SecurityConfig.class)
class AccountControllerSecurityTest {

    @Autowired MockMvc mockMvc;

    @Test
    void anonymous_request_is_rejected_with_401() throws Exception {
        mockMvc.perform(get("/api/accounts/iban-1"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "alice", roles = "USER")
    void authenticated_user_can_read() throws Exception {
        mockMvc.perform(get("/api/accounts/iban-1"))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = "bob", roles = "USER")
    void user_cannot_call_admin_endpoint() throws Exception {
        mockMvc.perform(delete("/api/accounts/iban-1"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "admin", roles = "ADMIN")
    void admin_can_call_admin_endpoint() throws Exception {
        mockMvc.perform(delete("/api/accounts/iban-1"))
                .andExpect(status().isNoContent());
    }
}
```

`@WithMockUser` shortcuts authentication — perfect for authorization tests. For full end-to-end (JWT filter + real users), use `spring-security-test`'s `httpBasic`/`jwt()` request post-processors, or `@SpringBootTest` + login.

## Testing with a real token

```java
@SpringBootTest
@AutoConfigureMockMvc
class ApiIntegrationTest {

    @Test
    void login_then_call_protected_endpoint() throws Exception {
        String body = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"admin123\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String token = objectMapper.readTree(body).get("token").asText();

        mockMvc.perform(get("/api/progress")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }
}
```

## The OWASP Top 10, translated to Spring

| Risk | Spring countermeasure |
|---|---|
| **A01 Broken Access Control** | `@PreAuthorize` + URL rules; test every role |
| **A02 Cryptographic Failures** | BCrypt/Argon2; TLS everywhere; no secrets in code |
| **A03 Injection (SQL/XSS)** | JPA/`JdbcTemplate` parameter binding; never string-concat SQL |
| **A04 Insecure Design** | Threat model early; fail-closed authz |
| **A05 Security Misconfiguration** | Defaults reviewed; headers on; error pages leak nothing |
| **A06 Vulnerable Components** | Dependency management + `mvn dependency-check`/Renovate |
| **A07 ID & Authn Failures** | Rate-limit login, MFA at the IdP, short token expiry |
| **A08 Integrity Failures** | Signed JWTs; deserialization only trusted types |
| **A09 Logging Failures** | Centralized logs, no sensitive data, audit trails |
| **A10 SSRF** | Validate/allowlist outbound URLs before fetching |

## The security test checklist

- [ ] Public endpoints work anonymously (and only those).
- [ ] Every protected endpoint 401s without credentials.
- [ ] Every role-bound endpoint 403s for the wrong role.
- [ ] Validation rejects malformed payloads (400).
- [ ] Login brute-force: N attempts → locked/429.
- [ ] Secrets never appear in responses or logs (test asserts on this!).
- [ ] Dependency scan is green in CI.

> **Why it matters (organizational view)** — Security testing is a habit, not an event: authorization tests on every endpoint, a dependency scanner in CI, and secrets-canary tests (assert the API never returns a password/token field). Teams that test security rules like business rules stop shipping access-control regressions.

## Key takeaways

- `@WithMockUser` = fast authorization tests; real-token tests for the full chain.
- Test 401, 403, and 200 for each endpoint × role matrix.
- Parameterized SQL kills injection; CSP/headers kill XSS; BCrypt kills hash cracking.
- Dependency scanning in CI catches A06 continuously.

**Official docs:** [Security testing](https://docs.spring.io/spring-security/reference/servlet/test/index.html) · [OWASP Top 10](https://owasp.org/www-project-top-ten/)
