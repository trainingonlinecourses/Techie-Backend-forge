---
title: Delegation Pattern — Composition Over Inheritance Done Right
summary: What delegation really is, when to use it instead of inheritance, the decorator pattern as its cousin, and how Spring itself is built on delegation.
order: 87
minutes: 18
topics: [delegation, composition-over-inheritance, decorator, forwarding, spring-context]
docs:
  - https://www.javaguides.net/2019/09/delegation-pattern-in-java.html
  - https://en.wikipedia.org/wiki/Delegation_pattern
---

# Delegation Pattern — Composition Over Inheritance Done Right

## The Concept, From Zero

**Delegation** means: instead of a class doing everything itself, it **hands off** (delegates) specific work to another object it holds a reference to. Think of a manager who doesn't write code — they assign tasks to team members. The manager still "does the work" from the client's perspective, but the actual labor happens inside the delegate.

This is the practical expression of **composition over inheritance** — one of the most important principles in object-oriented design. Instead of inheriting behavior from a parent class (which creates rigid, tightly-coupled hierarchies), you compose objects that work together by delegating to each other.

**The mental model:** Inheritance says "I *am* a specialized version of my parent." Delegation says "I *have* a helper that knows how to do this." The second approach is more flexible because you can swap helpers at runtime, combine multiple helpers, and avoid the fragile base class problem.

## How Delegation Works in Java

Delegation is not a special language feature — it's a **design pattern** implemented with interfaces and composition:

```java
// Step 1: Define the behavior contract
public interface MessageSender {
    void send(String to, String message);
}

// Step 2: Create concrete implementations
public class EmailSender implements MessageSender {
    @Override
    public void send(String to, String message) {
        System.out.println("Email to " + to + ": " + message);
        // Real implementation: connect to SMTP, build MIME message, send
    }
}

public class SmsSender implements MessageSender {
    @Override
    public void send(String to, String message) {
        System.out.println("SMS to " + to + ": " + message);
        // Real implementation: connect to Twilio API, send SMS
    }
}

// Step 3: The delegating class holds a reference and forwards calls
public class NotificationService {
    private final MessageSender sender;  // <-- the delegate

    // Constructor injection: caller decides which sender to use
    public NotificationService(MessageSender sender) {
        this.sender = sender;
    }

    // Delegation: NotificationService doesn't know HOW to send,
    // it just forwards the call to the delegate
    public void notifyUser(String userId, String message) {
        String email = lookupEmail(userId);
        sender.send(email, message);  // <-- delegation happens here
    }

    private String lookupEmail(String userId) {
        return "user@example.com";
    }
}
```

**Line-by-line walkthrough:**

1. **`interface MessageSender`** — This is the contract. It says "anything that can send messages must implement `send()`." The delegating class depends on this interface, not a concrete class.

2. **`class EmailSender implements MessageSender`** — A concrete implementation. It knows how to send emails. The `send()` method contains the actual email-sending logic.

3. **`class NotificationService`** — This is the delegator. It has a `MessageSender sender` field. It doesn't know or care whether the sender is email, SMS, or push notification. It just calls `sender.send()`.

4. **`this.sender = sender`** — Constructor injection. The caller decides which implementation to inject. This is what makes delegation flexible — you can swap the delegate without changing the delegator.

5. **`sender.send(email, message)`** — The actual delegation. `NotificationService` is saying "I don't know how to send messages, but I have someone who does."

## Delegation vs Inheritance

```java
// INHERITANCE approach (rigid, fragile):
public class EmailNotificationService extends EmailSender {
    // This forces EmailNotificationService to BE an EmailSender
    // What if we want SMS? We'd need to create a SEPARATE class
    // What if we want BOTH email AND SMS? Multiple inheritance — not possible in Java
}

// DELEGATION approach (flexible, composable):
public class NotificationService {
    private final MessageSender sender;  // can be EmailSender, SmsSender, or BOTH

    // Can even combine multiple delegates:
    private final List<MessageSender> senders;

    public NotificationService(List<MessageSender> senders) {
        this.senders = senders;  // send via ALL channels
    }

    public void notifyUser(String userId, String message) {
        senders.forEach(s -> s.send(lookupEmail(userId), message));
    }
}
```

**The key differences:**

| Aspect | Inheritance | Delegation |
|---|---|---|
| Coupling | Tight — child depends on parent's implementation | Loose — depends only on the interface |
| Flexibility | Fixed at compile time | Swappable at runtime |
| Multiple behaviors | Impossible (single inheritance) | Easy (multiple delegates) |
| Testing | Hard — must instantiate the full hierarchy | Easy — mock the delegate interface |
| Base class changes | Breaks all children | Only breaks the delegation call |

