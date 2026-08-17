---
title: Spring Boot Test Slices
module: spring-testing-advanced
order: 1
minutes: 20
topics: ["@WebMvcTest", "@DataJpaTest", "@JsonTest", "test slicing", "context caching", "fast tests"]
docs:
  - title: "Testing slices"
    url: "https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html#testing.applying-slices"
---

# Spring Boot Test Slices

`@SpringBootTest` boots the **whole** application — every bean, every auto-configuration. That's slow (30s+ per context) and brittle. Test slices boot **only the layer under test**: the MVC layer, the JPA layer, the JSON layer. The result: millisecond tests, isolated failures.

## The Problem With Full Context

```java
@SpringBootTest   // boots everything: DB, Redis, Kafka, security, the lot
class CourseServiceTest { ... }
```

- 30–120s to start the context
- Every test run re-initializes all dependencies
- A broken `@Component` anywhere fails every test

## The Slice Annotations

| Slice | Boots | Mocks |
|-------|-------|-------|
| `@WebMvcTest` | Controllers + MVC infra | `@MockBean` services |
| `@DataJpaTest` | JPA repositories + H2 | Everything else |
| `@JsonTest` | Jackson only | — |
| `@RestClientTest` | RestClient/WebClient | HTTP server |
| `@MyBatisTest` | MyBatis mappers | — |
| `@JdbcTest` | JdbcTemplate + DataSource | — |

## @WebMvcTest: Test the Controller, Mock the Service

```java
@WebMvcTest(CourseController.class)
class CourseControllerTest {

    @Autowired MockMvc mockMvc;

    @MockBean CourseService courseService;   // mocked, not real

    @Test
    void getCourseReturnsDto() throws Exception {
        when(courseService.findById(1L))
            .thenReturn(new CourseDto(1L, "Spring Boot"));

        mockMvc.perform(get("/api/courses/1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.title").value("Spring Boot"));
    }

    @Test
    void missingCourseIs404() throws Exception {
        when(courseService.findById(999L))
            .thenThrow(new CourseNotFoundException("999"));

        mockMvc.perform(get("/api/courses/999"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.detail").value(containsString("not found")));
    }
}
```

**What you test here**: mappings, validation, serialization, status codes, error handling — the HTTP contract. **Not**: the service logic (that's mocked).

### Security in Slices

If the app has Spring Security, `@WebMvcTest` loads it — every request is 401 unless you permit:

```java
@WebMvcTest(CourseController.class)
@AutoConfigureMockMvc(addFilters = false)      // skip security filters
class CourseControllerTest { ... }
```

Or authenticate in tests:

```java
mockMvc.perform(get("/api/courses/1")
        .with(user("admin").roles("ADMIN")))
    .andExpect(status().isOk());
```

## @DataJpaTest: Test the Repository, Real SQL

```java
@DataJpaTest
class CourseRepositoryTest {

    @Autowired CourseRepository repository;
    @Autowired TestEntityManager entityManager;

    @Test
    void findsByLevel() {
        entityManager.persistAndFlush(new Course("Java", "BEGINNER", 25));
        entityManager.persistAndFlush(new Course("Spring", "ADVANCED", 40));

        List<Course> results = repository.findByLevel("BEGINNER");

        assertEquals(1, results.size());
        assertEquals("Java", results.get(0).getTitle());
    }

    @Test
    void derivedQueryWorks() {
        Course c = entityManager.persistAndFlush(new Course("Boot", "INTERMEDIATE", 30));

        assertTrue(repository.findByTitleContaining("oo").contains(c));
    }
}
```

Key facts:

- Uses an **in-memory H2** by default — no external DB needed
- Rolls back each test (`@Transactional`)
- `TestEntityManager` gives `persistAndFlush`/`find` helpers
- Tests the **real** query generation — the derived query, the JPQL, the mapping

### Real Postgres in Slices

```java
@DataJpaTest
@Testcontainers
class CourseRepositoryTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @Autowired CourseRepository repository;
}
```

`@ServiceConnection` wires the container into the test context automatically — no config properties needed.

## @JsonTest: Test Serialization in Isolation

```java
@JsonTest
class CourseDtoJsonTest {

    @Autowired ObjectMapper objectMapper;

    @Test
    void serializesWithConfiguredRules() throws Exception {
        CourseDto dto = new CourseDto(1L, "Spring", 25, null);

        String json = objectMapper.writeValueAsString(dto);

        assertThat(json).doesNotContain("null")           // NON_NULL inclusion
                        .contains("\"minutes\":25");
    }

    @Test
    void deserializesDatesAsIso() throws Exception {
        String json = "{\"id\":1,\"publishedAt\":\"2026-08-18T10:00:00Z\"}";
        CourseDto dto = objectMapper.readValue(json, CourseDto.class);
        assertEquals(Instant.parse("2026-08-18T10:00:00Z"), dto.getPublishedAt());
    }
}
```

## Slices + Context Caching

Spring caches application contexts by configuration. Tests sharing the same slice config reuse the same context:

- `@WebMvcTest` with identical imports → one context for all such tests
- Add a `@MockBean` difference → new context (slow!)

**Batch mock declarations**: declare all `@MockBean`s in a base class so every subclass reuses one context instead of each creating its own.

## The Testing Pyramid in Spring

```
        🔺 @SpringBootTest (few)
       🔺🔺 @DataJpaTest / integration (some)
      🔺🔺🔺 @WebMvcTest (more)
     🔺🔺🔺🔺 Unit tests with plain JUnit (most)
```

Slices are the middle tier: fast enough to run constantly, real enough to catch layer-specific bugs (mapping errors, SQL generation, JSON shape).

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| `@DataJpaTest` failing on entity relationships | Add `@AutoConfigureTestDatabase(replace = NONE)` if you need real DB |
| Mocked service returning null | `when(...).thenReturn(...)` before the call |
| 401s in `@WebMvcTest` | `addFilters = false` or `.with(user(...))` |
| Test needing security context | `@WithMockUser` |
| Slow context per slice | Reuse config; minimize `@MockBean` differences |

## Summary

| Slice | Layer under test | Mocked |
|-------|------------------|--------|
| `@WebMvcTest` | Controllers | Services, repositories |
| `@DataJpaTest` | Repositories, SQL | Everything else |
| `@JsonTest` | Serialization | Everything |
| `@RestClientTest` | HTTP clients | Network |

Test slices give you the speed of unit tests with the confidence of integration tests — boot exactly what you're testing, mock the rest, and your suite stays fast enough to run on every commit.
