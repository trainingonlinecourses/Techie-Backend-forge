---
title: Reactive Security — Authentication & Authorization in WebFlux
summary: SecurityWebFilterChain, reactive authentication, JWT validation, route-level authorization, and the patterns that secure reactive applications. Beginner-friendly with line-by-line code.
order: 15
minutes: 22
topics: [reactive security, SecurityWebFilterChain, reactive authentication, JWT, route authorization, security filter, CORS, CSRF]
docs:
  - https://docs.spring.io/spring-security/reference/reactive/index.html
  - https://docs.spring.io/spring-security/reference/reactive/configuration/webflux-security.html
---

# Reactive Security — Authentication & Authorization in WebFlux

## Why Security is Different in Reactive (From Zero)

Spring MVC uses `SecurityFilterChain` (imperative). Spring WebFlux uses `SecurityWebFilterChain` (reactive). The concepts are the same — authentication, authorization, CSRF protection — but everything returns `Mono<Void>` instead of blocking.

Think of it like this: in MVC, a security filter stops the request and returns immediately. In WebFlux, a security filter returns a `Mono` that either continues the chain or short-circuits with an error.

---

## The Code — Line by Line

### 1. Reactive Security Configuration

```java
@Configuration
@EnableWebFluxSecurity
public class ReactiveSecurityConfig {

    @Bean
    public SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity http) {
        return http
            // === CSRF: disable for REST APIs (token-based auth) ===
            .csrf(csrf -> csrf.disable())                        // REST APIs don't use cookies

            // === CORS: allow specific origins ===
            .cors(cors -> cors.configurationSource(config -> {
                var corsConfig = new CorsConfiguration();
                corsConfig.addAllowedOrigin("https://techie-backend-forge.vercel.app");
                corsConfig.addAllowedMethod("*");                // Allow all HTTP methods
                corsConfig.addAllowedHeader("*");                // Allow all headers
                corsConfig.setAllowCredentials(true);
                return corsConfig;
            }))

            // === Authorization rules ===
            .authorizeExchange(exchanges -> exchanges
                // Public endpoints — no auth needed
                .pathMatchers("/api/auth/**").permitAll()
                .pathMatchers("/api/public/**").permitAll()
                .pathMatchers("/ws/chat").permitAll()            // WebSocket (auth via query param)
                .pathMatchers("/actuator/health").permitAll()

                // Admin-only endpoints
                .pathMatchers("/api/admin/**").hasRole("ADMIN")

                // Authenticated users only
                .pathMatchers("/api/**").authenticated()

                // Everything else
                .anyExchange().authenticated()
            )

            // === HTTP Basic (for development/testing) ===
            .httpBasic(Customizer.withDefaults())

            // === JWT (for production) ===
            // See JWT filter configuration below

            .build();
    }
}
```

**Line-by-line explained:**
- `ServerHttpSecurity` is the WebFlux equivalent of `HttpSecurity`.
- `.csrf(csrf -> csrf.disable())` — REST APIs using JWT don't need CSRF protection. CSRF protects against cookie-based attacks.
- `.cors(...)` — Configure which origins can make cross-origin requests.
- `.pathMatchers("/api/auth/**").permitAll()` — No authentication needed for login/register endpoints.
- `.pathMatchers("/api/admin/**").hasRole("ADMIN")` — Only users with ADMIN role can access these endpoints.

### 2. JWT Authentication Filter (Reactive)

