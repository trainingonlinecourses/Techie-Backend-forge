---
title: API Docs with Spring REST Docs
summary: Test-driven API documentation — assertions on the request/response contract, Asciidoctor snippets, and how REST Docs differs from Swagger UI.
order: 6
minutes: 13
topics: [spring rest docs, api documentation, test-driven docs, asciidoctor, snippets]
docs:
  - https://docs.spring.io/spring-restdocs/reference/
---

# API Docs with Spring REST Docs

## The philosophy: docs from tests, not annotations

Spring REST Docs generates API documentation **from the tests you already write**. The test performs a real request against the MockMvc/WebTestClient/RestAssured, and REST Docs captures the actual request and response as **snippets** (Asciidoctor files). Then Asciidoctor assembles them into HTML/PDF.

Why this beats annotation-based docs (Swagger UI/springdoc): the documented request/response is **guaranteed real** — it was executed in a passing test. If the endpoint changes shape, the test fails and the docs go stale *loudly*.

## The flow

```
@Test (MockMvc) ──with .andDo(document("orders/create"))──▶ snippets/*.adoc
    ├─ curl-request.adoc     the exact curl from the test
    ├─ http-request.adoc     raw HTTP
    ├─ http-response.adoc
    └─ request-body.adoc / response-fields.adoc (documented fields)
                                                         │
index.adoc ──Asciidoctor Maven plugin──▶ index.html     ◀─┘
```

## The test that documents

```java
@SpringBootTest
@AutoConfigureMockMvc
class OrderDocumentation {

    @Autowired MockMvc mvc;

    @Test
    void createOrder() throws Exception {
        this.mvc.perform(post("/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"customer":"ada@example.com","amount":49.90}
                    """))
            .andExpect(status().isCreated())
            .andDo(document("orders/create",
                requestFields(
                    fieldWithPath("customer").description("Customer contact email"),
                    fieldWithPath("amount").description("Order total in EUR")),
                responseFields(
                    fieldWithPath("id").description("Generated order id"),
                    fieldWithPath("status").description("Initial status: PENDING"))));
    }
}
```

`fieldWithPath(...)` **documents and asserts simultaneously** — every field in the actual response must be described (a new field fails the test until documented), and every documented field must exist. The docs and the contract can't drift.

## Documenting the details

- **Request/response bodies**: `requestFields`/`responseFields` with nested paths (`lines[].productId`), `subsectionWithPath` for objects documented elsewhere, `optional()` for nullable fields.
- **Headers/params**: `requestHeaders(headerWithPath("Authorization").description("Bearer JWT"))`, `pathParameters`, `queryParameters`.
- **Constraints**: `fieldWithPath("amount").description("must be positive")` — pair with `@Schema`/validation so the prose matches the rules.
- **Errors**: `document("orders/errors")` on a 400 test captures the error contract — the stable `code`/`message` shape clients depend on.

## Assembling the site

```adoc
// src/docs/asciidoc/index.adoc
= Orders API

== Create an order
operation::orders/create[]
```

The `asciidoctor-maven-plugin` (`spring-boot-starter-parent` manages versions) renders `target/generated-docs/index.html` from the snippets. CI publishes it (or the OpenAPI bridge does — see below).

## REST Docs vs. springdoc/OpenAPI

They're complements, not rivals:

| | Spring REST Docs | springdoc (OpenAPI) |
|---|---|---|
| Source of truth | executed tests | annotations + reflection |
| Guarantee | snippets are real | schema is generated, prose is manual |
| Interactivity | static HTML | Swagger UI "try it" |
| Machine-readable | no (by itself) | yes — OpenAPI JSON |

The bridge: **`spring-restdocs-openapi`** converts REST Docs snippets into an OpenAPI document — docs that are test-proven *and* machine-readable, feeding generated clients and mock servers. That's the production combination: REST Docs for accuracy, OpenAPI for tooling.

## Key takeaways

- Documentation lives in tests: `.andDo(document(...))` + `fieldWithPath` = docs and contract assertions in one.
- Every real field must be documented — drift becomes a test failure, not a support ticket.
- Snippets → Asciidoctor → HTML site in the build; CI publishes it.
- Combine with springdoc: test-proven accuracy plus machine-readable OpenAPI.

Official docs: [Spring REST Docs](https://docs.spring.io/spring-restdocs/reference/)
