---
title: Reactive Security — Authentication & Authorization in WebFlux
summary: SecurityWebFilterChain, reactive authentication, JWT validation, route-level authorization, and the patterns that secure reactive applications. Beginner-friendly with line-by-line code.
order: 9
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


**What this code does — step by step:**

1. === CSRF: disable for REST APIs (token-based auth) ===
2. `.csrf(csrf -> csrf.disable())` — REST APIs don't use cookies
3. === CORS: allow specific origins ===
4. `corsConfig.addAllowedMethod("*");` — Allow all HTTP methods
5. `corsConfig.addAllowedHeader("*");` — Allow all headers
6. === Authorization rules ===
7. Public endpoints — no auth needed
8. `.pathMatchers("/ws/chat").permitAll()` — WebSocket (auth via query param)
9. Admin-only endpoints
10. Authenticated users only
11. Everything else
12. === HTTP Basic (for development/testing) ===
13. === JWT (for production) ===. See JWT filter configuration below

The same code, clean:

```java
@Configuration
@EnableWebFluxSecurity
public class ReactiveSecurityConfig {

    @Bean
    public SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity http) {
        return http
            .csrf(csrf -> csrf.disable())

            .cors(cors -> cors.configurationSource(config -> {
                var corsConfig = new CorsConfiguration();
                corsConfig.addAllowedOrigin("https://techie-backend-forge.vercel.app");
                corsConfig.addAllowedMethod("*");
                corsConfig.addAllowedHeader("*");
                corsConfig.setAllowCredentials(true);
                return corsConfig;
            }))

            .authorizeExchange(exchanges -> exchanges
                .pathMatchers("/api/auth/**").permitAll()
                .pathMatchers("/api/public/**").permitAll()
                .pathMatchers("/ws/chat").permitAll()
                .pathMatchers("/actuator/health").permitAll()

                .pathMatchers("/api/admin/**").hasRole("ADMIN")

                .pathMatchers("/api/**").authenticated()

                .anyExchange().authenticated()
            )

            .httpBasic(Customizer.withDefaults())


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


**What this code does — step by step:**

1. Extract token from Authorization header
2. No token — continue without authentication (let authorization rules decide)
3. `String token = authHeader.substring(7);` — Remove "Bearer " prefix
4. `return tokenValidator.validate(token)` — Mono<Claims>
5. Token is valid — create authentication object
6. Create Spring Security authentication
7. `user,` — Principal
8. `null,` — Credentials (already validated)
9. Set authentication in the security context
10. Attach to the exchange for downstream use
11. `.then(chain.filter(exchange))` — Continue the filter chain
12. Invalid token — return 401

The same code, clean:

```java
@Component
public class JwtAuthenticationFilter implements WebFilter {

    private final JwtTokenValidator tokenValidator;
    private final UserRepository userRepository;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String authHeader = exchange.getRequest()
            .getHeaders()
            .getFirst("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return chain.filter(exchange);
        }

        String token = authHeader.substring(7);

        return tokenValidator.validate(token)
            .flatMap(claims -> {
                String username = claims.getSubject();
                String role = claims.get("role", String.class);

                return userRepository.findByUsername(username)
                    .map(user -> {
                        Authentication auth = new UsernamePasswordAuthenticationToken(
                            user,
                            null,
                            List.of(new SimpleGrantedAuthority("ROLE_" + role))
                        );

                        SecurityContext context = SecurityContextHolder.createEmptyContext();
                        context.setAuthentication(auth);

                        return exchange.getAttributes()
                            .put(SecurityWebServerContextServerWebExchange.WEBFLUX_SECURITY_CONTEXT_ATTR, context);
                    });
            })
            .then(chain.filter(exchange))
            .onErrorResume(e -> {
                exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                return exchange.getResponse().setComplete();
            });
    }
}
```

### 3. Route-Level Authorization


**What this code does — step by step:**

1. Public routes (no auth):
2. User routes (authenticated):
3. `.filter(this::requireAuth)` — Add auth filter to this group
4. Admin routes (authenticated + admin role):
5. `.filter(this::requireAdmin)` — Add admin filter
6. Filter: require authentication
7. Filter: require ADMIN role

The same code, clean:

```java
@Configuration
public class RouteConfig {

    @Bean
    public RouterFunction<ServerResponse> routes(
            AuthenticatedHandler authHandler,
            AdminHandler adminHandler) {

        return RouterFunctions.route()
            .path("/api/auth", builder -> builder
                .POST("/login", authHandler::login)
                .POST("/register", authHandler::register)
            )

            .path("/api/user", builder -> builder
                .GET("/profile", authHandler::getProfile)
                .PUT("/profile", authHandler::updateProfile)
                .filter(this::requireAuth)
            )

            .path("/api/admin", builder -> builder
                .GET("/users", adminHandler::listUsers)
                .DELETE("/users/{id}", adminHandler::deleteUser)
                .filter(this::requireAdmin)
            )

            .build();
    }

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

---

## Real-World Scenarios

### Scenario 1: JWT + Refresh Token Flow

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

### Scenario 2: Method-Level Security (Reactive)

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

### Scenario 3: WebSocket Authentication

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
```java
            .orElse(null);

        if (token == null) {
            return session.close(CloseStatus.POLICY_VIOLATION);  // No token = close
        }

        return tokenValidator.validate(token)
```
            .flatMap(user -> handleAuthenticated(session, user))
            .switchIfEmpty(session.close(CloseStatus.POLICY_VIOLATION).then());
    }
}

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

## References

- [Codecademy — Learn Java course](https://www.codecademy.com/learn/learn-java)
- [docs.spring.io/spring-framework/reference/web/webflux.html](https://docs.spring.io/spring-framework/reference/web/webflux.html)
