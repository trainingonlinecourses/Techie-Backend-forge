---
title: Security in Production — Hardening Your Application
summary: Production security checklist — HTTPS everywhere, secure cookies, rate limiting, audit logging, secrets management, and the common vulnerabilities that trip up real deployments.
order: 16
minutes: 20
topics: [production security, HTTPS, secure cookies, rate limiting, audit logging, secrets management, OWASP, security checklist]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/exploits/headers.html
  - https://owasp.org/www-project-top-ten/
---

# Security in Production — Hardening Your Application

## What is Production Security? (From Zero)

Development security is about getting the code right. **Production security** is about making sure the deployment is secure — HTTPS is enforced, cookies are protected, secrets aren't leaked, rate limits prevent abuse, and you can detect when something goes wrong.

Most breaches happen not because of bad code, but because of **misconfigured deployments**: expired certificates, debug endpoints left exposed, secrets in environment variables visible to all containers, or no rate limiting on login endpoints.

---

## The Production Security Checklist

### 1. HTTPS Everywhere

```yaml
# application.yml — Force HTTPS redirect
server:
  port: 443
  ssl:
    enabled: true
    key-store: classpath:keystore.p12
    key-store-password: ${SSL_KEYSTORE_PASSWORD}    # From environment variable
    key-store-type: PKCS12

# Redirect HTTP to HTTPS
spring:
  security:
    require-ssl: true
```

```java
// Or programmatically:
@Bean
public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http
        .requiresChannel(channel -> channel
            .anyRequest().requiresSecure()           // All requests must be HTTPS
        )
        // ... rest of config
    ;
    return http.build();
}
```

### 2. Secure Cookies

```java
@Bean
public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http
        .sessionManagement(session -> session
            .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
            .sessionCookie(cookie -> cookie
                .name("SESSIONID")                   // Custom cookie name (don't reveal framework)
                .httpOnly(true)                      // JavaScript can't read the cookie
                .secure(true)                        // Only sent over HTTPS
                .sameSite("Lax")                     // CSRF protection
                .maxAge(Duration.ofMinutes(30))       // Cookie expires in 30 minutes
                .path("/")                           // Apply to all paths
            )
        );
    return http.build();
}
```

**Line-by-line explained:**
- `httpOnly(true)` — Prevents JavaScript from reading the cookie. Stops XSS-based session theft.
- `secure(true)` — Cookie only sent over HTTPS. Prevents session theft on HTTP connections.
- `sameSite("Lax")` — Cookie not sent on cross-site requests. Prevents CSRF attacks.
- Custom `name("SESSIONID")` — Don't reveal "JSESSIONID" (tells attackers you're using Java/Spring).

### 3. Rate Limiting

```java
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private final RateLimiter rateLimiter = RateLimiter.create(100.0);  // 100 requests/second

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain) throws ServletException, IOException {

        String clientIp = request.getRemoteAddr();

        if (!rateLimiter.tryAcquire(Duration.ofMillis(100))) {    // Wait up to 100ms
            response.setStatus(429);                              // Too Many Requests
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"Rate limit exceeded\",\"retryAfter\":1}");
            return;                                               // Don't process the request
        }

        filterChain.doFilter(request, response);                  // Continue processing
    }
}
```

### 4. Audit Logging

```java
@Component
public class SecurityAuditListener {

    @EventListener
    public void onAuthenticationSuccess(AuthenticationSuccessEvent event) {
        String username = event.getAuthentication().getName();
        String ip = getCurrentRequest().getRemoteAddr();
        log.info("LOGIN SUCCESS: user={} ip={} time={}", username, ip, Instant.now());
        auditLog.save(new AuditEvent(username, "LOGIN_SUCCESS", ip));
    }

    @EventListener
    public void onAuthenticationFailure(AbstractAuthenticationFailureEvent event) {
        String username = event.getAuthentication().getName();
        String ip = getCurrentRequest().getRemoteAddr();
        String reason = event.getException().getMessage();
        log.warn("LOGIN FAILURE: user={} ip={} reason={}", username, ip, reason);
        auditLog.save(new AuditEvent(username, "LOGIN_FAILURE", ip, reason));
    }

    private HttpServletRequest getCurrentRequest() {
        return ((ServletRequestAttributes) RequestContextHolder.getRequestAttributes()).getRequest();
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Secrets Management

```java
// ❌ NEVER DO THIS:
private static final String DB_PASSWORD = "admin123";           // Hardcoded in source
private static final String API_KEY = "sk_live_abc123";         // In git history forever

// ✅ CORRECT: Environment variables
@Value("${database.password}")
private String dbPassword;                                      // From environment

// ✅ BETTER: Secrets manager (Vault, AWS Secrets Manager)
@Autowired
private VaultTemplate vault;

public String getDbPassword() {
    return vault.read("secret/data/db-password")
        .getData()
        .get("password");                                       // Rotated automatically
}
```

### Scenario 2: Debug Endpoints in Production

```properties
# ❌ NEVER IN PRODUCTION:
management.endpoints.web.exposure.include=*                    # Exposes ALL Actuator endpoints
management.endpoint.env.post.enabled=true                      # Allows changing env vars remotely!

# ✅ PRODUCTION CONFIG:
management.endpoints.web.exposure.include=health,info,metrics  # Only safe endpoints
management.endpoint.health.show-details=never                  # Don't show health details
management.endpoints.shutdown.enabled=false                    # No remote shutdown!
```

### Scenario 3: Input Validation

```java
@RestController
public class UserController {

    @PostMapping("/api/users")
    public ResponseEntity<User> createUser(@Valid @RequestBody UserRequest request) {
        // @Valid triggers Bean Validation — rejects malformed input
        return ResponseEntity.ok(userService.create(request));
    }
}

public record UserRequest(
    @NotBlank @Size(min = 3, max = 50) String name,          // Required, 3-50 chars
    @Email @NotBlank String email,                            // Must be valid email
    @Size(max = 200) String bio                               // Optional, max 200 chars
) {}
```

---

## Common Mistakes

| Mistake | Why It's Dangerous | Fix |
|---|---|---|
| Hardcoded secrets in source code | Secrets visible to anyone with repo access | Use environment variables or Vault |
| Debug endpoints in production | Information leakage, remote code execution | Disable or restrict Actuator endpoints |
| No rate limiting on login | Brute-force attacks succeed | Rate limit login endpoint (5-10 attempts/minute) |
| JSESSIONID cookie name | Reveals Java/Spring to attackers | Use custom cookie name |
| No audit logging | Can't detect breaches or investigate incidents | Log all auth events with IP + timestamp |
| Missing input validation | SQL injection, XSS, buffer overflow | Use `@Valid` + Bean Validation on all inputs |

---

## Key Takeaways

- **HTTPS everywhere** — no exceptions. Use `requiresSecure()` in Spring Security.
- **Secure cookies**: `httpOnly`, `secure`, `sameSite` — all three are essential.
- **Rate limit** sensitive endpoints (login, password reset, registration).
- **Audit log** all authentication events — you can't investigate what you don't record.
- **Never hardcode secrets** — use environment variables, Vault, or cloud secrets managers.
- **Disable debug endpoints** in production — Actuator endpoints are powerful and dangerous.

Official docs: [Spring Security Production](https://docs.spring.io/spring-security/reference/servlet/exploits/headers.html) · [OWASP Top 10](https://owasp.org/www-project-top-ten/)
