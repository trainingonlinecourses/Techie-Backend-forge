---
title: OpenAPI & API Documentation with springdoc
summary: Self-documenting REST APIs — OpenAPI 3 descriptors, springdoc-openapi annotations, Swagger UI, and generating typed clients from the contract.
order: 2
minutes: 13
topics: [openapi, swagger, springdoc, api documentation, api contract]
docs:
  - https://springdoc.org/
  - https://swagger.io/specification/
---

# OpenAPI & API Documentation with springdoc

## What OpenAPI is

**OpenAPI 3** is the machine-readable contract for HTTP APIs: paths, parameters, request/response schemas, auth schemes. It's the "interface definition" of REST — and because Spring controllers already encode all of that in annotations, the descriptor can be **generated** instead of hand-written.

```xml
<dependency>
  <groupId>org.springdoc</groupId>
  <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
  <version>2.x</version>
</dependency>
```

That one dependency gives you:

- `/v3/api-docs` — the JSON OpenAPI descriptor, generated from your controllers.
- `/swagger-ui.html` — an interactive UI to browse and try every endpoint.

No annotations needed for the basics: `@RestController` + DTOs + `@Valid` constraints all become schema automatically.

## Enriching the contract with annotations

The generated descriptor is only as good as the metadata you add:

```java
@Operation(summary = "Create an order", description = "Validates stock and reserves payment")
@ApiResponses({
    @ApiResponse(responseCode = "201", description = "Order created", content = @Content(schema = @Schema(implementation = OrderDto.class))),
    @ApiResponse(responseCode = "400", description = "Validation failed"),
    @ApiResponse(responseCode = "401", description = "Missing or invalid token")
})
@PostMapping("/orders")
ResponseEntity<OrderDto> create(@Valid @RequestBody CreateOrderRequest req) { ... }

public record CreateOrderRequest(
    @Schema(example = "ada@example.com", description = "Customer contact email")
    @Email String contact,
    @Schema(minimum = "0.01")
    @Positive BigDecimal amount
) {}
```

- `@Schema` adds examples/descriptions to DTOs — examples make the UI (and your testers) far more useful.
- Constraint annotations (`@NotNull`, `@Size`, `@Email`) are **translated into the schema** automatically (required, min/max length, format) — one more reason to validate with Bean Validation.
- Security schemes: with Spring Security JWT in place, `@SecurityRequirement(name = "bearerAuth")` or global config marks endpoints that need a token, and Swagger UI gets an "Authorize" button.

## Configuring the descriptor

```yaml
springdoc:
  api-docs:
    path: /v3/api-docs
  swagger-ui:
    path: /swagger-ui.html
    tags-sorter: alpha
    operations-sorter: method
  packages-to-scan: com.backendforge.academy.api
```

Grouping (`springdoc.group`) produces separate descriptors per module (`/v3/api-docs/auth`, `/orders`) — helpful once an API grows past a handful of controllers.

## Using the contract: generated clients and tests

The descriptor is a build-time asset:

- **Generate typed clients** — OpenAPI Generator / `openapi-generator-maven-plugin` turns `/v3/api-docs` into a Java/TS client. The generated interface and the Spring HTTP-interface pattern (rest-clients lesson) converge: one contract, both sides typed.
- **Contract testing** — assert the descriptor matches expectations in CI (paths exist, schemas contain required fields) so an accidental breaking change fails the build, not the consumers.
- **Mock servers** — tools like Prism serve a mock API from the descriptor, letting frontend work proceed before the backend exists.

## Exposing it safely

Swagger UI in production is a choice: it's a read-only documentation surface (no state changes beyond what endpoints already allow), but it does **reveal the full API surface** including admin endpoints. Common setups: enable in dev/staging, disable in prod (`springdoc.api-docs.enabled: false`), or gate behind auth — with Spring Security, restrict `/swagger-ui/**` and `/v3/api-docs/**` to a role.

## Key takeaways

- springdoc generates the OpenAPI descriptor and Swagger UI from your controllers — zero hand-written JSON.
- Annotate with `@Operation`/`@ApiResponses`/`@Schema` for a contract that's actually useful; Bean Validation annotations flow in automatically.
- The descriptor powers generated clients, contract tests and mock servers.
- Decide the production exposure policy (docs on, or gated by auth) explicitly.

Official docs: [springdoc-openapi](https://springdoc.org/) · [OpenAPI Specification](https://swagger.io/specification/)
