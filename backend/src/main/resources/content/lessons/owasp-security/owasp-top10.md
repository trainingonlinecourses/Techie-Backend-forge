---
title: OWASP Top 10 — Complete Beginner's Guide
summary: The 10 most critical web security risks, explained with real examples, how Spring Boot prevents them, and the code that fixes each one.
order: 1
minutes: 22
topics: [owasp, injection, xss, csrf, broken authentication, security misconfiguration]
docs:
  - https://owasp.org/Top10/
  - https://docs.spring.io/spring-security/reference/
---

# OWASP Top 10 — Complete Beginner's Guide

## What is OWASP?

OWASP (Open Worldwide Application Security Project) is a nonprofit that identifies the most critical web application security risks. The **OWASP Top 10** is a regularly updated list of the 10 most dangerous vulnerabilities. Every web developer should know these.

## A01: Broken Access Control (most common!)

**What it is:** Users can access data or perform actions they shouldn't be able to.

```java
// VULNERABLE — no authorization check
@GetMapping("/api/orders/{id}")
public Order getOrder(@PathVariable Long id) {
    return orderRepo.findById(id).orElseThrow();  // Any user can see ANY order!
}

// FIXED — check that the user owns this order
@GetMapping("/api/orders/{id}")
public Order getOrder(@PathVariable Long id, 
                      @AuthenticationPrincipal UserPrincipal principal) {
    Order order = orderRepo.findById(id).orElseThrow();
    if (!order.getUserId().equals(principal.getId())) {
        throw new AccessDeniedException("Not your order!");  // Line 1: Authorization check
    }
    return order;
}
```

**How Spring Security prevents it:**
```java
.authorizeHttpRequests(auth -> auth
    .requestMatchers("/api/admin/**").hasRole("ADMIN")   // Line 1: Admin only
    .requestMatchers("/api/orders/**").authenticated()    // Line 2: Must be logged in
    .anyRequest().denyAll()                              // Line 3: Deny everything else
)
```

## A02: Cryptographic Failures

**What it is:** Sensitive data exposed due to weak encryption, plaintext storage, or improper key management.

```java
// VULNERABLE — storing passwords in plaintext
user.setPassword(rawPassword);  // NEVER do this!

// FIXED — hash with BCrypt
user.setPassword(passwordEncoder.encode(rawPassword));  // Line 1: Hash before storing

// VULNERABLE — weak encryption
Cipher cipher = Cipher.getInstance("DES");  // DES is broken!

// FIXED — use strong encryption
Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");  // Line 1: AES-256 with GCM mode
```

**The rules:**
- Passwords: BCrypt/Argon2 (never MD5, SHA1, plaintext)
- Data at rest: AES-256-GCM
- Data in transit: TLS 1.3 (HTTPS)
- Secrets: Environment variables or vault (never in code)

## A03: Injection (SQL, NoSQL, LDAP)

**What it is:** Untrusted data sent to an interpreter as part of a command or query.

```java
// VULNERABLE — SQL injection
String query = "SELECT * FROM users WHERE username = '" + username + "'";
// If username = "admin' OR '1'='1", the query becomes:
// SELECT * FROM users WHERE username = 'admin' OR '1'='1'
// Returns ALL users!

// FIXED — use parameterized queries
@Query("SELECT u FROM User u WHERE u.username = :username")
User findByUsername(@Param("username") String username);  // Line 1: Safe — parameters are bound

// FIXED — use JPA (auto-parameterized)
User user = userRepo.findByUsername(username);  // Line 1: Spring Data handles safety
```

## A04: Insecure Design

**What it is:** Security flaws in the design itself, not the implementation.

```java
// INSECURE DESIGN — password reset doesn't expire the token
@PostMapping("/reset-password")
public void resetPassword(@RequestBody ResetRequest req) {
    String token = generateToken();  // Line 1: Generate token
    sendEmail(req.getEmail(), token);  // Line 2: Send email
    // Problem: Token never expires! Attacker can use it forever.
}

// SECURE DESIGN — token expires in 15 minutes
@PostMapping("/reset-password")
public void resetPassword(@RequestBody ResetRequest req) {
    String token = tokenProvider.generate(req.getEmail(), Duration.ofMinutes(15));  // Line 1: Expiring token
    sendEmail(req.getEmail(), token);
}
```

## A05: Security Misconfiguration

**What it is:** Default settings, unnecessary features, or missing security headers.

