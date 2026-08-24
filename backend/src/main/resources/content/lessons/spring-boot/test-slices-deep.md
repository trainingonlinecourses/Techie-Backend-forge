---
title: Test Slices Deep — @WebMvcTest, @DataJpaTest and Custom Slices
summary: How test slices load a subset of the context, the difference between MockMvc and TestRestTemplate, writing your own custom slice, and avoiding the most common mistakes.
order: 11
minutes: 20
topics: [test slices, @WebMvcTest, @DataJpaTest, MockMvc, @AutoConfigureMockMvc, custom slice, test context]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#features.testing.spring-boot-applications.testing-spring-boot-applications-with-spring-mvc
  - https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#features.testing.spring-boot-applications.testing-spring-boot-applications-testing-autoconfigured-spring-web-flux-tests
---

# Test Slices Deep — @WebMvcTest, @DataJpaTest and Custom Slices

## The concept: test a slice, not the whole stack

`@SpringBootTest` loads the entire application context — every bean, every configuration. For a unit test of a single controller, that's wasteful and slow. Test slices load only the beans needed for that layer: `@WebMvcTest` loads controllers + MVC infrastructure, `@DataJpaTest` loads repositories + embedded database, `@JsonTest` loads only Jackson. The result: faster tests, clearer isolation, and focused failures.

## @WebMvcTest — controller testing with MockMvc

```java
@WebMvcTest(OrderController.class)
class OrderControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean          // replaces the real bean in the test context
    private OrderService orderService;

    @Test
    void shouldReturnOrder() throws Exception {
        Order order = new Order(1L, "ACME", 1999L);
        when(orderService.getOrder(1L)).thenReturn(order);

        mockMvc.perform(get("/api/orders/1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(1))
            .andExpect(jsonPath("$.company").value("ACME"))
            .andExpect(jsonPath("$.totalCents").value(1999));
    }

    @Test
    void shouldReturn404() throws Exception {
        when(orderService.getOrder(99L)).thenThrow(new NotFoundException("Order not found"));

        mockMvc.perform(get("/api/orders/99"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").value("Order not found"));
    }
}
```

**What loads:** `OrderController`, `@ControllerAdvice`, `WebMvcConfigurer`, `@Valid` infrastructure.  
**What doesn't load:** repositories, services (unless `@MockBean`), database, security filters (unless configured).

## Security in @WebMvcTest

```java
@WebMvcTest(AdminController.class)
class AdminControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private AdminService adminService;

    @Test
    @WithMockUser(roles = "ADMIN")
    void adminCanAccess() throws Exception {
        mockMvc.perform(get("/api/admin/stats"))
            .andExpect(status().isOk());
    }

    @Test
    void unauthenticatedGets401() throws Exception {
        mockMvc.perform(get("/api/admin/stats"))
            .andExpect(status().isUnauthorized());
    }
}
```

## @DataJpaTest — repository testing with embedded DB

```java
@DataJpaTest
class OrderRepositoryTest {

    @Autowired
    private TestEntityManager em;  // manages persistence context for tests

    @Autowired
    private OrderRepository orderRepository;

    @Test
    void shouldFindOrdersByCompany() {
        em.persistAndFlush(new Order("ACME", 1999L));
        em.persistAndFlush(new Order("ACME", 2999L));
        em.persistAndFlush(new Order("GLOBEX", 999L));

        List<Order> acmeOrders = orderRepository.findByCompany("ACME");

        assertThat(acmeOrders).hasSize(2);
        assertThat(acmeOrders).extracting("totalCents").containsExactlyInAnyElement(1999L, 2999L);
    }

    @Test
    void shouldPersistWithGeneratedId() {
        Order order = em.persistAndFlush(new Order("ACME", 1999L));
        assertThat(order.getId()).isNotNull();
    }
}
```

**What loads:** JPA infrastructure, repositories, `TestEntityManager`, embedded H2.  
**What doesn't load:** web layer, security, services, controllers.

## Custom test slices

Create your own slice to test a specific layer:

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@TypeExclude(AuditAutoConfiguration exclusions)
@AutoConfigureMockMvc(addFilters = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@SpringBootTest
public @interface AuditTest {
    // Your custom annotation — loads only audit-related beans
}
```

Or use `@ImportAutoConfiguration` to control exactly which auto-configurations load:

```java
@DataJpaTest
@ImportAutoConfiguration(AuditAutoConfiguration.class)  // add just this one
class AuditEventRepositoryTest {
    // Loads JPA + audit auto-config, nothing else
}
```

## Common mistakes

**Mistake 1: loading too many beans**

```java
// WRONG: @SpringBootTest loads everything — slow and fragile
@SpringBootTest
class OrderControllerTest {
    @Autowired private MockMvc mockMvc;
    // This works but loads the entire app, every database, every service
}

// RIGHT: only load what you're testing
@WebMvcTest(OrderController.class)
class OrderControllerTest {
    @Autowired private MockMvc mockMvc;
}
```

**Mistake 2: forgetting @MockBean for dependencies**

```java
// WRONG: controller depends on OrderService — but @WebMvcTest doesn't load it
// Results in UnsatisfiedDependencyException

@WebMvcTest(OrderController.class)
class OrderControllerTest {
    @Autowired MockMvc mockMvc;
    // Missing: @MockBean OrderService orderService;
}
```

**Mistake 3: testing implementation details**

```java
// WRONG: verifying internal method calls
verify(orderService).processOrder(any());  // tests how, not what

// RIGHT: verify the output
mockMvc.perform(post("/api/orders").contentType(APPLICATION_JSON).content(json))
    .andExpect(status().isCreated())
    .andExpect(jsonPath("$.id").isNumber());
```

## Key takeaways

- `@WebMvcTest` loads only web layer beans (controllers, filters, MVC config); mock everything else.
- `@DataJpaTest` loads only JPA layer (repositories, entities, embedded DB); uses `TestEntityManager` for setup.
- `@MockBean` replaces a bean in the test context — it's how you isolate the layer under test.
- Create custom test slices with `@TypeExclude` or `@ImportAutoConfiguration` for your specific layer.
- Prefer verifying output (HTTP status, response body) over verifying internal interactions.
