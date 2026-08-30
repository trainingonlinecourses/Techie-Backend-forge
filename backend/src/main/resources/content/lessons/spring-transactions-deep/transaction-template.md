---
title: TransactionTemplate & Programmatic Transactions
module: spring-transactions-deep
order: 3
minutes: 20
topics: ["TransactionTemplate", "PlatformTransactionManager", "programmatic tx", "callback", "multi-boundary"]
docs:
  - title: "Programmatic transactions"
    url: "https://docs.spring.io/spring-framework/reference/data-access/transaction/programmatic.html"
summary: @Transactional is declarative and covers whole methods. But real code sometimes needs multiple transaction boundaries inside one method — peritem t...
---

# TransactionTemplate & Programmatic Transactions

`@Transactional` is declarative and covers whole methods. But real code sometimes needs **multiple transaction boundaries inside one method** — per-item transactions in a batch, a transaction around one section of a larger flow, or transaction control where the declarative model can't express it. That's `TransactionTemplate`.

## The Setup

```java
@Service
public class ImportService {

    private final TransactionTemplate txTemplate;

    public ImportService(PlatformTransactionManager txManager) {
        this.txTemplate = new TransactionTemplate(txManager);
    }
}
```

`PlatformTransactionManager` is the bean Spring uses internally for `@Transactional`. Wrapping it in a `TransactionTemplate` gives you programmatic control with the same semantics.

## The Two Callback Forms

```java
// With a result
public ImportResult doInTransaction() {
    return txTemplate.execute(status -> {
        int saved = jdbcTemplate.update(INSERT_SQL, ...);
        return new ImportResult(saved);
    });
}

// Without a result
public void doWork() {
    txTemplate.executeWithoutResult(status -> {
        jdbcTemplate.update(UPDATE_SQL, ...);
        auditService.log("updated");
    });
}
```

- Normal return → **commit**
- Exception → **rollback** (and the exception propagates)
- `status.setRollbackOnly()` → force rollback on a normal return

## Multiple Boundaries in One Method

The case `@Transactional` can't express:

```java
public ImportResult importInChunks(List<Course> courses) {
    int succeeded = 0;
    int failed = 0;

    for (List<Course> chunk : partition(courses, 500)) {
        try {
            txTemplate.executeWithoutResult(status ->
                insertChunk(chunk));
            succeeded += chunk.size();
        } catch (DataAccessException e) {
            failed += chunk.size();
            log.warn("Chunk failed (rolled back): {}", e.getMessage());
        }
    }
    return new ImportResult(succeeded, failed);
}
```

Each chunk is its **own transaction**: a failure rolls back only that chunk, and the import continues. `@Transactional` on the method would roll back everything — wrong for this use case.

## Configuring the Template

```java
TransactionTemplate tx = new TransactionTemplate(txManager);
tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
tx.setIsolationLevel(TransactionDefinition.ISOLATION_SERIALIZABLE);
tx.setTimeout(30);   // seconds — abort if the tx runs longer
tx.setReadOnly(true);
```

Use per-use-case configuration when different methods need different semantics:

```java
private TransactionTemplate serializable() {
    TransactionTemplate tx = new TransactionTemplate(txManager);
    tx.setIsolationLevel(TransactionDefinition.ISOLATION_SERIALIZABLE);
    tx.setTimeout(10);
    return tx;
}

public void reconcile() {
    serializable().executeWithoutResult(status -> reconcileCore());
}
```

## Mixing Declarative and Programmatic

```java
@Transactional
public void processOrder(Long orderId) {
    // ... part of the outer transaction (declarative)

    // A sub-operation that must COMMIT independently:
    otherTxTemplate.executeWithoutResult(status ->
        notificationService.send(orderId));
    // REQUIRES_NEW semantics via the template's own transaction
}
```

The template joins the current transaction by default (REQUIRED); configure it as REQUIRES_NEW to isolate.

## Handling Rollback Explicitly

```java
public void importWithDecision(List<Course> courses) {
    ImportResult result = txTemplate.execute(status -> {
        try {
            return importCore(courses);
        } catch (ImportException e) {
            status.setRollbackOnly();          // roll back THIS tx
            return new ImportResult(0, courses.size(), e.getMessage());
        }
    });
    // result is returned even though the tx rolled back — the caller decides
}
```

`setRollbackOnly` lets you return a *value* while still rolling back — something a thrown exception can't do.

## TransactionTemplate vs. @Transactional

| | @Transactional | TransactionTemplate |
|--|----------------|---------------------|
| Style | Declarative annotation | Programmatic callback |
| Boundaries | Method-wide | Per-callback — multiple per method |
| Self-invocation | Broken (proxy) | Works (direct call) |
| Dynamic config | Fixed per method | Per-template instance |
| Error handling | AOP interceptor | try/catch around the callback |
| Readability | Cleanest for single-boundary | Best for loops/conditional tx |

**Rule**: `@Transactional` for the common single-boundary case; `TransactionTemplate` when a method needs multiple, conditional, or configurable boundaries — or when self-invocation makes the proxy unusable.

## The Self-Invocation Escape Hatch

```java
@Service
public class PaymentService {

    private final PaymentService self;     // @Lazy self-injection

    public void chargeWithRetry(ChargeRequest req) {
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                self.charge(req);          // ✅ goes through the proxy
                return;
            } catch (OptimisticLockException e) {
                log.warn("Retry {}", attempt);
            }
        }
    }

    @Transactional
    public void charge(ChargeRequest req) { ... }
}
```

Or replace `self.charge(req)` with a `TransactionTemplate` — same isolation, no proxy trickery:

```java
public void chargeWithRetry(ChargeRequest req) {
    ...
    txTemplate.executeWithoutResult(status -> chargeCore(req));
}
```

## Testing

```java
@SpringBootTest
class ImportServiceTest {

    @Autowired ImportService importService;

    @Test
    void failedChunkDoesNotRollBackOthers() {
        ImportResult result = importService.importInChunks(
            List.of(validCourse(), invalidCourse(), validCourse()));

        assertEquals(2, result.succeeded());   // the bad chunk rolled back alone
        assertEquals(1, result.failed());
    }
}
```

## Summary

| Need | TransactionTemplate |
|------|---------------------|
| Tx per loop iteration | Callback per chunk |
| Tx around one section | Wrap only that section |
| Return value + rollback | `setRollbackOnly` |
| Per-call isolation | Template instance per config |
| Self-invocation | Direct call, no proxy |
| Declarative whole-method | Use @Transactional |

TransactionTemplate is the escape hatch for every transaction shape `@Transactional` can't express: per-chunk boundaries, conditional transactions, rollback-with-value, and proxy-free control. Keep `@Transactional` for the common case, reach for the template when the boundary logic gets interesting.
