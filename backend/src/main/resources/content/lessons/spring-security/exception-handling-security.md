---
title: Security Exception Handling — Auth Errors Done Right
summary: Handling authentication and authorization exceptions properly — custom entry points, access denied handlers, and the security pitfalls that leak information to attackers.
order: 11
minutes: 18
topics: [exception handling, AuthenticationEntryPoint, AccessDeniedHandler, 401, 403, error responses, security exceptions]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/configuration/architecture.html
  - https://docs.spring.io/spring-security/reference/servlet/exploits/headers.html
---

# Security Exception Handling — Auth Errors Done Right

## What is Security Exception Handling? (From Zero)

When a user tries to access a protected resource without logging in (401 Unauthorized) or without the right permissions (403 Forbidden), Spring Security throws specific exceptions. How you handle these exceptions determines:

1. What error message the user sees
2. Whether the error leaks information to attackers
3. Whether the frontend can handle the error gracefully

The default Spring Security behavior redirects to a login page — but in a REST API, you want JSON error responses, not redirects.

---

## The Code — Line by Line

### Custom Authentication Entry Point (401)

```java
@Component
public class CustomAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authException) throws IOException {

        // Set the response status to 401 Unauthorized
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");

        // Build a clean error response
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("timestamp", Instant.now().toString());
        error.put("status", 401);
        error.put("error", "Unauthorized");
        error.put("message", "Authentication required — please log in");
        error.put("path", request.getRequestURI());

        // Write JSON to response body
        objectMapper.writeValue(response.getOutputStream(), error);

        // DON'T include: stack trace, internal class names, SQL errors
        // These leak information to attackers
    }
}
```

**Line-by-line explained:**
- `AuthenticationEntryPoint` — Called when an **unauthenticated** user tries to access a protected resource. This is the "you need to log in" handler.
- `response.setStatus(401)` — Sets the HTTP status code. 401 means "authentication required."
- The error map includes only safe information: timestamp, status, generic message, path.
- **Never include**: stack traces, SQL error messages, internal class names — these help attackers understand your system.

### Custom Access Denied Handler (403)

```java
@Component
public class CustomAccessDeniedHandler implements AccessDeniedHandler {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException accessDeniedException) throws IOException {

        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");

        Map<String, Object> error = new LinkedHashMap<>();
        error.put("timestamp", Instant.now().toString());
        error.put("status", 403);
        error.put("error", "Forbidden");
        error.put("message", "You don't have permission to access this resource");
        error.put("path", request.getRequestURI());

        objectMapper.writeValue(response.getOutputStream(), error);
    }
}
```

**Line-by-line explained:**
- `AccessDeniedHandler` — Called when an **authenticated** user tries to access a resource they don't have permission for. This is the "you're logged in but not allowed" handler.
- 403 means "forbidden" — the server understood the request but refuses to authorize it.
- The message is intentionally vague — don't tell the user what permission they're missing (it helps attackers map your authorization model).

### Wiring Up in SecurityConfig

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Autowired
    private CustomAuthenticationEntryPoint entryPoint;

    @Autowired
    private CustomAccessDeniedHandler accessDeniedHandler;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .exceptionHandling(exceptions -> exceptions
                .authenticationEntryPoint(entryPoint)        // 401 handler
                .accessDeniedHandler(accessDeniedHandler)    // 403 handler
            )
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/public/**").permitAll()    // No auth needed
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            );

        return http.build();
    }
}
```

**Line-by-line explained:**
- `.authenticationEntryPoint(entryPoint)` — Register our custom 401 handler. Without this, Spring redirects to `/login`.
- `.accessDeniedHandler(accessDeniedHandler)` — Register our custom 403 handler.
- The order matters: authentication check happens first (401), then authorization check (403).

### Global Exception Handler for Security Exceptions

```java
@RestControllerAdvice
public class SecurityExceptionHandler {

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<Map<String, Object>> handleBadCredentials(BadCredentialsException ex) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("status", 401);
        error.put("error", "Invalid Credentials");
        error.put("message", "Username or password is incorrect");
        // Don't reveal WHICH one is wrong — that helps attackers
        return ResponseEntity.status(401).body(error);
    }

    @ExceptionHandler(AccountExpiredException.class)
    public ResponseEntity<Map<String, Object>> handleAccountExpired(AccountExpiredException ex) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("status", 401);
        error.put("error", "Account Expired");
        error.put("message", "Your account has expired — please contact support");
        return ResponseEntity.status(401).body(error);
    }

    @ExceptionHandler(LockedException.class)
    public ResponseEntity<Map<String, Object>> handleLocked(LockedException ex) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("status", 423);
        error.put("error", "Account Locked");
        error.put("message", "Your account has been locked due to too many failed attempts");
        return ResponseEntity.status(423).body(error);
    }

    @ExceptionHandler(InsufficientAuthenticationException.class)
    public ResponseEntity<Map<String, Object>> handleInsufficient(InsufficientAuthenticationException ex) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("status", 401);
        error.put("error", "Authentication Required");
        error.put("message", "Please log in to access this resource");
        return ResponseEntity.status(401).body(error);
    }
}
```

---

## Real-World Scenarios

### Scenario 1: SPA Login Flow

```
1. User enters wrong password → POST /api/auth/login
2. Spring throws BadCredentialsException
3. Our handler returns JSON:
   {
     "status": 401,
     "error": "Invalid Credentials",
     "message": "Username or password is incorrect"
   }
4. Frontend shows "Invalid username or password" toast
5. Frontend stays on login page (no redirect)
```

### Scenario 2: API Token Expired

```
1. Client sends expired JWT token → GET /api/orders
2. Spring detects expired token → InsufficientAuthenticationException
3. Our handler returns:
   {
     "status": 401,
     "error": "Token Expired",
     "message": "Your session has expired — please log in again"
   }
4. Client automatically refreshes the token using the refresh token
```

### Scenario 3: Role-Based Access Denial

```
1. Regular user tries to access /api/admin/users → GET /api/admin/users
2. Spring checks roles → user has ROLE_USER, not ROLE_ADMIN
3. AccessDeniedHandler returns:
   {
     "status": 403,
     "error": "Forbidden",
     "message": "You don't have permission to access this resource"
   }
4. Frontend shows "Access Denied" page
5. Frontend does NOT reveal that ROLE_ADMIN is needed (security!)
```

---

## Common Mistakes

| Mistake | Why It's Dangerous | Fix |
|---|---|---|
| Returning stack traces in 401/403 | Leaks internal class names, SQL queries to attackers | Return only safe error messages |
| Telling user "username not found" | Allows username enumeration | Say "invalid credentials" (generic) |
| Redirecting to /login in REST API | SPA can't handle redirects gracefully | Return JSON 401/403 responses |
| Not handling account lockout | User doesn't know why they can't log in | Return clear "account locked" message |
| Using default Spring error page | Default page may leak info | Custom entry point + access denied handler |

---

## Key Takeaways

- **401 = not authenticated** (AuthenticationEntryPoint). **403 = not authorized** (AccessDeniedHandler).
- **Return JSON for REST APIs** — don't redirect to `/login` like in traditional web apps.
- **Never reveal which field is wrong** — "invalid credentials" not "username not found."
- **Never include stack traces** — they leak internal implementation details.
- **Handle every auth exception type**: BadCredentials, AccountExpired, Locked, Disabled — each needs a clear message.

Official docs: [Exception Handling (Spring)](https://docs.spring.io/spring-security/reference/servlet/configuration/architecture.html) · [AuthenticationEntryPoint](https://docs.spring.io/spring-security/reference/api/org/springframework/security/web/AuthenticationEntryPoint.html)
