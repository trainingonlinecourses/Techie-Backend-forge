---
title: Authentication Providers — How Spring Actually Authenticates
summary: AuthenticationManager, ProviderManager, DaoAuthenticationProvider, custom providers for LDAP/OTP/SSO, and the chain that decides "who are you?".
order: 13
minutes: 18
topics: [authenticationmanager, providermanager, daoauthenticationprovider, custom-provider, userdetailsservice, authentication]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/authentication/architecture.html
  - https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/index.html
---

# Authentication Providers — How Spring Actually Authenticates

## The concept: the authentication pipeline

Authentication in Spring Security is a **chain of responsibility** with three moving parts:

1. **`AuthenticationManager`** — the entry point: given an `Authentication` object (e.g., username+password), return a *fully authenticated* `Authentication` or throw.
2. **`ProviderManager`** (the default `AuthenticationManager`) — holds a list of **`AuthenticationProvider`s** and tries each in order until one *supports* the token type and authenticates it.
3. **`AuthenticationProvider`** — knows how to authenticate *one kind* of credential. `DaoAuthenticationProvider` handles username/password against a `UserDetailsService`; others handle JWT, OTP codes, LDAP, OAuth2, etc.

```text
AuthenticationFilter (reads credentials from the request)
   ↓  builds UsernamePasswordAuthenticationToken
AuthenticationManager (ProviderManager)
   ↓  asks each provider: "supports()?"
DaoAuthenticationProvider.supports(UsernamePasswordAuthenticationToken) → true
   ↓  loads UserDetails via UserDetailsService, verifies password (PasswordEncoder.matches)
   ↓  returns a fully-authenticated Authentication (authorities populated)
   ↓
SecurityContextHolder.setContext(...) — the user is now "authenticated" for this request
```

## The default pieces, dissected

**`DaoAuthenticationProvider`** is what you get from `AuthenticationManagerBuilder`/`@EnableWebSecurity` with a `UserDetailsService`:

```java
@Service
public class AppUserDetailsService implements UserDetailsService {
    private final UserRepository users;

    @Override
    public UserDetails loadUserByUsername(String username) {
        return users.findByEmail(username)
            .orElseThrow(() -> new UsernameNotFoundException("No user: " + username));
        // returning a UserDetails whose getAuthorities() feeds role checks
    }
}

// Security wiring — Spring assembles:
//   DaoAuthenticationProvider(userDetailsService, passwordEncoder)
//   ProviderManager(List.of(daoProvider))
//   AuthenticationManager = ProviderManager
```

The provider handles the timing-safe `matches()` check, unlocks/locks disabled accounts (`UserDetails.isEnabled()`), and populates authorities.

## How we use it in an organization: the scenarios

**Scenario 1 — multi-factor: add an OTP provider.** Username+password authenticates the *first* factor; a second `AuthenticationProvider` handles the OTP token:

```java
public class OtpAuthenticationProvider implements AuthenticationProvider {
    private final OtpService otpService;

    @Override
    public Authentication authenticate(Authentication authentication) {
        OtpToken token = (OtpToken) authentication;
        if (!otpService.verify(token.getCode(), token.getUserId())) {
            throw new BadCredentialsException("Invalid OTP");
        }
        return new UsernamePasswordAuthenticationToken(
            token.getUserId(), null, token.getAuthorities());
    }

    @Override
    public boolean supports(Class<?> authentication) {
        return OtpToken.class.isAssignableFrom(authentication);
    }
}

@Configuration
public class AuthConfig {
    @Bean
    public AuthenticationManager authenticationManager(UserDetailsService uds,
                                                       PasswordEncoder encoder,
                                                       OtpAuthenticationProvider otp) {
        DaoAuthenticationProvider dao = new DaoAuthenticationProvider(encoder);
        dao.setUserDetailsService(uds);
        return new ProviderManager(List.of(dao, otp));   // try dao first, then otp
    }
}
```

**Scenario 2 — corporate SSO / LDAP for employees.** Employee logins go to the corporate directory; customer logins hit the app database. Two providers, and the *client* decides which by the token type or the username pattern:

```java
return new ProviderManager(List.of(
    new LdapAuthenticationProvider(ldapContextSource, ldapAuthoritiesPopulator), // employees
    daoProvider                                                                   // customers
));
```

**Scenario 3 — API-key authentication for machine clients.** A provider that validates an `X-Api-Key` header against a table of service accounts, producing an `Authentication` with service-account authorities — same architecture, different credential type.

## The `supports()` contract — why order matters

`ProviderManager` iterates providers; the **first whose `supports()` returns true and which authenticates successfully** wins. If no provider supports the token, or all throw, authentication fails. So:

- A custom provider must implement `supports()` *precisely* — returning true too broadly can swallow tokens meant for other providers.
- Provider **order** decides priority when multiple support the same token type — the `DaoAuthenticationProvider` should generally run before a custom one that also handles username/password, or the custom one never fires.

## Pitfalls

- **`AuthenticationManager` is a single bean** — don't create ad-hoc `ProviderManager`s in filters; expose it via `AuthenticationConfiguration` (`authenticationConfiguration.getAuthenticationManager()`) so the whole app shares one.
- **Always call `eraseCredentials()`** (or let the provider do it) so raw passwords don't linger in the `Authentication` object in the session.
- **A provider that returns without authorities** produces an authenticated-but-roleless user — fine for pure authentication, but role checks will fail; populate authorities or `hasRole` checks will deny everything.
- **Don't re-implement password verification** — `DaoAuthenticationProvider` already does salt, timing-safe compare, and lockout; a custom provider doing its own hashing invites subtle bugs.

## Key takeaways

- Authentication = `AuthenticationManager` → `ProviderManager` → ordered `AuthenticationProvider`s.
- `DaoAuthenticationProvider` + `UserDetailsService` + `PasswordEncoder` covers standard username/password.
- Custom providers plug in any credential type: OTP, LDAP, API keys, SSO.
- `supports()` decides routing; provider order decides priority.
- Share one `AuthenticationManager`; erase credentials; populate authorities.
