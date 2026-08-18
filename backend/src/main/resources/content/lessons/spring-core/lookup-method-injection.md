---
title: Method Injection & ObjectProvider — Prototype Beans Inside Singletons
summary: The prototype-in-singleton trap, @Lookup, ObjectProvider and Supplier injection, and the scenarios that genuinely need per-call beans.
order: 16
minutes: 20
topics: [lookup, objectprovider, prototype-scope, method-injection, provider, scoped-proxy]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-method-injection.html
  - https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-objectprovider.html
---

# Method Injection & ObjectProvider — Prototype Beans Inside Singletons

## The concept: the prototype-in-singleton trap

A singleton bean is created **once**; its dependencies are injected **once** at startup. If you inject a **prototype**-scoped bean into a singleton, you get *one* instance, captured at startup — every call after that reuses the same object, which defeats the whole point of prototype scope:

```java
@Component
@Scope("prototype")
public class AuditEvent { private final String id = UUID.randomUUID().toString(); }

@Service
public class AuditService {
    @Autowired private AuditEvent event;   // WRONG — captured ONCE, same id forever
    public void record(String action) { log.info("{} {}", action, event.id()); }
}
```

Every `record()` call logs the *same* event id. The fix isn't a new annotation — it's **deferring the lookup to call time**. Spring gives you three mechanisms, from simplest to most powerful.

## ObjectProvider — the cleanest modern answer

```java
@Service
public class AuditService {
    private final ObjectProvider<AuditEvent> eventProvider;

    public AuditService(ObjectProvider<AuditEvent> eventProvider) {   // constructor injection
        this.eventProvider = eventProvider;
    }

    public void record(String action) {
        AuditEvent event = eventProvider.getObject();   // fresh instance EVERY call
        log.info("{} {}", action, event.id());
    }
}
```

`ObjectProvider` is a lazy, injectable **lookup handle**: `getObject()` performs the bean lookup at call time, honoring scope. It also adds useful APIs:

- `getIfAvailable()` — null if no bean (optional dependency, no `@Autowired(required=false)` needed)
- `getIfUnique()` — the single candidate, or null when several match
- `stream()` — all matching beans, for strategy collections
- `getObject(Object... args)` — pass constructor args for prototype creation

This is also how **optional** or **multiple** dependencies are expressed idiomatically in modern code: inject `ObjectProvider<Formatter>`, call `stream()` and pick, rather than `List<Formatter>` with fragile assumptions.

## @Lookup — abstract method injection

```java
@Service
public abstract class AuditService {
    public void record(String action) {
        AuditEvent event = createEvent();      // each call → fresh prototype
        log.info("{} {}", action, event.id());
    }

    @Lookup
    protected abstract AuditEvent createEvent();   // Spring implements this method
}
```

Spring generates a subclass that overrides `createEvent()` to perform a prototype lookup. It's the classic approach (works back to Spring 2.x), but modern code prefers `ObjectProvider` or `Supplier` — the abstract-class requirement is awkward with constructor injection, and `ObjectProvider` is more explicit.

## Supplier injection — the terse variant

```java
@Service
public class AuditService {
    private final Supplier<AuditEvent> eventFactory;
    public AuditService(Supplier<AuditEvent> eventFactory) { this.eventFactory = eventFactory; }
    // Spring injects a Supplier that resolves the bean per call — same effect as ObjectProvider
}
```

`Supplier<T>` injection is concise but loses the `getIfAvailable`/`stream` helpers. Use it when you only need "a fresh bean per call" and nothing else.

## Scoped proxy — a different tool for the same trap

For web-scoped beans (`request`, `session`) inside singletons, the idiomatic fix is a **scoped proxy**:

```java
@Component
@Scope(value = "request", proxyMode = ScopedProxyMode.TARGET_CLASS)
public class RequestContext { private String tenantId; /* getters/setters */ }

@Service
public class TenantService {
    private final RequestContext ctx;   // injected PROXY — resolves the real request bean per call
    ...
}
```

The proxy stands in at injection time and resolves the actual request-scoped bean on each method call. For prototypes specifically, `ObjectProvider`/`@Lookup` are preferred over proxies (a proxy for a prototype is a foot-gun — every injected copy is a different instance anyway).

## How we use it in an organization: the scenarios

- **Per-request correlation/audit objects:** each API call gets a fresh `AuditEvent`/`CorrelationId` object — inject `ObjectProvider<...>` or, better, use the request scope.
- **Short-lived worker/task objects:** a prototype `ReportTask` whose constructor takes the payload; a scheduler service resolves a fresh one per execution.
- **Strategy instantiation with args:** `ObjectProvider<MyWorker>(arg1, arg2)` builds a prototype with constructor arguments, one per message consumed.
- **Optional framework hooks:** `ObjectProvider<TransactionManager>` in a library — present in some deployments, absent in others.

## Pitfalls

- Injecting a prototype directly into a singleton: the "one captured instance" bug — recognize it in code review.
- `@Lookup` on a **final** method or a non-abstract method without a body will not work; the pattern needs an overridable method.
- Overusing prototypes: most "fresh instance" needs are really request scope or a value object you can `new` yourself. Reserve container-managed prototypes for beans that need injection and are genuinely short-lived.
- Don't combine scoped proxies with constructor-injected prototypes — pick one mechanism per dependency.

## Key takeaways

- Prototypes injected into singletons are captured once — defer lookup to call time.
- `ObjectProvider` is the modern default: per-call resolution plus `getIfAvailable`/`stream`.
- `@Lookup` and `Supplier<T>` are lighter alternatives; request/session scope uses scoped proxies.
- Use prototypes for genuinely short-lived, injectable workers — not as a general "new object" habit.
