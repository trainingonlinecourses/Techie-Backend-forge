---
title: Inversion of Control & the ApplicationContext — Complete Beginner's Guide
summary: What IoC really means, how the container builds and wires beans step by step, why singleton statelessness matters, and the prototype injection trap.
order: 2
minutes: 22
topics: [ioc, applicationcontext, beans, scopes, bean-lifecycle, singleton, prototype]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans.html
  - https://docs.spring.io/spring-framework/reference/core/beans/basics.html
---

# Inversion of Control & the ApplicationContext — Complete Beginner's Guide

## What is Inversion of Control (IoC)?

**IoC means: the framework calls your code, not the other way around.**

In traditional Java, YOU create objects and manage their dependencies:

```java
// WITHOUT IoC — you create everything yourself
public class OrderService {
    // Line 1: YOU create the repository — tight coupling!
    private OrderRepository repo = new PostgresOrderRepository();  // Hardcoded to PostgreSQL
    
    public Order createOrder(OrderRequest req) {
        Order order = new Order(req);
        return repo.save(order);  // Line 2: YOU call the repository
    }
}
```

**Problems with this approach:**
1. `OrderService` is hardcoded to `PostgresOrderRepository` — can't switch to MongoDB without changing code
2. Can't test without a real database — no way to inject a mock
3. `OrderService` is responsible for BOTH creating AND using the repository

**With IoC, Spring creates and wires objects for you:**

```java
// WITH IoC — Spring manages the dependencies
@Service
public class OrderService {
    private final OrderRepository repo;  // Line 1: You DECLARE the dependency
    
    public OrderService(OrderRepository repo) {  // Line 2: Spring PASSES it in
        this.repo = repo;                        // Line 3: You just store it
    }
    
    public Order createOrder(OrderRequest req) {
        Order order = new Order(req);
        return repo.save(order);  // Line 4: Use the injected dependency
    }
}
```

**What happens at runtime:**
1. Spring scans for `@Service`, finds `OrderService`
2. It sees `OrderService` needs an `OrderRepository` (constructor parameter)
3. It finds the `OrderRepository` bean (created from `@Repository` or `@Bean` method)
4. It creates `OrderService` and PASSES the repository to the constructor
5. You never wrote `new PostgresOrderRepository()` — Spring did it for you

## The ApplicationContext — the brain

The `ApplicationContext` is Spring's central container — it holds all beans, manages their lifecycle, and wires them together.

```java
// This is what @SpringBootApplication creates under the hood
@SpringBootApplication
public class AcademyApplication {
    public static void main(String[] args) {
        // Line 1: Creates the ApplicationContext
        // Line 2: Scans for beans, creates them, wires them
        // Line 3: Starts the embedded Tomcat server
        // Line 4: Your app is now running
        SpringApplication.run(AcademyApplication.class, args);
    }
}
```

**What the ApplicationContext does:**
- **Creates beans** — instantiates all classes with `@Component`, `@Service`, `@Repository`, `@Controller`
- **Wires dependencies** — passes beans to constructors, sets fields
- **Manages lifecycle** — calls `@PostConstruct`, handles `@PreDestroy`
- **Provides services** — events, internationalization, resource loading
- **Proxies beans** — wraps beans for AOP (`@Transactional`, `@Cacheable`)

### BeanFactory vs ApplicationContext

```java
// BeanFactory — the raw container (rarely used directly)
BeanFactory factory = new DefaultListableBeanFactory();
OrderService svc = factory.getBean(OrderService.class);  // Basic: just create and inject

// ApplicationContext — the full container (what you always use)
ApplicationContext ctx = new AnnotationConfigApplicationContext(AppConfig.class);
OrderService svc = ctx.getBean(OrderService.class);  // Full: events, i18n, resources, AOP
```

| Feature | BeanFactory | ApplicationContext |
|---|---|---|
| Bean creation | Lazy (on first access) | Eager (at startup) |
| Event publishing | No | Yes |
| Internationalization | No | Yes |
| Resource loading | No | Yes |
| AOP/Proxies | No | Yes |
| **Use case** | Embedded/resource-light | **Everything you write** |

## How the container builds beans — step by step

The container goes through **5 phases** when starting up:

```
Phase 1: DISCOVER        Phase 2: CREATE        Phase 3: WIRE
  @ComponentScan    →     new OrderService()  →   inject OrderRepository
  @Bean methods     →     new OrderRepo()     →   inject DataSource
  @Import           →     new DataSource()    →   inject config values
         ↓                       ↓                       ↓
Phase 4: INITIALIZE       Phase 5: READY
  @PostConstruct     →     Beans available
  BeanPostProcessor  →     Proxies created
  AOP wrapping       →     App serving requests
```

**Line-by-line lifecycle example:**

