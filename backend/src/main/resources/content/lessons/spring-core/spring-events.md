---
title: Application Events & Decoupling
summary: Publish-subscribe inside the JVM, @EventListener, transactional events and when to reach for a broker.
order: 8
minutes: 15
topics: [events, eventlistener, transactional-event, decoupling]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/context-introduction.html#context-functionality-events
  - https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html
---

# Application Events & Decoupling

## The pattern

Spring's `ApplicationEventPublisher` gives you **in-process pub/sub**: one bean publishes, others listen, and neither knows the other exists. That's decoupling: `OrderService` doesn't import `AuditService`, `EmailService`, or `InventoryService`.

```java
// The event — an immutable record
public record AccountCreatedEvent(UUID accountId) {}
```

```java
// The publisher
@Service
public class AccountService {
    private final AccountRepository accounts;
    private final ApplicationEventPublisher events;

    @Transactional
    public AccountView createAccount(CreateAccountRequest req) {
        Account account = Account.open(req.customerId(), req.currency());
        accounts.save(account);
        events.publishEvent(new AccountCreatedEvent(account.getId()));
        return AccountView.from(account);
    }
}
```

```java
// The listener
@Component
public class AuditListener {
    @EventListener
    public void onCreated(AccountCreatedEvent e) {
        audit.record("ACCOUNT_CREATED", e.accountId());
    }
}
```

## Synchronous by default

`@EventListener` runs **synchronously in the publishing thread**. Exceptions in a listener propagate to the publisher (unless the listener handles them). That's fine for fast in-process work; for slow side effects, either keep them out of the request path or make them async:

```java
@Component
public class NotificationListener {
    @Async                       // + @EnableAsync on a config class
    @EventListener
    public void onCreated(AccountCreatedEvent e) {
        emailService.sendWelcome(e.accountId());   // runs on the async executor
    }
}
```

## @TransactionalEventListener — the important one

Listeners that touch the database must wait until the transaction **commits**. `@TransactionalEventListener` does exactly that:

```java
@Component
public class EmailListener {

    // AFTER_COMMIT: fires ONLY if the publishing transaction committed.
    // No welcome emails for rolled-back accounts — the classic bug this prevents.
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCreated(AccountCreatedEvent e) {
        emailService.sendWelcome(e.accountId());
    }
}
```

Phases: `BEFORE_COMMIT`, `AFTER_COMMIT` (default for tx listeners), `AFTER_ROLLBACK`, `AFTER_COMPLETION`.

## Event semantics you must know

| Property | In-process events |
|---|---|
| Delivery | Synchronous (or @Async), same JVM |
| Guarantees | **None beyond the method call** — no persistence, no retry |
| Ordering | By default unordered; `@Order` on listeners |
| Failure | Listener exception propagates to publisher |

So: events decouple *code*, not *systems*. If a side effect must survive a crash — send a message to a broker (Kafka/RabbitMQ) instead. Events are for "same process, same transaction, want loose coupling."

> **Why it matters (organizational view)** — Events are the cheap decoupling tool: new integrations (audit, email, analytics) become one listener class instead of edits to the core service. The review rules: use `@TransactionalEventListener(AFTER_COMMIT)` for anything touching state, prefer `@Async` for slow listeners, and graduate to a broker when you need durability or cross-service delivery.

## Key takeaways

- Publish records via `ApplicationEventPublisher`; listen with `@EventListener`.
- Synchronous by default; `@Async` for slow side effects (`@EnableAsync` needed).
- `@TransactionalEventListener(AFTER_COMMIT)` for anything that must not run on rollback.
- In-process events ≠ messaging; no durability, no retries, same JVM.

**Official docs:** [Events](https://docs.spring.io/spring-framework/reference/core/beans/context-introduction.html#context-functionality-events) · [Transactional events](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html)
