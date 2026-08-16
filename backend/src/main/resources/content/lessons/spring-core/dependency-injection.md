---
title: Dependency Injection in Depth
summary: Constructor injection, @Autowired, @Qualifier, @Primary, circular dependencies and why the container picks what it picks.
order: 3
minutes: 20
topics: [di, autowired, qualifier, primary, circular-deps]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/dependencies.html
  - https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/autowired.html
---

# Dependency Injection in Depth

## Why DI at all?

DI makes a class's dependencies **explicit** (constructor signature), **swappable** (interface implementations), and **testable** (mock the dependency). Without it, classes hard-code their collaborators and unit tests are impossible.

## Constructor injection — the default

```java
@Service
public class AccountService {
    private final AccountRepository accounts;
    private final ApplicationEventPublisher events;
    private final Clock clock;                       // testable time!

    public AccountService(AccountRepository accounts,
                          ApplicationEventPublisher events,
                          Clock clock) {
        this.accounts = accounts;
        this.events = events;
        this.clock = clock;
    }
}
```

Since Spring 4.3 a single constructor needs no `@Autowired`. Benefits: `final` fields, compile-time dependency check, no partial state. **Field injection is banned** in most orgs — it hides dependencies and breaks testing.

## Multiple beans of the same type

```java
@Service
public class ReportingService {
    private final FeePolicy feePolicy;

    public ReportingService(@Qualifier("vipFee") FeePolicy feePolicy) { ... }
}

@Configuration
public class FeeConfig {
    @Bean @Primary          // default when no qualifier
    FeePolicy standardFee() { return new StandardFee(); }

    @Bean
    FeePolicy vipFee() { return new VipFee(); }
}
```

Resolution order: `@Qualifier` name → `@Primary` → unique type → fail with `NoUniqueBeanDefinitionException`. Use `@Qualifier` at the injection site for *named* alternatives; use `@Primary` for the default.

## Optional dependencies

```java
@Service
public class AuditService {
    private final AuditSink sink;

    public AuditService(@Autowired(required = false) AuditSink sink) {
        this.sink = sink != null ? sink : NullSink.INSTANCE;
    }
}
// or cleaner: ObjectProvider<AuditSink>
public AuditService(ObjectProvider<AuditSink> sinkProvider) {
    this.sink = sinkProvider.getIfAvailable(() -> NullSink.INSTANCE);
}
```

## Circular dependencies

```java
@Service class A { A(B b) { this.b = b; } }   // A needs B
@Service class B { B(A a) { this.a = a; } }   // B needs A  → cycle!
```

Constructor-injected cycles fail at startup (good — loud, not at runtime). Fix by redesign: extract the shared dependency into a third bean, or introduce an interface to break the cycle. If you see "The dependencies of some of the beans in the application context form a cycle", that's a design smell — fix the design.

## Why DI makes testing trivial

```java
class AccountServiceTest {
    @Test
    void debit_fails_when_insufficient_funds() {
        AccountRepository repo = mock(AccountRepository.class);
        AccountService service = new AccountService(repo, mock(ApplicationEventPublisher.class), Clock.fixed(...));
        // no Spring needed — plain JUnit
    }
}
```

> **Why it matters (organizational view)** — Constructor injection is the org standard because it makes *dependencies visible in the constructor*, which makes architecture reviewable: if a service takes 8 dependencies, that's a review comment, not a surprise. The container enforces the dependency graph at startup, so wiring errors fail in CI, not in production.

## Key takeaways

- Constructor injection: `final` fields, explicit deps, mock-friendly.
- `@Qualifier` per site, `@Primary` for defaults, `ObjectProvider` for optional/lazy.
- Circular dependencies are design bugs — fix, don't patch.
- If it compiles, Spring will construct it; startup is the wiring test.

**Official docs:** [Dependencies](https://docs.spring.io/spring-framework/reference/core/beans/dependencies.html) · [@Autowired](https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/autowired.html)
