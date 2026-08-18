---
title: Mockito with Spring Boot — @MockBean and Slice Testing
module: mockito-deep
order: 4
minutes: 25
topics: ["@MockBean", "slice tests", "MockMvc", "Spring context", "WebMvcTest", "test doubles in Spring"]
docs:
  - title: "Testing with Spring Boot (Spring docs)"
    url: "https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html"
  - title: "MockMvc (Spring docs)"
    url: "https://docs.spring.io/spring-framework/reference/testing/spring-mvc-test-framework.html"
---

# Mockito with Spring Boot — @MockBean and Slice Testing

## The Concept: Mocks Inside the Spring Context

Mockito's plain unit tests mock *directly* — no Spring involved. But Spring Boot tests (`@SpringBootTest`, `@WebMvcTest`) create a real **application context**, and the beans inside it come from the context, not from your test code. How do you replace a context bean with a mock? The answer: **`@MockBean`** (and its modern sibling `@MockitoBean` in Boot 3.4+) — Spring's bridge that puts a Mockito mock *into the application context* in place of a real bean.

**The mental model:** the context is a hotel with staff (beans). `@SpringBootTest` checks in the whole staff; `@WebMvcTest` checks in only the front-desk staff (the web layer). `@MockBean` replaces one staff member with a *robot* (mock) — same job title, scripted responses. The rest of the staff (the real beans) interact with the robot exactly as they'd interact with the person — the whole point being that the test exercises the *real wiring* around a controlled collaborator.

## The Setup: Web Slice + Mocked Service

```java
// A WebMvcTest — a REAL Spring MVC context with ONLY the web layer
// (controller, filters, validation, error handling):
@WebMvcTest(LessonController.class)
class LessonControllerTest {

    // The controller's collaborator — replaced by a MOCK in the context:
    @MockBean
    LessonService lessonService;

    // The real MVC machinery, ready to drive HTTP-style calls:
    @Autowired
    MockMvc mockMvc;

    @Test
    void getLesson_returnsJson() throws Exception {
        // Stub the mocked bean exactly like any Mockito mock:
        when(lessonService.findById(1L))
            .thenReturn(new LessonDto(1L, "Generics Basics", 24));

        // Drive a real HTTP request through the MVC layer:
        mockMvc.perform(get("/api/lessons/1"))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.title").value("Generics Basics"))
               .andExpect(jsonPath("$.minutes").value(24));

        // Verify the interaction with the mocked bean:
        verify(lessonService).findById(1L);
    }
}
```

**Walking through it:** `@WebMvcTest(LessonController.class)` builds a *minimal* real context — the controller, the MVC machinery (MockMvc), validation, error handlers — but **not** the service layer or the database. `@MockBean LessonService` drops a Mockito mock into that context *in place of* the real service (which would pull in the whole dependency tree). The test then drives real HTTP (`get("/api/lessons/1")`), asserts on the real JSON output (`jsonPath`), and verifies the mock's interaction. This is the integration-slice sweet spot: **the web layer is real, everything below it is mocked.**

**Why this design wins:** the controller's mapping, validation, serialization, and error handling are exercised for real — the parts unit tests with plain Mockito can't reach — while the heavy layers (service, repositories, database) stay out of the test. Fast (no DB), real (actual MVC semantics), and focused (one layer at a time).

## @MockBean: What It Does and Its Costs

`@MockBean` registers a Mockito mock as a Spring bean, replacing any bean of the same type in the context. It works in `@SpringBootTest`, `@WebMvcTest`, and `@DataJpaTest`:

```java
@SpringBootTest                     // the whole app
class FullContextTest {
    @Autowired LessonService realService;    // hmm — this is the MOCK now

    @MockBean LessonRepository repo;         // repo replaced by a mock

    @Test
    void serviceWorksAgainstMockedRepo() {
        when(repo.findById(1L)).thenReturn(Optional.of(new LessonEntity(1L)));
        // the REAL service logic runs, backed by the mock repository
    }
}
```

**The costs to know (why @MockBean is not always the answer):**

