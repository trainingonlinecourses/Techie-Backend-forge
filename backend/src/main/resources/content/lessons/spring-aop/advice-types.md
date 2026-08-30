---
title: Advice Types: Before, After, Around, and More
module: spring-aop
order: 3
minutes: 35
topics: ["@Before", "@After", "@AfterReturning", "@AfterThrowing", "@Around", "advice ordering"]
summary: Advice is the action taken by an aspect at a particular join point. Spring AOP provides five advice types, each with specific semantics and use cas...
docs:
  - title: "Advice Types in Spring AOP"
    url: "https://docs.spring.io/spring-framework/reference/core/aop/around-advice.html"
---

# Advice Types: Before, After, Around, and More

Advice is the action taken by an aspect at a particular join point. Spring AOP provides five advice types, each with specific semantics and use cases. Understanding when to use each type is crucial for writing effective aspects.

## The Five Advice Types

### 1. @Before — Pre-execution Advice

Runs **before** the join point. Cannot prevent the join point from executing (unless it throws an exception).

```java
@Aspect
@Component
public class BeforeAdviceExample {
    
    @Before("execution(* com.acme.service.*.*(..))")
    public void beforeMethod(JoinPoint joinPoint) {
        String methodName = joinPoint.getSignature().getName();
        Object[] args = joinPoint.getArgs();
        
        log.info("Before {} with args: {}", methodName, Arrays.toString(args));
        
        // Can modify arguments through ThreadLocal or other mechanisms
        // But cannot prevent execution (unless throwing exception)
    }
}
```

#### Use Cases
- **Logging** — Log method entry with parameters
- **Security checks** — Verify permissions before execution
- **Input validation** — Validate arguments
- **Audit trails** — Record who called what

#### JoinPoint Parameter

The `JoinPoint` parameter is required for `@Before` and provides:

```java
@Before("execution(* com.acme.service.*.*(..))")
public void beforeMethod(JoinPoint joinPoint) {
    // Method signature
    Signature signature = joinPoint.getSignature();
    String name = signature.getName();
    String declaringTypeName = signature.getDeclaringType().getSimpleName();
    
    // Method parameters
    Object[] args = joinPoint.getArgs();
    
    // Target object
    Object target = joinPoint.getTarget();
    
    // Proxy object
    Object proxy = joinPoint.getThis();
    
    // Pointcut expression
    String pointcutExpression = joinPoint.getStaticPart().toString();
    
    log.info("Calling {} on {} with args: {}", 
             declaringTypeName + "." + name, 
             target.getClass().getSimpleName(),
             Arrays.toString(args));
}
```

### 2. @After — Finally Advice

Runs **after** the join point, regardless of whether it completed normally or threw an exception. Similar to a `finally` block.

```java
@Aspect
@Component
public class AfterAdviceExample {
    
    @After("execution(* com.acme.service.*.*(..))")
    public void afterMethod(JoinPoint joinPoint) {
        log.info("After {} completed", joinPoint.getSignature().getName());
        // Always runs, even if exception was thrown
    }
}
```

#### Use Cases
- **Cleanup** — Release resources
- **Logging** — Log method completion
- **Metrics** — Record method completion
- **Resource management** — Close connections, release locks

#### Difference from @AfterReturning and @AfterThrowing

```java
// @After runs in ALL cases
@After("execution(* com.acme.service.*.*(..))")
public void afterMethod(JoinPoint jp) {
    log.info("Always runs");
}

// @AfterReturning runs ONLY on success
@AfterReturning(pointcut = "execution(* com.acme.service.*.*(..))", returning = "result")
public void afterReturning(JoinPoint jp, Object result) {
    log.info("Runs only on success: {}", result);
}

// @AfterThrowing runs ONLY on exception
@AfterThrowing(pointcut = "execution(* com.acme.service.*.*(..))", throwing = "ex")
public void afterThrowing(JoinPoint jp, Exception ex) {
    log.error("Runs only on exception: {}", ex.getMessage());
}
```

### 3. @AfterReturning — Successful Return Advice

Runs only after the join point completes **normally** (without throwing an exception). Can access the return value.

