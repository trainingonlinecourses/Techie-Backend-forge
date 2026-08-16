---
title: OAuth2 & OpenID Connect
summary: The OAuth2 grant types, adding social login, and protecting APIs as a resource server with JWT validation.
order: 6
minutes: 18
topics: [oauth2, oidc, resource-server, authorization-code]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/oauth2/index.html
  - https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html
---

# OAuth2 & OpenID Connect

## The problem OAuth2 solves

Your API should not handle everyone's passwords. **OAuth2** lets users authorize clients without sharing credentials, and **OIDC** (OpenID Connect) adds identity on top of OAuth2 — the "who am I" claims.

## The players

| Actor | Role |
|---|---|
| **Resource Owner** | The user |
| **Client** | Your app (SPA/mobile/server) |
| **Authorization Server** | The identity provider (Keycloak, Auth0, Google, GitHub, Okta) |
| **Resource Server** | Your API — validates tokens, serves data |

## The grant types you'll actually use

| Grant | Used by | Flow |
|---|---|---|
| **Authorization Code + PKCE** | SPAs, mobile, web | Redirect → user logs in at IdP → code → token |
| **Client Credentials** | Server-to-server | Client presents its own credentials → token (no user) |
| **Password** | (legacy, discouraged) | Client collects username/password directly |
| **Refresh Token** | after auth-code | Get a new access token without re-login |

## Social login (OAuth2 login) in 3 config lines

```yaml
spring:
  security:
    oauth2:
      client:
        registration:
          github:
            client-id: ${GITHUB_CLIENT_ID}
            client-secret: ${GITHUB_CLIENT_SECRET}
```

With `spring-boot-starter-oauth2-client`, that gives you the whole redirect/state/code/token dance. Handle the post-login flow:

```java
@Bean
SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http
        .oauth2Login(Customizer.withDefaults())        // /oauth2/authorization/github
        .authorizeHttpRequests(a -> a.anyRequest().authenticated());
    return http.build();
}
```

## Resource server: protect your API with a JWT from a provider

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://your-idp.example.com/realms/app
          # Spring auto-fetches the JWK Set from the issuer's metadata
```

```java
http.oauth2ResourceServer(rs -> rs.jwt(Customizer.withDefaults()));
```

Now your API validates tokens signed by the IdP — no shared secrets, no local user table needed for authn. Claims are available in controllers:

```java
@GetMapping("/me")
public Jwt me(@AuthenticationPrincipal Jwt jwt) {
    return jwt;   // sub, email, roles claims from the IdP
}
```

## Client credentials for service accounts

```java
@Configuration
public class ServiceClientConfig {

    @Bean
    OAuth2AuthorizedClientManager clientManager(ClientRegistrationRepository registrations,
                                                OAuth2AuthorizedClientService clients) {
        var provider = new AuthorizedClientServiceOAuth2AuthorizedClientManager(registrations, clients);
        provider.setAuthorizedClientProvider(
                new ClientCredentialsOAuth2AuthorizedClientProvider());
        return provider;
    }

    // Then: get a token and call another service's API
    String token = clientManager.authorize(new OAuth2AuthorizeRequest
            .withClientRegistrationId("payments-api")
            .principal("service").build())
            .getAccessToken().getTokenValue();
}
```

## What Spring Security does for you

| Need | Starter + config |
|---|---|
| Login with Google/GitHub | `oauth2-client` + registration yml |
| Validate tokens from an IdP | `oauth2-resource-server` + `issuer-uri` |
| Machine-to-machine tokens | client credentials grant |
| Your own IdP | Keycloak / Spring Authorization Server |

> **Why it matters (organizational view)** — OAuth2 is how organizations stop owning passwords: one IdP (Keycloak, Okta, cloud IAM) issues tokens; every service is a resource server validating those tokens; SPAs use authorization code + PKCE. SSO, MFA, and user lifecycle management become the IdP's problem — your services just validate signatures.

## Key takeaways

- OAuth2 = authorization framework; OIDC = identity on top.
- Auth code + PKCE for SPAs; client credentials for services.
- Resource server = validate JWTs from the IdP's JWK set.
- Spring Boot configures most of it from `issuer-uri`.

**Official docs:** [OAuth2](https://docs.spring.io/spring-security/reference/servlet/oauth2/index.html) · [JWT resource server](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html)