```java
@Component
public class JwtAuthenticationFilter implements WebFilter {

    private final JwtTokenValidator tokenValidator;
    private final UserRepository userRepository;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        // Extract token from Authorization header
        String authHeader = exchange.getRequest()
            .getHeaders()
            .getFirst("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            // No token — continue without authentication (let authorization rules decide)
            return chain.filter(exchange);
        }

        String token = authHeader.substring(7);                  // Remove "Bearer " prefix

        return tokenValidator.validate(token)                    // Mono<Claims>
            .flatMap(claims -> {
                // Token is valid — create authentication object
                String username = claims.getSubject();
                String role = claims.get("role", String.class);

                return userRepository.findByUsername(username)
                    .map(user -> {
                        // Create Spring Security authentication
                        Authentication auth = new UsernamePasswordAuthenticationToken(
                            user,                                // Principal
                            null,                                // Credentials (already validated)
                            List.of(new SimpleGrantedAuthority("ROLE_" + role))
                        );

                        // Set authentication in the security context
                        SecurityContext context = SecurityContextHolder.createEmptyContext();
                        context.setAuthentication(auth);

                        // Attach to the exchange for downstream use
                        return exchange.getAttributes()
                            .put(SecurityWebServerContextServerWebExchange.WEBFLUX_SECURITY_CONTEXT_ATTR, context);
                    });
            })
            .then(chain.filter(exchange))                        // Continue the filter chain
            .onErrorResume(e -> {
                // Invalid token — return 401
                exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                return exchange.getResponse().setComplete();
            });
    }
}
```

### 3. Route-Level Authorization

```java
@Configuration
public class RouteConfig {

    @Bean
    public RouterFunction<ServerResponse> routes(
            AuthenticatedHandler authHandler,
            AdminHandler adminHandler) {

        return RouterFunctions.route()
            // Public routes (no auth):
            .path("/api/auth", builder -> builder
                .POST("/login", authHandler::login)
                .POST("/register", authHandler::register)
            )

            // User routes (authenticated):
            .path("/api/user", builder -> builder
                .GET("/profile", authHandler::getProfile)
                .PUT("/profile", authHandler::updateProfile)
                .filter(this::requireAuth)                       // Add auth filter to this group
            )

            // Admin routes (authenticated + admin role):
            .path("/api/admin", builder -> builder
                .GET("/users", adminHandler::listUsers)
                .DELETE("/users/{id}", adminHandler::deleteUser)
                .filter(this::requireAdmin)                      // Add admin filter
            )

            .build();
    }

    // Filter: require authentication
    private HandlerFilterFunction<ServerResponse, ServerResponse> requireAuth() {
        return (request, next) -> {
            return ReactiveSecurityContextHolder.getContext()
                .switchIfEmpty(Mono.error(new AccessDeniedException("Not authenticated")))
                .flatMap(ctx -> {
                    Authentication auth = ctx.getAuthentication();
                    if (auth == null || !auth.isAuthenticated()) {
                        return Mono.error(new AccessDeniedException("Not authenticated"));
                    }
                    return next.handle(request);
                });
        };
    }

    // Filter: require ADMIN role
    private HandlerFilterFunction<ServerResponse, ServerResponse> requireAdmin() {
        return (request, next) -> {
            return ReactiveSecurityContextHolder.getContext()
                .flatMap(ctx -> {
                    Authentication auth = ctx.getAuthentication();
                    boolean isAdmin = auth.getAuthorities().stream()
                        .anyMatch(g -> g.getAuthority().equals("ROLE_ADMIN"));
                    if (!isAdmin) {
                        return Mono.error(new AccessDeniedException("Admin role required"));
                    }
                    return next.handle(request);
                });
        };
    }
}
```

### 4. Reactive UserDetailsService

```java
@Component
public class ReactiveUserDetailsService implements ReactiveUserDetailsService {

    private final UserRepository userRepository;

    @Override
    public Mono<UserDetails> findByUsername(String username) {
        return userRepository.findByUsername(username)
            .map(user -> User.withUsername(user.getUsername())
                .password(user.getPassword())
                .roles(user.getRole().replace("ROLE_", ""))     // Remove prefix if present
                .build()
            );
    }
}
```

---

## Real-World Scenarios

### Scenario 1: JWT + Refresh Token Flow