```java
@Aspect
@Component
public class AfterReturningAdviceExample {
    
    @AfterReturning(
        pointcut = "execution(* com.acme.service.*.*(..))",
        returning = "result"
    )
    public void afterReturning(JoinPoint joinPoint, Object result) {
        log.info("Method {} returned: {}", 
                 joinPoint.getSignature().getName(), result);
    }
    
    // Can specify return type for more precise matching
    @AfterReturning(
        pointcut = "execution(* com.acme.service.*.*(..))",
        returning = "result"
    )
    public void afterReturningString(JoinPoint joinPoint, String result) {
        log.info("Method returned String: {}", result);
    }
    
    // Can modify the returned object (by returning a new value)
    @AfterReturning(
        pointcut = "execution(com.acme.model.User com.acme.service.*.*(..))",
        returning = "user"
    )
    public User afterReturningUser(JoinPoint joinPoint, User user) {
        // Cannot modify the original, but can log/audit
        log.info("User returned: {}", user.getEmail());
        return user; // Must return the same object
    }
}
```

#### Use Cases
- **Logging results** — Log what methods return
- **Auditing** — Record successful operations
- **Metrics** — Track return values
- **Cache population** — Store results in cache

#### Returning Parameter

The `returning` attribute binds the return value to a parameter:

```java
@AfterReturning(pointcut = "execution(* *(..))", returning = "result")
public void afterReturning(JoinPoint jp, Object result) {
    // result is the return value
    // Type must match (or be compatible with) the actual return type
}
```

### 4. @AfterThrowing — Exception Advice

Runs only when the join point throws an exception. Can access the exception.

```java
@Aspect
@Component
public class AfterThrowingAdviceExample {
    
    @AfterThrowing(
        pointcut = "execution(* com.acme.service.*.*(..))",
        throwing = "ex"
    )
    public void afterThrowing(JoinPoint joinPoint, Exception ex) {
        log.error("Method {} threw exception: {}", 
                  joinPoint.getSignature().getName(), ex.getMessage());
    }
    
    // Can specify exception type for more precise matching
    @AfterThrowing(
        pointcut = "execution(* com.acme.service.*.*(..))",
        throwing = "ex"
    )
    public void afterThrowingIO(JoinPoint joinPoint, IOException ex) {
        log.error("IO Exception: {}", ex.getMessage());
    }
    
    // Can catch specific exception types
    @AfterThrowing(
        pointcut = "execution(* com.acme.service.*.*(..))",
        throwing = "ex"
    )
    public void afterThrowingValidation(JoinPoint joinPoint, ValidationException ex) {
        log.error("Validation failed: {}", ex.getErrors());
    }
}
```

#### Use Cases
- **Error logging** — Log exceptions with context
- **Exception translation** — Convert exceptions to different types
- **Alerting** — Send notifications on critical errors
- **Retry logic** — Trigger retry on specific exceptions

#### Throwing Parameter

The `throwing` attribute binds the exception to a parameter:

```java
@AfterThrowing(pointcut = "execution(* *(..))", throwing = "ex")
public void afterThrowing(JoinPoint jp, Exception ex) {
    // ex is the thrown exception
    // Can be a specific exception type
}
```

### 5. @Around — Around Advice

The most powerful advice type. Wraps the join point, giving you complete control over whether and when it executes. **Must call `proceed()` to invoke the target method.**

```java
@Aspect
@Component
public class AroundAdviceExample {
    
    @Around("execution(* com.acme.service.*.*(..))")
    public Object aroundMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        String methodName = joinPoint.getSignature().getName();
        long start = System.currentTimeMillis();
        
        try {
            // Before advice logic
            log.info("Starting {}", methodName);
            
            // Invoke the target method
            Object result = joinPoint.proceed();
            
            // AfterReturning advice logic
            long duration = System.currentTimeMillis() - start;
            log.info("{} completed in {}ms, result: {}", methodName, duration, result);
            
            return result;
        } catch (Throwable t) {
            // AfterThrowing advice logic
            long duration = System.currentTimeMillis() - start;
            log.error("{} failed after {}ms: {}", methodName, duration, t.getMessage());
            throw t; // Re-throw or handle
        } finally {
            // After advice logic
            log.info("Finished {}", methodName);
        }
    }
}
```

#### ProceedingJoinPoint

`@Around` advice receives a `ProceedingJoinPoint` instead of `JoinPoint`:

```java
@Around("execution(* com.acme.service.*.*(..))")
public Object aroundMethod(ProceedingJoinPoint joinPoint) throws Throwable {
    // Can access all JoinPoint methods
    Signature signature = joinPoint.getSignature();
    Object[] args = joinPoint.getArgs();
    
    // Can modify arguments
    Object[] modifiedArgs = modifyArguments(args);
    
    // Must call proceed() to invoke the target
    // Can call it multiple times (for retry, etc.)
    Object result = joinPoint.proceed(modifiedArgs);
    
    // Can modify the result
    return modifyResult(result);
}
```

