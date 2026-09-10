---
title: The Security Model — Complete Beginner's Guide
summary: Authentication vs Authorization explained from zero, password hashing, the SecurityContext, and the filter chain that protects every request.
order: 13
minutes: 20
topics: [authentication, authorization, hashing, security-model, security-context, filter-chain]
docs:
  - https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html
  - https://docs.spring.io/spring-security/reference/servlet/architecture.html
---

# The Security Model — Complete Beginner's Guide

## The two words that matter

**Authentication (authn)** = *Who are you?* Prove your identity with a password, token, OTP, or SSO.

**Authorization (authz)** = *What may you do?* Once your identity is known, decide what you're allowed to access.

```
Request → AUTHENTICATION (who are you?) → AUTHORIZATION (can you do this?) → resource
```

**Real-world analogy:** Authentication is showing your ID at the airport security. Authorization is whether you have a boarding pass for that specific flight. Having an ID (authentication) doesn't mean you can board any plane (authorization).

## The SecurityContext — who is calling right now

Spring Security stores the authenticated user as a **principal** in the `SecurityContext` — held per-request:


**What this code does — step by step:**

1. After authentication, the user's identity is stored in SecurityContext
2. Line 1: @AuthenticationPrincipal extracts the current user from SecurityContext. Line 2: principal contains the user's ID, username, roles, etc.
3. You can also access it directly:
4. `SecurityContext ctx = SecurityContextHolder.getContext();` — Line 1: Get the context
5. `Authentication auth = ctx.getAuthentication();` — Line 2: Get the authentication
6. `String username = auth.getName();` — Line 3: Get the username

The same code, clean:

```java
@GetMapping("/me")
public UserDto me(@AuthenticationPrincipal UserPrincipal principal) {
    return UserDto.from(principal.user());
}

@GetMapping("/me")
public UserDto me() {
    SecurityContext ctx = SecurityContextHolder.getContext();
    Authentication auth = ctx.getAuthentication();
    String username = auth.getName();
    return userDtoService.findByUsername(username);
}
```

**What happens at runtime:**
1. User sends a request with a JWT token
2. The `JwtAuthFilter` extracts the token
3. It validates the token and creates an `Authentication` object
4. It stores the authentication in `SecurityContextHolder`
5. Your controller method runs with the user's identity available
6. At the end of the request, the context is cleared

## Password storage — hash, don't encrypt

Passwords are **hashed one-way** with a slow, salted algorithm — never reversible, never plaintext, never encrypted.

**What is hashing?** Hashing converts a password into a fixed-length string. It's one-way: you can't reverse the hash to get the original password. BCrypt adds a random salt and runs the algorithm thousands of times, making it slow to brute-force.


**What this code does — step by step:**

1. Spring Boot auto-configures BCrypt — just declare the bean
2. `return new BCryptPasswordEncoder();` — Line 1: Creates a BCrypt encoder. Line 2: Automatically strengthens over time as hardware gets faster
3. Hashing a password during registration
4. `String rawPassword = "hunter2";` — Line 1: The raw password
5. `String hashedPassword = passwordEncoder.encode(rawPassword);` — Line 2: Hash it
6. Line 3: Result looks like: $2a$10$N9qo8uLOickgx2ZMRZoMye... (contains salt + cost)
7. Verifying a password during login
8. `boolean matches = passwordEncoder.matches("hunter2", hashedPassword);` — Line 1: Re-hash the input
9. Line 2: Compare with stored hash — returns true if they match

The same code, clean:

```java
@Bean
PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
}

String rawPassword = "hunter2";
String hashedPassword = passwordEncoder.encode(rawPassword);

boolean matches = passwordEncoder.matches("hunter2", hashedPassword);
```

**Why BCrypt?**
- **Slow by design** — takes ~100ms to hash, making brute-force impractical
- **Salted** — each password gets a unique random salt, preventing rainbow table attacks
- **Adaptive** — the cost factor can be increased as hardware gets faster

**Never use:** MD5, SHA1, SHA256 for passwords — they're too fast and don't have salts.

## Where identity comes from — AuthenticationProviders

Spring Security supports multiple authentication sources through `AuthenticationProvider`:

| Source | AuthenticationProvider | Use case |
|---|---|---|
| Username + password in a DB | `DaoAuthenticationProvider` | Traditional login forms |
| OAuth2 / OIDC (Google, GitHub) | `OAuth2LoginAuthenticationProvider` | Social login, enterprise SSO |
| JWT tokens | `JwtAuthenticationProvider` | REST APIs, mobile apps |
| LDAP / Active Directory | `LdapAuthenticationProvider` | Enterprise directory services |
| SAML / CAS | Dedicated providers | SSO federation |


**What this code does — step by step:**

1. Example: JWT-based authentication
2. `private final JwtDecoder jwtDecoder;` — Line 1: Decodes JWT tokens
3. `private final UserDetailsService userDetailsService;` — Line 2: Loads user from DB
4. `String token = extractToken(request);` — Line 1: Get token from header
5. `Jwt jwt = jwtDecoder.decode(token);` — Line 2: Decode and validate
6. `String username = jwt.getSubject();` — Line 3: Extract username
7. `UserDetails user = userDetailsService.loadUserByUsername(username);` — Line 4: Load user
8. `user, null, user.getAuthorities()` — Line 5: Create authentication object
9. `SecurityContextHolder.getContext().setAuthentication(auth);` — Line 6: Store in context
10. `chain.doFilter(request, response);` — Line 7: Continue the filter chain

