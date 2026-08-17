---
title: Spring Modulith — Application Modules
summary: Enforcing the module map in code — @ApplicationModule, the dependency rule, named interfaces and how Spring Modulith verifies your architecture.
order: 2
minutes: 15
topics: [spring modulith, application module, dependency rule, named interface, architecture verification]
docs:
  - https://docs.spring.io/spring-modulith/reference/index.html
  - https://docs.spring.io/spring-modulith/reference/application-modules.html
---

# Spring Modulith — Application Modules

## What Spring Modulith is

Spring Modulith makes the **modular monolith** (previous lesson) enforceable in code. It formalizes the module map: each package is an application module, and the framework verifies at test time that modules only talk to each other through their **API surface** — not by reaching into internals. Modularity becomes a compile-time-adjacent fact instead of a code-review hope.

```java
@ApplicationModule(id = "billing")
package com.acme.app.billing;

// package-info.java marks the package as a module
```

## The module anatomy

```
com.acme.app
├── billing/                    ← application module "billing"
│   ├── BillingController.java   (api)
│   ├── BillingService.java      (api)
│   ├── BillingRepository.java   (internal — package-private!)
│   └── internal/
│       ├── TaxCalculator.java   (explicitly internal)
│       └── StatementGenerator.java
└── fulfillment/               ← application module "fulfillment"
```

Two rules define the boundary:

1. **Public types are the API** — only public classes in the module's root are reachable from other modules.
2. **Package-private is the enforcement** — `BillingRepository` (package-private) physically *cannot* be imported from `fulfillment`; the Java compiler enforces the boundary, not a linter.

## The dependency rule

Modules may depend on other modules' **public API** — but the dependency graph must stay **acyclic** and honest:

```java
// The module declares what it may use:
@ApplicationModule(allowedDependencies = "fulfillment")
package com.acme.app.billing;
```

- `allowedDependencies` makes the module map explicit and self-documenting.
- **Cycles are rejected** — `billing → fulfillment → billing` is a design smell (two modules that can't be understood separately) and Modulith flags it.
- The rule "depends on the API, never the internals" extends to **types, not just packages**: an `internal` class referenced from another module fails verification.

## Verification: the test that keeps it honest

```java
import static org.springframework.modulith.core.ApplicationModules;

@SpringBootTest
class ModulithArchitectureTests {

    @Test
    void modulesAreVerifiable() {
        ApplicationModules.of(Application.class).verify();   // dependency + API rules
    }

    @Test
    void modulesFollowTheDocumentedMap() {
        ApplicationModules.of(Application.class)
            .verifyDependencies();                           // strictly the declared graph
    }
}
```

Running in CI means **an illegal dependency fails the build** — the module map can't drift silently. This is the enforcement half of the pattern: architecture as a test, not a slide.

## Named interfaces: the seam for later extraction

When a module must expose a service without exposing its implementation (or when you want the extraction seam), use a **named interface**:

```java
// billing module root:
public interface PaymentProcessing {
    PaymentResult process(Payment payment);
}

// internal implementation:
@NamedInterface("payments")          // org.springframework.modulith
class PaymentProcessingImpl implements PaymentProcessing { ... }
```

Other modules depend on `PaymentProcessing` (the interface); the implementation can change, or the whole module can be extracted to a service with the interface as its contract — the named interface *is* the future microservice's API.

## Events across modules

The anti-pattern this solves: `billing` calling `fulfillment.ship(order)` directly (module A reaching into module B's internals for a side effect). The Modulith answer is **application events** — publish a domain event, other modules listen:

```java
// billing:
applicationEvents.publish(new OrderPaid(orderId));     // typed, guaranteed delivery

// fulfillment:
@TransactionalEventListener(phase = AFTER_COMMIT)
void on(OrderPaid event) { ... }                        // only after the billing tx commits
```

Spring Modulith wraps Spring's event infrastructure with **publication tracking**: events are persisted and can be replayed if a listener fails (the next lesson). This is the in-process version of the outbox pattern — same discipline, no network.

## Key takeaways

- `@ApplicationModule` + package structure = the module map in code; package-private internals are compiler-enforced.
- `allowedDependencies` declares the graph; `ApplicationModules.verify()` makes drift a build failure.
- Public root types are the API; `internal` subpackages and named interfaces shape the seam.
- Cross-module side effects go through application events (with publication tracking), not direct internal calls.

Official docs: [Spring Modulith — Application Modules](https://docs.spring.io/spring-modulith/reference/application-modules.html)
