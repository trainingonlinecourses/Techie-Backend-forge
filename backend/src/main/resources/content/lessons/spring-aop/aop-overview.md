---
title: "Aspect-Oriented Programming: The Big Picture"
module: spring-aop
order: 1
minutes: 25
topics: ["AOP concepts", "cross-cutting concerns", "join points", "advice"]
docs:
  - title: "Aspect-Oriented Programming with Spring"
    url: "https://docs.spring.io/spring-framework/reference/core/aop.html"
---

# Aspect-Oriented Programming: The Big Picture

Aspect-Oriented Programming (AOP) complements Object-Oriented Programming (OOP) by providing another way to think about program structure. Where OOP's key unit is the class, AOP's key unit is the **aspect**. AOP enables modularization of **cross-cutting concerns** — functionality that spans multiple modules and doesn't fit cleanly into a single class.

## The Problem AOP Solves

Consider logging in a typical application. Without AOP, you'd scatter logging calls throughout every service method:

```java
@Service
public class OrderService {
    public Order createOrder(OrderRequest request) {
        log.info("Creating order for customer: {}", request.getCustomerId());
        long start = System.currentTimeMillis();
        try {
            Order order = repository.save(mapToEntity(request));
            log.info("Order created: {} in {}ms", order.getId(), System.currentTimeMillis() - start);
            return order;
        } catch (Exception e) {
            log.error("Failed to create order: {}", e.getMessage());
            throw e;
        }
    }
    
    public Order getOrder(Long id) {
        log.info("Fetching order: {}", id);
        long start = System.currentTimeMillis();
        try {
            Order order = repository.findById(id).orElseThrow();
            log.info("Order fetched: {} in {}ms", id, System.currentTimeMillis() - start);
            return order;
        } catch (Exception e) {
            log.error("Failed to fetch order: {}", e.getMessage());
            throw e;
        }
    }
}
```

This violates the **DRY principle** — the logging, timing, and error handling code is identical across methods. AOP lets you extract this into a single, reusable module.

## Core AOP Terminology

### Join Point

A **join point** is a point during the execution of a program, such as the execution of a method or the handling of an exception. In Spring AOP, join points always represent **method execution**. This is a key limitation — Spring AOP only supports method-level join points, unlike AspectJ which can intercept field access, constructors, and static initializers.

```java
// Every public method in this class is a potential join point
@Service
public class UserService {
    public User findById(Long id) { ... }          // join point
    public User create(CreateUserDto dto) { ... }  // join point
    private User mapToEntity(CreateUserDto dto) { ... } // NOT a join point (private)
}
```

### Pointcut

A **pointcut** is a predicate that matches join points. It's the "where" — which join points do you want to intercept? Pointcuts are defined using **pointcut designators** and **expressions**.

```java
// This pointcut matches all public methods in the service layer
@Pointcut("execution(public * com.acme.service.*.*(..))")
public void serviceMethods() {}

// This pointcut matches any method that takes a Long parameter
@Pointcut("execution(* *(Long, ..))")
public void methodsWithLongParam() {}

// This pointcut matches methods annotated with @Transactional
@Pointcut("@annotation(org.springframework.transaction.annotation.Transactional)")
public void transactionalMethods() {}
```

### Advice

**Advice** is the action taken by an aspect at a particular join point. Spring AOP supports five types of advice:

1. **@Before** — Runs before the join point
2. **@After** — Runs after the join point (whether it completed normally or threw an exception)
3. **@AfterReturning** — Runs only after the join point completes normally
4. **@AfterThrowing** — Runs only if the join point throws an exception
5. **@Around** — Wraps the join point, giving you complete control

```java
@Aspect
@Component
public class LoggingAspect {
    
    @Before("execution(* com.acme.service.*.*(..))")
    public void logBefore(JoinPoint joinPoint) {
        log.info("Calling: {}", joinPoint.getSignature().getName());
    }
    
    @After("execution(* com.acme.service.*.*(..))")
    public void logAfter(JoinPoint joinPoint) {
        log.info("Completed: {}", joinPoint.getSignature().getName());
    }
    
    @AfterReturning(pointcut = "execution(* com.acme.service.*.*(..))", returning = "result")
    public void logAfterReturning(JoinPoint joinPoint, Object result) {
        log.info("Returned: {} -> {}", joinPoint.getSignature().getName(), result);
    }
    
    @AfterThrowing(pointcut = "execution(* com.acme.service.*.*(..))", throwing = "ex")
    public void logAfterThrowing(JoinPoint joinPoint, Exception ex) {
        log.error("Exception in {}: {}", joinPoint.getSignature().getName(), ex.getMessage());
    }
    
    @Around("execution(* com.acme.service.*.*(..))")
    public Object logAround(ProceedingJoinPoint joinPoint) throws Throwable {
        long start = System.currentTimeMillis();
        try {
            Object result = joinPoint.proceed();
            log.info("{} completed in {}ms", joinPoint.getSignature().getName(), 
                     System.currentTimeMillis() - start);
            return result;
        } catch (Throwable t) {
            log.error("{} failed after {}ms: {}", joinPoint.getSignature().getName(),
                      System.currentTimeMillis() - start, t.getMessage());
            throw t;
        }
    }
}
```

