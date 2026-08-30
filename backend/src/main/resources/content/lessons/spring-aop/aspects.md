---
title: Creating and Configuring Aspects
module: spring-aop
order: 4
minutes: 25
topics: ["@Aspect", "aspect instantiation", "aspect lifecycle", "aspect scoping", "aspect configuration"]
docs:
  - title: "Aspect Instantiation"
    url: "https://docs.spring.io/spring-framework/reference/core/aop/aspect-instantiation.html"
summary: Aspects are the building blocks of AOP — they combine pointcuts with advice to create modular, reusable crosscutting concerns. This lesson covers h...
---

# Creating and Configuring Aspects

Aspects are the building blocks of AOP — they combine pointcuts with advice to create modular, reusable cross-cutting concerns. This lesson covers how to create, configure, and manage aspects in Spring.

## Defining an Aspect

An aspect is a class annotated with `@Aspect`. In Spring AOP, aspects are typically Spring beans managed by the IoC container.

### Basic Aspect Structure

```java
@Aspect
@Component
public class LoggingAspect {
    
    private static final Logger log = LoggerFactory.getLogger(LoggingAspect.class);
    
    // Pointcut definition
    @Pointcut("execution(* com.acme.service.*.*(..))")
    public void serviceMethods() {}
    
    // Advice methods
    @Before("serviceMethods()")
    public void logBefore(JoinPoint joinPoint) {
        log.info("Calling: {}", joinPoint.getSignature().getName());
    }
    
    @After("serviceMethods()")
    public void logAfter(JoinPoint joinPoint) {
        log.info("Completed: {}", joinPoint.getSignature().getName());
    }
}
```

### Aspect with Dependencies

Aspects are Spring beans, so they can have dependencies injected:

```java
@Aspect
@Component
public class SecurityAspect {
    
    private final SecurityService securityService;
    private final AuditService auditService;
    
    public SecurityAspect(SecurityService securityService, AuditService auditService) {
        this.securityService = securityService;
        this.auditService = auditService;
    }
    
    @Before("@annotation(com.acme.annotation.Secured)")
    public void checkSecurity(JoinPoint joinPoint) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!securityService.isAuthenticated(auth)) {
            throw new SecurityException("Not authenticated");
        }
        
        Method method = ((MethodSignature) joinPoint.getSignature()).getMethod();
        Secured secured = method.getAnnotation(Secured.class);
        
        if (!securityService.hasRole(auth, secured.value())) {
            auditService.logUnauthorizedAccess(auth, method);
            throw new SecurityException("Insufficient privileges");
        }
    }
}
```

### Aspect with Configuration Properties

```java
@Aspect
@Component
@ConfigurationProperties(prefix = "app.aspect.logging")
public class ConfigurableLoggingAspect {
    
    private boolean enabled = true;
    private List<String> excludePatterns = List.of("**/health**", "**/metrics**");
    
    // Getters and setters
    
    @Before("execution(* com.acme..*.*(..))")
    public void logMethod(JoinPoint joinPoint) {
        if (!enabled) return;
        
        String methodName = joinPoint.getSignature().toShortString();
        if (excludePatterns.stream().anyMatch(methodName::matches)) {
            return;
        }
        
        log.info("Method called: {}", methodName);
    }
}
```

## Aspect Instantiation Models

Spring AOP supports different instantiation models for aspects:

### Singleton (Default)

The aspect is instantiated once and shared across the application:

```java
@Aspect
@Component
public class SingletonAspect {
    // Created once, shared across all proxies
    // Thread-safe by default
}
```

### Per-Prototype

A new aspect instance is created for each proxy:

```java
@Aspect
@Component
@Scope("prototype")
public class PrototypeAspect {
    // New instance for each target bean
}
```

### Per-Request (via Scope)

```java
@Aspect
@Component
@Scope(value = "request", proxyMode = ScopedProxyMode.TARGET_CLASS)
public class RequestScopedAspect {
    // New instance for each HTTP request
}
```

### Per-Session (via Scope)

```java
@Aspect
@Component
@Scope(value = "session", proxyMode = ScopedProxyMode.TARGET_CLASS)
public class SessionScopedAspect {
    // New instance for each HTTP session
}
```

## Aspect Configuration Options

### Enabling AOP Proxying

