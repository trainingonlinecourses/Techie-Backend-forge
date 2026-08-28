---
title: Spring Configuration — @Configuration, @Bean, and Properties
summary: How Spring's configuration system works — @Configuration classes, @Bean methods, @Value injection, profile-specific config, and the patterns that keep enterprise applications maintainable. Beginner-friendly with line-by-line code.
order: 5
minutes: 20
topics: [@Configuration, @Bean, @Value, @PropertySource, profiles, configuration properties, typed config, relaxed binding]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/java/configuration-annotation.html
  - https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#features.external-config
---

# Spring Configuration — @Configuration, @Bean, and Properties

## What is Spring Configuration? (From Zero)

Configuration is how you tell Spring **what to create and how to wire it together**. There are two main approaches:

1. **Component scanning** — annotate your classes with `@Component`, `@Service`, `@Repository`, and Spring finds them automatically.
2. **Java configuration** — write `@Configuration` classes with `@Bean` methods that explicitly create objects.

Most real applications use **both**: component scanning for simple beans, explicit `@Configuration` for complex setup (security, caching, third-party libraries).

### @Component Scan vs @Configuration

| Approach | When to Use | Example |
|---|---|---|
| **@Component scan** | Your own classes, simple beans | `@Service`, `@Repository`, `@Controller` |
| **@Configuration + @Bean** | Third-party libraries, complex wiring | DataSource, RedisTemplate, SecurityFilterChain |

---

## The Code — Line by Line

### 1. @Configuration Class

```java
@Configuration                           // Marks this class as a configuration source
@EnableConfigurationProperties           // Enables typed config classes
public class AppConfig {

    // === Simple @Bean method ===
    @Bean                               // Tells Spring: this method creates a Spring-managed bean
    public RestTemplate restTemplate() {
        return RestTemplate.builder()
            .setConnectTimeout(Duration.ofSeconds(5))      // Configure the bean
            .setReadTimeout(Duration.ofSeconds(10))
            .build();
    }

    // === @Bean with dependencies ===
    @Bean
    public OrderService orderService(OrderRepository repo,
                                      PaymentGateway gateway) {
        // Spring automatically injects the required beans
        return new OrderService(repo, gateway);            // Explicit constructor injection
    }

    // === @Bean with @ConditionalOnProperty ===
    @Bean
    @ConditionalOnProperty(name = "app.cache.type", havingValue = "redis")
    public CacheManager redisCacheManager(RedisConnectionFactory factory) {
        return RedisCacheManager.builder(factory).build(); // Only created if cache.type=redis
    }

    @Bean
    @ConditionalOnProperty(name = "app.cache.type", havingValue = "memory",
                           matchIfMissing = true)          // Default when property not set
    public CacheManager memoryCacheManager() {
        return new ConcurrentMapCacheManager();            // Only created if cache.type=memory
    }
}
```

**Line-by-line explained:**
- `@Configuration` — Spring creates a CGLIB proxy of this class. This ensures `@Bean` methods are intercepted so that Spring can manage the bean lifecycle.
- `@Bean` — The method return value becomes a Spring-managed bean. The method name becomes the bean name.
- Spring **automatically resolves dependencies** — if `orderService()` needs `OrderRepository` and `PaymentGateway`, Spring finds them and passes them in.
- `@ConditionalOnProperty` — Bean is only created if the property matches. This is how you swap implementations based on configuration.

### 2. @ConfigurationProperties (Typed Configuration)

```java
// application.yml:
// app:
//   jwt:
//     secret: my-secret-key
//     expiration: 3600000
//     refresh-expiration: 86400000
//   payment:
//     gateway:
//       url: https://api.stripe.com
//       timeout: 30
//       retry-count: 3

@ConfigurationProperties(prefix = "app.jwt")              // Maps to "app.jwt.*" properties
public record JwtProperties(
    String secret,                                        // app.jwt.secret
    long expiration,                                      // app.jwt.expiration
    long refreshExpiration                                // app.jwt.refresh-expiration
) {}

@ConfigurationProperties(prefix = "app.payment.gateway")  // Maps to "app.payment.gateway.*"
public record PaymentProperties(
    String url,                                           // app.payment.gateway.url
    int timeout,                                          // app.payment.gateway.timeout
    int retryCount                                        // app.payment.gateway.retry-count
) {}

// Enable in your main class:
@SpringBootApplication
@EnableConfigurationProperties({JwtProperties.class, PaymentProperties.class})
public class AcademyApplication { ... }

// Use in your beans:
@Service
public class AuthService {
    private final JwtProperties jwtProps;

    public AuthService(JwtProperties jwtProps) {
        this.jwtProps = jwtProps;                         // Typed, IDE-completable, validated
    }

    public String generateToken(User user) {
        return Jwts.builder()
            .setSubject(user.getId())
            .setExpiration(new Date(System.currentTimeMillis() + jwtProps.expiration()))
            .signWith(getSigningKey(jwtProps.secret()))
            .compact();
    }
}
```

