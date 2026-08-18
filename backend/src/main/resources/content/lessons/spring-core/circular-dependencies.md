---
title: Circular Dependencies — Why They Happen and How to Break Them
summary: The bean cycle failure, constructor vs field injection behavior, and the refactors (extract, ObjectProvider, @Lazy) that eliminate cycles cleanly.
order: 22
minutes: 18
topics: [circular-dependency, cycle, objectprovider, lazy, refactor, constructor-injection]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-collaborators.html
  - https://www.baeldung.com/circular-dependencies-in-spring
---

# Circular Dependencies — Why They Happen and How to Break Them

## The concept: bean A needs B, B needs A

A circular dependency is `A` needing `B`, `B` needing `A` (possibly through a longer chain). The container cannot construct either first — every constructor is waiting on the other. Spring's failure message is famous:

```text
BeanCurrentlyInCreationException: Error creating bean with name 'a':
Requested bean is currently in creation: Is there an unresolvable circular reference?
```

**Constructor injection fails hard** on cycles — and that's a feature: the cycle is a design smell, and the error surfaces at startup, forcing you to fix it. **Field/setter injection "works"** because Spring creates the bean (with null fields), then wires them later — but the resulting object can be **half-constructed** when methods run during wiring, and the cycle stays hidden until something misbehaves in production.

## Why cycles are usually a design smell

A clean dependency graph is a **DAG** (directed acyclic) — "upstream" services depend on "downstream" ones. A cycle almost always means:

- **Responsibilities overlap** — two services both doing validation/notification/persistence that should live in one place or a third collaborator.
- **The "god object" pulling both ways** — A and B are really facets of one aggregate.
- **Event loops modeled as method calls** — A notifies B, B notifies A; the design should be one-way (A publishes an event, B subscribes).

The org discipline: **treat a cycle as a code-review failure** — refactor, don't paper over it.

## How we use it in an organization: the fixes, in order

**Fix 1 — extract the shared dependency (the right answer).** If `OrderService` and `NotificationService` both need each other's data, extract the shared logic:

```java
// Before: OrderService → NotificationService → OrderService  (cycle)
// After:
@Service public class OrderService {
    private final OrderRepository repo;
    private final OrderEvents events;        // the extracted shared collaborator
}
@Service public class NotificationService {
    private final OrderRepository repo;      // both depend on the repository, not on each other
    private final NotificationGateway gateway;
}
```

Both now point *down* at shared collaborators — the cycle is gone because the graph is a DAG.

**Fix 2 — break the cycle with ObjectProvider (lazy resolution).** When one direction is genuinely "rarely used", defer it:

```java
@Service
public class AuditService {
    private final ObjectProvider<ReportService> reports;   // resolved on demand, not at startup

    public AuditService(ObjectProvider<ReportService> reports) { this.reports = reports; }

    public void onEvent() {
        reports.getIfAvailable().generate();   // only now is ReportService needed — cycle broken
    }
}
```

`ObjectProvider` defers the lookup to call time, so the constructor cycle disappears while keeping constructor injection on both sides.

**Fix 3 — @Lazy on one side (the pragmatic escape hatch).** Inject a lazy proxy so construction order can proceed:

```java
@Service
public class A {
    private final B b;
    public A(@Lazy B b) { this.b = b; }   // a proxy stands in until B is actually used
}
```

`@Lazy` on the parameter injects a proxy that resolves the real bean on first use. It works, but it's the **last resort** — it hides the design smell and adds a proxy layer.

## Field injection — the tempting wrong answer

Switching from constructor to `@Autowired` fields "fixes" the cycle instantly — and that's exactly why teams banned field injection:

- The cycle is **invisible** in the constructor signature — no one sees A needs B needs A.
- Beans can be **used before fully wired** (a `@PostConstruct` in A calling B while B's fields are still being set).
- **Testing requires reflection or a DI framework** — no constructor to construct the object plainly.

If the only way to "fix" a cycle is field injection, the cycle is telling you something. Refactor or use `ObjectProvider`/`@Lazy` with constructor injection — never field injection as the cycle escape.

## The scenarios teams hit

- **A service and its own validator/notifier pointing back at the service** — extract the validator, both depend on it.
- **Cross-module calls in a monolith** — module A's service calls module B's, which calls back into A (often through a facade). Enforce one-directional module dependencies (see the Modulith lesson — this is exactly what `spring-modulith` verifies at test time).
- **Configuration classes calling each other's `@Bean` methods in a cycle** — break with method parameters (container-resolved) instead of method calls.
- **Events** — if A must notify B and B must react into A, model it as **events** (A publishes, B listens) — the container wires listeners one-way, no cycle.

## Pitfalls

- **Constructor cycles fail at startup** — that's correct behavior; don't "fix" by making one side field-injected.
- **`@Lazy` hides the cycle but adds a proxy** — every call through the lazy proxy has a small overhead, and the cycle remains in the architecture.
- **Runtime cycles in `@PostConstruct`** — even with field injection, calling across the cycle during initialization can NPE on unwired fields.
- **AOP proxies and cycles** — `@Transactional` beans involved in cycles make proxying/self-reference interactions more confusing; fixing the cycle fixes the confusion too.

## Key takeaways

- A bean cycle fails at startup with constructor injection — the signal to refactor.
- Field/setter injection hides cycles — banned in most orgs for this reason.
- Fix order: extract a shared collaborator → `ObjectProvider` → `@Lazy` (last resort).
- Model bidirectional needs as events (one-way) rather than mutual method calls.
- Treat every cycle as a design review item, not a configuration puzzle.
