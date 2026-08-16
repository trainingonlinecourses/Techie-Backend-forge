---
title: Stateless JWT Authentication
summary: The JWT structure, issuing and validating tokens with Nimbus, and a stateless filter for REST APIs.
order: 4
minutes: 20
topics: [jwt, stateless, bearer-tokens, nimbus]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/authentication/index.html#servlet-authentication-bearer
  - https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html
---

# Stateless JWT Authentication

## Why JWT for APIs

A **stateless** API keeps no server-side session. The client proves identity on every request with a signed token:

```
POST /api/auth/login {username, password}
  → 200 { "token": "eyJhbGciOiJIUzI1NiIs..." , "user": {...} }

GET /api/accounts/iban-1
  Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
  → 200 account JSON
```

## The JWT anatomy

```
header.payload.signature
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 . eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJBRE1JTiJ9 . 4H8...
   │                                  │                          │
   alg: HS256, typ: JWT              claims (base64url JSON)     HMAC signature
```

The signature makes the token **tamper-evident**: anyone can read the payload, but only the holder of the secret can *forge* it. Store claims that identify the user — `sub` (subject), `role`, `exp` — not sensitive data.

## Issuing tokens (Nimbus — spring-boot-starter-oauth2-jose)

```java
@Service
public class JwtService {

    private final JwtEncoder encoder;
    private final JwtDecoder decoder;
    private final AppProperties props;

    public JwtService(AppProperties props) {
        this.props = props;
        SecretKey key = new SecretKeySpec(props.jwt().secret().getBytes(UTF_8), "HmacSHA256");
        JWKSource<SecurityContext> jwkSource = new ImmutableSecret<>(key);
        this.encoder = new NimbusJwtEncoder(jwkSource);        // HS256 signing
        this.decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
    }

    public String issue(User user) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("backendforge-academy")
                .issuedAt(now)
                .expiresAt(now.plusSeconds(props.jwt().expirationSeconds()))
                .subject(user.getUsername())
                .claim("uid", user.getId())
                .claim("role", user.getRole().name())
                .build();
        return encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    public String subject(String token) {
        try {
            return decoder.decode(token).getSubject();   // validates signature + expiry
        } catch (JwtException e) {
            return null;
        }
    }
}
```

## The authentication filter

```java
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserRepository users;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String username = jwtService.subject(header.substring(7));
            if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
                users.findByUsername(username).ifPresent(user -> {
                    UserPrincipal principal = new UserPrincipal(user);
                    var auth = new UsernamePasswordAuthenticationToken(
                            principal, null, principal.getAuthorities());
                    SecurityContextHolder.getContext().setAuthentication(auth);
                });
            }
        }
        chain.doFilter(request, response);
    }
}
```

Registered in the chain: `http.addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)`.

## Security config for a stateless API

```java
http
    .csrf(AbstractHttpConfigurer::disable)                    // no cookies → no CSRF
    .cors(Customizer.withDefaults())
    .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
    .exceptionHandling(e -> e
        .authenticationEntryPoint(restEntryPoint)             // JSON 401, not a redirect
        .accessDeniedHandler(restDeniedHandler))              // JSON 403
    .authorizeHttpRequests(a -> a
        .requestMatchers("/api/auth/**", "/actuator/health").permitAll()
        .anyRequest().authenticated())
    .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
```

## JWT best practices

| Rule | Why |
|---|---|
| Short expiry (15m–24h) | Limits stolen-token blast radius |
| Secret ≥ 32 random bytes, env-injected | HS256 is only as strong as the secret |
| Use RS256 (keypair) in production | Private key signs, public key verifies — no secret sharing |
| Token in `Authorization` header | Never in URLs (they get logged) |
| Validate `exp` on every request | Nimbus decoder does this automatically |
| Re-verify the user exists on each request | Revoked/deleted users stop working immediately |
| Don't put secrets in claims | Payload is readable by anyone |

> **Why it matters (organizational view)** — JWT is the org's default for machine-to-machine and SPA auth because it scales horizontally (no session store). The standard pattern: login endpoint issues a token; a filter validates it per request; roles travel as claims; `@PreAuthorize` enforces authorization. When you need logout/revocation, pair JWT with a short expiry + a denylist, or switch to opaque tokens.

## Key takeaways

- JWT = signed claims; verify signature + expiry on every request.
- Nimbus (`oauth2-jose`) encodes/decodes; HS256 dev, RS256 prod.
- Stateless: no session, filter authenticates, 401/403 as JSON.
- Re-load the user per request so deletions/roles take effect immediately.

**Official docs:** [Bearer tokens](https://docs.spring.io/spring-security/reference/servlet/authentication/index.html#servlet-authentication-bearer) · [JWT resource server](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html)
