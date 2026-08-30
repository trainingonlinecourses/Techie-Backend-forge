---
title: Advanced Stubbing and Verification — Matchers, doAnswer, and Verify Modes
module: mockito-deep
order: 3
minutes: 26
topics: ["argument matchers", "doAnswer", "verify modes", "inOrder", "timeouts", "stubbing chains"]
docs:
  - title: "Argument Matchers (Mockito docs)"
    url: "https://javadoc.io/doc/org.mockito/mockito-core/latest/org/mockito/ArgumentMatchers.html"
  - title: "Verification (Mockito docs)"
    url: "https://javadoc.io/doc/org.mockito/mockito-core/latest/org/mockito/Mockito.html#4"
summary: The basics cover when(x).thenReturn(y) and verify(x).times(n). Real tests outgrow them fast: stubs that must compute an answer from the arguments, ...
---

# Advanced Stubbing and Verification — Matchers, doAnswer, and Verify Modes

## The Concept: When Simple Stubs Aren't Enough

The basics cover `when(x).thenReturn(y)` and `verify(x).times(n)`. Real tests outgrow them fast: stubs that must *compute* an answer from the arguments, matchers for custom argument types, verification of *order*, and verification with *timeouts* (for async code). This lesson is that middle tier — the patterns that make Mockito handle production-shaped tests.

**The mental model:** simple stubbing is "give me a canned answer." `doAnswer` is "compute the answer from what was passed" — the mock becomes a tiny function. Matchers are the *pattern* language for "which calls count". Verify modes are the *accounting* — how many times, in what order, how quickly. Each tool exists because tests that only use the basics end up either over-stubbed (brittle) or under-verified (blind).

## Argument Matchers, In Depth

```java
import static org.mockito.ArgumentMatchers.*;

// The matcher families:
any()                       // any object (non-null)
anyString(), anyInt(), anyLong()   // any value of the type
anyList(), anyMap()         // any collection
any(Order.class)            // any instance of the class
eq(value)                   // EQUAL to the value (use with other matchers)
same(ref)                   // the SAME instance (identity)
isNull() / isNotNull()      // null-ness
contains("sub"), startsWith("x"), endsWith("y")  // string patterns
matches("[0-9]+")           // regex
```

```java
// The critical rule — matchers must be ALL or NOTHING per call:
when(repo.findById(anyString())).thenReturn(p);        // OK — all matcher
when(repo.find(anyString(), eq(5))).thenReturn(p);     // OK — matchers + eq()
// when(repo.find(anyString(), 5)).thenReturn(p);      // ERROR — mixed!
// raw values are illegal alongside matchers; wrap them in eq().
```

**Custom matchers** with `argThat` — the "is this the right object?" check:

```java
verify(repo).save(argThat(order ->
        order.status().equals("PENDING") && order.total() > 0));
// argThat takes a Predicate — your own matching logic inline.
```

**The rules to internalize:** matchers must be used consistently within a call (`eq` for raw values); `argThat` predicates should be *pure* (no side effects — they may run multiple times); and matching is by `equals` for `eq` — so records and properly-overridden classes work naturally.

## doAnswer: The Computed Stub

The escape hatch for stubs that must derive their answer from the arguments — simulating an ID-generating repository, a stateful counter, or a callback-invoking method:

```java
// A repository that assigns IDs like the real one would:
when(repo.save(any(Order.class))).thenAnswer(invocation -> {
    Order incoming = invocation.getArgument(0);   // the argument passed
    return new Order("generated-" + System.nanoTime(), incoming.status(),
                     incoming.total());           // "the DB" assigns an ID
});

// Then the code under test sees a realistic result:
Order saved = service.placeOrder("c1", 25.0);
assertEquals("generated-", saved.id().substring(0, 10));  // worked!
```

**The `InvocationOnMock` gives you everything:** `getArgument(0)` (the args), `getMethod()` (which method), `getMock()` (the mock), and `callRealMethod()` (delegate to the real one). The classic uses: ID/sequence generation, time-based values, simulating a queue that acknowledges, and **callback invocation** — `doAnswer` to invoke the callback argument the way a real async API would.

## The do* Family — When when() Can't Work

