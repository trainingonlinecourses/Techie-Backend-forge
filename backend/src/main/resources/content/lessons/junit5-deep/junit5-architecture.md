---
title: JUnit 5 Architecture — Jupiter, Platform, and Vintage
module: junit5-deep
order: 1
minutes: 24
topics: ["JUnit 5", "Jupiter", "Platform", "Vintage", "test lifecycle", "annotations"]
docs:
  - title: "JUnit 5 User Guide"
    url: "https://junit.org/junit5/docs/current/user-guide/"
  - title: "JUnit 5 Architecture (junit.org)"
    url: "https://junit.org/junit5/docs/current/user-guide/#overview"
summary: JUnit 5 isn't one library — it's an architecture of three cooperating projects, and understanding the split explains almost every "why is my test n...
---

# JUnit 5 Architecture — Jupiter, Platform, and Vintage

## The Concept: Three Pieces, One Testing Story

JUnit 5 isn't one library — it's an *architecture* of three cooperating projects, and understanding the split explains almost every "why is my test not running" mystery:

- **JUnit Platform** — the foundation: the *engine that discovers and runs tests* on the JVM. IDEs, Maven Surefire, and Gradle talk to the Platform; the Platform finds and executes tests.
- **JUnit Jupiter** — the *new* programming model: the `org.junit.jupiter` API you write (`@Test`, `@BeforeEach`, assertions) plus the engine that runs Jupiter tests.
- **JUnit Vintage** — a compatibility engine that runs *old* JUnit 4 tests (JUnit 3/4 `@Test` classes) on the new Platform.

**The mental model:** the Platform is the stadium, Jupiter is the rules of the new game, Vintage is a wing where the old game is still played. Your `@Test` methods are the players. If a test "doesn't run," the question is always: which engine saw it, and why didn't it? The Platform's answer is a test *tree* — the discovery/execution model that lets IDEs, CI, and tools all consume the same results.

## The Test Lifecycle: What Runs and When

```java
import org.junit.jupiter.api.*;

class LifecycleDemo {

    LifecycleDemo() {
        System.out.println("constructor — a NEW instance per test by default");
    }

    @BeforeAll
    static void beforeAll() {
        System.out.println("runs ONCE, before all tests — must be static by default");
    }

    @AfterAll
    static void afterAll() {
        System.out.println("runs ONCE, after all tests — must be static by default");
    }

    @BeforeEach
    void beforeEach() {
        System.out.println("runs before EACH test");
    }

    @AfterEach
    void afterEach() {
        System.out.println("runs after EACH test");
    }

    @Test
    void firstTest() { System.out.println("test 1"); }

    @Test
    void secondTest() { System.out.println("test 2"); }
}
```

**Walking through the lifecycle:**

- **Default instance-per-test:** JUnit creates a *new instance of the test class for each test method*. That's why `@BeforeAll`/`@AfterAll` must be `static` — there's no instance yet when they run. (You can opt into per-class instances with `@TestInstance(Lifecycle.PER_CLASS)` — useful for stateful or `@BeforeAll`-on-instance setups.)
- **Per-test setup/teardown:** `@BeforeEach`/`@AfterEach` run around every test — the place to reset state, start/stop mocks, open/close resources.
- **The order per test:** constructor → `@BeforeEach` → test → `@AfterEach`. Across tests: `@BeforeAll` once, then the per-test cycle, then `@AfterAll` once.
- **Failure semantics:** a failing `@BeforeEach` fails the test; a failing `@AfterEach` fails the test (even if the test itself passed); `@AfterAll` failure is reported separately.

The lifecycle is *the* contract of test isolation: each test starts clean, and `@BeforeEach` is where "clean" is established.

## The Core Annotations

```java
import org.junit.jupiter.api.*;

class AnnotationDemo {

    @Test
    void standardTest() { }

    @Disabled("reason — like @Ignore in JUnit 4")
    void skippedTest() { }

    @DisplayName("A human-readable name for reports and IDEs")
    void displayNameTest() { }

    @Tag("fast") @Tag("unit")
    @Test
    void taggedTest() { }        // filter by tag: -Dgroups=fast

    @Timeout(2)
    @Test
    void timedTest() throws InterruptedException {
        Thread.sleep(100);       // fails if it exceeds 2 seconds
    }

    @RepeatedTest(3)
    void repeatedTest() { }      // runs 3 times (RepetitionInfo available)
}
```

