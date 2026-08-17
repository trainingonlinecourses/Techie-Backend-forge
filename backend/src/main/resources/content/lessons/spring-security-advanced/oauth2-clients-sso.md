---
title: OAuth2 Client — Login with Google, GitHub & SSO
summary: Adding "Sign in with …" to your app — the OAuth2 client filter chain, provider registration, user info mapping and the OIDC login flow.
order: 4
minutes: 14
topics: [oauth2 client, oidc, sso, sign in with google, userinfo, federated login]
docs:
  - https://docs.spring.io/spring-security/reference/servlet/oauth2/login/index.html
  - https://docs.spring.io/spring-security/reference/servlet/oauth2/client/index.html
---

# OAuth2 Client — Login with Google, GitHub & SSO

## The other side of OAuth2

The **client** is the app with the "Sign in with Google / GitHub / your-company-SSO" button. Spring Security's OAuth2 **client** support implements the whole dance for you — redirect to the provider, receive the callback, exchange the code, and create a local authenticated user.

## Adding a provider: three properties

```yaml
spring:
  security:
    oauth2:
      client:
        registration:
          google:
            client-id: ${GOOGLE_CLIENT_ID}
            client-secret: ${GOOGLE_CLIENT_SECRET}
            scope: openid, profile, email
        provider:
          google:
            issuer-uri: https://accounts.google.com   # discovery: endpoints + JWKS auto-wired
```

That single registration gives you: `/oauth2/authorization/google` (start login), the callback handler at `/login/oauth2/code/google` (registered automatically), and a redirect to `/` on success. **Issuer-based discovery** (`issuer-uri`) means you never hard-code endpoint URLs — the client fetches the provider's `.well-known` document and wires everything.

GitHub works the same (`github` registration, no `openid` scope — it's OAuth2 without OIDC), as does any issuer: Okta, Auth0, Keycloak, your own Spring Authorization Server from the previous lesson.

## The login flow, end to end

```
1. User clicks "Sign in with Google"
2. App → /oauth2/authorization/google
3. App → Google: /authorize?client_id=…&redirect_uri=/login/oauth2/code/google&scope=…
4. Google: user authenticates, consents
5. Google → app: redirect_uri?code=…
6. App (server-side!): POST /token with code + secret  ← secret never leaves the server
7. App: validates id_token (JWKS), fetches /userinfo
8. App: local session created → user is logged in
```

The `client-secret` exchange happens **server-side** — that's why the client (this app) is a *confidential* client and the SPA in the resource-server lesson is a *public* client with PKCE.

## Mapping the provider user to YOUR user

Provider identity (Google `sub`, email) isn't your user model. Map on login via `OAuth2UserService`:

```java
@Service
public class CustomOAuth2UserService extends DefaultOAuth2UserService {

    @Override
    public OAuth2User loadUser(OAuth2UserRequest req) throws OAuth2AuthenticationException {
        OAuth2User providerUser = super.loadUser(req);
        String email = providerUser.getAttribute("email");
        // find-or-create in your users table, link accounts, assign roles…
        return new AppOAuth2User(user);          // wrap with YOUR authorities/roles
    }
}
```

```java
http.oauth2Login(oauth -> oauth
    .userInfoEndpoint(ui -> ui.userService(customService))
    .defaultSuccessUrl("/dashboard", true));
```

The pattern to get right: **provider identity (sub) must be unique per provider** — storing by email alone lets an attacker who controls the victim's email at another provider hijack the account. Store `provider` + `providerSub` as the link key.

## Multiple providers, one app

```yaml
registration:
  google: …
  github:
    client-id: ${GITHUB_CLIENT_ID}
    client-secret: ${GITHUB_CLIENT_SECRET}
  internal:
    client-id: ${INTERNAL_OAUTH_CLIENT_ID}
    client-secret: ${INTERNAL_OAUTH_CLIENT_SECRET}
    authorization-grant-type: authorization_code
    scope: openid, profile
```

Each registration gets its own login button and callback path. **Account linking** — the same email from Google and GitHub — is your policy decision: auto-link by verified email, or force explicit "connect accounts" flow. Security-sensitive apps choose explicit.

## OIDC specifics: id_token, nonce, logout

- With `openid` scope you get an **`id_token`** — the JWT that proves who the user is (subject + claims), validated against the provider's JWKS.
- **Nonce** — the id_token carries a nonce the client set at authorize-time; it proves the token was minted for *this* login, killing replay. Spring handles it — keep the OIDC scopes standard.
- **Logout** — ending a local session doesn't end the provider session: OIDC **front-channel logout** / `logout_uri` lets the provider's logout hit your app (and vice versa). For SSO across apps, that coordination is the whole point of the provider.

## Testing the client flow

```java
// Mock the provider with spring-security-oauth2-client test support:
http.oauth2Login(oauth -> oauth
    .userInfoEndpoint(ui -> ui.userService(mockUserService)))   // no real Google in tests
// then: GET /oauth2/authorization/google with the mocked filter → assert redirect + local session
```

`MockMvc` + a mocked `OAuth2UserService` tests the entire client chain without touching the provider — the security-testing lesson's `@WithMockOAuth2User`/`@WithUser` annotations cover the logged-in side.

## Key takeaways

- `spring.security.oauth2.client.registration.*` + `issuer-uri` = full SSO login with zero controller code.
- The code-for-token exchange is server-side; the secret never reaches the browser.
- Map provider identity by `provider` + `sub`, not email alone; wrap with your authorities.
- Multiple registrations = multiple providers; plan logout semantics when going multi-app SSO.

Official docs: [OAuth2 Login](https://docs.spring.io/spring-security/reference/servlet/oauth2/login/index.html) · [OAuth2 Client](https://docs.spring.io/spring-security/reference/servlet/oauth2/client/index.html)