```java
// Void methods — when() cannot stub a void (nothing to return):
doThrow(new DataAccessException("db down")).when(repo).delete(anyString());
doAnswer(inv -> { System.out.println("deleted " + inv.getArgument(0)); return null; })
    .when(repo).delete(anyString());
doNothing().when(repo).delete(anyString());   // explicit no-op (readability)

// Spies — avoid when() which calls the real method:
doReturn(42).when(spy).secretNumber();

// doCallRealMethod — the inverse: force the real method on a full mock
// (rare; usually you'd use a spy instead):
doCallRealMethod().when(mock).someMethod();
```

**The rule:** `when(mock.method()).thenReturn(...)` first *calls* `method()` to record the stub — fine for mocks (no-op), dangerous for spies (real side effects) and impossible for voids. `doReturn/doThrow/doAnswer/doNothing` skip the call entirely — the safe family for voids and spies.

## Verify Modes: The Full Accounting

```java
verify(mock).method();                    // exactly once (the default)
verify(mock, times(3)).method();
verify(mock, never()).method();
verify(mock, atLeastOnce()).method();
verify(mock, atLeast(2)).method();
verify(mock, atMost(2)).method();
verify(mock, only()).method();            // called exactly once, nothing else
verifyNoMoreInteractions(mock);           // NOTHING else was called on it
verifyNoInteractions(mock);               // it was never touched at all
```

**`verifyNoMoreInteractions` and `verifyNoInteractions`** are the strictness tools: they assert the *absence* of unexpected calls. `verifyNoInteractions(mock)` is the standard "this path must not touch the dependency" assertion — e.g., "a cached read must not hit the repository."

**In-order verification** — asserting the sequence of calls:

```java
InOrder inOrder = inOrder(repo, auditLog);

service.charge("a1", 50);

// The service must: load the account, THEN save it, and log AFTER:
inOrder.verify(repo).findById("a1");
inOrder.verify(repo).save(any(Account.class));
inOrder.verify(auditLog).record(any(AuditEntry.class));
```

`inOrder` asserts *relative* ordering (not that no other calls happened) — the tool for "the code did the right thing in the right sequence" (a save before an audit entry, a lock before a release).

## Verifying Async Code: timeout()

For asynchronous code (executor, CompletableFuture, virtual threads), the verification must *wait* for the call to happen:

```java
// timeout() — poll for the interaction, up to the given duration:
verify(mock, timeout(2000)).process(anyString());
// vs times() inside: verify(mock, timeout(2000).times(2)).process(any());

// The distinction: times() fails immediately if the call hasn't happened
// yet (race in async tests); timeout() waits up to the window for it.
```

**The async testing discipline:** prefer making the code's async boundary injectable (an `Executor`, a `CompletableFuture` you complete in the test) — then `timeout()` isn't needed. When the async is genuinely external, `timeout(ms)` with a generous window is the pragmatic tool — never a bare `Thread.sleep`, which is both slow and flaky.

## The Over-Stubbing Anti-Pattern

The biggest real-world Mockito problem is **over-stubbing**: stubbing everything "just in case," which makes tests brittle (any refactor that stops calling a stubbed method fails the strict-stubbing check or silently passes with dead stubs). The rules:

1. **Stub only what the code path actually uses** — strict stubbing (the MockitoExtension default) enforces this by failing unused stubs.
2. **Prefer real values over stubs** — records, DTOs, and immutable values shouldn't be mocked at all.
3. **`thenAnswer` over chains of `thenReturn`** for computed or stateful answers — clearer intent.
4. **When a test needs many stubs, the design may need a seam** — the code should ask for less, or the test should move up (integration) or down (a smaller unit).

## Recap

Advanced Mockito is the middle tier between basics and desperation: **argument matchers** (`any`, `eq`, `argThat` — all-or-nothing per call) describe which calls count; **`doAnswer`** computes answers from the arguments (ID generation, callbacks); the **`do*` family** handles voids and spies where `when()` can't; **verify modes** (`times`, `never`, `atLeastOnce`, `verifyNoInteractions`, `inOrder`) provide the full accounting of interactions; and **`timeout()`** tames async verification. The discipline that ties it together: stub only what the path uses, verify what you care about, and when a test demands elaborate mocking, question the design before adding another layer of stubs.
