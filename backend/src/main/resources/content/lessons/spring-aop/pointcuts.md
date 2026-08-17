---
title: Pointcut Expressions: Matching Join Points
module: spring-aop
order: 2
minutes: 30
topics: ["pointcut designators", "execution", "within", "annotation", "bean", "combining"]
docs:
  - title: "Pointcut Designators"
    url: "https://docs.spring.io/spring-framework/reference/core/aop/pointcuts/designators.html"
---

# Pointcut Expressions: Matching Join Points

Pointcuts are the "where" of AOP — they define which join points an aspect should intercept. Spring AOP provides a rich set of **pointcut designators** (PCDs) that let you express precise matching rules. Understanding pointcuts is essential for writing effective aspects.

## The Anatomy of a Pointcut Expression

A pointcut expression has two parts:

```java
@Pointcut("execution(public * com.acme.service.OrderService.createOrder(..))")
//          ^designator    ^return ^package     ^class          ^method   ^args
```

- **Designator** — The type of matching (execution, within, annotation, etc.)
- **Pattern** — The specific pattern to match

## execution — The Workhorse

The `execution` designator is the most commonly used. It matches method execution based on return type, class, method name, and parameters.

### Basic Syntax

```
execution(modifiers? return-type declaring-type? method-name(param-pattern) throws-pattern?)
```

Every part except `method-name` is optional (denoted by `?`).

### Matching Return Types

```java
// Any return type
@Pointcut("execution(* com.acme.service.*.*(..))")

// Void return type
@Pointcut("execution(void com.acme.service.*.*(..))")

// String return type
@Pointcut("execution(String com.acme.service.*.*(..))")

// Any type starting with "Order" (wildcard)
@Pointcut("execution(Order* com.acme.service.*.*(..))")

// Any collection return type
@Pointcut("execution(java.util.List com.acme.service.*.*(..))")
```

### Matching Class and Package

```java
// Specific class
@Pointcut("execution(* com.acme.service.OrderService.*(..))")

// All classes in a package
@Pointcut("execution(* com.acme.service.*.*(..))")

// All classes in a package and sub-packages (..)
@Pointcut("execution(* com.acme..service.*.*(..))")

// Classes ending with "Service"
@Pointcut("execution(* com.acme.service.*Service.*(..))")
```

### Matching Method Names

```java
// Specific method
@Pointcut("execution(* com.acme.service.*.createOrder(..))")

// Methods starting with "find"
@Pointcut("execution(* com.acme.service.*.find*(..))")

// Methods ending with "ById"
@Pointcut("execution(* com.acme.service.*.*ById(..))")

// Methods containing "order" (case-sensitive)
@Pointcut("execution(* com.acme.service.*.*order*(..))")
```

### Matching Parameters

Parameter matching is one of the most powerful features:

```java
// No parameters
@Pointcut("execution(* com.acme.service.*.method())")

// Exactly one parameter of any type
@Pointcut("execution(* com.acme.service.*.method(*))")

// Exactly two parameters (any types)
@Pointcut("execution(* com.acme.service.*.method(*, *))")

// Any number of parameters
@Pointcut("execution(* com.acme.service.*.method(..))")

// First parameter is String, any remaining
@Pointcut("execution(* com.acme.service.*.method(String, ..))")

// Last parameter is Exception
@Pointcut("execution(* com.acme.service.*.method(.., Exception))")

// Parameters: Long, then any
@Pointcut("execution(* com.acme.service.*.method(Long, ..))")

// Parameters: any, then String, then any
@Pointcut("execution(* com.acme.service.*.method(*, String, ..))")

// Exactly: Long, String
@Pointcut("execution(* com.acme.service.*.method(Long, String))")

// Parameter types (fully qualified)
@Pointcut("execution(* com.acme.service.*.method(java.lang.String, com.acme.dto.OrderRequest))")
```

### Parameter Pattern Wildcards

