---
title: Modulith — Testing & Documentation
summary: @ApplicationModuleTest, scenarios for cross-module flows, and the C4/PlantUML documentation Modulith generates from the module map.
order: 4
minutes: 12
topics: [modulith testing, application module test, scenarios, c4 model, documentation]
docs:
  - https://docs.spring.io/spring-modulith/reference/testing.html
  - https://docs.spring.io/spring-modulith/reference/documentation.html
---

# Modulith — Testing & Documentation

## The architecture test (recap, the non-negotiable)

```java
@SpringBootTest
class ModulithArchitectureTests {
    @Test
    void verify() {
        ApplicationModules.of(Application.class).verify();
    }
}
```

This test is the contract that keeps the module map honest — dependency rules, API-only access, no cycles. **It must run in CI**, and it must be allowed to fail the build: its entire value is that an illegal dependency is a *build failure*, not a code-review comment.

## @ApplicationModuleTest: testing one module

Spring Modulith's slice-test style for modules — boots the context for a single module (and its dependencies), with the rest mocked:

```java
@ApplicationModuleTest
class BillingModuleTests {

    @Test
    void recordsPayment(Scenario scenario) {
        // Exercise the module's public API + event flows, then assert outcomes:
        scenario.stimulate(() -> billingService.markPaid(order))
            .andWaitForEventOfType(OrderPaid.class)
            .toArrive()
            .andVerify((event, publications) ->
                assertThat(publications).hasSize(1));
    }
}
```

**`Scenario`** is the killer feature: a DSL for cross-module event flows. `stimulate(...)` performs an action, `andWaitForEventOfType(...).toArrive()` awaits the resulting application event, and `andVerify(...)` inspects the event + publication state. It's the in-process replacement for "start Kafka, publish, consume, assert".

## The scenario DSL in practice

```java
@ApplicationModuleTest
class BillingFulfillmentIntegration {

    @Test
    void paidOrderTriggersFulfillment(Scenario scenario) {
        scenario.stimulate(() -> billingService.markPaid(order))
            .andWaitForEventOfType(OrderPaid.class)
            .toArrive();
            // if a listener failed, the wait times out — the test fails loudly
    }

    @Test
    void failedListenerLeavesPublicationPending(Scenario scenario) {
        // a listener that throws → the event publication stays incomplete:
        scenario.stimulate(() -> billingService.markPaid(order))
            .andWaitForEventOfType(OrderPaid.class)
            .toArrive()
            .andVerify((event, pubs) ->
                assertThat(pubs).allMatch(p -> !p.isCompleted()));
    }
}
```

This is the reliability contract as a test: **"a failed listener must leave evidence, not silence."** The same scenario DSL doubles as the documentation of each module's public behavior.

## Generating the documentation

Modulith reads the module map and renders it — no diagramming tool:

```java
// A test (or CI job) that emits the docs:
ApplicationModules.of(Application.class).forEach(System.out::println);

// Or the Maven plugin:
mvn -Pmodulith modulith:documentation
```

Output: **C4-style PlantUML component diagrams** (modules + allowed dependencies + events between them) and an HTML module reference — the architecture document that can't go stale, because it's generated from the code and verified by the test. The module map you show stakeholders *is* the code.

## The discipline summary

| Layer | Tool | Enforces |
|---|---|---|
| Compiler | package-private internals | modules can't reach internals |
| `@ApplicationModuleTest` | module-scoped slice tests | module behavior in isolation |
| `Scenario` DSL | event-flow tests | cross-module contracts + reliability |
| `ApplicationModules.verify()` | architecture test in CI | dependency graph stays legal |
| `modulith:documentation` | generated C4/PlantUML | the docs match the code |

The loop that makes it stick: **write the module → test it in isolation → verify the graph in CI → document it from the code**. None of these is a one-time ceremony; all of them run on every build.

## Key takeaways

- `ApplicationModules.verify()` in CI is the enforcement half — illegal dependency = build failure.
- `@ApplicationModuleTest` tests one module; the `Scenario` DSL tests cross-module event flows.
- Scenario-based tests prove the reliability contract: failed listeners leave pending publications, not silence.
- Documentation is generated (C4/PlantUML) from the verified module map — architecture docs that can't drift.

Official docs: [Spring Modulith — Testing](https://docs.spring.io/spring-modulith/reference/testing.html) · [Documentation](https://docs.spring.io/spring-modulith/reference/documentation.html)