### Aspect

An **aspect** is a modularization of a concern that cuts across multiple classes. It's a class that combines pointcuts and advice. In Spring AOP, aspects are typically implemented as regular Spring beans.

```java
@Aspect
@Component
public class PerformanceMonitoringAspect {
    // Pointcut + Advice = Aspect
}
```

### Introduction (or Inter-type Declaration)

**Introduction** (also called inter-type declaration) allows you to add new methods or fields to existing classes. For example, you might introduce a `Monitorable` interface to classes that should be monitored:

```java
@Aspect
@Component
public class MonitorableIntroduction {
    
    @Introduction
    public Monitorable monitorable = new DefaultMonitorable();
}

public interface Monitorable {
    boolean isMonitorEnabled();
}

public class DefaultMonitorable implements Monitorable {
    private boolean enabled = true;
    
    public boolean isMonitorEnabled() { return enabled; }
    public void setMonitorEnabled(boolean enabled) { this.enabled = enabled; }
}
```

### Weaving

**Weaving** is the process of linking aspects with target objects to create advised objects. Spring AOP uses **proxy-based weaving** at runtime:

- **Compile-time weaving** — Aspects compiled into class files (AspectJ)
- **Load-time weaving** — Aspects woven when classes are loaded (AspectJ LTW)
- **Runtime weaving** — Spring AOP creates proxies (JDK dynamic proxies or CGLIB)

```java
// Spring AOP uses runtime weaving via proxies
// JDK dynamic proxy for interfaces
// CGLIB proxy for concrete classes
```

## How Spring AOP Works Under the Hood

Spring AOP creates **proxies** around your beans. When you call a method on a proxied bean, the proxy intercepts the call, applies the advice, and then delegates to the target bean.

### JDK Dynamic Proxy

For beans implementing interfaces, Spring uses JDK's `java.lang.reflect.Proxy`:

```java
// If OrderService implements OrderOperations
// Spring creates a proxy that implements OrderOperations
// The proxy intercepts calls and applies aspects
```

### CGLIB Proxy

For concrete classes without interfaces, Spring uses CGLIB to create a subclass:

```java
// If OrderService is a concrete class
// Spring generates a subclass OrderService$$EnhancerBySpringCGLIB
// The subclass overrides methods to apply aspects
```

### Proxy Configuration

You can control proxy creation in `application.yml`:

```yaml
spring:
  aop:
    proxy-target-class: false  # Use JDK proxy (default: true for CGLIB)
```

Or via `@EnableAspectJAutoProxy`:

```java
@Configuration
@EnableAspectJAutoProxy(proxyTargetClass = true)
public class AopConfig {}
```

## Pointcut Designators

Spring AOP supports these pointcut designators:

### execution

Matches method execution:

```java
// All public methods in any class
@Pointcut("execution(public * *(..))")

// All methods in UserService
@Pointcut("execution(* com.acme.service.UserService.*(..))")

// Methods starting with "find" in the service package
@Pointcut("execution(* com.acme.service.*.find*(..))")

// Methods returning String
@Pointcut("execution(String *(..))")

// Methods with exactly two parameters
@Pointcut("execution(* *(Long, String))")
```

### within

Limits matching to join points within certain types:

```java
// All methods in classes under com.acme.service
@Pointcut("within(com.acme.service..*)")

// All methods in OrderService
@Pointcut("within(com.acme.service.OrderService)")
```

### @annotation

Matches methods annotated with a specific annotation:

```java
// Methods annotated with @Transactional
@Pointcut("@annotation(org.springframework.transaction.annotation.Transactional)")

// Methods annotated with custom annotation
@Pointcut("@annotation(com.acme.annotation.Auditable)")
```

### @within

Matches all join points within types annotated with a specific annotation:

```java
// All methods in classes annotated with @Service
@Pointcut("@within(org.springframework.stereotype.Service)")
```

### @target

Matches join points where the runtime object is annotated with a specific annotation:

```java
// Similar to @within but checks runtime type
@Pointcut("@target(org.springframework.stereotype.Repository)")
```

### @args

Matches join points where the runtime type of the actual argument is annotated:

