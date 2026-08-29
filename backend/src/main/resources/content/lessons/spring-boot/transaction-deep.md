---
title: Spring Transaction Management In Depth — @Transactional Pitfalls
summary: Transaction propagation, isolation levels, rollback rules, self-invocation, @Transactional on private methods, and how organizations prevent lost updates and phantom reads in production databases.
order: 37
minutes: 22
topics: [transactional, propagation, isolation, rollback, self-invocation, proxy, read-only, transaction-timeout, phantom-read]
docs:
  - https://docs.spring.io/spring-framework/reference/data-access/transaction.html
  - https://docs.spring.io/spring-boot/docs/current/reference/html/data.html#data.transaction
---

# Spring Transaction Management In Depth — @Transactional Pitfalls

## The concept

`@Transactional` is Spring's declarative transaction management. You annotate a method (or class) and Spring wraps it in a database transaction: start, execute, commit on success, rollback on exception.

```java
@Transactional
public void transferMoney(String fromAccount, String toAccount, BigDecimal amount) {
    Account sender = accountRepository.findById(fromAccount).orElseThrow();
    Account receiver = accountRepository.findById(toAccount).orElseThrow();

    sender.debit(amount);
    receiver.credit(amount);

    accountRepository.save(sender);
    accountRepository.save(receiver);
    // COMMIT happens here — if any exception, ROLLBACK
}
```

Without `@Transactional`, each `save()` is its own transaction. If `save(receiver)` fails, the debit is already committed — money vanished.

## Transaction propagation

Propagation defines what happens when a transactional method is called from within an existing transaction:

| Propagation | Behavior |
|---|---|
| `REQUIRED` (default) | Join existing transaction or create new |
| `REQUIRES_NEW` | Always create new; suspend existing |
| `SUPPORTS` | Join existing; run non-transactional if none |
| `NOT_SUPPORTED` | Run non-transactional; suspend existing |
| `MANDATORY` | Must have existing transaction; throw if none |
| `NEVER` | Must NOT have transaction; throw if one exists |
| `NESTED` | Create savepoint within existing transaction |

```java
@Service
public class OrderService {

    @Transactional
    public void processOrder(OrderRequest request) {
        // This runs in the same transaction
        Order order = createOrder(request);

        // This runs in a SEPARATE transaction (suspended outer)
        auditLogService.logAsync(order);  // REQUIRES_NEW
        // Audit log commits independently — even if order rolls back, log survives
    }
}
```

## Isolation levels

Isolation controls what uncommitted changes from other transactions are visible:

| Level | Dirty Read | Non-Repeatable Read | Phantom Read |
|---|---|---|---|
| `READ_UNCOMMITTED` | ✅ Possible | ✅ Possible | ✅ Possible |
| `READ_COMMITTED` | ❌ | ✅ Possible | ✅ Possible |
| `REPEATABLE_READ` (default) | ❌ | ❌ | ✅ Possible |
| `SERIALIZABLE` | ❌ | ❌ | ❌ |

```java
// Avoid phantom reads during reporting
@Transactional(isolation = Isolation.REPEATABLE_READ)
public Report generateInventoryReport() {
    List<Product> products = productRepository.findAll();
    // No new products inserted between this query and the next
    return Report.from(products);
}
```

## Rollback rules

By default, Spring rolls back on **unchecked exceptions** (`RuntimeException` and subclasses) and **errors**. Checked exceptions do NOT trigger rollback:

```java
// This does NOT rollback on IOException (checked)
@Transactional
public void processFile(String path) throws IOException {
    repository.save(entity);
    throw new IOException("File not found");  // entity already committed!
}

// Fix: specify rollbackFor
@Transactional(rollbackFor = Exception.class)
public void processFile(String path) throws IOException {
    repository.save(entity);
    throw new IOException("File not found");  // NOW rolls back
}
```

**Never-final rule:** `@Transactional` on a `final` or `static` method is silently ignored. Spring uses CGLIB proxies, and final/static methods cannot be overridden.

## The self-invocation problem

This is the #1 `@Transactional` bug in production:

```java
@Service
public class OrderService {

    public void processOrder(OrderRequest request) {
        // This call does NOT go through the proxy
        createOrder(request);  // no transaction! Spring AOP is bypassed
    }

    @Transactional
    public Order createOrder(OrderRequest request) {
        Order order = new Order(request);
        orderRepository.save(order);
        return order;
    }
}
```

When `processOrder()` calls `createOrder()` on `this`, the call bypasses the Spring proxy entirely. No transaction is started. `save()` runs in autocommit mode.

**Fixes:**
1. Inject itself and call through the proxy.
2. Extract the transactional method to a separate `@Component`.
3. Use `AopContext.currentProxy()`.

```java
@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository repository;
    private final TransactionTemplate txTemplate;

    public void processOrder(OrderRequest request) {
        // Use TransactionTemplate for programmatic transaction
        txTemplate.execute(status -> {
            createOrder(request);
            return null;
        });
    }

    @Transactional
    public Order createOrder(OrderRequest request) {
        Order order = new Order(request);
        repository.save(order);
        return order;
    }
}
```

## Read-only transactions

```java
@Transactional(readOnly = true)
public List<Order> getOrders(String customerId) {
    return orderRepository.findByCustomerId(customerId);
}
```

`readOnly = true` tells the database optimizer this transaction will not modify data. Hibernate uses this to skip dirty checking, improving performance. The database may also take read-only shortcuts (e.g., PostgreSQL skips WAL writes for read-only transactions).

## Transaction timeout

```java
@Transactional(timeout = 30)  // rolls back if not committed within 30 seconds
public void longRunningBatch() {
    // process thousands of records
    // if it takes > 30 seconds, Spring throws TransactionTimedOutException
}
```

## How we use it in organizations

### Scenario 1: nested transactions with savepoints

```java
@Service
public class PaymentService {

    @Transactional
    public PaymentResult processPayment(PaymentRequest request) {
        Order order = orderService.createOrder(request.orderRequest());

        try {
            paymentGateway.charge(order);
            return PaymentResult.success(order.id());
        } catch (PaymentDeclinedException e) {
            // Order is still saved (outer transaction commits)
            return PaymentResult.declined(order.id(), e.getMessage());
        }
    }
}
```

### Scenario 2: REQUIRES_NEW for audit logging

```java
@Service
public class AuditService {

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public AuditEntry logAction(String userId, String action) {
        AuditEntry entry = new AuditEntry(userId, action, Instant.now());
        return auditRepository.save(entry);
        // Commits independently of the caller's transaction
    }
}
```

### Scenario 3: optimistic locking with @Version

```java
@Entity
public class Account {
    @Id private String id;
    @Version private Long version;  // JPA optimistic lock
    private BigDecimal balance;
}

@Service
public class AccountService {

    @Transactional
    public void debit(String accountId, BigDecimal amount) {
        Account account = accountRepository.findById(accountId).orElseThrow();
        // If another thread modified the account since we read it,
        // save() throws OptimisticLockingFailureException
        account.debit(amount);
        accountRepository.save(account);
    }
}
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Self-invocation of `@Transactional` method | No transaction — autocommit mode |
| `@Transactional` on `final` method | Silently ignored |
| Not specifying `rollbackFor` | Checked exceptions commit partial work |
| Long-running transactions | Locks held too long — other transactions timeout |
| `@Transactional` on read queries without `readOnly` | Unnecessary dirty checking — slower |
| Mixing programmatic and declarative | Confusing transaction boundaries |
