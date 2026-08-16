---
title: Capstone — Security & JWT End to End
summary: The full JWT security stack in the payments API — config, filter, issuing, and protecting endpoints.
order: 4
minutes: 18
topics: [capstone, jwt, security, filter]
capstone: true
docs:
  - https://docs.spring.io/spring-security/reference/servlet/authentication/index.html
---

# Capstone — Security & JWT End to End

Open `projects/payments-api/src/main/java/com/example/payments/security/` — the whole stack is there, exactly as described in the Spring Security module.

## The security config

```java
package com.example.payments.config;

import com.example.payments.security.JwtAuthFilter;
import com.example.payments.security.RestAccessDeniedHandler;
import com.example.payments.security.RestAuthEntryPoint;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http,
                                            JwtAuthFilter jwtAuthFilter,
                                            RestAuthEntryPoint entryPoint,
                                            RestAccessDeniedHandler deniedHandler) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)                     // stateless API
            .cors(Customizer.withDefaults())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(e -> e
                .authenticationEntryPoint(entryPoint)                 // JSON 401
                .accessDeniedHandler(deniedHandler))                  // JSON 403
            .authorizeHttpRequests(a -> a
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers("/api/auth/**", "/actuator/health").permitAll()
                .anyRequest().authenticated())                        // everything else needs a token
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    UserDetailsService userDetailsService(UserRepository users) {
        return username -> users.findByUsername(username)
                .map(UserPrincipal::new)
                .orElseThrow(() -> new UsernameNotFoundException("Unknown user"));
    }

    @Bean
    DaoAuthenticationProvider authenticationProvider(UserDetailsService uds, PasswordEncoder encoder) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(uds);
        provider.setPasswordEncoder(encoder);
        return provider;
    }

    @Bean
    AuthenticationManager authenticationManager(DaoAuthenticationProvider provider) {
        return new ProviderManager(provider);
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

## The JWT filter (stateless per-request auth)

```java
package com.example.payments.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserRepository users;

    public JwtAuthFilter(JwtService jwtService, UserRepository users) {
        this.jwtService = jwtService;
        this.users = users;
    }

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

## Login & register endpoints

```java
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @GetMapping("/me")
    public UserDto me(@AuthenticationPrincipal UserPrincipal principal) {
        return UserDto.from(principal.user());
    }
}
```

```java
@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (users.existsByUsername(request.username())) {
            throw new ConflictException("Username is already taken");
        }
        User user = new User();
        user.setUsername(request.username().toLowerCase());
        user.setDisplayName(request.displayName());
        user.setPassword(encoder.encode(request.password()));    // BCrypt only
        users.save(user);
        return new AuthResponse(jwtService.issue(user), UserDto.from(user));
    }

    public AuthResponse login(LoginRequest request) {
        var auth = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.username().toLowerCase(),
                        request.password()));
        UserPrincipal principal = (UserPrincipal) auth.getPrincipal();
        return new AuthResponse(jwtService.issue(principal.user()), UserDto.from(principal.user()));
    }
}
```

## Try it live

```bash
# 1. register
curl -X POST localhost:8081/api/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"ada","password":"password123","displayName":"Ada"}'

# 2. login → token
curl -X POST localhost:8081/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"ada","password":"password123"}'

# 3. call a protected endpoint with the token
curl localhost:8081/api/accounts -H "Authorization: Bearer $TOKEN"

# 4. without a token → 401 JSON
curl -i localhost:8081/api/accounts
```

> **Why it matters (organizational view)** — This exact stack (BCrypt + `UserDetailsService` + JWT filter + stateless config + JSON 401/403) is the org template for every API. Copy it, customize the claims, and every new service starts secure instead of "we'll add auth later."

## Key takeaways

- Stateless config: CSRF off, sessions off, JWT filter in the chain.
- BCrypt on register; `AuthenticationManager` on login; token on the way out.
- Everything except `/api/auth/**` and health requires a Bearer token.
- 401/403 as JSON via entry point + denied handler.

**Official docs:** [Spring Security auth](https://docs.spring.io/spring-security/reference/servlet/authentication/index.html)