```java
// Methods where first argument is annotated with @Valid
@Pointcut("@args(com.acme.annotation.Valid)")
```

### bean

Spring-specific pointcut designator matching bean names:

```java
// All methods in beans named "orderService"
@Pointcut("bean(orderService)")

// All methods in beans matching a pattern
@Pointcut("bean(*Service)")
```

### Combining Pointcuts

Spring supports logical operators for combining pointcuts:

```java
// AND - both conditions must match
@Pointcut("execution(* com.acme.service.*.*(..)) && @annotation(Loggable)")

// OR - either condition can match
@Pointcut("execution(* com.acme.service.*.*(..)) || execution(* com.acme.dao.*.*(..))")

// NOT - excludes matches
@Pointcut("execution(* com.acme.service.*.*(..)) && !execution(* com.acme.service.Internal*.*(..))")
```

## Practical Example: Complete Logging Aspect

Here's a production-ready logging aspect:

```java
@Aspect
@Component
@Slf4j
public class LoggingAspect {
    
    private final ThreadLocal<Long> startTime = new ThreadLocal<>();
    
    @Around("execution(* com.acme..service.*.*(..))")
    public Object logMethodExecution(ProceedingJoinPoint joinPoint) throws Throwable {
        String methodName = joinPoint.getSignature().toShortString();
        Object[] args = joinPoint.getArgs();
        
        startTime.set(System.currentTimeMillis());
        log.info("Entering: {} with args: {}", methodName, Arrays.toString(args));
        
        try {
            Object result = joinPoint.proceed();
            long duration = System.currentTimeMillis() - startTime.get();
            log.info("Exiting: {} returned {} in {}ms", methodName, result, duration);
            return result;
        } catch (Throwable t) {
            long duration = System.currentTimeMillis() - startTime.get();
            log.error("Exception in {} after {}ms: {}", methodName, duration, t.getMessage());
            throw t;
        } finally {
            startTime.remove(); // Prevent memory leak
        }
    }
}
```

## AOP vs. Decorator Pattern

You might wonder why not just use the Decorator pattern instead. Here's the comparison:

| Aspect | AOP | Decorator |
|--------|-----|-----------|
| **Coupling** | Decoupled from business code | Tightly coupled (must wrap) |
| **Multiple concerns** | Easy to stack multiple aspects | Complex wrapping chains |
| **Pointcuts** | Flexible matching | Manual wrapping |
| **Reusability** | High (pointcut-driven) | Medium (class-based) |
| **Debugging** | Harder (proxy layer) | Easier (explicit wrapping) |
| **Performance** | Slight overhead (proxy creation) | Zero overhead |

## Common Use Cases

1. **Logging and auditing** — Track method calls, parameters, and results
2. **Security** — Method-level authorization checks
3. **Transaction management** — @Transactional is implemented via AOP
4. **Caching** — @Cacheable, @CacheEvict
5. **Retry logic** — @Retryable
6. **Performance monitoring** — Track execution times
7. **Input validation** — Validate method parameters
8. **Retry and circuit breaking** — Resilience4j uses AOP

## Limitations of Spring AOP

1. **Only method execution** — Cannot intercept field access, constructors, or static initializers
2. **Proxy-based** — Internal method calls within the same class don't trigger aspects
3. **No load-time weaving** — Spring AOP is runtime-only (unlike AspectJ)
4. **Limited pointcut designators** — Fewer than AspectJ (no cflow, etc.)

For more advanced needs, consider **AspectJ** which supports compile-time and load-time weaving, more pointcut designators, and can intercept any join point.

## Testing Aspects

```java
@SpringBootTest
class LoggingAspectTest {
    
    @Autowired
    private UserService userService;
    
    @Autowired
    private CapturingAppender logAppender;
    
    @Test
    void shouldLogMethodExecution() {
        userService.findById(1L);
        
        assertTrue(logAppender.contains("Entering: UserService.findById"));
        assertTrue(logAppender.contains("Exiting: UserService.findById"));
    }
}
```

## Summary

| Concept | Description |
|---------|-------------|
| **Join Point** | A point during execution (method call in Spring AOP) |
| **Pointcut** | Predicate matching join points |
| **Advice** | Action taken at a join point (@Before, @After, @Around, etc.) |
| **Aspect** | Modularization combining pointcut + advice |
| **Introduction** | Adding methods/fields to existing classes |
| **Weaving** | Linking aspects with target objects |
| **Proxy** | Runtime object wrapping the target (JDK or CGLIB) |

AOP is a powerful tool for keeping cross-cutting concerns separate from business logic. When used judiciously, it leads to cleaner, more maintainable code. The key is balance — use AOP for truly cross-cutting concerns, not as a replacement for good object-oriented design.