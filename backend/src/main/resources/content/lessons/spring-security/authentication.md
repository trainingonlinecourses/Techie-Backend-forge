---
title: Authentication — Users, Password Encoding & Providers
summary: UserDetailsService, DaoAuthenticationProvider, AuthenticationManager and how username/password auth really works.
order: 3
minutes: 18
topics: [userdetailsservice, authenticationmanager, daoauthenticationprovider]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/authentication/index.html
  - https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/index.html
---

# Authentication — Users, Password Encoding & Providers

## The building blocks

```
LoginController → AuthenticationManager.authenticate(UsernamePasswordAuthenticationToken)
                        ↓
                ProviderManager (list of providers)
                        ↓
        DaoAuthenticationProvider (first that supports this token)
                        ↓
          UserDetailsService.loadUserByUsername(username)
                        ↓
              UserDetails (principal) + PasswordEncoder.matches(password, hash)
                        ↓
              authenticated Authentication → SecurityContext
```

## UserDetailsService: where users come from

```java
@Service
public class AppUserDetailsService implements UserDetailsService {

    private final UserRepository users;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = users.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("Unknown user"));
        return new UserPrincipal(user);          // adapts your entity to UserDetails
    }
}
```

```java
public class UserPrincipal implements UserDetails {
    private final User user;

    @Override public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()));
    }
    @Override public String getPassword() { return user.getPassword(); }   // the BCrypt hash
    @Override public String getUsername() { return user.getUsername(); }
}
```

## Wiring the provider and manager

```java
@Bean
DaoAuthenticationProvider authenticationProvider(UserDetailsService uds, PasswordEncoder encoder) {
    DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
    provider.setUserDetailsService(uds);
    provider.setPasswordEncoder(encoder);        // BCrypt by default
    return provider;
}

@Bean
AuthenticationManager authenticationManager(DaoAuthenticationProvider provider) {
    return new ProviderManager(provider);
}
```

`DaoAuthenticationProvider` does the security-critical part: it loads the user, runs `passwordEncoder.matches(raw, hash)` (constant-time comparison), and rejects on failure.

## Using it in a login endpoint

```java
@PostMapping("/login")
public AuthResponse login(@Valid @RequestBody LoginRequest req) {
    var auth = authenticationManager.authenticate(
            new UsernamePasswordAuthenticationToken(req.username(), req.password()));
    UserPrincipal principal = (UserPrincipal) auth.getPrincipal();
    String token = jwtService.issue(principal.user());     // → next lesson
    return new AuthResponse(token, UserDto.from(principal.user()));
}
```

## Registration: encode before saving

```java
@Transactional
public AuthResponse register(RegisterRequest req) {
    if (users.existsByUsername(req.username())) {
        throw new ConflictException("Username is already taken");
    }
    User user = new User();
    user.setUsername(req.username().toLowerCase());
    user.setPassword(encoder.encode(req.password()));     // BCrypt — the ONLY way
    users.save(user);
    return new AuthResponse(jwtService.issue(user), UserDto.from(user));
}
```

## Failure modes to know

- **`BadCredentialsException`** — wrong username or password (same message for both; don't reveal which).
- **`DisabledException` / `LockedException`** — account state.
- **`UsernameNotFoundException`** — be careful: exposing it can leak which users exist.

> **Why it matters (organizational view)** — This is the pattern every org uses: JPA user → `UserDetailsService` → `DaoAuthenticationProvider` → `AuthenticationManager`. The rules: BCrypt (or Argon2) only, same error for unknown-user vs wrong-password, lowercase/normalize usernames, and never return the principal's password in any API response.

## Key takeaways

- `UserDetailsService` loads users; `DaoAuthenticationProvider` verifies; manager orchestrates.
- `PasswordEncoder` = BCrypt default; encode on register, never store plaintext.
- Constant-time `matches`; uniform error messages.
- `@AuthenticationPrincipal` hands you your principal in controllers.

**Official docs:** [Authentication](https://docs.spring.io/spring-security/reference/servlet/authentication/index.html) · [Passwords](https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/index.html)
