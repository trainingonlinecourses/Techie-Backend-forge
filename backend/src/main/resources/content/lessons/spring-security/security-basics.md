---
title: The Security Model — Complete Beginner's Guide
summary: Authentication vs Authorization explained from zero, password hashing, the SecurityContext, and the filter chain that protects every request.
order: 1
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

```java
// After authentication, the user's identity is stored in SecurityContext
@GetMapping("/me")
public UserDto me(@AuthenticationPrincipal UserPrincipal principal) {
    // Line 1: @AuthenticationPrincipal extracts the current user from SecurityContext
    // Line 2: principal contains the user's ID, username, roles, etc.
    return UserDto.from(principal.user());
}

// You can also access it directly:
@GetMapping("/me")
public UserDto me() {
    SecurityContext ctx = SecurityContextHolder.getContext();  // Line 1: Get the context
    Authentication auth = ctx.getAuthentication();             // Line 2: Get the authentication
    String username = auth.getName();                          // Line 3: Get the username
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

```java
// Spring Boot auto-configures BCrypt — just declare the bean
@Bean
PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();     // Line 1: Creates a BCrypt encoder
    // Line 2: Automatically strengthens over time as hardware gets faster
}

// Hashing a password during registration
String rawPassword = "hunter2";                          // Line 1: The raw password
String hashedPassword = passwordEncoder.encode(rawPassword);  // Line 2: Hash it
// Line 3: Result looks like: $2a$10$N9qo8uLOickgx2ZMRZoMye... (contains salt + cost)

// Verifying a password during login
boolean matches = passwordEncoder.matches("hunter2", hashedPassword);  // Line 1: Re-hash the input
// Line 2: Compare with stored hash — returns true if they match
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

```java
// Example: JWT-based authentication
@Component
public class JwtAuthFilter extends OncePerRequestFilter {
    private final JwtDecoder jwtDecoder;           // Line 1: Decodes JWT tokens
    private final UserDetailsService userDetailsService;  // Line 2: Loads user from DB
    
    @Override
    protected void doFilterInternal(HttpServletRequest request,
            HttpServletResponse response, FilterChain chain) {
        
        String token = extractToken(request);      // Line 1: Get token from header
        if (token != null) {
            Jwt jwt = jwtDecoder.decode(token);    // Line 2: Decode and validate
            String username = jwt.getSubject();     // Line 3: Extract username
            
            UserDetails user = userDetailsService.loadUserByUsername(username);  // Line 4: Load user
            
            Authentication auth = new UsernamePasswordAuthenticationToken(
                user, null, user.getAuthorities()   // Line 5: Create authentication object
            );
            SecurityContextHolder.getContext().setAuthentication(auth);  // Line 6: Store in context
        }
        chain.doFilter(request, response);         // Line 7: Continue the filter chain
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

```java
// The security configuration defines which filters run
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    return http
        .csrf(csrf -> csrf.disable())                    // Line 1: Disable CSRF for APIs
        .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))  // Line 2: No sessions
        .authorizeHttpRequests(auth -> auth               // Line 3: Authorization rules
            .requestMatchers("/api/public/**").permitAll()  // Line 4: Public endpoints
            .requestMatchers("/api/admin/**").hasRole("ADMIN")  // Line 5: Admin only
            .anyRequest().authenticated()                 // Line 6: Everything else requires login
        )
        .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))  // Line 7: JWT validation
        .build();                                         // Line 8: Build the filter chain
}
```

## Real-world scenario — user registration and login

```java
// Registration flow — line by line
@Service
public class AuthService {
    private final UserRepository userRepo;          // Line 1: Database access
    private final PasswordEncoder encoder;          // Line 2: Password hashing
    private final JwtTokenProvider tokenProvider;   // Line 3: JWT generation
    
    public AuthResponse register(RegisterRequest req) {
        // Line 1: Check if username already exists
        if (userRepo.existsByUsername(req.username())) {
            throw new ConflictException("Username taken");
        }
        
        // Line 2: Hash the password (NEVER store plaintext!)
        String hashedPassword = encoder.encode(req.password());
        
        // Line 3: Create and save the user
        User user = new User(req.username(), hashedPassword, req.displayName());
        userRepo.save(user);
        
        // Line 4: Generate JWT token
        String token = tokenProvider.generate(user);
        
        // Line 5: Return token + user info
        return new AuthResponse(token, UserDto.from(user));
    }
    
    // Login flow — line by line
    public AuthResponse login(LoginRequest req) {
        // Line 1: Load user by username
        User user = userRepo.findByUsername(req.username())
            .orElseThrow(() -> new BadCredentialsException("Invalid credentials"));
        
        // Line 2: Verify password (BCrypt comparison)
        if (!encoder.matches(req.password(), user.getPassword())) {
            throw new BadCredentialsException("Invalid credentials");
        }
        
        // Line 3: Generate JWT token
        String token = tokenProvider.generate(user);
        
        // Line 4: Return token + user info
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
