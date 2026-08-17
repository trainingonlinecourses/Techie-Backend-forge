---
title: Spring REST Docs — Test-Driven Documentation
module: openapi-rest-docs
order: 3
minutes: 24
topics: ["REST Docs", "asciidoctor", "test-driven docs", "snippets", "MockMvc"]
docs:
  - title: "Spring REST Docs"
    url: "https://docs.spring.io/spring-restdocs/reference/"
---

# Spring REST Docs — Test-Driven Documentation

## The Concept: Docs That Can't Lie (Because Tests Write Them)

Springdoc generates documentation *from code*. **Spring REST Docs** goes further: it generates documentation **from tests**. Every endpoint's documentation is written *by a passing test* — the docs literally cannot describe something that isn't there and working.

The workflow:

1. You write a **MockMvc test** that calls the endpoint.
2. The test asserts the response is correct (so the endpoint *works*).
3. The test also emits **snippets** — `.adoc` files capturing the request/response, parameters, headers, and schema.
4. **Asciidoctor** assembles the snippets into final HTML/PDF docs.

Because the snippets come from real, passing test executions, **the docs are always in sync with behavior**. If the API changes, the test changes first, and the docs regenerate with it. This is the "documentation as a test artifact" philosophy — beloved in teams that ship public APIs.

## springdoc vs REST Docs — The Honest Comparison

| | Springdoc (OpenAPI) | Spring REST Docs |
|---|---|---|
| Source | Code annotations | Tests |
| Output | OpenAPI JSON/YAML (machine-readable) | Asciidoctor HTML/PDF (human-readable) |
| Swagger UI | Built-in | Not built-in (can combine) |
| Can generate clients | Yes (from the spec) | Not directly |
| Best for | Fast, interactive docs + client gen | Precise, tested, hand-curated docs |
| Staleness risk | Low (code-driven) | Almost zero (test-driven) |

**The hybrid** (common in production): REST Docs for the *hand-written* narrative docs, plus springdoc for the machine-readable spec and Swagger UI. Many teams pick one; sophisticated teams use both for different audiences.

## The Code Walkthrough

```java
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.restdocs.AutoConfigureRestDocs;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.restdocs.mockmvc.MockMvcRestDocumentation.document;
import static org.springframework.restdocs.payload.PayloadDocumentation.*;
import static org.springframework.restdocs.request.RequestDocumentation.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@AutoConfigureRestDocs                    // enables snippet generation
class CourseControllerDocsTest {

    @Autowired
    MockMvc mockMvc;

    @Test
    void documentsCourseListing() throws Exception {
        mockMvc.perform(get("/api/courses").param("page", "0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())

                // THE DOCS: capture this request/response as documentation snippets
                .andDo(document("courses/list",
                        requestParameters(
                                parameterWithName("page").description("Page index, 0-based")),
                        responseFields(
                                fieldWithPath("content").description("Courses on this page"),
                                fieldWithPath("content[].id").description("Course id"),
                                fieldWithPath("content[].title").description("Course title"),
                                fieldWithPath("totalElements").description("Total courses"),
                                fieldWithPath("totalPages").description("Total pages"))));
    }
}
```

### Walking Through Each Part

**`@AutoConfigureRestDocs`** — turns on snippet generation for the test context. Each `.andDo(document("courses/list", ...))` writes snippets into `target/generated-snippets/courses/list/`.

**The request** — `mockMvc.perform(get("/api/courses").param("page", "0"))` actually executes the endpoint. The test *must pass* for docs to exist — that's the guarantee.

**`document(...)`** — the documentation call: `requestParameters` describes the query params; `responseFields` describes every JSON field with a human description. If a described field isn't in the response (or a response field isn't described), **the test fails** — the docs are checked as strictly as the response. This strictness is the point: docs and reality can't drift.

**The `.adoc` snippets** — for each documented call, REST Docs writes files like `http-response.adoc`, `response-fields.adoc`, `curl-request.adoc`. Asciidoctor includes them into the final document:

```asciidoc
= Academy API
== Course listing
include::{snippets}/courses/list/http-request.adoc[]
include::{snippets}/courses/list/response-fields.adoc[]
```

## The Build Integration (Maven)

```xml
<plugin>
    <groupId>org.asciidoctor</groupId>
    <artifactId>asciidoctor-maven-plugin</artifactId>
    <version>2.2.6</version>
    <executions>
        <execution>
            <id>generate-docs</id>
            <phase>prepare-package</phase>
            <goals><goal>process-asciidoc</goal></goals>
            <configuration>
                <sourceDirectory>src/docs/asciidoc</sourceDirectory>
                <outputDirectory>target/docs</outputDirectory>
                <attributes>
                    <snippets>${project.build.directory}/generated-snippets</snippets>
                </attributes>
            </configuration>
        </execution>
    </executions>
</plugin>
```

The build order: tests run (producing snippets) → Asciidoctor assembles docs → package. **Broken endpoint = failed test = no docs generated.** The documentation pipeline is the test pipeline.

## Common Beginner Pitfalls

1. **Described fields not in the response** — the strictest (and most annoying) failure: every `fieldWithPath` must match reality, or the test fails. Keep field lists in sync.
2. **Ignoring the snippets** — docs are only assembled if your `.adoc` files include the snippets; the build doesn't auto-write a full manual.
3. **Docs without tests** — the pattern only works when every endpoint has a documenting test; an undocumented endpoint is an untested endpoint.
4. **Version/dependency mismatches** — REST Docs 3.x pairs with Boot 3.x; the `spring-restdocs-mockmvc` artifact.
5. **Over-describing** — documenting every field for every endpoint is verbose; document the public contract (status codes, key fields), not internal details.
6. **Forgetting `@AutoConfigureRestDocs` in the right scope** — snippet generation needs the annotation on the test (or a shared base test class).

## Key Takeaways

- REST Docs writes documentation *from passing tests* — docs can't lie.
- MockMvc test + `.andDo(document(...))` emits snippets; Asciidoctor assembles them.
- Strict field checking: described ≠ actual fails the test (docs and reality stay in sync).
- Choose springdoc for machine-readable specs + UI; REST Docs for tested, narrative docs.
- The build integrates: tests → snippets → docs → package.
- Docs as tests means every documented endpoint is a tested endpoint.
