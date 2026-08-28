---
title: Component Scanning & @Import — Complete Beginner's Guide
summary: How Spring finds your beans, why package structure matters, @Import for third-party libraries, and the debugging tricks that save hours.
order: 17
minutes: 22
topics: [componentscan, import, stereotypes, filters, bean-discovery, package-structure]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/classpath-scanning.html
  - https://docs.spring.io/spring-framework/reference/core/beans/java/import.html
---

# Component Scanning & @Import — Complete Beginner's Guide

## The concept: how Spring finds your code

When you write a class annotated with `@Service`, `@Component`, or `@Repository`, how does Spring know it exists? **Component scanning** — Spring walks through your package tree, finds annotated classes, and automatically creates beans from them.

Think of it like a GPS that starts from your house (the main class) and scans every street (package) going downward. If a class is outside the streets your GPS covers, it's invisible.

```
com.acme/                          ← Main class lives here (GPS starting point)
├── orders/                        ← GPS scans this
│   ├── OrderController.java       ← Found! (has @Controller)
│   ├── OrderService.java          ← Found! (has @Service)
│   └── OrderRepository.java       ← Found! (has @Repository)
├── payments/                      ← GPS scans this too
│   ├── PaymentService.java        ← Found!
│   └── PaymentConfig.java         ← Found! (has @Configuration)
└── legacy/                        ← This is OUTSIDE the scan path
    └── LegacyService.java         ← NOT found! (not under main class)
```

**Line-by-line code example:**

```java
// The main class — this is where Spring starts scanning
@SpringBootApplication                     // Line 1: Combines @Configuration + @ComponentScan + @EnableAutoConfiguration
                                           // Line 2: By default, scans THIS package and all sub-packages
public class AcademyApplication {          // Line 3: Must be at the TOP of your package tree
                                           // Line 4: If this class is in com.acme, it scans com.acme.**
    public static void main(String[] args) {
        SpringApplication.run(AcademyApplication.class, args);  // Line 5: Starts the app
    }
}
```

**What happens at startup:**
1. Spring finds `@SpringBootApplication` on `AcademyApplication`
2. It reads the package: `com.acme`
3. It scans `com.acme.*`, `com.acme.orders.*`, `com.acme.payments.*`, etc.
4. Any class with `@Component`, `@Service`, `@Repository`, `@Controller`, or `@Configuration` becomes a bean
5. Spring wires them together via dependency injection

## The two ways beans enter the context

Spring beans come from exactly **two places**:

### 1. Component scanning (automatic)

```java
@Service                              // Line 1: Spring finds this class during scanning
public class OrderService {           // Line 2: Becomes a bean automatically
    
    private final OrderRepository repo;  // Line 3: Spring injects the repository bean
    
    public OrderService(OrderRepository repo) {  // Line 4: Constructor injection
        this.repo = repo;              // Line 5: Spring passes the repository here
    }
}
```

### 2. Explicit registration (manual)

```java
@Configuration                         // Line 1: This class defines beans manually
public class AppConfig {
    
    @Bean                              // Line 2: This method creates a bean
    public RestTemplate restTemplate() {
        return new RestTemplate();      // Line 3: Spring calls this method and stores the result as a bean
    }
    
    @Bean                              // Line 4: Another bean definition
    public Clock clock() {
        return Clock.systemUTC();       // Line 5: Returns a Clock bean
    }
}
```

**When to use which:**
- **Component scanning** — for your own classes (services, controllers, repositories)
- **Explicit registration** — for third-party classes you can't annotate (RestTemplate, ObjectMapper, Clock)

## Component scanning in detail

### Basic scanning — the default behavior

```java
// This is what @SpringBootApplication does under the hood
@ComponentScan(
    basePackages = "com.acme"           // Line 1: Start scanning from this package
    // Line 2: By default, includes ALL stereotype annotations
    // Line 3: @Component, @Service, @Repository, @Controller, @Configuration
)
```

**The rule:** Spring scans `basePackages` and ALL sub-packages. If your main class is at `com.acme`, it scans `com.acme.*`, `com.acme.orders.*`, `com.acme.payments.*`, etc.

### Custom scanning — when the default isn't enough

```java
@Configuration
@ComponentScan(
    basePackages = "com.acme.orders",   // Line 1: Only scan this package tree
    includeFilters = @ComponentScan.Filter(  // Line 2: Only include classes matching this filter
        type = FilterType.REGEX,        // Line 3: Use regex matching
        pattern = ".*Service"           // Line 4: Only classes ending with "Service"
    ),
    excludeFilters = @ComponentScan.Filter(  // Line 5: Exclude classes matching this filter
        type = FilterType.ASSIGNABLE_TYPE,   // Line 6: Match by class type
        classes = LegacyService.class   // Line 7: Exclude this specific class
    )
)
public class OrdersConfig { }
```

**Filter types:**
| Type | What it matches | Example |
|---|---|---|
| `ANNOTATION` | Classes with a specific annotation | `@Component.class` |
| `ASSIGNABLE_TYPE` | Classes of a specific type | `LegacyService.class` |
| `REGEX` | Classes matching a regex pattern | `".*Service"` |
| `ASPECTJ` | Classes matching an AspectJ type pattern | `"com.acme..*Service+"` |
| `CUSTOM` | Your own `TypeFilter` implementation | Custom logic |