```java
@Configuration
@EnableAspectJAutoProxy
public class AopConfig {
    // Enables Spring AOP support
}
```

### Advanced Configuration

```java
@Configuration
@EnableAspectJAutoProxy(
    proxyTargetClass = true,  // Use CGLIB proxies
    exposeProxy = true,       // Make proxy available via AopContext
    optimize = false           // Optimize for final classes
)
public class AdvancedAopConfig {}
```

### Configuration Properties

```yaml
spring:
  aop:
    proxy-target-class: true   # Use CGLIB (default: true)
    auto: true                 # Enable auto-proxying
    expose-proxy: false        # Expose proxy in AopContext
```

## Aspect Ordering and Priority

### Using @Order

```java
@Aspect
@Component
@Order(1)
public class SecurityAspect {
    // Runs first (lowest order = highest priority)
}

@Aspect
@Component
@Order(2)
public class LoggingAspect {
    // Runs second
}

@Aspect
@Component
@Order(3)
public class PerformanceAspect {
    // Runs third
}
```

### Ordering Rules

1. **@Before** advice: Lower order runs first
2. **@After** advice: Lower order runs last (reverse order)
3. **@Around** advice: Lower order wraps higher order

```java
@Aspect
@Component
@Order(1)
public class OuterAspect {
    @Around("execution(* com.acme.service.*.*(..))")
    public Object outer(ProceedingJoinPoint jp) throws Throwable {
        log.info("Outer before");
        Object result = jp.proceed();
        log.info("Outer after");
        return result;
    }
}

@Aspect
@Component
@Order(2)
public class InnerAspect {
    @Around("execution(* com.acme.service.*.*(..))")
    public Object inner(ProceedingJoinPoint jp) throws Throwable {
        log.info("Inner before");
        Object result = jp.proceed();
        log.info("Inner after");
        return result;
    }
}
```

Output:
```
Outer before
Inner before
[Method executes]
Inner after
Outer after
```

### Custom Ordering with @Priority

```java
@Aspect
@Component
@Priority(value = 1)
public class HighPriorityAspect {
    // Runs first
}
```

## Aspect Lifecycle Hooks

### @PostConstruct

```java
@Aspect
@Component
public class LifecycleAspect {
    
    private final Map<String, Method> cache = new ConcurrentHashMap<>();
    
    @PostConstruct
    public void init() {
        log.info("Aspect initialized");
        // Pre-compute or cache data
    }
    
    @PreDestroy
    public void cleanup() {
        log.info("Aspect destroying");
        cache.clear();
    }
    
    @Before("execution(* com.acme.service.*.*(..))")
    public void before(JoinPoint jp) {
        String key = jp.getSignature().toShortString();
        cache.computeIfAbsent(key, k -> {
            // Lazy initialization
            return ((MethodSignature) jp.getSignature()).getMethod();
        });
    }
}
```

### @PreDestroy

```java
@Aspect
@Component
public class ResourceAspect {
    
    private final Connection connection;
    
    @PostConstruct
    public void init() {
        connection = dataSource.getConnection();
    }
    
    @PreDestroy
    public void cleanup() throws SQLException {
        if (connection != null && !connection.isClosed()) {
            connection.close();
        }
    }
    
    @Before("execution(* com.acme.dao.*.*(..))")
    public void ensureConnection(JoinPoint jp) throws SQLException {
        if (connection.isClosed()) {
            connection = dataSource.getConnection();
        }
    }
}
```

## Aspect Scoping and Proxies

### Understanding Proxy Types

When you annotate a class with `@Aspect`, Spring creates a proxy around it. The proxy type depends on your configuration:

```java
// CGLIB proxy (default)
@EnableAspectJAutoProxy(proxyTargetClass = true)

// JDK dynamic proxy
@EnableAspectJAutoProxy(proxyTargetClass = false)
```

### Aspect with Interface

```java
@Aspect
@Component
public class AuditableAspect implements Ordered {
    
    @Override
    public int getOrder() {
        return 1;
    }
    
    @Before("@annotation(com.acme.annotation.Auditable)")
    public void audit(JoinPoint jp) {
        // Implementation
    }
}
```

### Aspect without Interface (CGLIB Required)