#### Use Cases
- **Transaction management** — @Transactional is implemented via @Around
- **Performance monitoring** — Measure execution time
- **Retry logic** — Retry failed operations
- **Circuit breaking** — Prevent calls when service is down
- **Caching** — Return cached values without calling method
- **Security** — Check permissions before and after

#### Combining All Advice Types

```java
@Aspect
@Component
public class ComprehensiveAspect {
    
    @Around("execution(* com.acme.service.*.*(..))")
    public Object monitor(ProceedingJoinPoint joinPoint) throws Throwable {
        long start = System.currentTimeMillis();
        try {
            Object result = joinPoint.proceed();
            long duration = System.currentTimeMillis() - start;
            metrics.record(joinPoint.getSignature().getName(), duration);
            return result;
        } catch (Throwable t) {
            long duration = System.currentTimeMillis() - start;
            metrics.recordError(joinPoint.getSignature().getName(), duration, t);
            throw t;
        }
    }
    
    @Before("execution(* com.acme.service.*.*(..))")
    public void validate(JoinPoint joinPoint) {
        for (Object arg : joinPoint.getArgs()) {
            if (arg instanceof Validatable) {
                ((Validatable) arg).validate();
            }
        }
    }
    
    @AfterReturning(pointcut = "execution(* com.acme.service.*.*(..))", returning = "result")
    public void audit(JoinPoint joinPoint, Object result) {
        auditService.record(joinPoint.getSignature().getName(), result);
    }
    
    @AfterThrowing(pointcut = "execution(* com.acme.service.*.*(..))", throwing = "ex")
    public void alert(JoinPoint joinPoint, Exception ex) {
        if (isCritical(ex)) {
            alertService.send(joinPoint.getSignature().getName(), ex);
        }
    }
}
```

## Advice Ordering

When multiple aspects apply to the same join point, their execution order is determined by:

### 1. Aspect Order

Control aspect ordering with `@Order`:

```java
@Aspect
@Component
@Order(1)
public class SecurityAspect {
    @Before("execution(* com.acme.service.*.*(..))")
    public void checkSecurity(JoinPoint jp) {
        log.info("Security check (order 1)");
    }
}

@Aspect
@Component
@Order(2)
public class LoggingAspect {
    @Before("execution(* com.acme.service.*.*(..))")
    public void log(JoinPoint jp) {
        log.info("Logging (order 2)");
    }
}
```

**Lower order = higher priority**. For `@Before` advice, lower order runs first. For `@After` advice, lower order runs last (reverse order).

### 2. Advice Type Ordering

When the same aspect has multiple advice types, Spring guarantees this order:

1. **@Around** (start)
2. **@Before**
3. **@Around** (proceed)
4. **Method execution**
5. **@Around** (return)
6. **@AfterReturning** or **@AfterThrowing**
7. **@After**
8. **@Around** (complete)

```java
@Aspect
@Component
public class OrderingDemo {
    
    @Around("execution(* com.acme.service.*.*(..))")
    public Object around(ProceedingJoinPoint jp) throws Throwable {
        log.info("1. Around before");
        Object result = jp.proceed();
        log.info("7. Around after");
        return result;
    }
    
    @Before("execution(* com.acme.service.*.*(..))")
    public void before(JoinPoint jp) {
        log.info("2. Before");
    }
    
    @After("execution(* com.acme.service.*.*(..))")
    public void after(JoinPoint jp) {
        log.info("6. After");
    }
    
    @AfterReturning(pointcut = "execution(* com.acme.service.*.*(..))", returning = "r")
    public void afterReturning(JoinPoint jp, Object r) {
        log.info("5. AfterReturning");
    }
    
    @AfterThrowing(pointcut = "execution(* com.acme.service.*.*(..))", throwing = "ex")
    public void afterThrowing(JoinPoint jp, Exception ex) {
        log.info("5. AfterThrowing");
    }
}
```

Output:
```
1. Around before
2. Before
[Method executes]
5. AfterReturning (or AfterThrowing)
6. After
7. Around after
```

## Practical Examples

### 1. Performance Monitoring Aspect

