---
title: AOP Best Practices — When to Use Aspects and When Not To
summary: The production patterns that justify aspects (audit, metrics, retry), the anti-patterns that hide logic, and how teams keep pointcuts reviewable.
order: 7
minutes: 17
topics: [aop-practices, audit-aspect, metrics-aspect, retry-aspect, anti-patterns, pointcut-design]
docs:
  - https://docs.spring.io/spring-framework/reference/core/aop.html
  - https://docs.spring.io/spring-framework/reference/core/aop/ataspectj/pointcuts.html
---

# AOP Best Practices — When to Use Aspects and When Not To

## The concept: aspects are for cross-cutting concerns

AOP exists for one reason: **concerns that cut across many classes** and that you *want* applied uniformly without repeating code — auditing, metrics, retries, security, transactions, caching, logging. The litmus test for a good aspect: **it applies to many join points, and every one of them wants exactly the same behavior.** If you're writing an aspect that targets a single method, you're probably misusing AOP.

The org rule of thumb:

| Concern | Aspect-worthy? | Why |
|---|---|---|
| Audit "who did what" across services | ✅ | Uniform, cross-cutting, identical semantics |
| Request metrics/timing on many endpoints | ✅ | Same measurement everywhere, one change applies all |
| Retry for transient failures | ✅ | Uniform policy per annotation/namespace |
| Transaction, caching, security | ✅ | Framework-built aspects — you use them, not write them |
| One method's unique business logic | ❌ | Just write the code in the method |
| A check that only one class needs | ❌ | A plain method/validation beats an aspect |

## The production patterns teams keep

**Pattern 1 — an audit aspect keyed by a custom annotation.** The annotation is the *contract*; the aspect is the *policy*:

```java
@Target(ElementType.METHOD) @Retention(RetentionPolicy.RUNTIME)
public @interface Audited { String action(); }

@Aspect @Component
public class AuditAspect {
    @Around("@annotation(audited)")
    public Object audit(ProceedingJoinPoint pjp, Audited audited) throws Throwable {
        Object result = pjp.proceed();
        auditService.record(audited.action(), currentUser(), result);
        return result;
    }
}

// Usage — declarative, obvious, uniform:
@Audited(action = "ORDER_CREATED")
public Order placeOrder(OrderRequest r) { ... }
```

The annotation pattern is the sweet spot: **the *what* is declared on the method, the *how* lives in one aspect**, and adding auditing to a new method is a one-line annotation.

**Pattern 2 — a retry aspect for transient failures.** Retrying only the *transient* exception types, with backoff and a cap — and importantly, sitting **outside** any transaction so each attempt gets a fresh unit of work:

```java
@Aspect @Component
public class RetryAspect {
    @Around("@annotation(retryable)")
    public Object retry(ProceedingJoinPoint pjp, Retryable retryable) throws Throwable {
        int attempts = 0;
        while (true) {
            try {
                return pjp.proceed();
            } catch (TransientException e) {
                if (++attempts > retryable.maxAttempts()) throw e;
                Thread.sleep(retryable.backoffMs() * attempts);  // simple linear backoff
            }
        }
    }
}
```

(Production teams often reach for Spring Retry or Resilience4j instead of hand-rolling — but a small custom aspect is legitimate when the policy is tiny and specific.)

**Pattern 3 — a timing/metrics aspect on service boundaries.** Measure every `@Service` method or every controller handler uniformly, feeding a metrics registry:

```java
@Aspect @Component
public class MetricsAspect {
    @Around("execution(* com.acme..*Service.*(..))")   // package-scoped pointcut
    public Object timed(ProceedingJoinPoint pjp) throws Throwable {
        long start = System.nanoTime();
        try { return pjp.proceed(); }
        finally { registry.timer("service.call", pjp.getSignature().getName())
                          .record(System.nanoTime() - start, NANOSECONDS); }
    }
}
```

The `execution(...)` pointcut scoped to a package is the maintainable form — a new `*Service` in that package is *automatically* covered, which is exactly the uniformity AOP promises.

## The anti-patterns that fail code review

- **The "aspect for everything" trap** — aspects are invisible: a new developer reading `placeOrder()` sees no audit, no retry, no metrics. Each aspect is implicit behavior. Too many of them = a codebase nobody can follow. **Balance: keep aspects for true cross-cutting concerns; prefer explicit code for everything else.**
- **Pointcut over-reach** — `execution(* com.acme..*(..))` on *everything* intercepts framework calls, toString, equals — chaos. Scope pointcuts by package/annotation so the blast radius is reviewable.
- **Side effects inside aspects** — an aspect that throws business exceptions, mutates arguments, or depends on join-point internals is fragile. Aspects should *observe/guard/time*, not implement business rules.
- **Logic hidden from tests** — aspect behavior must be tested (unit-test the aspect itself; integration-test the composed chain). Untested aspects are untested behavior.
- **String-based pointcut typos** — a pointcut that matches nothing fails *silently* (no aspect runs, tests pass). Add a test asserting the aspect actually fires on the target (`isAopProxy` / a probe method).

## How we use it in an organization: the governance

- **One `aspects` package**, all aspects in one place, documented with a comment per aspect: *what it guards, why it's an aspect, its order*.
- **Annotation-driven over execution-pattern** — `@Audited`, `@Retryable` make the behavior visible at the call site; `execution(...)` patterns make it invisible. Prefer annotations for business-facing aspects; keep package-patterns only for infrastructure-wide concerns (metrics).
- **Order declarations on every aspect** — even order-1-only aspects declare `@Order` so the chain is deterministic.
- **Test the aspects** — each aspect gets a unit test (direct invocation of the advice logic) and the key integrations get an E2E assertion that the aspect fired.

## Pitfalls

- **Aspects and self-invocation** — an aspect on `save()` is bypassed by `this.save()`; same proxy rule as transactions (see proxy-mechanics).
- **`finally` blocks in `@Around`** — for timing you want `finally`; for audit-after-commit you want the result *outside* the inner transaction — two different placements, two different semantics.
- **Exception transparency** — `@Around` methods must `throw Throwable` (or rethrow carefully) so checked exceptions propagate; swallowing in an aspect corrupts the caller's contract.
- **Performance** — every aspect adds indirection; a metrics aspect on the hottest path has a measurable cost. Measure; keep hot paths lean.

## Key takeaways

- Aspects are for cross-cutting concerns applied uniformly — audit, metrics, retries, framework concerns.
- The annotation-as-contract pattern (`@Audited`, `@Retryable`) keeps the *what* visible and the *how* centralized.
- Scope pointcuts tightly (package/annotation), declare `@Order`, and test that aspects actually fire.
- Avoid aspects for single-use or business logic — implicit behavior is a maintainability cost.
- Watch self-invocation, exception transparency, and hot-path overhead.
