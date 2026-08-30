---
title: Testing Native Images — JVM Tests, Native Tests, and the Gap
module: graalvm-native
order: 3
minutes: 24
topics: ["native testing", "test AOT", "GraalVM test support", "JVM vs native", "integration testing"]
docs:
  - title: "Testing Native Images (Spring docs)"
    url: "https://docs.spring.io/spring-boot/reference/packaging/native-image/testing-native-images.html"
  - title: "GraalVM Testing (graalvm.org)"
    url: "https://www.graalvm.org/latest/docs/reference-manual/native-image/Testing/"
summary: Here's the trap: your test suite runs on the JVM — but production runs a native binary. The two execution models differ precisely at the seams nati...
---

# Testing Native Images — JVM Tests, Native Tests, and the Gap

## The Concept: The Tests Must Run Where the App Runs

Here's the trap: your test suite runs on the **JVM** — but production runs a **native binary**. The two execution models differ precisely at the seams native image cares about (reflection, resources, dynamic loading) — so a suite that's green on the JVM can ship a binary that crashes at first reflective call. The answer is two-tier testing: **JVM tests** for the fast, comprehensive loop, and **native tests** — the same suite, compiled AOT and run against the native binary — for the reachability gap. This lesson is that two-tier discipline.

**The mental model:** the JVM test suite is the factory's quality control on the prototype line; the native test suite is QC on the *actual production line*. Prototype-line QC (JVM) is fast and catches logic bugs; production-line QC (native) is slow (native builds take minutes) but catches what only the real process can reveal: a class the analyzer missed, a resource not in the binary, a reflection hint forgotten. Both lines matter — and the gap between them is exactly the native-image risk surface.

## The Two-Tier Setup

```xml
<!-- The native plugin gives you BOTH tiers: -->
<plugin>
    <groupId>org.graalvm.buildtools</groupId>
    <artifactId>native-maven-plugin</artifactId>
    <configuration>
        <!-- Optional: exclude slow/integration tests from the native run -->
        <skipNativeTests>false</skipNativeTests>
    </configuration>
</plugin>
```

```bash
# Tier 1 — the JVM test loop (seconds): logic, correctness, iteration.
./mvnw test

# Tier 2 — the native test run (minutes): the same suite as a native binary.
./mvnw -Pnative test
# -> compiles the test suite AOT, runs it against the native test binary
#    (target/native-tests/academy-app-tests)
```

**The two-tier rhythm:** develop on Tier 1 (fast feedback, run constantly); gate on Tier 2 (run in CI before release — especially before any native deployment). The same `@SpringBootTest` suite runs in both — which is the point: *the tests are the contract, and the contract must hold on the production runtime.*

## What Native Testing Actually Catches

The failure classes only the native tier reveals:

```java
// 1. Missing reflection hints — the classic:
//    On the JVM: works (reflection is free).
//    In native: ClassNotFoundException / NoSuchMethodError at runtime.
@RegisterReflectionForBinding(CustomDto.class)   // <- needed for native
@SpringBootTest
class SerializationTest { ... }

// 2. Missing resource hints — a template, a SQL file, a properties file:
//    In native: "Could not find resource classpath:templates/email.html"
//    Fix: hints.resources().registerPattern("templates/*.html");

// 3. Dynamic class loading — Class.forName by config value (JDBC drivers,
//    service loaders): works JVM, absent native.
//    Fix: reflect-config hint (or the driver's native support).

// 4. Serialization of custom types — works JVM, fails native.
```

**The discipline:** run the full test suite (unit + integration + the Spring slices) in native mode. A passing native test suite is the *evidence* that the closed-world analysis saw everything — the integration tests, especially, exercise the reflective edges (JSON binding, Spring Data, Actuator) that the analyzer must have hinted correctly.

## Test AOT: Making the JVM Loop Closer to Native

**Test AOT** is Spring Boot's tool to *narrow the gap before the slow native build*: it runs the test suite's AOT processing (the same engine the native build uses) on the JVM — so the bean definitions and hints are generated and verified *in the fast loop*:

```bash
./mvnw -Dspring.aot=true test
# Runs the tests with AOT-processed context — catching many native
# reachability issues without a native build.
```

The workflow refinement: **develop with `-Dspring.aot=true`** (JVM speed + AOT verification), **gate with the native test run** (minutes, full fidelity). The AOT-engine bugs and hint gaps surface in seconds instead of minutes — a genuinely useful speedup for native-heavy projects.

## The Integration-Test Caveats

Native testing has its own integration-test realities:

1. **Testcontainers still work** — native tests run Postgres/Redis in containers exactly like JVM tests; the container's *client libraries* must be native-compatible (the JDBC driver needs native support — the standard drivers have it).
2. **MockMvc and the slices work natively** — Boot's test support is AOT-compatible; the same `@WebMvcTest`/`@DataJpaTest` suites run in native mode.
3. **Native tests are slower to START but fast to run** — the binary starts in milliseconds; the total time is dominated by the *build* (minutes), not the run.
4. **CI caching is essential** — a native test run per commit is minutes; cache the GraalVM toolchain and the native build outputs so only the *delta* rebuilds.

## The Testing Strategy Summary

| Tier | Command | Speed | Catches |
|---|---|---|---|
| Unit tests (JVM) | `mvn test` | seconds | logic, business rules |
| AOT tests (JVM + AOT) | `mvn -Dspring.aot=true test` | seconds–minutes | AOT processing, many hint gaps |
| Native tests | `mvn -Pnative test` | minutes (build-bound) | the full reachability gap — the production runtime |
| E2E on the native binary | run the built image + curl | minutes | deployment reality |

**The release gate:** before any native deployment — CI runs the JVM suite (fast failures), then the native suite (the real contract), then boots the built image and hits the endpoints (the deployment smoke test). The pattern is the testing-pyramid lesson applied to the AOT world: fast and comprehensive at the base, slow and faithful at the top.

## The Anti-Patterns

1. **Shipping native with only JVM tests green** — the suite never ran where the app runs; the reachability gap is unverified.
2. **Skipping the JVM tier for native-only testing** — native builds are too slow for the iteration loop; you lose feedback velocity.
3. **Test-only hints** — hints in test config that production lacks (or vice versa): the tiers must share the same hint surface.
4. **Ignoring the native test failures** — "it works on my JVM" is precisely the failure mode native testing exists to catch; a native test failure is a production bug found early.

## Recap

Native testing is two-tier discipline: the **JVM tier** (`mvn test` — fast iteration, optionally with `-Dspring.aot=true` for AOT verification) catches logic and many reachability issues in seconds; the **native tier** (`mvn -Pnative test` — the same suite compiled AOT and run against the native binary) verifies the *production runtime*: missing reflection hints, absent resources, dynamic-loading gaps — everything the closed-world analysis must have captured. The gap between the tiers *is* the native-image risk surface, and the native test run is the only honest measurement of it. Develop fast on the JVM, gate deliberately on native, and never ship a native binary that hasn't run its own test suite.