| Pattern | Meaning |
|---------|---------|
| `()` | No parameters |
| `(*)` | Exactly one parameter of any type |
| `(*, *)` | Exactly two parameters |
| `(..)` | Any number of parameters (zero or more) |
| `(String, ..)` | First param is String, any remaining |
| `(.., Exception)` | Last param is Exception |
| `(*, String, ..)` | Second param is String |

### Matching Exceptions

```java
// Methods that throw RuntimeException
@Pointcut("execution(* com.acme.service.*.*(..) throws java.lang.RuntimeException)")

// Methods declared to throw any exception
@Pointcut("execution(* com.acme.service.*.*(..) throws ..)")
```

### Matching Modifiers

```java
// Public methods only
@Pointcut("execution(public * com.acme.service.*.*(..))")

// Public or protected
@Pointcut("execution(public || protected * com.acme.service.*.*(..))")

// Not static
@Pointcut("execution(!static * com.acme.service.*.*(..))")
```

## within — Type-based Matching

The `within` designator limits matching to join points within certain types:

```java
// All methods in OrderService
@Pointcut("within(com.acme.service.OrderService)")

// All methods in any class under com.acme.service
@Pointcut("within(com.acme.service..*)")

// All methods in classes ending with "Service"
@Pointcut("within(com.acme.service.*Service)")
```

### within vs. execution

```java
// execution — matches the method signature
@Pointcut("execution(* com.acme.service.*.*(..))")

// within — matches the type containing the method
@Pointcut("within(com.acme.service..*)")
```

Key difference: `execution` matches based on method signature, `within` matches based on the declaring type. For most cases, `execution` is more precise.

## @annotation — Method Annotations

Matches methods annotated with a specific annotation:

```java
// Methods annotated with @Transactional
@Pointcut("@annotation(org.springframework.transaction.annotation.Transactional)")

// Methods annotated with custom annotation
@Pointcut("@annotation(com.acme.annotation.Auditable)")

// Methods annotated with @Transactional and having specific rollback behavior
@Pointcut("@annotation(org.springframework.transaction.annotation.Transactional) && execution(* *(..))")
```

### Combining @annotation with execution

```java
// Public methods annotated with @Cacheable
@Pointcut("@annotation(org.springframework.cache.annotation.Cacheable) && execution(public * *(..))")
public void cachedPublicMethods() {}
```

## @within — Type Annotations

Matches all join points within types annotated with a specific annotation:

```java
// All methods in classes annotated with @Service
@Pointcut("@within(org.springframework.stereotype.Service)")

// All methods in classes annotated with @Repository
@Pointcut("@within(org.springframework.stereotype.Repository)")

// All methods in classes annotated with @RestController
@Pointcut("@within(org.springframework.web.bind.annotation.RestController)")
```

### @within vs. @annotation

```java
// @annotation — method must be annotated
@Pointcut("@annotation(com.acme.annotation.Auditable)")

// @within — class must be annotated
@Pointcut("@within(com.acme.annotation.Auditable)")
```

## @target — Runtime Type Check

Similar to `@within` but checks the runtime type of the object:

```java
// Matches based on runtime type
@Pointcut("@target(org.springframework.stereotype.Service)")
```

The difference from `@within`:
- `@within` checks the compile-time type
- `@target` checks the runtime type (important for proxies)

In practice, `@within` is more commonly used.

## @args — Argument Type Annotations

Matches join points where the runtime type of the actual argument is annotated:

```java
// Methods where first argument is annotated with @Valid
@Pointcut("@args(com.acme.annotation.Valid)")

// Methods where any argument is annotated with @NotNull
@Pointcut("@args(org.springframework.lang.NonNull)")
```

### @args vs. @annotation

```java
// @args — checks the argument's type annotation
@Pointcut("@args(com.acme.annotation.Valid)")

// @annotation — checks the method's annotation
@Pointcut("@annotation(com.acme.annotation.Auditable)")
```

## bean — Spring-specific Matching

The `bean` designator is Spring-specific and matches based on bean names:

```java
// All methods in a specific bean
@Pointcut("bean(orderService)")

// All methods in beans matching a pattern
@Pointcut("bean(*Service)")

// All methods in beans starting with "order"
@Pointcut("bean(order*)")
```

