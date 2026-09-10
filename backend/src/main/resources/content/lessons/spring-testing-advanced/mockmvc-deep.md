---
title: MockMvc Deep Dive
module: spring-testing-advanced
order: 4
minutes: 22
topics: ["MockMvc builders", "perform andExpect", "jsonPath", "request builders", "async testing", "file upload"]
summary: MockMvc is the Swissarmy knife of Spring MVC testing: it drives the full dispatcher — mapping, validation, converters, interceptors, exception hand...
docs:
  - title: "Testing with MockMvc"
    url: "https://docs.spring.io/spring-framework/reference/testing/spring-mvc-test-framework.html"
---

# MockMvc Deep Dive

MockMvc is the Swiss-army knife of Spring MVC testing: it drives the full dispatcher — mapping, validation, converters, interceptors, exception handling — without a real server. Master its request/response DSL and you can test the entire HTTP contract in milliseconds.

## Two Ways to Build MockMvc

### Standalone (no context — fastest)

MockMvc mockMvc = MockMvcBuilders
    .standaloneSetup(new CourseController(courseService))
    .setControllerAdvice(new GlobalExceptionHandler())
```java
    .build();
```

Explicit, isolated, instant. You wire exactly the beans the test needs.

### Web context (real config)

```java
@WebMvcTest(CourseController.class)
class CourseControllerTest {
    @Autowired MockMvc mockMvc;   // wired from the slice
}
```

Tests the real MVC configuration: converters, validation, interceptors, security.

## The Request DSL

mockMvc.perform(
```java
    get("/api/courses/{id}", 1L)
```
        .header("Authorization", "Bearer " + token)
        .param("page", "0")
        .param("size", "20")
        .contentType(MediaType.APPLICATION_JSON)
        .accept(MediaType.APPLICATION_JSON)
```java
        .content("{\"title\":\"New\"}")
```
        .sessionAttr("cart", cart)
)

Request builders: `get`, `post`, `put`, `patch`, `delete`, `options`, `multipart`.

## The Response DSL: andExpect


**What this code does — step by step:**

1. `.andExpect(status().isOk())` — status
2. `.andExpect(content().json(expectedJson, true))` — lenient JSON compare
3. `.andExpect(view().name("course/list"))` — view tests
4. `.andExpect(model().attributeExists("courses"))` — model tests
5. `.andExpect(redirectedUrl("/api/courses/1"))` — redirect tests

The same code, clean:

```java
mockMvc.perform(get("/api/courses"))
    .andExpect(status().isOk())
    .andExpect(status().is(200))
    .andExpect(header().string("Cache-Control", containsString("max-age")))
    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
    .andExpect(content().json(expectedJson, true))
    .andExpect(content().string(containsString("Spring")))
    .andExpect(view().name("course/list"))
    .andExpect(model().attributeExists("courses"))
    .andExpect(redirectedUrl("/api/courses/1"))
    .andExpect(forwardedUrl("/error"));
```

## jsonPath: The JSON Assertion Language

.andExpect(jsonPath("$.title").value("Spring Boot"))
.andExpect(jsonPath("$.lessons[0].id").value(1))
.andExpect(jsonPath("$.lessons[*].title").value(hasSize(3)))
.andExpect(jsonPath("$.items[*].id", hasItem(5)))
.andExpect(jsonPath("$.status").value(404))
.andExpect(jsonPath("$.fieldErrors[0].field").value("title"))
.andExpect(jsonPath("$.totalElements").isNumber())
.andExpect(jsonPath("$.content").isEmpty())

jsonPath supports the full Jayway JsonPath syntax: filters, wildcards, deep scans:

.andExpect(jsonPath("$.lessons[?(@.minutes > 20)].title")
    .value(hasItems("Spring Boot", "AOP")))
.andExpect(jsonPath("$..title").value(hasSize(3)))   // deep scan

## Chaining and Debugging

mockMvc.perform(get("/api/courses/1"))
    .andDo(print())                       // dump request + response to stdout
```java
    .andExpect(status().isOk());
```

`print()` is invaluable when a test fails — it shows the exact request/response including headers and body.

## Testing Validation and Errors

@Test
void invalidPayloadReturnsFieldErrors() throws Exception {
    mockMvc.perform(post("/api/courses")
            .contentType(MediaType.APPLICATION_JSON)
```java
            .content("{\"title\":\"\",\"minutes\":-5}"))
```
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.fieldErrors[*].field",
```java
            containsInAnyOrder("title", "minutes")));
}

@Test
void unknownEndpointReturnsStructured404() throws Exception {
```
    mockMvc.perform(get("/api/nope"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.status").value(404));
}

## File Upload

@Test
void uploadsCsv() throws Exception {
    MockMultipartFile file = new MockMultipartFile(
        "file", "courses.csv", "text/csv",
```java
        "1,Spring Boot\n2,Spring AOP\n".getBytes());
```

    mockMvc.perform(multipart("/api/courses/import").file(file))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.imported").value(2));
}

## Async / Streaming Responses

For `DeferredResult`, `CompletableFuture`, or SSE, MockMvc needs async handling:

@Test
void asyncEndpointEventuallyResolves() throws Exception {
    MvcResult result = mockMvc.perform(get("/api/orders/async"))
        .andExpect(request().asyncStarted())      // dispatch started
```java
        .andReturn();
```

    mockMvc.perform(asyncDispatch(result))         // complete the async result
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("PROCESSING"));
}

## Testing With Security

@Test
@WithMockUser(username = "admin", roles = "ADMIN")
void adminCanDelete() throws Exception {
    mockMvc.perform(delete("/api/courses/1"))
```java
        .andExpect(status().isNoContent());
}

@Test
@WithAnonymousUser
void anonymousIs401() throws Exception {
```
    mockMvc.perform(get("/api/courses/1"))
        .andExpect(status().isUnauthorized());
}

// Custom user:
mockMvc.perform(get("/api/me")
        .with(user("alice").password("pw").roles("USER")))
```java
    .andExpect(status().isOk());
```

## Testing CSRF

mockMvc.perform(post("/api/courses")
        .with(csrf())                                  // auto CSRF token
        .contentType(MediaType.APPLICATION_JSON)
        .content(body))
```java
    .andExpect(status().isCreated());

// without csrf(): 403 Forbidden
```

## Session and Cookies

mockMvc.perform(get("/api/profile")
        .sessionAttr("userId", 42L))
```java
    .andExpect(status().isOk());

// capture a cookie and reuse it
MvcResult result = mockMvc.perform(post("/login")).andReturn();
Cookie session = result.getResponse().getCookie("JSESSIONID");
```

mockMvc.perform(get("/api/profile").cookie(session))
```java
    .andExpect(status().isOk());
```

## Best Practices

| Practice | Why |
|----------|-----|
| Test the contract, not the impl | jsonPath on response, not internals |
| One expectation theme per test | Readable failures |
| Use `print()` while debugging | See exactly what happened |
| Combine with slices | Real config, mocked deps |
| Test error paths as much as happy paths | That's where bugs live |
| Keep JSON bodies as fixtures | Readable, maintainable |

## Summary

MockMvc is the fastest way to verify your HTTP contract: status codes, headers, JSON shape, validation, security, redirects, uploads, and async flows. Master the request/response DSL — `perform`, `andExpect`, `jsonPath`, `print` — and your controller tests become precise, fast, and readable.

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html](https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html)
