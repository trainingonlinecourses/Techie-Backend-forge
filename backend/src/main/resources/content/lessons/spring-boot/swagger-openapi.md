---
title: API Documentation with OpenAPI / Swagger — Living Documentation
summary: springdoc-openapi setup, @Operation and @Schema annotations, grouping, authentication in docs, Swagger UI, and how organizations maintain API docs that stay in sync with code.
order: 29
minutes: 18
topics: [openapi, swagger, springdoc, api-documentation, schema, grouping, bearer-auth, swagger-ui]
docs:
  - https://springdoc.org/
  - https://swagger.io/specification/
---

# API Documentation with OpenAPI / Swagger — Living Documentation

## The concept

OpenAPI (formerly Swagger) is a standard for describing REST APIs. Springdoc-openapi generates OpenAPI 3.0 specs from your Spring code. Swagger UI renders a browsable, interactive API explorer from that spec.

**Why it matters:** API documentation is always outdated in wikis and markdown files. OpenAPI makes it **living documentation** — the spec is generated from the code, so it cannot drift.

## Setup

```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
    <version>2.6.0</version>
</dependency>
```

```yaml
# application.yml
springdoc:
  api-docs:
    path: /api-docs
  swagger-ui:
    path: /swagger-ui.html
    tags-sorter: alpha
    operations-sorter: method
```

Visit `http://localhost:8080/swagger-ui.html` for the interactive UI.

## Annotations

```java
@RestController
@RequestMapping("/api/orders")
@Tag(name = "Orders", description = "Order management operations")
public class OrderController {

    @Operation(summary = "Get all orders", description = "Returns a paginated list of orders for the authenticated user")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Orders returned successfully"),
        @ApiResponse(responseCode = "401", description = "Unauthorized")
    })
    @GetMapping
    public Page<Order> getOrders(
            @Parameter(description = "Page number (0-based)") @RequestParam(defaultValue = "0") int page,
            @Parameter(description = "Page size") @RequestParam(defaultValue = "20") int size) {
        return orderService.getOrders(page, size);
    }

    @Operation(summary = "Create a new order")
    @PostMapping
    public ResponseEntity<Order> createOrder(
            @RequestBody @Schema(description = "Order creation request") OrderRequest request) {
        Order order = orderService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(order);
    }
}
```

## Schema documentation on models

```java
@Schema(description = "Order entity")
public record OrderResponse(
    @Schema(description = "Unique order identifier", example = "ord-123")
    String id,

    @Schema(description = "Current order status", allowableValues = {"CREATED", "PAID", "SHIPPED", "DELIVERED"})
    String status,

    @Schema(description = "Total amount in USD", example = "99.99")
    BigDecimal total,

    @Schema(description = "List of items in the order")
    List<OrderLineItem> items,

    @Schema(description = "When the order was created")
    Instant createdAt
) {}
```

## API grouping

```java
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
            .info(new Info()
                .title("Backend Forge Academy API")
                .version("2.0")
                .description("Learning management system API"))
            .addSecurityItem(new SecurityRequirement().addList("bearerAuth"))
            .components(new Components()
                .addSecuritySchemes("bearerAuth",
                    new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")));
    }
}
```

```java
@Configuration
public class OpenApiGroupConfig {

    @Bean
    public GroupedOpenApi orderApis() {
        return GroupedOpenApi.builder()
            .group("Orders")
            .pathsToMatch("/api/orders/**")
            .build();
    }

    @Bean
    public GroupedOpenApi userApis() {
        return GroupedOpenApi.builder()
            .group("Users")
            .pathsToMatch("/api/users/**")
            .build();
    }
}
```

## How we use it in organizations

### Scenario 1: frontend-backend contract

Frontend developers use Swagger UI to:
- Discover available endpoints and their parameters.
- Test API calls directly from the browser.
- Copy example request bodies.
- Understand error response formats.

### Scenario 2: contract testing

Generate the OpenAPI spec and use it for contract tests:

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OrderApiContractTest {

    @Test
    void openApiSpecIsValid() {
        String spec = testRestTemplate.getForObject("/api-docs", String.class);
        // Parse and validate against OpenAPI 3.0 schema
        new OpenAPIParser().readContents(spec);
    }
}
```

### Scenario 3: API versioning documentation

```java
@RestController
@RequestMapping("/api/v2/orders")
@Tag(name = "Orders v2", description = "V2 order operations — includes bulk operations")
public class OrderControllerV2 {

    @Operation(summary = "Bulk create orders (V2 only)")
    @PostMapping("/bulk")
    public List<Order> bulkCreate(@RequestBody List<OrderRequest> requests) {
        return orderService.bulkCreate(requests);
    }
}
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Exposing Swagger UI in production | Security risk — attackers see all endpoints |
| No `@Schema` on response types | Frontend gets incomplete API docs |
| Missing `@ApiResponse` for error codes | Error formats undocumented |
| Exposing internal DTOs in API | Internal implementation leaks |
| Not versioning the API spec | Breaking changes break frontend |