```java
@Component
public class OrderService {
    private final OrderRepository repo;
    
    // Phase 2: Constructor — Spring calls this to create the bean
    public OrderService(OrderRepository repo) {     // Line 1: Spring passes the repository
        this.repo = repo;                           // Line 2: Store the dependency
        System.out.println("OrderService created"); // Line 3: Constructor runs
    }
    
    // Phase 4: PostConstruct — called AFTER all dependencies are injected
    @PostConstruct
    public void init() {
        System.out.println("OrderService initialized");  // Line 4: Safe to use dependencies here
        // Line 5: Good place for validation, cache warming, etc.
    }
    
    @PreDestroy
    public void cleanup() {
        System.out.println("OrderService destroyed");  // Line 6: Called when context shuts down
        // Line 7: Good place for resource cleanup
    }
}
```

## Bean scopes — how many instances?

| Scope | What it means | When to use |
|---|---|---|
| **`singleton`** (default) | ONE instance per application | Stateless services, repos — **99% of beans** |
| **`prototype`** | NEW instance every time it's injected | Stateful helpers you control |
| **`request`** | NEW instance per HTTP request | Request-scoped data (web only) |
| **`session`** | NEW instance per HTTP session | Session-scoped data (web only) |

### The singleton rule — be stateless!

```java
// BAD — singleton with mutable state (data race!)
@Service
public class OrderCounter {
    private int count = 0;  // SHARED across all requests!
    
    public int increment() {
        return ++count;  // Race condition: two threads read same value
    }
}

// GOOD — singleton that is stateless
@Service
public class OrderCounter {
    private final AtomicInteger count = new AtomicInteger(0);  // Thread-safe
    
    public int increment() {
        return count.incrementAndGet();  // Atomic operation — safe
    }
}
```

### The prototype injection trap

```java
@Service
public class ReportService {
    private final ReportBuilder builder;  // This is a PROTOTYPE bean
    
    // PROBLEM: Constructor injection happens ONCE
    public ReportService(ReportBuilder builder) {
        this.builder = builder;  // Line 1: Gets ONE instance of ReportBuilder
        // Line 2: Every call to build() uses the SAME ReportBuilder!
    }
    
    public Report build(Query q) {
        return builder.build(q);  // Line 3: Same builder every time — state leaks!
    }
}

// SOLUTION: Use ObjectProvider for fresh instances
@Service
public class ReportService {
    private final ObjectProvider<ReportBuilder> builders;
    
    public ReportService(ObjectProvider<ReportBuilder> builders) {
        this.builders = builders;  // Line 1: Spring wraps the prototype
    }
    
    public Report build(Query q) {
        return builders.getObject().build(q);  // Line 2: FRESH ReportBuilder each call!
    }
}
```

## Real-world scenario — e-commerce dependency injection

```java
// The dependency chain — Spring wires everything automatically
@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {
    List<Order> findByCustomerId(Long customerId);
}

@Service
public class OrderService {
    private final OrderRepository orderRepo;     // Injected by Spring
    private final PaymentService paymentService;  // Injected by Spring
    private final InventoryService inventoryService;  // Injected by Spring
    
    @Transactional  // Spring wraps this method in a transaction
    public Order placeOrder(OrderRequest req) {
        Order order = new Order(req);              // Your business logic
        orderRepo.save(order);                     // Use injected dependency
        paymentService.charge(order);              // Use injected dependency
        inventoryService.reserve(order);           // Use injected dependency
        return order;
    }
}

// Spring creates: OrderRepository → PaymentService → InventoryService → OrderService
// You never wrote: new OrderRepository(), new PaymentService(), etc.
```

## Common mistakes

| Mistake | Why it fails | Fix |
|---|---|---|
| Singleton with mutable fields | Data race between requests | Use `AtomicX` or make fields `final` |
| Prototype in singleton constructor | Same instance used everywhere | Use `ObjectProvider<T>` |
| Field injection (`@Autowired` private) | Hides dependencies, hard to test | Use constructor injection |
| Creating beans with `new` | Bypasses Spring's management | Let Spring create beans via `@Bean` or `@Component` |
| Forgetting `@PostConstruct` | Dependencies not ready in constructor | Use `@PostConstruct` for init logic |

## Key takeaways

- IoC = Spring creates and wires objects; you declare dependencies via constructors
- `ApplicationContext` = the brain that holds all beans, manages lifecycle, and provides services
- Container lifecycle: discover → create → wire → initialize → ready
- Constructor injection; singletons stay stateless
- `ObjectProvider` to get fresh prototype instances

**Official docs:** [IoC container](https://docs.spring.io/spring-framework/reference/core/beans.html) · [Bean basics](https://docs.spring.io/spring-framework/reference/core/beans/basics.html)