```java
@Aspect
@Component
public class NonInterfaceAspect {
    // Requires CGLIB proxy since no interface
    // proxyTargetClass = true must be set
}
```

## Shared Pointcuts

### Pointcut Composition

```java
@Aspect
@Component
public class ComposedAspect {
    
    @Pointcut("execution(* com.acme.service.*.*(..))")
    public void serviceMethods() {}
    
    @Pointcut("execution(* com.acme.dao.*.*(..))")
    public void daoMethods() {}
    
    @Pointcut("serviceMethods() || daoMethods()")
    public void serviceOrDaoMethods() {}
    
    @Pointcut("serviceMethods() && @annotation(com.acme.annotation.Auditable)")
    public void auditableServiceMethods() {}
    
    @Before("serviceOrDaoMethods()")
    public void logServiceOrDao(JoinPoint jp) {
        log.info("Service or DAO call: {}", jp.getSignature().getName());
    }
    
    @Before("auditableServiceMethods()")
    public void auditService(JoinPoint jp) {
        log.info("Auditable service call: {}", jp.getSignature().getName());
    }
}
```

### Pointcut in Separate Class

```java
// Pointcuts.java - reusable pointcut definitions
public class Pointcuts {
    
    @Pointcut("execution(* com.acme.service.*.*(..))")
    public static void serviceMethods() {}
    
    @Pointcut("execution(* com.acme.dao.*.*(..))")
    public static void daoMethods() {}
    
    @Pointcut("execution(* com.acme..*.*(..))")
    public static void allMethods() {}
}

// Using pointcuts from another class
@Aspect
@Component
public class LoggingAspect {
    
    @Before("Pointcuts.serviceMethods()")
    public void logService(JoinPoint jp) {
        log.info("Service: {}", jp.getSignature().getName());
    }
    
    @Before("Pointcuts.daoMethods()")
    public void logDao(JoinPoint jp) {
        log.info("DAO: {}", jp.getSignature().getName());
    }
}
```

### Pointcut with Parameters

```java
@Aspect
@Component
public class ParameterizedAspect {
    
    @Pointcut("@annotation(com.acme.annotation.Loggable)")
    public void loggableMethods() {}
    
    @Around("@annotation(loggable)")
    public Object logWithDetails(ProceedingJoinPoint jp, Loggable loggable) throws Throwable {
        String level = loggable.level();
        String message = loggable.message();
        
        if ("DEBUG".equals(level)) {
            log.debug("{}: {}", message, jp.getSignature().getName());
        } else {
            log.info("{}: {}", message, jp.getSignature().getName());
        }
        
        return jp.proceed();
    }
}
```

## Aspect Testing

### Unit Testing Aspects

```java
@SpringBootTest
class LoggingAspectTest {
    
    @Autowired
    private UserService userService;
    
    @Autowired
    private LoggingAspect loggingAspect;
    
    @Test
    void shouldLogMethodCall() {
        // Given
        when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));
        
        // When
        userService.findById(1L);
        
        // Then
        verify(log).info(argThat(s -> s.contains("findById")));
    }
    
    @Test
    void shouldLogMethodCompletion() {
        // Given
        when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));
        
        // When
        userService.findById(1L);
        
        // Then
        verify(log).info(argThat(s -> s.contains("Completed")));
    }
}
```

### Integration Testing Aspects

```java
@SpringBootTest
@Transactional
class SecurityAspectIntegrationTest {
    
    @Autowired
    private UserService userService;
    
    @WithMockUser(roles = "ADMIN")
    @Test
    void adminCanAccessAdminMethods() {
        assertDoesNotThrow(() -> userService.deleteUser(1L));
    }
    
    @WithMockUser(roles = "USER")
    @Test
    void userCannotAccessAdminMethods() {
        assertThrows(AccessDeniedException.class, 
                     () -> userService.deleteUser(1L));
    }
}
```

### Mocking Aspect Dependencies

```java
@SpringBootTest
class AspectWithMockedDependenciesTest {
    
    @MockBean
    private AuditService auditService;
    
    @Autowired
    private SecurityAspect securityAspect;
    
    @Test
    void shouldAuditSecurityCheck() {
        // Test aspect behavior with mocked dependencies
        securityAspect.checkSecurity(mockJoinPoint);
        
        verify(auditService).logSecurityCheck(any(), any());
    }
}
```