### bean with other designators

```java
// Public methods in the orderService bean
@Pointcut("bean(orderService) && execution(public * *(..))")

// Methods annotated with @Transactional in any *Service bean
@Pointcut("@annotation(org.springframework.transaction.annotation.Transactional) && bean(*Service)")
```

## Combining Pointcuts

Spring AOP supports logical operators for combining pointcuts:

### AND (&&)

Both conditions must match:

```java
// Public methods in service classes annotated with @Auditable
@Pointcut("execution(public * com.acme.service.*.*(..)) && @within(com.acme.annotation.Auditable)")

// Or using named pointcuts
@Pointcut("serviceMethods() && annotatedWithAuditable")
```

### OR (||)

Either condition can match:

```java
// Methods in service or repository packages
@Pointcut("execution(* com.acme.service.*.*(..)) || execution(* com.acme.repository.*.*(..))")
```

### NOT (!)

Excludes matches:

```java
// All public methods except those in internal classes
@Pointcut("execution(public * com.acme..*.*(..)) && !execution(* com.acme..internal*.*(..))")

// All methods except getters/setters
@Pointcut("execution(* com.acme..*.*(..)) && !execution(* get*(..)) && !execution(* set*(..))")
```

## Named Pointcuts vs. Inline Pointcuts

### Named Pointcuts (Reusable)

```java
@Aspect
@Component
public class LoggingAspect {
    
    @Pointcut("execution(* com.acme.service.*.*(..))")
    public void serviceMethods() {}
    
    @Pointcut("@annotation(com.acme.annotation.Auditable)")
    public void auditableMethods() {}
    
    @Before("serviceMethods()")
    public void logServiceCall(JoinPoint jp) {
        log.info("Service call: {}", jp.getSignature().getName());
    }
    
    @Before("serviceMethods() && auditableMethods()")
    public void logAuditableServiceCall(JoinPoint jp) {
        log.info("Auditable service call: {}", jp.getSignature().getName());
    }
}
```

### Inline Pointcuts (One-time Use)

```java
@Aspect
@Component
public class LoggingAspect {
    
    @Before("execution(* com.acme.service.*.*(..))")
    public void logServiceCall(JoinPoint jp) {
        log.info("Service call: {}", jp.getSignature().getName());
    }
    
    @Before("execution(* com.acme.repository.*.*(..)) && @annotation(com.acme.annotation.Auditable)")
    public void logAuditableRepositoryCall(JoinPoint jp) {
        log.info("Auditable repository call: {}", jp.getSignature().getName());
    }
}
```

### Pointcut Composition in XML

In XML-based AOP, you can define pointcuts in a shared config:

```xml
<aop:config>
    <aop:pointcut id="serviceMethods" 
                  expression="execution(* com.acme.service.*.*(..))"/>
    
    <aop:aspect ref="loggingAspect">
        <aop:before pointcut-ref="serviceMethods" method="logBefore"/>
        <aop:after pointcut-ref="serviceMethods" method="logAfter"/>
    </aop:aspect>
</aop:config>
```

## Real-World Pointcut Examples

### Secure Methods

```java
// All public methods in the security package
@Pointcut("execution(public * com.acme.security.*.*(..))")

// Methods annotated with @PreAuthorize
@Pointcut("@annotation(org.springframework.security.access.prepost.PreAuthorize)")

// Methods in service classes that take a User parameter
@Pointcut("execution(* com.acme.service.*.*(.., com.acme.model.User, ..))")
```

### Performance Monitoring

```java
// All public methods in the service layer
@Pointcut("execution(public * com.acme.service.*.*(..))")

// Methods that return a CompletableFuture
@Pointcut("execution(java.util.concurrent.CompletableFuture com.acme..*.*(..))")

// Methods with @Timed annotation
@Pointcut("@annotation(io.micrometer.core.annotation.Timed)")
```

### Cache Operations