```java
// INSECURE — debug mode in production
server:
  error:
    include-stacktrace: always     // Exposes stack traces to users!

// SECURE — hide details in production
server:
  error:
    include-stacktrace: never      // Line 1: No stack traces
    include-message: never         // Line 2: No error messages

// Security headers (Spring Security enables these by default)
// But verify they're active:
http.headers(headers -> headers
    .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'self'"))  // Line 1: CSP
    .httpStrictTransportSecurity(hsts -> hsts                                  // Line 2: HSTS
        .includeSubDomains(true)
        .maxAgeInSeconds(31536000)
    )
);
```

## A06: Vulnerable and Outdated Components

**What it is:** Using libraries with known vulnerabilities.

```xml
<!-- Check for vulnerable dependencies -->
<plugin>
    <groupId>org.owasp</groupId>
    <artifactId>dependency-check-maven</artifactId>
    <version>9.0.0</version>
</plugin>
```

```bash
# Scan for vulnerabilities
mvn dependency-check:check

# Or use Spring Boot's built-in check
mvn dependency:tree | grep -i "CVE"
```

**Prevention:**
- Keep dependencies updated
- Use `mvn versions:display-dependency-updates`
- Run OWASP Dependency Check in CI
- Remove unused dependencies

## A07: Identification and Authentication Failures

**What it is:** Weak authentication, session management, or credential handling.

```java
// VULNERABLE — no rate limiting on login
@PostMapping("/login")
public AuthResponse login(@RequestBody LoginRequest req) {
    // Attacker can try 1 million passwords per second!
}

// FIXED — rate limiting + account lockout
@Service
public class LoginService {
    private final RateLimiter rateLimiter;  // Line 1: Limit login attempts
    
    public AuthResponse login(LoginRequest req) {
        if (!rateLimiter.tryAcquire(req.getUsername())) {
            throw new TooManyAttemptsException("Too many login attempts");  // Line 2: Block brute force
        }
        // ... normal login logic
    }
}
```

## A08: Software and Data Integrity Failures

**What it is:** Code or data that's been tampered with during deployment or runtime.

```java
// VULNERABLE — deserializing untrusted data
ObjectInputStream ois = new ObjectInputStream(untrustedInputStream);
Object obj = ois.readObject();  // Can execute arbitrary code!

// FIXED — use JSON instead of Java serialization
// Jackson deserialization is safe (no code execution)
ObjectMapper mapper = new ObjectMapper();
User user = mapper.readValue(jsonInput, User.class);  // Line 1: Safe deserialization
```

## A09: Security Logging and Monitoring Failures

**What it is:** Not logging security events, making incidents undetectable.

```java
// Log security events
@Component
public class SecurityAuditLogger {
    
    public void logLoginSuccess(String username) {
        log.info("LOGIN_SUCCESS user={} timestamp={}", username, Instant.now());  // Line 1: Structured log
    }
    
    public void logLoginFailure(String username, String reason) {
        log.warn("LOGIN_FAILURE user={} reason={}", username, reason);  // Line 2: Warning for failures
    }
    
    public void logUnauthorizedAccess(String username, String resource) {
        log.error("UNAUTHORIZED user={} resource={}", username, resource);  // Line 3: Error for access denial
    }
}
```

**What to log:**
- Login success/failure
- Password changes
- Privileged actions
- Data exports
- Authorization failures

## A10: Server-Side Request Forgery (SSRF)

**What it is:** App fetches a URL provided by the user, but the URL points to internal resources.

```java
// VULNERABLE — fetch any URL the user provides
@GetMapping("/fetch")
public String fetchUrl(@RequestParam String url) {
    return restTemplate.getForObject(url, String.class);  // Attacker can access internal services!
}

// FIXED — validate and whitelist URLs
@GetMapping("/fetch")
public String fetchUrl(@RequestParam String url) {
    if (!isAllowedUrl(url)) {                              // Line 1: Validate URL
        throw new BadRequestException("URL not allowed");
    }
    return restTemplate.getForObject(url, String.class);
}

private boolean isAllowedUrl(String url) {
    List<String> allowedHosts = List.of("api.example.com", "data.example.com");
    URI uri = URI.create(url);
    return allowedHosts.contains(uri.getHost());           // Line 2: Check against whitelist
}
```

## Key takeaways

- Broken Access Control is #1 — always check authorization
- Never store plaintext passwords — use BCrypt/Argon2
- Use parameterized queries — never concatenate user input into SQL
- Keep dependencies updated — run vulnerability scans
- Log security events — you can't detect what you don't log
- Validate URLs before fetching — prevent SSRF

**Official docs:** [OWASP Top 10](https://owasp.org/Top10/) · [Spring Security Reference](https://docs.spring.io/spring-security/reference/)