**Line-by-line explained:**
- `@ConfigurationProperties(prefix = "app.jwt")` — Maps all `app.jwt.*` properties to this record's fields. Spring Boot handles the binding automatically.
- **Relaxed binding**: `app.jwt.secret`, `APP_JWT_SECRET`, `app-jwt-secret` all map to the same property.
- Records are ideal for config — immutable, auto-generated `equals/hashCode`, constructor binding.
- `@EnableConfigurationProperties` — Registers the config class as a Spring bean so it can be injected.

### 3. @PropertySource and @Value

```java
@Configuration
@PropertySource("classpath:custom.properties")            // Load additional properties file
public class CustomConfig {

    @Value("${custom.api.key}")                            // Required — fails if missing
    private String apiKey;

    @Value("${custom.api.timeout:30}")                     // Default value: 30
    private int timeout;

    @Value("#{${custom.api.endpoints}}")                   // SpEL: parse map from properties
    private Map<String, String> endpoints;

    @Bean
    public WebClient webClient() {
        return WebClient.builder()
            .defaultHeader("Authorization", "Bearer " + apiKey)
            .baseUrl(endpoints.get("base"))
            .build();
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Multi-Environment Configuration

```yaml
# application.yml (shared config):
spring:
  jpa:
    hibernate:
      ddl-auto: validate
    properties:
      hibernate:
        format_sql: true

# application-dev.yml (development overrides):
spring:
  datasource:
    url: jdbc:h2:mem:devdb
    driver-class-name: org.h2.Driver
  jpa:
    hibernate:
      ddl-auto: update              # Override: auto-update in dev
    show-sql: true

# application-prod.yml (production overrides):
spring:
  datasource:
    url: ${DATABASE_URL}
    username: ${DB_USER}
    password: ${DB_PASS}
  jpa:
    hibernate:
      ddl-auto: validate            # Override: only validate in prod
    show-sql: false
```

### Scenario 2: Configuration Validation

```java
@ConfigurationProperties(prefix = "app.redis")
@Validated                                    // Enable Bean Validation
public record RedisProperties(
    @NotBlank String host,                    // Must not be blank
    @Min(1) @Max(65535) int port,             // Must be 1-65535
    @DurationUnit(ChronoUnit.SECONDS) Duration timeout  // Auto-parsed duration
) {}

// If validation fails at startup:
// "Invalid configuration: app.redis.host must not be blank"
// App fails FAST instead of failing at runtime when the connection is attempted
```

### Scenario 3: @Profile for Environment-Specific Beans

```java
@Configuration
@Profile("dev")                               // Only active in dev profile
public class DevConfig {
    @Bean
    public CommandLineRunner demoDataLoader(UserRepository userRepo) {
        return args -> {
            userRepo.save(new User("admin", "admin@example.com", "admin123"));
            log.info("Demo data loaded for development");
        };
    }
}

@Configuration
@Profile("prod")                              // Only active in prod profile
public class ProdConfig {
    @Bean
    public CommandLineRunner securityCheck() {
        return args -> {
            if ("changeme".equals(env.getProperty("app.jwt.secret"))) {
                throw new IllegalStateException("DO NOT deploy with default JWT secret!");
            }
        };
    }
}
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Hardcoding configuration values | Can't change between environments | Use `@Value` or `@ConfigurationProperties` |
| No configuration validation | App fails at runtime with cryptic errors | Add `@Validated` to config properties |
| Using `@Autowired` for config | Constructor injection is testable and explicit | Inject config properties via constructor |
| Putting business logic in @Configuration | Untestable, violates SRP | @Configuration creates beans; services use them |
| Forgetting @EnableConfigurationProperties | Config properties class not registered as a bean | Add the annotation to your main class |

---

## Key Takeaways

- **`@Configuration` + `@Bean`** for complex setup (third-party libraries, security, caching).
- **`@ConfigurationProperties`** for typed, validated configuration — IDE-completable, safe.
- **`@ConditionalOnProperty`** for environment-specific bean creation.
- **Relaxed binding** works with `kebab-case`, `camelCase`, `SCREAMING_SNAKE_CASE`.
- **Always validate config at startup** — fail fast with clear error messages.

Official docs: [@Configuration (Spring)](https://docs.spring.io/spring-framework/reference/core/beans/java/configuration-annotation.html) · [External Config (Boot)](https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#features.external-config)
