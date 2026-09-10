---
title: Observer Pattern — Notifying When Things Change
module: design-patterns
order: 3
minutes: 24
topics: ["observer", "publish-subscribe", "event listeners", "decoupling", "Spring events"]
summary: Think of a news subscription. You don't call the newspaper every morning asking "is there news yet?" — you subscribe, and the paper pushes new edit...
docs:
  - title: "Observer (Refactoring Guru)"
    url: "https://refactoring.guru/design-patterns/observer"
---

# Observer Pattern — Notifying When Things Change

## The Concept: "Tell Me When It Happens"

Think of a news subscription. You don't call the newspaper every morning asking "is there news yet?" — you **subscribe**, and the paper *pushes* new editions to you. That's the Observer pattern: a **subject** (the news publisher) maintains a list of **observers** (subscribers) and notifies them automatically whenever its state changes.

In code, this solves a fundamental coupling problem. Consider a `UserService` that creates a user. Without observers:

```java
void createUser(User u) {
    repo.save(u);
    emailService.sendWelcome(u);        // UserService KNOWS about email
    analytics.track("user_created", u); // ...and analytics
    auditLog.record(u);                 // ...and audit
    // adding a 5th consequence = editing UserService again
}
```

`UserService` is coupled to every downstream concern, and every new concern edits it. With observers, `UserService` just publishes an event ("a user was created") and knows nothing about who listens:

```java
// UserService: publishes; has NO knowledge of listeners
eventPublisher.publish(new UserCreatedEvent(u));
```

Email, analytics, and audit each become *observers* that subscribe to `UserCreatedEvent` — added and removed without touching `UserService`. This is **decoupling**: the producer and consumers depend only on the *event type*, never on each other.

## The Code Walkthrough


**What this code does — step by step:**

1. ---- 1. The event: what happened ----
2. ---- 2. The subject (publisher): manages observers and notifies ----
3. Subscribe: register an observer for an event type
4. Publish: notify every observer of this event type
5. ---- 3. The subject that triggers events ----
6. `bus.publish(new UserCreatedEvent(username, email));` — announce — knows nothing else
7. ---- 4. Observers subscribe (each is independent) ----
8. ---- 5. Trigger — all observers fire automatically ----
9. [UserService] saving user sateesh. [Email] welcome to sateesh. [Audit] sateesh created at ...

The same code, clean:

```java
import java.util.*;

record UserCreatedEvent(String username, String email) {}

class EventBus {
    private final Map<Class<?>, List<Object>> listeners = new HashMap<>();

    public <T> void subscribe(Class<T> eventType, java.util.function.Consumer<T> handler) {
        listeners.computeIfAbsent(eventType, k -> new ArrayList<>()).add(handler);
    }

    public <T> void publish(T event) {
        @SuppressWarnings("unchecked")
        List<java.util.function.Consumer<T>> handlers =
                (List<java.util.function.Consumer<T>>) (List<?>) listeners.get(event.getClass());
        if (handlers != null) {
            for (var h : handlers) h.accept(event);
        }
    }
}

class UserService {
    private final EventBus bus;

    UserService(EventBus bus) { this.bus = bus; }

    void createUser(String username, String email) {
        System.out.println("[UserService] saving user " + username);
        bus.publish(new UserCreatedEvent(username, email));
    }
}

public class ObserverDemo {

    public static void main(String[] args) {
        EventBus bus = new EventBus();

        bus.subscribe(UserCreatedEvent.class, e ->
                System.out.println("[Email]   welcome to " + e.username()));
        bus.subscribe(UserCreatedEvent.class, e ->
                System.out.println("[Audit]   " + e.username() + " created at " + System.currentTimeMillis()));

        UserService service = new UserService(bus);
        service.createUser("sateesh", "s@example.com");

    }
}
```

### Walking Through Each Part

**The event record** — a plain data carrier: "a user was created, here are the details." In Spring this would be a POJO/record too.

**The `EventBus` (subject)** — maintains a map of event type → handlers. `subscribe` registers a handler; `publish` looks up the type and calls every handler. Notice the bus is *generic* — it works for any event type, which is exactly what Spring's `ApplicationEventPublisher` gives you out of the box.

