---
title: Aspect Ordering — @Order, Precedence and Advice Composition
summary: When multiple aspects wrap one method, @Order and Ordered control the chain, and the transaction/audit/security composition patterns teams rely on.
order: 6
minutes: 15
topics: [aspect-ordering, order, precedence, multiple-aspects, transaction-advice, audit-aspect]
docs:
  - https://docs.spring.io/spring-framework/reference/core/aop/ataspectj/advice.html#aop-ataspectj-ordering
---

# Aspect Ordering — @Order, Precedence and Advice Composition

## The concept: a chain of advisors

When several aspects (or `@Transactional`, `@Cacheable`, method security) apply to the *same* method, Spring builds an **ordered chain** of interceptors. The order decides which advice runs first on the way in — and therefore last on the way out (like a stack of nested wrappers):

```text
Method call → Aspect A (order 1) → Aspect B (order 2) → real method → B after → A after
```

- **Lower order value = higher precedence = runs FIRST on the way in, LAST on the way out.**
- Without explicit ordering, aspect execution order is **unspecified** — a real source of subtle bugs when the chain matters (e.g., transaction opens *before* the audit aspect reads state, or after).

## The two ways to order

```java
// 1. @Order on the aspect class
@Aspect
@Component
@Order(1)                       // highest precedence — outermost wrapper
public class AuditAspect { ... }

@Aspect
@Component
@Order(2)
public class MetricsAspect { ... }

// 2. Implement Ordered
@Aspect
@Component
public class SecurityAspect implements Ordered {
    @Override public int getOrder() { return 0; }   // runs before everything else
    ...
}
```

For **advice methods within one aspect**, the ordering is fixed by advice type: `@Around` → `@Before` → target → `@AfterReturning`/`@AfterThrowing` → `@After` → back through `@Around`. You control *cross-aspect* order via `@Order`; intra-aspect order is the type grammar.

## How we use it in an organization: the scenarios

**Scenario 1 — the transaction/audit composition.** The most common real chain: the audit aspect must see the *committed* outcome, so it must be **outermost** (lower order) — it wraps the transaction, letting it log after commit:

```java
@Aspect @Component @Order(1)             // outermost
public class AuditAspect {
    @Around("@annotation(auditable)")
    public Object audit(ProceedingJoinPoint pjp, Auditable auditable) throws Throwable {
        Object result = pjp.proceed();    // runs the WHOLE inner chain incl. the transaction
        auditService.record(pjp.getSignature().getName(), result);  // after commit
        return result;
    }
}

@Service
public class OrderService {
    @Transactional @Auditable
    public Order placeOrder(...) { ... }
    // chain: AuditAspect → TransactionInterceptor → placeOrder
    // AuditAspect.proceed() → transaction opens+commits → audit logs the committed result
}
```

**Scenario 2 — timing metrics around the transaction.** A `MetricsAspect` at order 2 (inside the audit aspect, outside the transaction) measures the *whole* operation; a finer-grained timing would sit inside. Choosing where the timer sits = deciding what you measure.

**Scenario 3 — security check before anything.** `@PreAuthorize` (method security) is itself an interceptor; ordering it *before* the transaction means an unauthorized call never opens a transaction. Method security's default order (Ordered.LOWEST_PRECEDENCE - ...) is already first in most chains — but when composing custom aspects, keep the authorization outermost by giving it the lowest order value.

**Scenario 4 — retry inside vs outside the transaction.** A retry aspect at order 1 (outside the transaction) retries the whole unit-of-work — including re-opening the transaction each attempt. At order 3 (inside), retries reuse the same (possibly poisoned) transaction. Teams deliberately choose: **retry outside the transaction** for correct semantics (each attempt gets a fresh transaction).

## Pitfalls

- **Unspecified order is a bug farm** — two aspects whose relative order matters *must* both declare `@Order`; the chain is deterministic only when every participant orders itself.
- **Order of `@Bean`-declared aspects vs classpath-scanned ones** — mixing declaration styles makes precedence harder to reason about; standardize on one.
- **The transaction interceptor's own order** — `@EnableTransactionManagement(order = ...)` lets you place the transaction advisor in the chain relative to your aspects; the default is `Ordered.LOWEST_PRECEDENCE` (innermost). If you need the transaction *outside* your aspect, raise its order.
- **Aspect vs interceptor is invisible** — the chain doesn't distinguish `@Aspect` advice from `@Transactional` or `@Cacheable` interceptors; they all participate in the same order.
- **`@Order` on the aspect class vs `@Order` on the advice method** — the class-level value governs; method-level `@Order` (Spring 5.2.7+) can refine, but class-level is the norm.

## Key takeaways

- Multiple aspects form an ordered interceptor chain — lower `@Order` runs first in, last out.
- Order matters when the chain has side effects: audit outside transactions, retry outside transactions, auth outermost.
- Intra-aspect order is fixed (`@Around` → `@Before` → target → after-advice); cross-aspect order is `@Order`/`Ordered`.
- The transaction/cache/security interceptors are part of the same chain — place your aspects relative to them deliberately.
- Unspecified ordering is a bug farm — every order-sensitive aspect declares its order.