## The Decorator Pattern: Delegation's Close Cousin

Decorators wrap an object and add behavior before/after forwarding:

```java
public class LoggingSender implements MessageSender {
    private final MessageSender delegate;  // wraps another sender

    public LoggingSender(MessageSender delegate) {
        this.delegate = delegate;
    }

    @Override
    public void send(String to, String message) {
        long start = System.currentTimeMillis();
        System.out.println("[LOG] Sending to " + to);

        delegate.send(to, message);  // delegate the actual work

        long elapsed = System.currentTimeMillis() - start;
        System.out.println("[LOG] Sent in " + elapsed + "ms");
    }
}

// Usage: stack decorators
MessageSender sender = new LoggingSender(           // outer: logging
                        new RetrySender(            // middle: retry logic
                            new EmailSender()));    // inner: actual send
```

**Each decorator adds one concern:**
- `LoggingSender` adds logging
- `RetrySender` adds retry logic
- `EmailSender` does the actual sending

You can stack them in any order, add new ones without modifying existing code — this is the **Open/Closed Principle** in action.

## Real-World Scenario: Spring Itself Uses Delegation Everywhere

Spring is built on delegation. Understanding this pattern helps you understand how the framework works:

```java
// 1. HandlerMapping delegates to HandlerAdapter
// Spring MVC doesn't hard-code how to invoke controllers.
// HandlerMapping finds the right controller, HandlerAdapter delegates the invocation.

// 2. BeanPostProcessor delegates to custom processors
// Spring doesn't hard-code what to do after creating a bean.
// It delegates to every registered BeanPostProcessor.

// 3. DataSource delegates to connection pool
// Your application calls dataSource.getConnection()
// but the actual connection comes from HikariCP, not the DataSource itself.

// 4. Your Repository delegates to JdbcTemplate
@Repository
public class UserRepository {
    private final JdbcTemplate jdbc;  // delegate

    public UserRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;  // Spring injects the delegate
    }

    public User findById(Long id) {
        return jdbc.queryForObject(  // delegation
            "SELECT * FROM users WHERE id = ?", new UserRowMapper(), id);
    }
}
```

**Scenario 1 — Payment processing:** A `PaymentService` delegates to different payment gateways (Stripe, PayPal, bank transfer). The service doesn't know how each gateway works — it just calls `gateway.charge(amount, currency)`. You can add a new gateway without touching `PaymentService`.

**Scenario 2 — Caching:** A `CachedUserService` wraps a `UserService` and adds caching. It checks the cache first; on miss, it delegates to the real `UserService`. The caching decorator can be added or removed without changing `UserService`.

**Scenario 3 — Testing:** In tests, you inject a `MockSender` instead of `EmailSender`. The `NotificationService` doesn't know the difference — it just calls `sender.send()`. This is only possible because of delegation through the interface.

## Common Mistakes

| Mistake | Problem | Fix |
|---|---|---|
| Delegating to a concrete class, not an interface | Can't swap implementations | Always delegate through an interface |
| Creating too many delegate layers | Hard to trace which delegate handles what | Keep delegation chains shallow (2-3 levels max) |
| Using delegation when inheritance is simpler | Over-engineering | If there's only ONE implementation and it won't change, inheritance is fine |
| Not using constructor injection for delegates | Can't swap at runtime | Inject delegates through constructors, not field injection |
| Forgetting to document delegation chains | Code becomes opaque | Add a comment or diagram showing the delegation flow |

## When to Use Delegation

1. **You need to swap behavior at runtime** — different payment gateways, different notification channels
2. **You want to add concerns without modifying existing code** — logging, retry, caching, rate limiting
3. **You're implementing a strategy pattern** — the algorithm varies, the interface stays the same
4. **Testing matters** — delegation through interfaces makes mocking trivial
5. **You're building a framework** — Spring, Jackson, and almost every Java framework use delegation heavily

## Key Takeaways

- Delegation = "I have a helper" (composition) vs inheritance = "I am a specialized version" (hierarchy)
- Always delegate through interfaces, inject delegates via constructors
- Decorators are delegation with added behavior — stack them like layers
- Spring is built on delegation: HandlerAdapter, BeanPostProcessor, DataSource, JdbcTemplate
- Use delegation when you need flexibility; use inheritance only for true "is-a" relationships

Official docs: [Delegation Pattern](https://en.wikipedia.org/wiki/Delegation_pattern) · [Java Guides](https://www.javaguides.net/2019/09/delegation-pattern-in-java.html)
