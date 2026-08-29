---
title: AOP & Proxies
summary: Aspects, pointcuts, advice types, how Spring AOP works — and the self-invocation trap that bites everyone.
order: 7
minutes: 18
topics: [aop, aspects, pointcuts, proxies, self-invocation]
docs:
  - https://docs.spring.io/spring-framework/reference/core/aop.html
  - https://docs.spring.io/spring-framework/reference/core/aop/pointcuts.html
---

# AOP & Proxies

## What AOP is for

**Aspect-oriented programming** lets you apply cross-cutting concerns — logging, timing, auditing, retries — *declaratively*, without copying code into every method. You write the concern once (the **aspect**) and point it at many join points.

## The vocabulary

| Term | Meaning |
|---|---|
| **Aspect** | The module containing cross-cutting logic (`@Aspect` class) |
| **Join point** | A place where advice can run (Spring: method execution) |
| **Pointcut** | A predicate selecting join points (`execution(...)`, `within(...)`) |
| **Advice** | Code that runs: `@Before`, `@AfterReturning`, `@AfterThrowing`, `@Around` |

## A working aspect

```java
@Aspect
@Component
public class ServiceTimingAspect {

    @Pointcut("within(@org.springframework.stereotype.Service *)")
    void serviceLayer() {}

    @Before("serviceLayer()")
    public void enter(JoinPoint jp) { /* audit entry */ }

    @AfterReturning(pointcut = "serviceLayer()", returning = "result")
    public void ok(JoinPoint jp, Object result) { /* success hook */ }

    @AfterThrowing(pointcut = "serviceLayer()", throwing = "ex")
    public void fail(JoinPoint jp, Throwable ex) { log.error("failed {}", jp.getSignature()); }

    @Around("serviceLayer()")
    public Object time(ProceedingJoinPoint pjp) throws Throwable {
        long start = System.nanoTime();
        try {
            return pjp.proceed();                 // you control execution
        } finally {
            long ms = (System.nanoTime() - start) / 1_000_000;
            if (ms > 250) log.warn("slow {} took {}ms", pjp.getSignature(), ms);
        }
    }
}
```

## How Spring AOP works: proxies

Spring AOP uses **proxies** — it never rewrites your bytecode:

- Bean implements an interface → JDK dynamic proxy.
- Otherwise → CGLIB subclass proxy.

The context injects the **proxy**; your class is the target inside. This is the same mechanism behind `@Transactional`, `@Async`, `@Cacheable`, and security annotations.

## The self-invocation trap (top-10 Spring bug)

```java
@Service
public class OrderService {
    @Transactional
    public void outer() { this.inner(); }        // this.inner() BYPASSES the proxy!
                                                 // no transaction, no advice
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void inner() { /* ... */ }
}
```

Because `this` is the raw bean (not the proxy), `inner()`'s `@Transactional` never runs. Fixes:

```java
// Fix 1: extract into another bean
@Service
public class PaymentService {
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void settle(Order order) { ... }
}
// OrderService injects PaymentService and calls it — the proxy applies.

// Fix 2: inject yourself (self-reference through the context)
@Service
public class OrderService {
    private final ObjectProvider<OrderService> self;
    public void outer() { self.getObject().inner(); }   // goes through the proxy
}
```

## Transactions under the hood (same story)

`TransactionInterceptor` → `PlatformTransactionManager` → begin → binds connection to the **thread** (`TransactionSynchronizationManager`) → DAOs reuse that connection → commit/rollback at method exit. That's why `@Transactional` silently breaks when you hop threads — the connection is bound to the calling thread.

> **Why it matters (organizational view)** — AOP is the mechanism behind Spring's most-used annotations, so "why isn't my transaction starting?" is usually answered by "self-invocation" or "wrong visibility (private methods can't be advised)." Teams standardize on: public methods only for proxied annotations, no cross-bean self-calls, `@Transactional` on service methods (not private helpers), and new AOP aspects reviewed carefully — they run on *every* matching call.

## Key takeaways

- AOP = cross-cutting concerns applied declaratively via proxies.
- Pointcuts select methods; `@Around` is the Swiss-army advice.
- Proxies only apply when calling **through the bean**, not `this`.
- Transactions bind to the thread — async/thread hops break them.

**Official docs:** [AOP](https://docs.spring.io/spring-framework/reference/core/aop.html) · [Pointcuts](https://docs.spring.io/spring-framework/reference/core/aop/pointcuts.html)