**The everyday set:** `@Test` (the test itself), `@Disabled` (temporarily off, with a reason — the reason is *required* discipline so nobody forgets why), `@DisplayName` (report/IDE readability), `@Tag` (the grouping mechanism — run "fast" tests in CI, exclude "slow" ones), `@Timeout` (the hang-guard — a test that blocks forever fails instead of hanging the build), `@RepeatedTest` (flakiness detection). The philosophical point: JUnit 5 treats *test structure as API* — display names, tags, and timeouts are first-class, not comments.

## Assertions: The Verification Language

```java
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AssertionDemo {

    @Test
    void assertions() {
        // Equality:
        assertEquals(4, 2 + 2);
        assertNotEquals(5, 2 + 2);

        // Truthiness:
        assertTrue(4 > 2);
        assertFalse(4 < 2);

        // Nulls:
        assertNull(null);
        assertNotNull("value");

        // Collections/arrays:
        assertArrayEquals(new int[]{1, 2, 3}, new int[]{1, 2, 3});
        assertIterableEquals(java.util.List.of(1, 2), java.util.List.of(1, 2));

        // Exceptions — the "this SHOULD throw" assertion:
        assertThrows(IllegalArgumentException.class, () -> {
            new PaymentService().charge(null, null);
        });

        // Timeouts:
        assertTimeoutPreemptively(java.time.Duration.ofMillis(500),
                () -> slowOperation());

        // Failure with a message (the modern style — supplier = lazy):
        assertTrue(4 > 2, () -> "4 should be greater than 2, but math broke");
    }

    void slowOperation() { }
}
```

**The critical details:**

- **`assertThrows`** — asserts *and captures* the exception: `IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> ...); assertEquals("amount must be positive", ex.getMessage());`. This is the standard way to test error paths — better than try/catch, which silently passes if nothing throws.
- **The message supplier** (`() -> "message"`) is *lazy* — only evaluated on failure. Expensive message construction costs nothing when tests pass.
- **`assertEquals` on objects uses `equals`** — records and properly-overridden classes work; default `Object.equals` (identity) does not (the classic "why does my entity test fail").
- **Floating point** needs a delta: `assertEquals(0.1 + 0.2, 0.3, 0.0001)` — never exact equality on doubles.

## Nested Tests: Structure Within a Class

```java
import org.junit.jupiter.api.*;

class StackTest {

    java.util.Stack<String> stack;

    @BeforeEach
    void setup() { stack = new java.util.Stack<>(); }

    @Nested
    class WhenEmpty {
        @Test
        void isEmpty() { assertTrue(stack.isEmpty()); }

        @Test
        void throwsOnPop() {
            assertThrows(java.util.EmptyStackException.class, () -> stack.pop());
        }
    }

    @Nested
    class WhenNotEmpty {
        @BeforeEach
        void pushOne() { stack.push("a"); }

        @Test
        void notEmpty() { assertFalse(stack.isEmpty()); }

        @Test
        void popsLastIn() { assertEquals("a", stack.pop()); }
    }
}
```

`@Nested` inner classes group tests by *scenario*, each with its own `@BeforeEach` — the spec-style "when empty / when not empty" structure. This is how JUnit 5 turns a flat list of test methods into readable behavior documentation. (Inner classes must be non-static, and they inherit the outer lifecycle.)

## Recap

JUnit 5's architecture is Platform (the runner) + Jupiter (the new API) + Vintage (JUnit 4 compat) — which explains both how tests run and why the ecosystem (Surefire, Gradle, IDEs) all speak one language. The lifecycle — per-test instances, `@BeforeAll` once, `@BeforeEach`/`@AfterEach` per test — is the isolation contract; the annotations (`@Test`, `@Disabled`, `@DisplayName`, `@Tag`, `@Timeout`, `@Nested`) structure and describe tests; and assertions (`assertEquals`, `assertThrows`, lazy messages, delta-based doubles) are the verification vocabulary. Master these and you have the *foundation* — the next lessons build parameterized tests and extensions on top.