```java
@RestController
@RequestMapping("/api/auth")
public class ReactiveAuthController {

    private final ReactiveAuthenticationManager authManager;
    private final JwtTokenProvider tokenProvider;

    @PostMapping("/login")
    public Mono<ResponseEntity<AuthResponse>> login(@RequestBody LoginRequest request) {
        return authManager.authenticate(
            new UsernamePasswordAuthenticationToken(request.username(), request.password())
        )
        .flatMap(auth -> {
            String accessToken = tokenProvider.generateAccessToken(auth);
            String refreshToken = tokenProvider.generateRefreshToken(auth);

            return Mono.just(ResponseEntity.ok(new AuthResponse(
                accessToken,
                refreshToken,
                Duration.ofHours(1).toMillis()                   // Access token expires in 1 hour
            )));
        })
        .onErrorReturn(ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
    }

    @PostMapping("/refresh")
    public Mono<ResponseEntity<AuthResponse>> refresh(@RequestBody RefreshRequest request) {
        return tokenProvider.validateRefreshToken(request.refreshToken())
            .flatMap(claims -> {
                String newAccessToken = tokenProvider.generateAccessToken(claims);
                return Mono.just(ResponseEntity.ok(new AuthResponse(
                    newAccessToken,
                    request.refreshToken(),                      // Keep same refresh token
                    Duration.ofHours(1).toMillis()
                )));
            })
            .onErrorReturn(ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
    }
}
```

### Scenario 2: Method-Level Security (Reactive)

```java
@Service
public class OrderService {

    // Only the order's owner or an admin can view it:
    @PreAuthorize("hasRole('ADMIN') or #orderId in authentication.principal.orderIds")
    public Mono<Order> getOrder(String orderId) {
        return orderRepository.findById(orderId);
    }

    // Only the order's owner can cancel it:
    @PreAuthorize("#order.userId == authentication.name")
    public Mono<Order> cancelOrder(Order order) {
        order.setStatus(OrderStatus.CANCELLED);
        return orderRepository.save(order);
    }
}
```

### Scenario 3: WebSocket Authentication

```java
@Component
public class SecureWebSocketHandler implements WebSocketHandler {

    private final JwtTokenValidator tokenValidator;

    @Override
    public Mono<Void> handle(WebSocketSession session) {
        // Extract token from query string: /ws/chat?token=xxx
        String token = Optional.ofNullable(session.getHandshakeInfo().getURI().getQuery())
            .map(q -> q.split("token="))
            .filter(parts -> parts.length > 1)
            .map(parts -> parts[1])
            .orElse(null);

        if (token == null) {
            return session.close(CloseStatus.POLICY_VIOLATION);  // No token = close
        }

        return tokenValidator.validate(token)
            .flatMap(user -> handleAuthenticated(session, user))
            .switchIfEmpty(session.close(CloseStatus.POLICY_VIOLATION).then());
    }
}
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Using MVC security config in WebFlux | Doesn't compile — different APIs | Use `SecurityWebFilterChain`, not `SecurityFilterChain` |
| Forgetting to disable CSRF for REST | POST/PUT/DELETE requests fail with 403 | Disable CSRF for JWT-based REST APIs |
| Not handling auth errors reactively | Unauthenticated users see stack traces | Return 401 in onErrorResume |
| Blocking in WebFilter | Deadlock — blocks the event loop | Always return Mono/Flux, never block |
| Hardcoded CORS origins | Breaks in different environments | Use environment variables for origins |

---

## Key Takeaways

- **`SecurityWebFilterChain`** is the WebFlux equivalent of `SecurityFilterChain`.
- **Everything is reactive** — `WebFilter` returns `Mono<Void>`, authentication is async.
- **JWT filter** extracts token → validates → creates `SecurityContext` → attaches to exchange.
- **Route-level authorization** with `RouterFunction` filters for fine-grained control.
- **Never block** in reactive security — always return `Mono`/`Flux`.

Official docs: [Reactive Security](https://docs.spring.io/spring-security/reference/reactive/index.html) · [WebFlux Security](https://docs.spring.io/spring-security/reference/reactive/configuration/webflux-security.html)