**`UserService`** — publishes and stops. It has zero knowledge of email, analytics, or audit. The coupling is now: `UserService → EventBus → event type`. Adding a 5th consequence (say, sending a promo) means adding one `subscribe` — `UserService` untouched.

**The observers** — each a tiny lambda reacting to the event. They can be added or removed at runtime, in any order, without touching the producer.

**The demo** — creating one user fires every subscribed handler. If a handler throws, you must decide: does one failing subscriber block the rest? (Spring: by default an exception in one listener propagates unless you use `@Async` or catch — a real design consideration.)

## Observer vs Publish-Subscribe

The family has two flavors:

- **Observer (this lesson)** — the subject *knows* its observers (it holds references) and notifies them directly. Simple, tight, in-process.
- **Publish-Subscribe** — producers and consumers never meet; a *broker* (message queue: RabbitMQ, Kafka) mediates, often across processes. Producers "publish to a topic", consumers "subscribe to the topic".

Spring uses both: `ApplicationEventPublisher` is observer-style (in-process); Kafka/RabbitMQ integration is pub-sub (cross-service).

## Spring Events — The Pattern, For Free

Spring's event system *is* the Observer pattern with all the plumbing done:


**What this code does — step by step:**

1. 1. An event — plain record
2. 2. Publish — inject the publisher anywhere
3. constructor injection...
4. ... save ...
5. `publisher.publishEvent(new UserCreatedEvent(name));` — fire and forget
6. 3. Listen — annotate a method; Spring registers it as an observer
7. send welcome email — UserService knows nothing about this class

The same code, clean:

```java
record UserCreatedEvent(String username) {}

@Service
class UserService {
    private final ApplicationEventPublisher publisher;

    void createUser(String name) {
        publisher.publishEvent(new UserCreatedEvent(name));
    }
}

@Component
class WelcomeEmailListener {
    @EventListener
    void onUserCreated(UserCreatedEvent event) {
    }
}
```

Add `@Async` to the listener method (plus `@EnableAsync`) to handle it on another thread — the producer doesn't wait. This is the pattern you'll meet constantly in real Spring apps: domain events, audit, notifications, cache invalidation all ride on `@EventListener`.

## The Pitfalls

1. **Synchronous by default** — an observer that's slow (email call!) makes the producer slow. Use `@Async` or a queue for slow observers.
2. **Exception semantics** — one failing listener can abort the publish loop (Spring propagates). Decide policy: catch per-listener, or use `@Async` so failures are isolated.
3. **Ordering** — observers fire in registration order (in Spring: by `@Order`); don't rely on it implicitly.
4. **Circular events** — a listener that publishes an event that triggers the original publisher again = infinite loop. Guard with flags or event metadata.
5. **Memory leaks** — an observer that never unsubscribes keeps the subject alive (GC). In long-lived systems, unsubscribe/deregister when done.
6. **Overuse** — events make flow harder to trace (no call stack). Use them at *boundaries* (side effects, cross-module notifications), not for core flow logic.

## Common Beginner Pitfalls

1. **Coupled producers** — if the producer references the consumer classes directly, you haven't used the pattern; you've just written a helper.
2. **Events carrying mutable shared state** — listeners that mutate the event object race with each other; keep events immutable (records).
3. **Listener exceptions killing the flow** — catch or `@Async` per policy.
4. **Synchronous-only thinking** — the pattern's real power is enabling async and cross-process later without changing producers.
5. **Subscribing but never unsubscribing** — the leak. In Spring this is managed for you (beans live for the container), but in hand-rolled buses it's your job.

## Key Takeaways

- Observer decouples producers from consumers: publish an event, know nothing about who listens.
- Subject holds observers and notifies them on state change; observers subscribe independently.
- Adding a consequence = one new subscriber; producers never change (open/closed).
- Spring gives you the pattern free: `ApplicationEventPublisher.publishEvent` + `@EventListener`.
- Pub-sub (Kafka/RabbitMQ) is the cross-process sibling; events stay immutable; watch sync cost and exceptions.

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [refactoring.guru/design-patterns](https://refactoring.guru/design-patterns)
