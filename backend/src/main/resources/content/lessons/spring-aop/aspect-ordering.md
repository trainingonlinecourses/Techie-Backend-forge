---
title: Aspect Ordering — When Multiple Aspects Intersect
summary: How Spring resolves aspect execution order, @Order annotation, conflict resolution, and why ordering matters for security + transaction + logging aspects. Beginner-friendly with line-by-line code.
order: 6
minutes: 18
topics: [aspect ordering, @Order, aspect priority, transaction security ordering, advice ordering, conflict resolution]
docs:
  - https://docs.spring.io/spring-framework/reference/core/aop/ataspectj/advice.html
  - https://docs.spring.io/spring-framework/reference/core/aop.html
---

# Aspect Ordering — When Multiple Aspects Intersect

## What is Aspect Ordering? (From Zero)

When multiple aspects apply to the same method call, Spring needs to decide **which runs first**. For example, if you have a security check aspect and a transaction aspect, the security check should run before the transaction starts — there's no point opening a database transaction if the user isn't authorized.

**Aspect ordering** controls the execution sequence. Think of it like a pipeline: each aspect is a stage, and the order matters.

### Why Order Matters

```
Request → [Security Aspect] → [Transaction Aspect] → [Logging Aspect] → [Your Method]
                                                                      ↓
Response ← [Logging Aspect] ← [Transaction Aspect] ← [Security Aspect] ← [Result]
```

- Security must run first (reject unauthorized requests before any processing)
- Transaction must run before business logic (ensure data consistency)
- Logging should run around everything (capture timing of the entire operation)

---

## The Code — Line by Line

### Using @Order to Control Aspect Priority

```java
@Aspect
@Component
@Order(100)        // Lower number = higher priority = runs FIRST
public class SecurityAspect {

    @Around("@annotation(RequiresRole)")
    public Object checkAccess(ProceedingJoinPoint joinPoint) throws Throwable {
        System.out.println("1. Security check — before anything else");
        // Validate JWT, check roles, etc.
        Object result = joinPoint.proceed();    // Continue to next aspect / target method
        System.out.println("6. Security cleanup — after everything");
        return result;
    }
}

@Aspect
@Component
@Order(200)        // Runs AFTER SecurityAspect (100 < 200)
public class TransactionAspect {

    @Around("@annotation(Transactional)")
    public Object manageTransaction(ProceedingJoinPoint joinPoint) throws Throwable {
        System.out.println("2. Transaction started");
        TransactionStatus tx = transactionManager.getTransaction(new DefaultTransactionDefinition());
        try {
            Object result = joinPoint.proceed();
            transactionManager.commit(tx);
            System.out.println("5. Transaction committed");
            return result;
        } catch (Exception e) {
            transactionManager.rollback(tx);
            System.out.println("5. Transaction rolled back");
            throw e;
        }
    }
}

@Aspect
@Component
@Order(300)        // Runs AFTER TransactionAspect (200 < 300)
public class LoggingAspect {

    @Around("execution(* com.example.service.*.*(..))")
    public Object logMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        long start = System.currentTimeMillis();
        System.out.println("3. Logging: calling " + joinPoint.getSignature().getName());

        Object result = joinPoint.proceed();

        long elapsed = System.currentTimeMillis() - start;
        System.out.println("4. Logging: " + joinPoint.getSignature().getName() + " took " + elapsed + "ms");
        return result;
    }
}
```

**Execution order for a service method:**
```
1. Security check — before anything else
2. Transaction started
3. Logging: calling processOrder
4. Logging: processOrder took 45ms
5. Transaction committed
6. Security cleanup — after everything
```

**Line-by-line explained:**
- `@Order(100)` — Lower number = higher priority. Security runs first because 100 < 200 < 300.
- The `@Around` advice wraps the method call. Everything before `joinPoint.proceed()` runs before the method. Everything after runs after.
- Spring nests the aspects like Russian dolls: Security wraps Transaction wraps Logging wraps Your Method.

### Default Ordering (Without @Order)

```java
@Aspect
@Component
// No @Order — default priority is LOWEST (runs last among ordered aspects)
public class MetricsAspect {
    // ...
}
```

**Default rules:**
1. Aspects with `@Order` run first, sorted by value (lower = first)
2. Aspects without `@Order` run last, in undefined order relative to each other
3. Spring's built-in `@Transactional` has a default order of `Ordered.LOWEST_PRECEDENCE` (runs last)

---

## Real-World Scenarios

### Scenario 1: Security → Transaction → Audit Chain

```java
@Aspect
@Component
@Order(100)    // First: security check
public class SecurityAuditAspect {
    @Around("@annotation(Auditable)")
    public Object audit(ProceedingJoinPoint joinPoint) throws Throwable {
        String user = SecurityContextHolder.getContext().getAuthentication().getName();
        String action = joinPoint.getSignature().getName();
        auditLog.record(new AuditEvent(user, action, Instant.now()));   // Log BEFORE execution
        return joinPoint.proceed();                                      // Let other aspects run
    }
}

@Aspect
@Component
@Order(200)    // Second: transaction
public class TransactionAspect { ... }

@Aspect
@Component
@Order(300)    // Third: performance monitoring
public class PerformanceAspect {
    @Around("@annotation(Timed)")
    public Object time(ProceedingJoinPoint joinPoint) throws Throwable {
        long start = System.nanoTime();
        Object result = joinPoint.proceed();
        long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
        metrics.record(joinPoint.getSignature().getName(), elapsed);
        return result;
    }
}
```

### Scenario 2: Aspect Conflict (Same Order)

```java
@Aspect
@Component
@Order(100)    // Both have order 100 — which runs first?
public class AspectA { ... }

@Aspect
@Component
@Order(100)    // Ambiguous! Spring uses alphabetical order of class names
public class AspectB { ... }
// AspectA runs first (A < B alphabetically)
```

**Fix:** Give them distinct order values: `@Order(100)` and `@Order(200)`.

### Scenario 3: Combining with Spring's Built-in Aspects

```java
// Spring's @Transactional has default order = LOWEST_PRECEDENCE
// Your custom aspects with @Order(100) run BEFORE @Transactional

// To run AFTER @Transactional:
@Aspect
@Component
@Order(Ordered.LOWEST_PRECEDENCE - 10)   // Just before the default
public class AfterTransactionAspect { ... }
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| No @Order on aspects | Undefined execution order, non-deterministic | Always use `@Order` with explicit values |
| Security aspect runs after transaction | Unnecessary DB connections for unauthorized requests | Give security aspect lower order number (100) |
| Two aspects with same @Order | Alphabetical fallback — fragile and unclear | Give each aspect a unique order value |
| Logging outside transaction | Timing doesn't include transaction overhead | Put logging aspect with higher order number (wraps everything) |
| Ordering by class name | Accidental dependency on naming conventions | Always use explicit `@Order` values |

---

## Key Takeaways

- **`@Order(n)` controls execution sequence** — lower number runs first.
- **Security first (100) → Transaction (200) → Logging (300)** — the standard production ordering.
- **Without @Order**, aspects run last in undefined order — always specify it explicitly.
- **Spring's `@Transactional` defaults to LOWEST_PRECEDENCE** — your custom aspects with explicit order run before it.
- **Give each aspect a unique order value** — avoid ambiguity.

Official docs: [Advice Ordering](https://docs.spring.io/spring-framework/reference/core/aop/ataspectj/advice.html) · [AOP](https://docs.spring.io/spring-framework/reference/core/aop.html)