1. **Context caching is invalidated.** Spring caches contexts between tests for speed; every `@MockBean` change *rebuilds the context* (a new cached entry). Many tests with different `@MockBean` sets = many context rebuilds = slow suites. The guidance: group tests that share the same mock set, and prefer slice tests (`@WebMvcTest`) over full `@SpringBootTest` with mocks.
2. **It's a blunt instrument.** Mocking the *repository* in a full-context test means the service's real SQL never runs — a contract you may want covered at the integration level (that's what `@DataJpaTest` + Testcontainers is for).
3. **Boot 3.4 renamed it** — `@MockBean` is deprecated in favor of `@MockitoBean` (same behavior, better naming). On older Boot, `@MockBean` remains standard.

**The decision framework:** use `@MockBean`/`@MockitoBean` when the test targets one layer and the layer below is a *boundary* (web → service, service → external API); use real beans (Testcontainers, embedded infrastructure) when the test targets the *contract* with that boundary (SQL correctness, real HTTP behavior).

## MockMvc: The Three Assertion Layers

MockMvc lets you assert on the full HTTP response:

```java
mockMvc.perform(post("/api/lessons")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"title\":\"A\",\"minutes\":-5}"))     // invalid input
    .andExpect(status().isBadRequest())                    // 1. status
    .andExpect(jsonPath("$.message").exists())             // 2. body shape
    .andExpect(header().string("Content-Type", containsString("application/json")))
    .andReturn();                                          // 3. full access
```

- **Status** — `isOk()`, `isBadRequest()`, `isNotFound()`, `isCreated()`.
- **Body** — `jsonPath(...)` (the JSONPath expression language: `$.title`, `$[0].id`, wildcards) or `content().json(...)` (exact JSON match).
- **Headers/raw** — `header().string(...)`, `andReturn()` gives the full `MvcResult` for custom inspection.

**The `jsonPath` matcher is the everyday tool** — one line asserts "the response contains a field with this value at this path," which is exactly the contract a controller test should verify.

## The Slices and What to Mock in Each

| Test | Real in context | Mocked with @MockBean |
|---|---|---|
| `@WebMvcTest` | controller, MVC, validation | service layer |
| `@DataJpaTest` | repositories + real DB (H2/Testcontainers) | nothing (services aren't loaded) |
| `@SpringBootTest` | everything | whatever the test must control |

The pattern to note: **`@DataJpaTest` doesn't mock the database — it uses a real (embedded or containerized) one.** That's the deliberate boundary: SQL correctness is tested with a real SQL engine; only *external* boundaries (services, APIs, message brokers) are mocked. Mocking a database hides the very bugs (bad queries, wrong mappings) the data layer exists to catch.

## When Mockito-in-Spring Isn't Enough

The full-context tests with heavy mocking can become *detached from reality*: the mock's behavior drifts from the real bean's, and the test passes against a fiction. The remedies, in order:

1. **Slice tests with mocks** (`@WebMvcTest`) — the default; covers one layer with real semantics.
2. **Slice tests with real infrastructure** (`@DataJpaTest` + Testcontainers) — for data-layer contracts.
3. **A few full `@SpringBootTest` tests** — the integration spine, using real beans for the critical path, mocks only for genuinely external services.
4. **Contract tests / Testcontainers** for the external boundaries — a real test against the real service rather than a mock of it.

## Recap

Mockito meets Spring through **`@MockBean`/`@MockitoBean`**: a Mockito mock dropped into the application context in place of a real bean — the mechanism behind `@WebMvcTest` slice tests, where the web layer runs real and the service below is stubbed. MockMvc then drives real HTTP and asserts on status, `jsonPath` bodies, and headers. The discipline: use `@MockBean` for *boundaries the test targets* (controller tests, service tests against mocked repos); use real infrastructure (`@DataJpaTest` + Testcontainers) for *contracts* with the data layer; and watch the context-caching cost — group tests by mock set and prefer slices over full-context mocking. The result is tests that are fast, real where it matters, and controlled where it counts.
