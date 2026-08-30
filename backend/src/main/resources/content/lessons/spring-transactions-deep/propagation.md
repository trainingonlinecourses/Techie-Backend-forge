---
title: Transaction Propagation Explained
module: spring-transactions-deep
order: 1
minutes: 25
topics: ["propagation", "REQUIRED", "REQUIRES_NEW", "NESTED", "MANDATORY", "NOT_SUPPORTED", "join vs suspend"]
summary: Propagation defines how a transactional method joins an existing transaction — join it, suspend it, or demand it. Getting this right is what makes ...
docs:
  - title: "Transaction propagation"
    url: "https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html"
---

# Transaction Propagation Explained

Propagation defines **how a transactional method joins an existing transaction** — join it, suspend it, or demand it. Getting this right is what makes composed service calls behave atomically, and getting it wrong causes the two most common Spring transaction bugs: lost rollbacks and phantom commits.

## The Seven Propagations

| Propagation | Behavior when a transaction EXISTS | Behavior when NONE exists |
|-------------|-------------------------------------|---------------------------|
| `REQUIRED` (default) | Join it | Create one |
| `REQUIRES_NEW` | Suspend it, create a new one | Create one |
| `NESTED` | Savepoint within it | Create one |
| `MANDATORY` | Join it | **Throw** |
| `NOT_SUPPORTED` | Suspend it, run without tx | Run without tx |
| `SUPPORTS` | Join it | Run without tx |
| `NEVER` | **Throw** | Run without tx |

## REQUIRED: The Default That Joins

```java
@Service
public class OrderService {

    @Transactional
    public void placeOrder(OrderDto dto) {
        orderRepository.save(toEntity(dto));
        inventoryService.reserve(dto.items());   // joins the SAME transaction
        paymentService.authorize(dto.amount());  // joins the SAME transaction
    }
}
```

All three writes are one transaction: any exception rolls back **everything** — order, inventory, and payment. This is the atomicity contract you want for a business operation spanning services.

## REQUIRES_NEW: The Independent Transaction

```java
@Service
public class AuditService {

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String action, Long entityId) {
        auditRepository.save(new AuditEntry(action, entityId));
    }
}

@Service
public class OrderService {

    @Transactional
    public void placeOrder(OrderDto dto) {
        orderRepository.save(toEntity(dto));
        auditService.record("order-placed", dto.orderId());   // OWN transaction
        // if the save above rolls back, the audit COMMITS anyway
    }
}
```

**The audit pattern**: `REQUIRES_NEW` suspends the outer transaction, commits the inner one independently, then resumes. The audit entry survives an outer rollback — which is exactly what an audit trail must do.

**Cost**: two transactions = two commits = two connection/commit round-trips. Use it only when the inner work must survive or be independent.

## NESTED: Savepoint Semantics

```java
@Transactional(propagation = Propagation.NESTED)
public void importRow(Row row) { ... }   // savepoint, not a real commit

@Transactional
public void importAll(List<Row> rows) {
    for (Row row : rows) {
        try {
            importRow(row);            // NESTED: savepoint per row
        } catch (DataAccessException e) {
            // only THIS row rolls back to its savepoint — the rest keep going
            log.warn("Row failed: {}", e.getMessage());
        }
    }
}
```

- **Same connection, savepoint markers** — cheaper than REQUIRES_NEW
- Failure rolls back to the savepoint, **not** the whole outer transaction
- Requires a JDBC driver that supports savepoints (most do)
- The "import with skip" pattern — keep the good rows, drop the bad ones

## MANDATORY and NEVER: Enforcing the Contract

```java
// Must run INSIDE a caller transaction — throws if there is none
@Transactional(propagation = Propagation.MANDATORY)
public void debit(Long accountId, BigDecimal amount) { ... }

// Must run WITHOUT a transaction — throws if one exists
@Transactional(propagation = Propagation.NEVER)
public void runExternalProcess() { ... }
```

MANDATORY is the "inner helper" contract: a repository-level operation that must be part of the caller's transaction. NEVER guards long-running, non-transactional work from being accidentally wrapped.

## NOT_SUPPORTED: The Suspension

```java
@Transactional(propagation = Propagation.NOT_SUPPORTED)
public void callSlowExternalApi() { ... }
// Suspends any current transaction while this runs — long I/O doesn't hold locks
```

Holding a DB transaction open during a 10-second external call holds locks for 10 seconds. `NOT_SUPPORTED` suspends the transaction for the duration — the classic fix for "I'm locking the table while calling an external API."

## The Propagation Decision Tree

```
Must the inner work fail if the outer fails?
├─ Yes → join: REQUIRED (default)
├─ No, inner must survive outer rollback → REQUIRES_NEW (audit, notifications)
├─ No, inner should fail alone but keep the rest → NESTED (batch imports)
├─ Inner REQUIRES an outer tx → MANDATORY
└─ Inner must NOT run in a tx → NEVER / NOT_SUPPORTED
```

## The Two Most Common Bugs

### Bug 1: Self-invocation → propagation silently ignored

```java
@Service
public class OrderService {

    public void placeOrder(OrderDto dto) {
        processPayment(dto);        // ❌ self-call — REQUIRES_NEW ignored!
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void processPayment(OrderDto dto) { ... }
}
```

Fix with self-injection:

```java
private final OrderService self;
public OrderService(@Lazy OrderService self) { this.self = self; }

public void placeOrder(OrderDto dto) {
    self.processPayment(dto);      // ✅ through the proxy — REQUIRES_NEW applies
}
```

### Bug 2: REQUIRED swallowing a REQUIRES_NEW rollback

```java
@Transactional
public void placeOrder(OrderDto dto) {
    auditService.record("placed", dto.orderId());   // REQUIRES_NEW — commits
    orderRepository.save(...);                       // then this FAILS
    // outer rolls back, but the audit ALREADY committed — by design
}
```

If the audit *shouldn't* exist without the order, use REQUIRED (join), not REQUIRES_NEW. The bug is choosing the wrong propagation, not the mechanism.

## Testing Propagation

```java
@SpringBootTest
class PropagationTest {

    @Autowired OrderService orderService;
    @Autowired AuditRepository auditRepository;

    @Test
    void requiresNewCommitsDespiteOuterRollback() {
        assertThrows(RuntimeException.class,
            () -> orderService.placeOrderFailingAfterAudit(dto));

        assertEquals(1, auditRepository.count());   // audit SURVIVED
        assertEquals(0, orderRepository.count());   // order rolled back
    }

    @Test
    void requiredJoinsOuterTransaction() {
        assertThrows(RuntimeException.class,
            () -> orderService.placeOrderFailingAfterInner(dto));

        assertEquals(0, orderRepository.count());   // everything rolled back
    }
}
```

## Summary

| Propagation | Join? | Typical use |
|-------------|-------|-------------|
| REQUIRED | Join | Default — one atomic business operation |
| REQUIRES_NEW | Suspend | Audit, notifications, anything that must survive |
| NESTED | Savepoint | Batch imports, skip-failed-rows |
| MANDATORY | Demand | Inner helpers |
| NOT_SUPPORTED | Suspend | Long external calls |
| SUPPORTS | Optional join | Shared helpers |
| NEVER | Forbid | Non-transactional operations |

Propagation is the atomicity contract between collaborating beans: join for "all or nothing," suspend for "must survive," savepoint for "keep the rest." Pick deliberately, avoid self-invocation, and test the rollback semantics — the propagation table is small, but each row is a different guarantee.