```java
// Methods annotated with @Cacheable
@Pointcut("@annotation(org.springframework.cache.annotation.Cacheable)")

// Methods annotated with @CacheEvict
@Pointcut("@annotation(org.springframework.cache.annotation.CacheEvict)")

// Methods annotated with @CachePut
@Pointcut("@annotation(org.springframework.cache.annotation.CachePut)")

// All cache operations
@Pointcut("@annotation(org.springframework.cache.annotation.Cacheable) || " +
          "@annotation(org.springframework.cache.annotation.CacheEvict) || " +
          "@annotation(org.springframework.cache.annotation.CachePut)")
```

### Validation

```java
// Controller methods
@Pointcut("execution(* com.acme.controller.*.*(..))")

// Methods with @Valid annotation on first parameter
@Pointcut("execution(* *(.., @org.springframework.validation.annotation.Valid (*), ..))")
```

## Debugging Pointcuts

When a pointcut doesn't match as expected, use these debugging techniques:

### 1. Check Pointcut Syntax

```java
// Wrong — missing .. for any parameters
@Pointcut("execution(* com.acme.service.*.method(*))")

// Correct — use .. for any parameters
@Pointcut("execution(* com.acme.service.*.method(..))")
```

### 2. Verify Method Signatures

```java
// The method signature must match exactly
// If the method is: public User findById(Long id)
// Use: execution(* com.acme.service.*.findById(Long))

// If you want any parameters:
// Use: execution(* com.acme.service.*.findById(..))
```

### 3. Enable AOP Proxy Logging

```yaml
logging:
  level:
    org.springframework.aop: DEBUG
    org.springframework.cglib: DEBUG
```

### 4. Test with a Simple Aspect

```java
@Aspect
@Component
public class DebugAspect {
    
    @Before("execution(* com.acme.service.*.*(..))")
    public void debugMatch(JoinPoint jp) {
        log.debug("Matched: {}", jp.getSignature());
    }
}
```

## Common Pitfalls

### 1. Forgetting .. for Parameters

```java
// WRONG — matches only methods with exactly one Long parameter
@Pointcut("execution(* com.acme.service.*.findById(Long))")

// CORRECT — matches methods with Long parameter (and potentially others)
@Pointcut("execution(* com.acme.service.*.findById(..))")
```

### 2. Internal Method Calls

```java
@Service
public class OrderService {
    public void processOrder() {
        this.validateOrder(); // Internal call — AOP won't intercept!
    }
    
    @Transactional
    public void validateOrder() { ... }
}
```

AOP proxies intercept calls through the proxy, not internal calls within the same object.

### 3. Final Methods

```java
// CGLIB cannot proxy final methods
public final void method() { ... }

// This will fail at startup
```

### 4. Private Methods

```java
// execution only matches public and protected methods
// private methods cannot be intercepted
@Pointcut("execution(private * com.acme..*.*(..))") // Doesn't work
```

## Performance Considerations

Pointcut evaluation happens at:
1. **Bean creation time** — Proxy creation
2. **Runtime** — For each method call

Complex pointcut expressions can impact performance. Keep them simple and specific:

```java
// SLOW — complex expression evaluated at every call
@Pointcut("execution(* com.acme..*.*(..)) && @annotation(com.acme.annotation.Auditable) && bean(*Service)")

// FASTER — use named pointcuts and combine
@Pointcut("serviceMethods && auditableMethods")
```

## Summary

| Designator | Matches | Example |
|------------|---------|---------|
| `execution` | Method execution | `execution(* com.acme..*.*(..))` |
| `within` | Join points within types | `within(com.acme.service..*)` |
| `@annotation` | Methods with annotation | `@annotation(@Transactional)` |
| `@within` | Types with annotation | `@within(@Service)` |
| `@target` | Runtime type with annotation | `@target(@Service)` |
| `@args` | Arguments with annotation | `@args(@Valid)` |
| `bean` | Bean names | `bean(*Service)` |

Mastering pointcuts is the foundation of effective AOP. Start with `execution` and `@annotation` for most cases, and add other designators as needed.