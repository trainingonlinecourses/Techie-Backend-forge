---
title: Test Lifecycle and State — Isolation, Ordering, and Parallelism
module: junit5-deep
order: 4
minutes: 24
topics: ["test isolation", "TestInstance", "PER_CLASS", "test ordering", "parallel tests", "shared state"]
docs:
  - title: "Test Instance Lifecycle (JUnit 5 User Guide)"
    url: "https://junit.org/junit5/docs/current/user-guide/#writing-tests-test-instance-lifecycle"
  - title: "Parallel Execution (JUnit 5 User Guide)"
    url: "https://junit.org/junit5/docs/current/user-guide/#writing-tests-parallel-execution"
summary: Reliable tests share one property: isolation — each test runs as if it were the only test. The three enemies are shared mutable state (a field that...
---

# Test Lifecycle and State — Isolation, Ordering, and Parallelism

## The Concept: The Three Enemies of Reliable Tests

Reliable tests share one property: **isolation** — each test runs as if it were the only test. The three enemies are *shared mutable state* (a field that leaks between tests), *hidden ordering dependencies* (test B only passes because test A ran first), and *environment coupling* (tests that depend on wall-clock time, random values, or real services). This lesson is the JUnit 5 toolkit for defeating all three — instance lifecycles, ordering, and parallel execution.

**The mental model:** each test is a scientist's experiment. The experiment must be reproducible: clean apparatus (fresh instance), controlled conditions (no leftovers from the previous experiment), and independence (running experiments in any order or in parallel must not change results). JUnit 5 gives you the switches; *your discipline* decides whether tests are truly isolated.

## The Default: PER_METHOD Isolation

By default, JUnit creates **a fresh test-class instance for every test method**:

```java
class IsolationDemo {
    private final List<String> calls = new java.util.ArrayList<>();

    @Test
    void first() {
        calls.add("first");
        assertEquals(1, calls.size());    // 1 — a brand-new instance
    }

    @Test
    void second() {
        calls.add("second");
        assertEquals(1, calls.size());    // 1 — ANOTHER brand-new instance
        // If instances were shared, this would be 2 and the test would
        // depend on `first` having run — order dependence. The default
        // kills that entire class of bugs.
    }
}
```

**Why fresh-per-method is the right default:** instance fields are *per-test state*. Two tests sharing a field create hidden coupling — test B's outcome depends on what test A left behind, which depends on ordering, which breaks as soon as tests run in parallel or get reordered. The fresh instance makes every test start from the same blank slate. The discipline that follows: **store per-test state in instance fields (they reset automatically); reserve `static` fields for genuinely shared, immutable setup.**

## PER_CLASS: When You Deliberately Share

Sometimes sharing an instance is the *point* — expensive setup that shouldn't rebuild per test:

```java
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PerClassDemo {

    // The expensive resource — built once, reused by all tests:
    private final ExpensiveClient client = new ExpensiveClient();

    // NOTE: with PER_CLASS, @BeforeAll/@AfterAll can be NON-static —
    // there IS an instance by the time they run.
    @BeforeAll
    void setUp() {
        client.connect();
    }

    @AfterAll
    void tearDown() {
        client.close();
    }

    @Test
    void usesClient() { assertTrue(client.isConnected()); }

    @Test
    void usesClientAgain() { assertTrue(client.isConnected()); }
}
```

**The trade-off, stated plainly:** PER_CLASS shares instance state across the class's tests — faster (one setup), but it *reintroduces* the coupling the default removes. The professional rule: use PER_CLASS only for **immutable** shared resources (an expensive client that holds no test-specific state) — never for mutable fields tests write to. If two tests both mutate a shared field, you've recreated the ordering bug in slow motion. (And PER_CLASS enables `@MethodSource` factories that aren't static — a common reason to reach for it.)

## Test Ordering: Making Order Explicit or Irrelevant

Tests should pass in *any* order. When you need determinism, JUnit 5 gives you explicit control:

```java
// Option 1 — order by method name (alphabetical):
@TestMethodOrder(MethodOrderer.MethodName.class)
class OrderedByName { }

// Option 2 — explicit numeric order via @Order:
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class OrderedByAnnotation {

    @Test @Order(2) void second() { }
    @Test @Order(1) void first() { }     // runs first
    @Test @Order(3) void third() { }
}

// Option 3 — the standard deterministic choice: the @Order annotations
// and everything else in a stable, human-designed sequence.
```

**The deeper advice:** ordering is a *code smell* when it's covering for shared state. If tests only pass in a specific order, the real fix is isolation (fresh instances, no shared mutable fields), not ordering. Use `@Order` for *intentional* sequences (integration flows, a "given → when → then" progression) and for deterministic CI output — never as a band-aid over coupling.

## Parallel Execution: Speed With a Contract

JUnit 5 supports running tests in parallel (opt-in via `junit-platform.properties`):

```properties
# junit-platform.properties
junit.jupiter.execution.parallel.enabled = true
junit.jupiter.execution.parallel.mode.default = concurrent
junit.jupiter.execution.parallel.mode.classes.default = concurrent
```

```java
// Opt a class OUT if it must run serially:
@Execution(ExecutionMode.SAME_THREAD)
class SerialOnlyTest { }
```

**The contract parallel testing demands:** tests must be *truly independent* — no shared mutable state, no fixed ports, no ordering assumptions. The moment a test touches a shared resource (a static cache, a fixed port, a shared temp file), parallel execution exposes it as flaky failures. Which is the point: **parallel execution is a stress test of your isolation.** Spring Boot tests (which cache a shared context) run parallel safely because the context is read-only after startup; tests that *write* to the context or to shared services need `SAME_THREAD`.

## The State Management Toolkit

The complete arsenal for test state:

```java
class StateToolkit {

    // 1. Fresh instance per test — the default. Instance fields = per-test.
    private final String perTest = "fresh";

    // 2. @TempDir — a per-test temp directory, auto-created and cleaned:
    @TempDir
    java.nio.file.Path tempDir;    // unique per test, deleted after

    @Test
    void writesToTempDir() throws Exception {
        java.nio.file.Path f = tempDir.resolve("data.txt");
        java.nio.file.Files.writeString(f, "hello");
        assertTrue(java.nio.file.Files.exists(f));
    }

    // 3. @BeforeEach resets shared-ish state — the sanctioned pattern:
    //    (an in-memory list that every test wants to start empty)
    //    private final List<String> db = new ArrayList<>();
    //    @BeforeEach void reset() { db.clear(); }
}
```

- **`@TempDir`** — the file-system isolation tool: a unique directory per test, created before, deleted after — no shared files, no cleanup leaks, no parallel collisions.
- **`@BeforeEach` reset** — for mocks/collections you *do* share at the class level (because they're expensive): clear them in `@BeforeEach`, never in the previous test's tail.
- **Immutables shared via `static final`** — constants, read-only config — safe to share.

## The Isolation Checklist

1. Instance fields for per-test state (the default does this for you).
2. `@BeforeEach` for resetting anything shared.
3. `@TempDir` for any filesystem work.
4. No dependence on wall-clock time — inject a `Clock`; no dependence on random — inject a seed.
5. No fixed ports, no real external services — use mocks or testcontainers.
6. Tests pass in any order, and in parallel — prove it in CI.

## Recap

Reliable tests are isolated tests, and JUnit 5's defaults enforce it: **fresh instances per method** (instance fields are per-test state), with `@TempDir` for per-test files and `@BeforeEach` for resetting shared resources. **PER_CLASS** shares an instance for expensive *immutable* setup — a deliberate trade that reintroduces coupling if abused. **Ordering** (`@Order`, `MethodOrderer`) exists for intentional sequences, not as a fix for shared state. And **parallel execution** — the speed feature — is really the isolation audit: if tests can't run concurrently, they aren't independent. The rule that ties it together: make every test a self-contained experiment, and the suite becomes fast, deterministic, and trustworthy.
