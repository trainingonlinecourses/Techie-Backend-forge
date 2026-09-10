---
title: OWASP Top 10 — Complete Beginner's Guide
summary: The 10 most critical web security risks, explained with real examples, how Spring Boot prevents them, and the code that fixes each one.
order: 3
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

**How Spring Security prevents it:**
.authorizeHttpRequests(auth -> auth
    .requestMatchers("/api/admin/**").hasRole("ADMIN")   // Line 1: Admin only
    .requestMatchers("/api/orders/**").authenticated()    // Line 2: Must be logged in
    .anyRequest().denyAll()                              // Line 3: Deny everything else
)

## A02: Cryptographic Failures

**What it is:** Sensitive data exposed due to weak encryption, plaintext storage, or improper key management.


**What this code does — step by step:**

1. VULNERABLE — storing passwords in plaintext
2. `user.setPassword(rawPassword);` — NEVER do this!
3. FIXED — hash with BCrypt
4. `user.setPassword(passwordEncoder.encode(rawPassword));` — Line 1: Hash before storing
5. VULNERABLE — weak encryption
6. `Cipher cipher = Cipher.getInstance("DES");` — DES is broken!
7. FIXED — use strong encryption
8. `Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");` — Line 1: AES-256 with GCM mode

The same code, clean:

```java
user.setPassword(rawPassword);

user.setPassword(passwordEncoder.encode(rawPassword));

Cipher cipher = Cipher.getInstance("DES");

Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
```

**The rules:**
- Passwords: BCrypt/Argon2 (never MD5, SHA1, plaintext)
- Data at rest: AES-256-GCM
- Data in transit: TLS 1.3 (HTTPS)
- Secrets: Environment variables or vault (never in code)

## A03: Injection (SQL, NoSQL, LDAP)

**What it is:** Untrusted data sent to an interpreter as part of a command or query.


**What this code does — step by step:**

1. VULNERABLE — SQL injection
2. If username = "admin' OR '1'='1", the query becomes: SELECT * FROM users WHERE username = 'admin' OR '1'='1'. Returns ALL users!
3. FIXED — use parameterized queries
4. `User findByUsername(@Param("username") String username);` — Line 1: Safe — parameters are bound
5. FIXED — use JPA (auto-parameterized)
6. `User user = userRepo.findByUsername(username);` — Line 1: Spring Data handles safety

The same code, clean:

```java
String query = "SELECT * FROM users WHERE username = '" + username + "'";

@Query("SELECT u FROM User u WHERE u.username = :username")
User findByUsername(@Param("username") String username);

User user = userRepo.findByUsername(username);
```

## A04: Insecure Design

**What it is:** Security flaws in the design itself, not the implementation.


**What this code does — step by step:**

1. INSECURE DESIGN — password reset doesn't expire the token
2. `String token = generateToken();` — Line 1: Generate token
3. `sendEmail(req.getEmail(), token);` — Line 2: Send email. Problem: Token never expires! Attacker can use it forever.
4. SECURE DESIGN — token expires in 15 minutes
5. `String token = tokenProvider.generate(req.getEmail(), Duration.ofMinutes(15));` — Line 1: Expiring token

The same code, clean:

```java
@PostMapping("/reset-password")
public void resetPassword(@RequestBody ResetRequest req) {
    String token = generateToken();
    sendEmail(req.getEmail(), token);
}

@PostMapping("/reset-password")
public void resetPassword(@RequestBody ResetRequest req) {
    String token = tokenProvider.generate(req.getEmail(), Duration.ofMinutes(15));
    sendEmail(req.getEmail(), token);
}
```

## A05: Security Misconfiguration

**What it is:** Default settings, unnecessary features, or missing security headers.


**What this code does — step by step:**

1. INSECURE — debug mode in production
2. `include-stacktrace: always` — Exposes stack traces to users!
3. SECURE — hide details in production
4. `include-stacktrace: never` — Line 1: No stack traces
5. `include-message: never` — Line 2: No error messages
6. Security headers (Spring Security enables these by default). But verify they're active:
7. `.contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'self'"))` — Line 1: CSP
8. `.httpStrictTransportSecurity(hsts -> hsts` — Line 2: HSTS

The same code, clean:

```java
server:
  error:
    include-stacktrace: always

server:
  error:
    include-stacktrace: never
    include-message: never

http.headers(headers -> headers
    .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'self'"))
    .httpStrictTransportSecurity(hsts -> hsts
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


**What this code does — step by step:**

1. VULNERABLE — no rate limiting on login
2. Attacker can try 1 million passwords per second!
3. FIXED — rate limiting + account lockout
4. `private final RateLimiter rateLimiter;` — Line 1: Limit login attempts
5. `throw new TooManyAttemptsException("Too many login attempts");` — Line 2: Block brute force
6. ... normal login logic

The same code, clean:

```java
@PostMapping("/login")
public AuthResponse login(@RequestBody LoginRequest req) {
}

@Service
public class LoginService {
    private final RateLimiter rateLimiter;

    public AuthResponse login(LoginRequest req) {
        if (!rateLimiter.tryAcquire(req.getUsername())) {
            throw new TooManyAttemptsException("Too many login attempts");
        }
    }
}
```

## A08: Software and Data Integrity Failures

**What it is:** Code or data that's been tampered with during deployment or runtime.


**What this code does — step by step:**

1. VULNERABLE — deserializing untrusted data
2. `Object obj = ois.readObject();` — Can execute arbitrary code!
3. FIXED — use JSON instead of Java serialization. Jackson deserialization is safe (no code execution)
4. `User user = mapper.readValue(jsonInput, User.class);` — Line 1: Safe deserialization

The same code, clean:

```java
ObjectInputStream ois = new ObjectInputStream(untrustedInputStream);
Object obj = ois.readObject();

ObjectMapper mapper = new ObjectMapper();
User user = mapper.readValue(jsonInput, User.class);
```

## A09: Security Logging and Monitoring Failures

**What it is:** Not logging security events, making incidents undetectable.

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

**What to log:**
- Login success/failure
- Password changes
- Privileged actions
- Data exports
- Authorization failures

## A10: Server-Side Request Forgery (SSRF)

**What it is:** App fetches a URL provided by the user, but the URL points to internal resources.


**What this code does — step by step:**

1. VULNERABLE — fetch any URL the user provides
2. `return restTemplate.getForObject(url, String.class);` — Attacker can access internal services!
3. FIXED — validate and whitelist URLs
4. `if (!isAllowedUrl(url)) {` — Line 1: Validate URL
5. `return allowedHosts.contains(uri.getHost());` — Line 2: Check against whitelist

The same code, clean:

```java
@GetMapping("/fetch")
public String fetchUrl(@RequestParam String url) {
    return restTemplate.getForObject(url, String.class);
}

@GetMapping("/fetch")
public String fetchUrl(@RequestParam String url) {
    if (!isAllowedUrl(url)) {
        throw new BadRequestException("URL not allowed");
    }
    return restTemplate.getForObject(url, String.class);
}

private boolean isAllowedUrl(String url) {
    List<String> allowedHosts = List.of("api.example.com", "data.example.com");
    URI uri = URI.create(url);
    return allowedHosts.contains(uri.getHost());
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