```java
@Aspect
@Component
@Slf4j
public class PerformanceMonitoringAspect {
    
    private final MeterRegistry meterRegistry;
    
    public PerformanceMonitoringAspect(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }
    
    @Around("execution(* com.acme.service.*.*(..))")
    public Object monitorPerformance(ProceedingJoinPoint joinPoint) throws Throwable {
        String methodName = joinPoint.getSignature().toShortString();
        Timer.Sample sample = Timer.start(meterRegistry);
        
        try {
            Object result = joinPoint.proceed();
            sample.stop(Timer.builder("method.execution")
                .tag("class", joinPoint.getSignature().getDeclaringType().getSimpleName())
                .tag("method", joinPoint.getSignature().getName())
                .tag("status", "success")
                .register(meterRegistry));
            return result;
        } catch (Throwable t) {
            sample.stop(Timer.builder("method.execution")
                .tag("class", joinPoint.getSignature().getDeclaringType().getSimpleName())
                .tag("method", joinPoint.getSignature().getName())
                .tag("status", "error")
                .register(meterRegistry));
            throw t;
        }
    }
}
```

### 2. Security Authorization Aspect

```java
@Aspect
@Component
public class SecurityAuthorizationAspect {
    
    private final SecurityService securityService;
    
    @Before("@annotation(com.acme.annotation.RequiresRole)")
    public void checkRole(JoinPoint joinPoint) {
        Method method = ((MethodSignature) joinPoint.getSignature()).getMethod();
        RequiresRole annotation = method.getAnnotation(RequiresRole.class);
        String requiredRole = annotation.value();
        
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!securityService.hasRole(auth, requiredRole)) {
            throw new AccessDeniedException("Required role: " + requiredRole);
        }
    }
    
    @Before("@annotation(com.acme.annotation.RequiresPermission)")
    public void checkPermission(JoinPoint joinPoint) {
        Method method = ((MethodSignature) joinPoint.getSignature()).getMethod();
        RequiresPermission annotation = method.getAnnotation(RequiresPermission.class);
        String permission = annotation.value();
        
        Object target = joinPoint.getTarget();
        Object[] args = joinPoint.getArgs();
        
        if (!securityService.hasPermission(target, permission, args)) {
            throw new AccessDeniedException("Required permission: " + permission);
        }
    }
}
```

### 3. Caching Aspect

```java
@Aspect
@Component
public class CachingAspect {
    
    private final CacheManager cacheManager;
    
    @Around("@annotation(cacheable)")
    public Object cacheResult(ProceedingJoinPoint joinPoint, Cacheable cacheable) throws Throwable {
        String cacheName = cacheable.value();
        String key = generateKey(joinPoint);
        
        Cache cache = cacheManager.getCache(cacheName);
        Cache.ValueWrapper wrapper = cache.get(key);
        
        if (wrapper != null) {
            log.debug("Cache hit for key: {}", key);
            return wrapper.get();
        }
        
        log.debug("Cache miss for key: {}", key);
        Object result = joinPoint.proceed();
        
        if (result != null) {
            cache.put(key, result);
        }
        
        return result;
    }
    
    @AfterReturning(pointcut = "@annotation(cacheEvict)", returning = "result")
    public void evictCache(JoinPoint joinPoint, Object result) {
        CacheEvict cacheEvict = ((MethodSignature) joinPoint.getSignature())
            .getMethod().getAnnotation(CacheEvict.class);
        String cacheName = cacheEvict.value();
        String key = generateKey(joinPoint);
        
        cacheManager.getCache(cacheName).evict(key);
        log.debug("Evicted cache key: {}", key);
    }
    
    private String generateKey(JoinPoint joinPoint) {
        StringBuilder key = new StringBuilder();
        key.append(joinPoint.getSignature().getName());
        key.append("(");
        for (Object arg : joinPoint.getArgs()) {
            key.append(arg).append(",");
        }
        key.append(")");
        return key.toString();
    }
}
```

### 4. Retry Aspect

```java
@Aspect
@Component
public class RetryAspect {
    
    @Around("@annotation(retryable)")
    public Object retryOnException(ProceedingJoinPoint joinPoint, Retryable retryable) throws Throwable {
        int maxAttempts = retryable.maxAttempts();
        long backoff = retryable.backoff();
        Class<? extends Exception>[] retryOn = retryable.retryOn();
        
        Exception lastException = null;
        
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return joinPoint.proceed();
            } catch (Exception ex) {
                lastException = ex;
                
                if (!isRetryable(ex, retryOn)) {
                    throw ex;
                }
                
                if (attempt < maxAttempts) {
                    log.warn("Attempt {} failed, retrying in {}ms: {}", 
                             attempt, backoff * attempt, ex.getMessage());
                    Thread.sleep(backoff * attempt);
                }
            }
        }
        
        throw lastException;
    }
    
    private boolean isRetryable(Exception ex, Class<? extends Exception>[] retryOn) {
        for (Class<? extends Exception> retryable : retryOn) {
            if (retryable.isInstance(ex)) {
                return true;
            }
        }
        return false;
    }
}
```

### 5. Transaction Propagation Aspect