**In practice:** Most apps never use filters. The default (all stereotypes under the base package) is what you want 99% of the time.

## @Import — explicit assembly when scanning isn't enough

Sometimes you need to register beans that aren't in your scan path:

```java
// Scenario: A third-party library ships a config class
// You can't scan its packages (it's a dependency, not your code)
// @Import is the solution:

@Configuration
@Import({ DataSourceConfig.class, SecurityConfig.class })  // Line 1: Explicitly register these classes
public class AppConfig {                                    // Line 2: Now their beans are available
}
```

**How @Enable* annotations work (the hidden pattern):**

```java
// When you write @EnableScheduling, Spring does this:
@EnableScheduling                        // Line 1: This annotation exists
public class AppConfig { }

// Under the hood, @EnableScheduling is:
@Import(SchedulingConfiguration.class)    // Line 2: It imports a configuration class
public @interface EnableScheduling { }   // Line 3: That's all @Enable* annotations do!
```

**Every `@Enable*` annotation is an `@Import` in disguise:**
- `@EnableAsync` → imports `AsyncConfigurationSelector`
- `@EnableWebMvc` → imports `DelegatingWebMvcConfiguration`
- `@EnableCaching` → imports `CachingConfigurationSelector`
- `@EnableSecurity` → imports `SecurityConfiguration`

## Real-world scenarios

### Scenario 1 — the layered-package convention

```
com.acme/
├── AcademyApplication.java          ← Main class (scans everything below)
├── controller/
│   └── OrderController.java         ← @Controller
├── service/
│   └── OrderService.java            ← @Service
├── repository/
│   └── OrderRepository.java         ← @Repository
└── config/
    └── AppConfig.java               ← @Configuration
```

**Adding a new feature:** Just add a new package under `com.acme` — no config changes needed!

### Scenario 2 — excluding a bean in tests

```java
@SpringBootTest
@ComponentScan(
    excludeFilters = @ComponentScan.Filter(
        type = FilterType.ASSIGNABLE_TYPE,
        classes = KafkaIngestService.class  // Exclude this bean in tests
    )
)
class OrderServiceTest {
    // KafkaIngestService is not created here — no need to mock it
}
```

### Scenario 3 — importing a third-party module

```java
// The payment module is a JAR dependency — you can't scan its packages
// @Import registers its configuration:
@Configuration
@Import(PaymentModuleConfig.class)      // Line 1: Import the library's config
public class AppConfig {
    // Line 2: Now PaymentService, PaymentRepository, etc. are beans
}
```

### Scenario 4 — duplicate beans (the fail-fast feature)

```java
// If two classes have the same name, Spring fails fast:
@Component("paymentService")
class V1PaymentService { }

@Component("paymentService")  // ERROR: ConflictingBeanDefinitionException
class V2PaymentService { }

// Fix with @Primary or @Qualifier:
@Component("paymentService")
@Primary                                    // This one wins when there's a conflict
class V1PaymentService { }
```

## Debugging component scanning

### Enable debug logging

```yaml
# application.yml
logging:
  level:
    org.springframework.context.annotation: DEBUG  # Shows which beans are scanned
```

### Check if your bean is being created

```java
@Component
public class MyBean implements CommandLineRunner {
    @Override
    public void run(String... args) {
        System.out.println("MyBean is alive!");  // If you see this, the bean was created
    }
}
```

### The classic "bean not found" bug

```java
// WRONG — main class is in a sub-package
com.acme.orders/
├── AcademyApplication.java          ← Main class HERE
├── service/
│   └── OrderService.java            ← NOT scanned! (above the main class)
└── repository/
    └── OrderRepository.java         ← NOT scanned!

// RIGHT — main class at the top
com.acme/
├── AcademyApplication.java          ← Main class HERE
├── orders/
│   ├── OrderController.java         ← Scanned ✓
│   ├── OrderService.java            ← Scanned ✓
│   └── OrderRepository.java         ← Scanned ✓
```

## Common mistakes

| Mistake | Why it fails | Fix |
|---|---|---|
| Main class in wrong package | Beans above the main class aren't scanned | Put main class at the root package |
| Scanning too much | Slow startup, unintended beans | Keep `basePackages` tight |
| Missing @Service/@Component | Class isn't discovered | Add the annotation |
| Duplicate bean names | `ConflictingBeanDefinitionException` | Use `@Primary` or `@Qualifier` |
| @Import on non-config class | Silently ignored | Only import `@Configuration` or `@Component` classes |

## Key takeaways

- Component scanning discovers stereotypes under the base package; `@Import` registers explicitly
- `@SpringBootApplication` scans its own package downward — keep the main class at the top
- `@Enable*` annotations are `@Import` + selectors under the hood — the library pattern
- Filters (`include`/`exclude`) control discovery for adoptions and tests
- Duplicate bean names fail fast by design — resolve with `@Primary`/`@Qualifier`, not suppression

**Official docs:** [Classpath scanning](https://docs.spring.io/spring-framework/reference/core/beans/classpath-scanning.html) · [@Import](https://docs.spring.io/spring-framework/reference/core/beans/java/import.html)