The same code, clean:

```java
@Component
public class JwtAuthFilter extends OncePerRequestFilter {
    private final JwtDecoder jwtDecoder;
    private final UserDetailsService userDetailsService;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
            HttpServletResponse response, FilterChain chain) {

        String token = extractToken(request);
        if (token != null) {
            Jwt jwt = jwtDecoder.decode(token);
            String username = jwt.getSubject();

            UserDetails user = userDetailsService.loadUserByUsername(username);

            Authentication auth = new UsernamePasswordAuthenticationToken(
                user, null, user.getAuthorities()
            );
            SecurityContextHolder.getContext().setAuthentication(auth);
        }
        chain.doFilter(request, response);
    }
}
```

## The filter chain — how security works

Every request passes through a chain of **filters**. Security filters run BEFORE your controller:

```
Client Request
    ↓
SecurityFilterChain
    ├── JwtAuthFilter (validates token)
    ├── ExceptionTranslationFilter (handles 401/403)
    └── FilterSecurityInterceptor (checks permissions)
    ↓
Your Controller
    ↓
Response
```

**Line-by-line example:**


**What this code does — step by step:**

1. The security configuration defines which filters run
2. `.csrf(csrf -> csrf.disable())` — Line 1: Disable CSRF for APIs
3. `.sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))` — Line 2: No sessions
4. `.authorizeHttpRequests(auth -> auth` — Line 3: Authorization rules
5. `.requestMatchers("/api/public/**").permitAll()` — Line 4: Public endpoints
6. `.requestMatchers("/api/admin/**").hasRole("ADMIN")` — Line 5: Admin only
7. `.anyRequest().authenticated()` — Line 6: Everything else requires login
8. `.oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))` — Line 7: JWT validation
9. `.build();` — Line 8: Build the filter chain

The same code, clean:

```java
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    return http
        .csrf(csrf -> csrf.disable())
        .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/api/public/**").permitAll()
            .requestMatchers("/api/admin/**").hasRole("ADMIN")
            .anyRequest().authenticated()
        )
        .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
        .build();
}
```

## Real-world scenario — user registration and login


**What this code does — step by step:**

1. Registration flow — line by line
2. `private final UserRepository userRepo;` — Line 1: Database access
3. `private final PasswordEncoder encoder;` — Line 2: Password hashing
4. `private final JwtTokenProvider tokenProvider;` — Line 3: JWT generation
5. Line 1: Check if username already exists
6. Line 2: Hash the password (NEVER store plaintext!)
7. Line 3: Create and save the user
8. Line 4: Generate JWT token
9. Line 5: Return token + user info
10. Login flow — line by line
11. Line 1: Load user by username
12. Line 2: Verify password (BCrypt comparison)
13. Line 3: Generate JWT token
14. Line 4: Return token + user info

The same code, clean:

```java
@Service
public class AuthService {
    private final UserRepository userRepo;
    private final PasswordEncoder encoder;
    private final JwtTokenProvider tokenProvider;

    public AuthResponse register(RegisterRequest req) {
        if (userRepo.existsByUsername(req.username())) {
            throw new ConflictException("Username taken");
        }

        String hashedPassword = encoder.encode(req.password());

        User user = new User(req.username(), hashedPassword, req.displayName());
        userRepo.save(user);

        String token = tokenProvider.generate(user);

        return new AuthResponse(token, UserDto.from(user));
    }

    public AuthResponse login(LoginRequest req) {
        User user = userRepo.findByUsername(req.username())
            .orElseThrow(() -> new BadCredentialsException("Invalid credentials"));

        if (!encoder.matches(req.password(), user.getPassword())) {
            throw new BadCredentialsException("Invalid credentials");
        }

        String token = tokenProvider.generate(user);

        return new AuthResponse(token, UserDto.from(user));
    }
}
```

## Common mistakes

| Mistake | Why it's dangerous | Fix |
|---|---|---|
| Storing plaintext passwords | Data breach exposes all passwords | Use BCrypt/Argon2 |
| Custom hash algorithms | You'll get it wrong — always | Use Spring's `PasswordEncoder` |
| Skipping authorization checks | Any authenticated user can access admin endpoints | Configure `authorizeHttpRequests` |
| Storing JWT in localStorage | XSS vulnerability | Use httpOnly cookies |
| Returning 403 for unauthenticated | Clients don't know to re-login | Return 401 for missing token |

## Key takeaways

- Authentication = who; authorization = may they; both live in the request pipeline
- `SecurityContextHolder` = current principal; `@AuthenticationPrincipal` = typed access
- BCrypt (or Argon2) for passwords — never plaintext, never custom hashing
- `AuthenticationManager` + providers = the pluggable core
- The filter chain runs BEFORE your controller — security is enforced at the entry point

**Official docs:** [Password storage](https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html) · [Architecture](https://docs.spring.io/spring-security/reference/servlet/architecture.html)

## References

- [Codecademy — Learn Java course](https://www.codecademy.com/learn/learn-java)
- [docs.spring.io/spring-security/reference](https://docs.spring.io/spring-security/reference/)