```java
@Aspect
@Component
public class TransactionPropagationAspect {
    
    @Around("@annotation(transactional)")
    public Object manageTransaction(ProceedingJoinPoint joinPoint, 
                                   Transactional transactional) throws Throwable {
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setPropagationBehavior(transactional.propagation().value());
        template.setReadOnly(transactional.readOnly());
        
        return template.execute(status -> {
            try {
                Object result = joinPoint.proceed();
                return result;
            } catch (Throwable t) {
                if (shouldRollback(t, transactional)) {
                    status.setRollbackOnly();
                }
                throw new RuntimeException(t);
            }
        });
    }
    
    private boolean shouldRollback(Throwable t, Transactional transactional) {
        for (Class<? extends Exception> rollbackFor : transactional.rollbackFor()) {
            if (rollbackFor.isInstance(t)) {
                return true;
            }
        }
        return false;
    }
}
```

## Advanced Techniques

### 1. Modifying Arguments

```java
@Around("execution(* com.acme.service.*.*(..))")
public Object modifyArguments(ProceedingJoinPoint joinPoint) throws Throwable {
    Object[] args = joinPoint.getArgs();
    
    for (int i = 0; i < args.length; i++) {
        if (args[i] instanceof String) {
            args[i] = ((String) args[i]).trim();
        }
    }
    
    return joinPoint.proceed(args);
}
```

### 2. Modifying Return Value

```java
@AfterReturning(pointcut = "execution(* com.acme.service.*.*(..))", returning = "result")
public Object modifyReturnValue(JoinPoint joinPoint, Object result) {
    if (result instanceof User) {
        User user = (User) result;
        // Cannot modify the original, but can log
        log.info("User email: {}", user.getEmail());
    }
    return result;
}
```

### 3. Suppressing Exceptions

```java
@Around("execution(* com.acme.service.*.*(..))")
public Object suppressException(ProceedingJoinPoint joinPoint) throws Throwable {
    try {
        return joinPoint.proceed();
    } catch (BusinessException e) {
        log.warn("Suppressing exception: {}", e.getMessage());
        return null; // Return null instead of throwing
    }
}
```

### 4. Multiple Proceed Calls

```java
@Around("execution(* com.acme.cache.*.*(..))")
public Object withRetry(ProceedingJoinPoint joinPoint) throws Throwable {
    int attempts = 3;
    
    for (int i = 0; i < attempts; i++) {
        try {
            return joinPoint.proceed();
        } catch (Exception e) {
            if (i == attempts - 1) {
                throw e;
            }
            log.warn("Attempt {} failed, retrying...", i + 1);
        }
    }
    
    throw new IllegalStateException("Should not reach here");
}
```

## Common Mistakes

### 1. Forgetting to Call proceed()

```java
// WRONG — method never executes
@Around("execution(* com.acme.service.*.*(..))")
public Object around(ProceedingJoinPoint jp) throws Throwable {
    log.info("Before");
    // Missing: jp.proceed();
    log.info("After");
    return null;
}
```

### 2. Catching Throwable Without Re-throwing

```java
// WRONG — swallows all exceptions
@Around("execution(* com.acme.service.*.*(..))")
public Object around(ProceedingJoinPoint jp) throws Throwable {
    try {
        return jp.proceed();
    } catch (Throwable t) {
        log.error("Error", t);
        return null; // Swallows exception
    }
}
```

### 3. Not Handling Checked Exceptions

```java
// WRONG — doesn't declare checked exceptions
@Around("execution(* com.acme.service.*.*(..))")
public Object around(ProceedingJoinPoint jp) {
    try {
        return jp.proceed();
    } catch (Throwable t) {
        throw new RuntimeException(t);
    }
}
```

## Summary

| Advice Type | When Runs | Can Access | Can Modify | Use Case |
|-------------|-----------|------------|------------|----------|
| @Before | Before method | JoinPoint, args | Args (via modification) | Validation, logging |
| @After | After method (always) | JoinPoint | Nothing | Cleanup, logging |
| @AfterReturning | After success | JoinPoint, return value | Nothing (can log) | Auditing, caching |
| @AfterThrowing | After exception | JoinPoint, exception | Nothing (can log) | Error handling, alerting |
| @Around | Wraps method | ProceedingJoinPoint | Args, return value, proceed | Transactions, retry, caching |

Choose the right advice type for your use case:
- **@Before** for pre-execution checks
- **@After** for cleanup
- **@AfterReturning** for success handling
- **@AfterThrowing** for exception handling
- **@Around** when you need full control (prefer this for complex scenarios)