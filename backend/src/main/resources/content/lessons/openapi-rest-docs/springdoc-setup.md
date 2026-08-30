---
title: Springdoc — OpenAPI in Spring Boot
module: openapi-rest-docs
order: 2
minutes: 23
topics: ["springdoc-openapi", "swagger config", "OpenAPI bean", "security schemes", "groups"]
docs:
  - title: "springdoc-openapi documentation"
    url: "https://springdoc.org/"
summary: Most apps need nothing beyond the dependency. The configuration work begins when you want to customize: the API's metadata (title, version, descrip...
---

# Springdoc — OpenAPI in Spring Boot

## The Concept: The Least-Setup Documentation You'll Ever Do

**springdoc-openapi** is the library that brings OpenAPI to Spring Boot: add one dependency, and your controllers become a live API spec + interactive UI. It works by scanning `@RestController`s and their annotations at startup and building an `OpenAPI` object — the in-memory spec that `/v3/api-docs` serializes.

Most apps need nothing beyond the dependency. The configuration work begins when you want to customize: the API's metadata (title, version, description), security schemes (so the UI can send tokens), grouping (public vs internal endpoints), and controlling what's exposed in production.

## The Code Walkthrough

```java
// ---- 1. The dependency ----
// Maven:
// <dependency>
//   <groupId>org.springdoc</groupId>
//   <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
//   <version>2.6.0</version>
// </dependency>

// ---- 2. Customize the API metadata + security scheme ----
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI academyOpenApi() {
        final String securitySchemeName = "bearerAuth";

        return new OpenAPI()
                .info(new Info()
                        .title("BackendForge Academy API")
                        .description("Course catalog, progress, and AI tutor APIs")
                        .version("1.0.0"))
                // Tell Swagger UI: this API uses Bearer tokens
                .addSecurityItem(new SecurityRequirement().addList(securitySchemeName))
                .components(new Components().addSecuritySchemes(securitySchemeName,
                        new SecurityScheme()
                                .name(securitySchemeName)
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")));
    }
}
```

```properties
# ---- 3. Runtime configuration (application.properties) ----
springdoc.api-docs.path=/v3/api-docs          # where the spec lives
springdoc.swagger-ui.path=/swagger-ui.html    # where the UI lives
springdoc.swagger-ui.tags-sorter=alpha        # sort tags alphabetically
springdoc.show-actuator=false                 # don't document actuator endpoints
```

### Walking Through Each Part

**The `OpenAPI` bean** — the customization point. `Info` sets the API's title/description/version — this is what consumers see first. A well-described API starts with these three fields.

**The security scheme** — `bearerAuth`: declares that operations can require an HTTP Bearer token (JWT). Once declared, Swagger UI shows an **Authorize** button where users paste a token; every request from the UI then carries `Authorization: Bearer <token>`. Without this, testing protected endpoints in the UI is impossible.

**The properties** — paths, sorting, and what's included. `springdoc.show-actuator=false` keeps actuator internals out of the public spec (the default is to exclude them).

## Documenting Auth on Individual Operations

```java
@Operation(security = { @SecurityRequirement(name = "bearerAuth") })
@GetMapping("/me")
public UserDto me() { ... }
```

Or apply globally (the bean above) and refine per-operation. Public endpoints (login) can *clear* the requirement:

```java
@Operation(security = {})
@PostMapping("/auth/login")
public TokenDto login(@RequestBody LoginRequest r) { ... }
```

## Grouping — Public vs Internal Specs

For larger APIs, group endpoints into separate specs:

```java
@Bean
public GroupedOpenApi publicApi() {
    return GroupedOpenApi.builder()
            .group("public")
            .pathsToMatch("/api/courses/**", "/api/auth/**")
            .build();
}

@Bean
public GroupedOpenApi internalApi() {
    return GroupedOpenApi.builder()
            .group("internal")
            .pathsToMatch("/admin/**", "/internal/**")
            .build();
}
```

Each group gets its own spec endpoint (`/v3/api-docs/public`, `/v3/api-docs/internal`) and its own UI tab. Useful when the internal API shouldn't be shown to external consumers.

## Production Security — Don't Ship the Blueprint to the World

Swagger UI is a complete map of your API — great in dev, dangerous if public in prod. Options:

1. **Disable entirely in prod** (profile-scoped):
```properties
# application-prod.properties
springdoc.api-docs.enabled=false
springdoc.swagger-ui.enabled=false
```

2. **Protect with Spring Security** — only admins/devs reach the UI paths.

3. **Keep it internal-only** — bind to an internal port or behind the VPN.

Choose based on whether the API is public (documentation is a feature — keep it, but protect mutation endpoints) or internal (disable the UI in prod).

## Testing Against the Spec

The generated spec is also your **contract** for tests:

- **Assert the spec matches reality** — call `/v3/api-docs`, verify the endpoint you just added appears (a smoke test that catches misconfigured mappings).
- **Contract tests** — validate request/response shapes against the schemas.
- **Client generation** — CI regenerates the frontend client from the spec and fails on breaking changes (see the previous lesson).

## Common Beginner Pitfalls

1. **Forgetting the security scheme** — the UI can't test protected endpoints; users hand-curl instead.
2. **`show-actuator` left on** — internal endpoints leak into the public spec.
3. **Production UI exposed** — disable or secure it by profile.
4. **No `Info` bean** — the spec is generated, but with a generic title; spend the 3 lines.
5. **DTOs leaking internals** — spec shows entity fields (including hashed passwords, ids); use response DTOs.
6. **Version mismatches** — springdoc version must match your Boot 3.x (use the `springdoc-openapi-starter-webmvc-ui` artifact for Boot 3).

## Key Takeaways

- springdoc = one dependency → live spec at `/v3/api-docs` + UI at `/swagger-ui.html`.
- Customize via an `OpenAPI` bean: title/version/description, security schemes, grouping.
- The `bearerAuth` scheme gives the UI an Authorize button for JWT testing.
- Group APIs (public vs internal) into separate specs.
- Protect the UI in production: disable by profile or secure with Spring Security.
- The spec doubles as a contract for tests and client generation.