## Aspect Best Practices

### 1. Keep Aspects Focused

```java
// GOOD — Single responsibility
@Aspect
@Component
public class LoggingAspect {
    // Only handles logging
}

@Aspect
@Component
public class SecurityAspect {
    // Only handles security
}

// BAD — Multiple responsibilities
@Aspect
@Component
public class MultiPurposeAspect {
    // Handles logging, security, and transactions
}
```

### 2. Use Named Pointcuts

```java
// GOOD — Reusable and readable
@Aspect
@Component
public class LoggingAspect {
    
    @Pointcut("execution(* com.acme.service.*.*(..))")
    public void serviceMethods() {}
    
    @Before("serviceMethods()")
    public void logBefore(JoinPoint jp) { ... }
    
    @After("serviceMethods()")
    public void logAfter(JoinPoint jp) { ... }
}

// LESS IDEAL — Inline pointcuts repeated
@Aspect
@Component
public class LoggingAspect {
    @Before("execution(* com.acme.service.*.*(..))")
    public void logBefore(JoinPoint jp) { ... }
    
    @After("execution(* com.acme.service.*.*(..))")
    public void logAfter(JoinPoint jp) { ... }
}
```

### 3. Handle Exceptions Properly

```java
@Aspect
@Component
public class ErrorHandlingAspect {
    
    @Around("execution(* com.acme.service.*.*(..))")
    public Object handleError(ProceedingJoinPoint jp) throws Throwable {
        try {
            return jp.proceed();
        } catch (BusinessException e) {
            log.error("Business error: {}", e.getMessage());
            throw e; // Re-throw business exceptions
        } catch (Exception e) {
            log.error("Unexpected error: {}", e.getMessage(), e);
            throw new TechnicalException("Internal error", e); // Wrap unexpected
        }
    }
}
```

### 4. Avoid Circular Dependencies

```java
// BAD — Circular dependency
@Aspect
@Component
public class AspectA {
    @Autowired
    private AspectB aspectB;
}

@Aspect
@Component
public class AspectB {
    @Autowired
    private AspectA aspectA;
}

// GOOD — Use constructor injection and avoid circular references
@Aspect
@Component
public class AspectA {
    private final ServiceB serviceB;
    
    public AspectA(ServiceB serviceB) {
        this.serviceB = serviceB;
    }
}
```

### 5. Use Appropriate Proxy Type

```java
// For interfaces — JDK proxy is fine
@EnableAspectJAutoProxy(proxyTargetClass = false)

// For concrete classes — CGLIB required
@EnableAspectJAutoProxy(proxyTargetClass = true)
```

## Common Pitfalls

### 1. Self-Invocation

```java
@Service
public class UserService {
    
    @Transactional
    public void methodA() {
        // Internal call — AOP won't intercept!
        this.methodB();
    }
    
    @Cacheable("users")
    public User methodB() {
        // This won't be cached when called from methodA
    }
}
```

**Solution:** Inject the proxy or use `AopContext.currentProxy()`:

```java
@Service
public class UserService {
    
    @Transactional
    public void methodA() {
        // Get the proxy
        UserService proxy = AopContext.currentProxy();
        proxy.methodB(); // This will be intercepted
    }
}
```

### 2. Final Methods

```java
// CGLIB cannot proxy final methods
public final void method() { ... }

// This will fail at startup
```

### 3. Private Methods

```java
// AOP cannot intercept private methods
private void method() { ... }

// execution(private * *(..)) doesn't work
```

### 4. Package-private Methods

```java
// AOP can intercept package-private methods
// But only if CGLIB proxy is used
void method() { ... }
```

## Summary

| Concept | Description |
|---------|-------------|
| **@Aspect** | Marks a class as an aspect |
| **@Component** | Makes aspect a Spring bean |
| **Singleton** | Default scope, one instance per aspect |
| **Prototype** | New instance for each target bean |
| **@Order** | Controls aspect execution order |
| **Shared Pointcuts** | Reusable pointcut definitions |
| **Lifecycle Hooks** | @PostConstruct, @PreDestroy |
| **Testing** | Unit and integration testing patterns |

Aspects are powerful but should be used judiciously. Keep them focused, well-organized, and properly tested. Remember that AOP adds a layer of indirection that can make debugging more challenging.