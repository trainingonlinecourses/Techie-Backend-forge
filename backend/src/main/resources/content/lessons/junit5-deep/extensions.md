---
title: Extensions — The Extension Model That Makes JUnit 5 Powerful
module: junit5-deep
order: 3
minutes: 26
topics: ["extensions", "TestExecutionListener", "ParameterResolver", "beforeEachCallback", "lifecycle", "custom extensions"]
docs:
  - title: "Extensions (JUnit 5 User Guide)"
    url: "https://junit.org/junit5/docs/current/user-guide/#extensions"
  - title: "Extension Registration (JUnit 5 User Guide)"
    url: "https://junit.org/junit5/docs/current/user-guide/#extensions-registration"
summary: JUnit 5's deepest architectural idea: test execution is a pipeline of extension points, and almost everything the framework does is itself an exten...
---

# Extensions — The Extension Model That Makes JUnit 5 Powerful

## The Concept: Tests as an Extensible Pipeline

JUnit 5's deepest architectural idea: test execution is a **pipeline of extension points**, and almost everything the framework does is itself an extension. `@BeforeEach`? An extension. Mockito's injection? An extension. Spring's test context? A huge extension. When you write `@ExtendWith(MockitoExtension.class)` or `@SpringBootTest` (which registers `SpringExtension`), you're plugging into the same mechanism.

**The mental model:** the test runner walks a lifecycle: before all → before each → test → after each → after all — plus the *parameter resolution* that supplies test method arguments. Each step has a **callback interface** you can implement. Your extension is a hook: implement `BeforeEachCallback` and you get code that runs before every test; implement `ParameterResolver` and you get to *invent* test parameters. The framework calls your hooks; you never call it.

## The Lifecycle Callbacks

```java
import org.junit.jupiter.api.extension.*;
import java.lang.reflect.Method;

// An extension that times every test and logs slow ones:
public class TimingExtension implements BeforeEachCallback, AfterEachCallback {

    private final ThreadLocal<Long> startTime = new ThreadLocal<>();

    @Override
    public void beforeEach(ExtensionContext context) {
        startTime.set(System.nanoTime());
    }

    @Override
    public void afterEach(ExtensionContext context) {
        long ms = (System.nanoTime() - startTime.get()) / 1_000_000;
        if (ms > 500) {
            context.getDisplayName();                       // the test's name
            System.err.println("SLOW: " + context.getDisplayName() + " took " + ms + "ms");
        }
    }
}
```

```java
// Register it on a test class:
@ExtendWith(TimingExtension.class)
class ServiceTest {
    @Test void fast() { }
    @Test void slow() throws InterruptedException { Thread.sleep(600); }
}
```

**Walking through it:** the extension implements the `BeforeEachCallback`/`AfterEachCallback` interfaces — JUnit calls `beforeEach(ExtensionContext)` and `afterEach(ExtensionContext)` around every test. The **`ExtensionContext`** is the extension's window into the test: the display name, the test method (`getTestMethod()`), the test instance, tags, and configuration parameters. This single object is how extensions learn *what* they're running and *how to report back*. The `ThreadLocal` matters: JUnit can run tests in parallel, and the callback context is per-execution.

**The full callback ladder** (mirrors the test lifecycle): `BeforeAllCallback`/`AfterAllCallback`, `BeforeEachCallback`/`AfterEachCallback`, `BeforeTestExecutionCallback`/`AfterTestExecutionCallback` (immediately around the test method itself — before/after `@BeforeEach` for the former, inside for the latter), `TestExecutionExceptionHandler` (decide what happens when a test throws), and `TestWatcher` (react to pass/fail/skip — the basis of reporting integrations).

## ParameterResolver: Inventing Test Arguments

The most powerful extension point — this is how Mockito's `@Mock` injection and Spring's `@Autowired` test parameters work:

```java
import org.junit.jupiter.api.extension.*;
import java.lang.annotation.*;
import java.lang.reflect.Parameter;

// Step 1: a marker annotation for the parameters we resolve.
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@interface RandomUser { }

// Step 2: the resolver — "when the test asks for a parameter annotated
// with @RandomUser, I will provide it."
class RandomUserResolver implements ParameterResolver {

    @Override
    public boolean supportsParameter(ParameterContext pc, ExtensionContext ec) {
        // Only claim parameters that carry OUR annotation:
        return pc.isAnnotated(RandomUser.class);
    }

    @Override
    public Object resolveParameter(ParameterContext pc, ExtensionContext ec) {
        // Return the value JUnit will inject into the test method.
        return new User("user-" + System.nanoTime() % 1000, "Ada");
    }

    record User(String id, String name) { }
}

// Step 3: use it — the parameter appears "out of nowhere."
@ExtendWith(RandomUserResolver.class)
class ResolverDemo {
    @Test
    void worksWithInjectedUser(@RandomUser RandomUserResolver.User user) {
        System.out.println("Injected user: " + user);
    }
}
```

**The contract has exactly two methods:** `supportsParameter` (JUnit asks "can you provide this parameter?" — answer by checking the type/annotation) and `resolveParameter` (JUnit asks "give me the value"). JUnit calls `supportsParameter` for *every* unresolved parameter, in *extension registration order*, until one claims it. This is precisely how **`MockitoExtension`** works — it sees `@Mock UserRepository repo` in the test method's parameters, creates the mock, and injects it. And it's how **`SpringExtension`** (`@SpringBootTest`) injects beans: a resolver that pulls from the application context.

## A Realistic Extension: Conditional Execution

```java
import org.junit.jupiter.api.extension.*;

// An extension that skips tests when an environment flag says so:
public class DisabledOnMissingEnv implements ExecutionCondition {

    @Override
    public ConditionEvaluationResult evaluateExecutionCondition(ExtensionContext context) {
        // Read a config parameter (settable per test via @TestPropertySource
        // or a junit-platform.properties file):
        String env = System.getenv("TEST_ENV");
        if (env == null) {
            return ConditionEvaluationResult.disabled("TEST_ENV not set — skipping");
        }
        return ConditionEvaluationResult.enabled("TEST_ENV=" + env);
    }
}
```

`ExecutionCondition` is the mechanism behind `@Disabled`, `@EnabledOnOs`, and `@EnabledIfEnvironmentVariable` — they're all built-in extensions implementing this interface. The takeaway: **if you can express it as a condition, an extension can apply it.**

## Registration: Three Ways

```java
// 1. Declarative (most common) — on the class or method:
@ExtendWith(TimingExtension.class)
class TestA { }

// 2. Composed annotation — bundle several extensions into one custom
//    annotation (how @SpringBootTest bundles Spring's extensions):
@ExtendWith(TimingExtension.class)
@ExtendWith(RandomUserResolver.class)
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@interface FastTestSuite { }

// 3. Programmatic (JUnit 5.5+) — the extension registers itself via
//    @RegisterExtension on a field, giving you lifecycle access to it:
//    (used for extensions that need setup/teardown in the test itself)
```

The **composed annotation** pattern is the professional packaging: a team's `@WebTest` or `@DatabaseTest` annotation bundles the extension set, tags, and conventions into one meaningful name — the same design philosophy as Spring's stereotype annotations.

## The Extensions You Already Use

The realization that makes this lesson click: **you've been using extensions all along.** `@SpringBootTest` = the Spring Extension (context caching, bean injection, transaction rollback). `MockitoExtension` = the mocking extension (initializes `@Mock`/`@InjectMocks`, strict stubbing). `@TempDir` = the temp-directory extension (creates/deletes a temp dir per test). `@Timeout` = the timeout extension. JUnit 5's "opinionated defaults" are all just extensions the framework ships — and the model is open for yours.

## Recap

JUnit 5 is an extension pipeline: lifecycle callbacks (`BeforeEachCallback`, `BeforeAllCallback`, `TestWatcher`), **`ParameterResolver`** (inventing test arguments — the mechanism behind Mockito's `@Mock` injection and Spring's `@Autowired` params), `ExecutionCondition` (conditional skipping), and `@RegisterExtension` — all plugged in via `@ExtendWith` or composed annotations. The `ExtensionContext` is the extension's window into the test. Everything you thought was "framework magic" — Spring Boot tests, Mockito injection, `@TempDir` — is an extension, and the model is open for your own: timing, retries, environment gating, custom parameter injection. Master the extension points and you can make JUnit do almost anything — because the framework is explicitly designed to let you.
